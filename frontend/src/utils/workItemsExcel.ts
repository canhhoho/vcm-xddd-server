/**
 * workItemsExcel.ts
 * Đọc và ghi file Excel danh mục hạng mục công việc.
 *
 * Vì sao dùng ExcelJS chứ không phải `xlsx` như utils/excelExport.ts:
 *  - GHI: SheetJS bản community KHÔNG ghi được style (màu nền, màu chữ, viền).
 *    File gửi chủ đầu tư cần tô cam dòng nhóm và chữ EN xanh như mẫu.
 *  - ĐỌC: ô song ngữ trong file mẫu là RICH TEXT (đoạn VI đen + đoạn EN xanh
 *    trong cùng một ô). SheetJS làm phẳng thành chuỗi nên mất thông tin màu;
 *    ExcelJS cho đọc từng đoạn, tách VI/EN theo màu chữ chính xác hơn hẳn.
 *
 * ExcelJS nặng (~800KB) nên mọi hàm ở đây đều import động, không để nó vào
 * bundle chính. Các trang khác giữ nguyên utils/excelExport.ts.
 */
import type { ProjectWorkItem, WorkItemSheetInput } from '../types';

// ── Kiểu nội bộ ──────────────────────────────────────────────────────────────

/** Một đoạn text có định dạng riêng trong ô rich text */
interface RichTextRun {
    text: string;
    font?: { color?: { argb?: string }; bold?: boolean };
}

export interface ParseWarning {
    sheetName: string;
    row: number;
    message: string;
}

export interface ParseResult {
    sheets: WorkItemSheetInput[];
    warnings: ParseWarning[];
    totalItems: number;
    /** Số dòng lá — chỉ những dòng này mới cập nhật được khối lượng */
    leafCount: number;
}

// ── Đọc ──────────────────────────────────────────────────────────────────────

/** Màu được coi là "chữ tiếng Anh" trong file mẫu: xanh lá / xanh dương */
function isEnglishColor(argb?: string): boolean {
    if (!argb) return false;
    const hex = argb.length === 8 ? argb.slice(2) : argb;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return false;
    // Không phải đen/xám đậm, và có thành phần xanh trội hơn đỏ
    const isDark = r < 60 && g < 60 && b < 60;
    return !isDark && (g > r + 20 || b > r + 20);
}

/**
 * Tách ô song ngữ thành { vi, en }.
 *
 * Ưu tiên tách theo màu chữ của từng đoạn rich text. Ô là chuỗi thường thì
 * fallback tách theo xuống dòng.
 *
 * KHÔNG tách theo dấu '/': tên hạng mục có sẵn dấu này
 * ("Tê thép hàn mạ kẽm D114/60, SCH20/"), tách theo '/' là cắt nhầm giữa tên.
 */
function splitBilingual(raw: unknown): { vi: string; en: string } {
    if (raw === null || raw === undefined) return { vi: '', en: '' };

    // Rich text: { richText: [{ text, font }, ...] }
    const rich = (raw as { richText?: RichTextRun[] }).richText;
    if (Array.isArray(rich) && rich.length > 0) {
        const viParts: string[] = [];
        const enParts: string[] = [];
        let seenEnglish = false;
        rich.forEach(run => {
            // Một khi đã sang đoạn tiếng Anh thì các đoạn sau cũng là tiếng Anh,
            // kể cả đoạn không đặt màu (thường là dấu cách, ký hiệu ×).
            if (isEnglishColor(run.font?.color?.argb)) seenEnglish = true;
            (seenEnglish ? enParts : viParts).push(run.text || '');
        });
        if (enParts.length > 0) {
            return { vi: cleanName(viParts.join('')), en: cleanName(enParts.join('')) };
        }
        return splitByNewline(viParts.join(''));
    }

    // Ô công thức trả { result }, ô thường trả string/number
    const text = typeof raw === 'object' && raw !== null && 'result' in raw
        ? String((raw as { result: unknown }).result ?? '')
        : String(raw);
    return splitByNewline(text);
}

function splitByNewline(text: string): { vi: string; en: string } {
    const [first = '', ...rest] = text.split('\n');
    return { vi: cleanName(first), en: cleanName(rest.join(' ')) };
}

/** Bỏ dấu '/' cuối dòng (dấu ngăn song ngữ trong file mẫu) và khoảng trắng thừa */
function cleanName(s: string): string {
    return s.replace(/\s*\/\s*$/, '').replace(/\s+/g, ' ').trim();
}

/** Lấy chuỗi thuần từ một ô bất kỳ (rich text, công thức, số) */
function cellText(raw: unknown): string {
    if (raw === null || raw === undefined) return '';
    const rich = (raw as { richText?: RichTextRun[] }).richText;
    if (Array.isArray(rich)) return rich.map(r => r.text || '').join('');
    if (typeof raw === 'object' && 'result' in raw) {
        return String((raw as { result: unknown }).result ?? '');
    }
    return String(raw);
}

/**
 * Đọc số, chịu được cả số thật của Excel lẫn chuỗi định dạng VN ("1.234,5").
 * Trả về null nếu không phải số — caller quyết định coi là lỗi hay bỏ qua.
 */
function parseQty(raw: unknown): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

    const text = cellText(raw).trim();
    if (!text) return null;

    // "1.234,5" (VN) -> 1234.5 ; "1,234.5" (EN) -> 1234.5
    const normalized = text.includes(',') && text.lastIndexOf(',') > text.lastIndexOf('.')
        ? text.replace(/\./g, '').replace(',', '.')
        : text.replace(/,/g, '');

    const n = Number(normalized.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
}

/**
 * Suy ra cấp từ cột STT.
 *   'E'    -> 0 (nhóm)
 *   'E.2'  -> 1 (nhóm con)
 *   ''     -> 2 (hạng mục lá, mới có khối lượng)
 */
function deriveLevel(code: string): 0 | 1 | 2 {
    const c = code.trim();
    if (!c) return 2;
    if (/^[A-Za-z]+$/.test(c)) return 0;
    if (/^[A-Za-z]+[.\d]/.test(c) || /^\d+$/.test(c)) return 1;
    return 2;
}

/**
 * Đọc ngày từ ô Excel. ExcelJS trả về ba dạng khác nhau tuỳ cách ô được định dạng:
 * Date thật (ô định dạng ngày), số serial (ô số), hoặc chuỗi người dùng gõ tay.
 * Trả 'YYYY-MM-DD', hoặc null nếu không phải ngày hợp lệ.
 */
function parseExcelDate(raw: unknown): string | null {
    if (raw === null || raw === undefined || raw === '') return null;

    const pad = (n: number) => String(n).padStart(2, '0');
    const fromDate = (d: Date) =>
        Number.isNaN(d.getTime()) ? null : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

    if (raw instanceof Date) return fromDate(raw);

    // Ô công thức trả { result }
    if (typeof raw === 'object' && raw !== null && 'result' in raw) {
        return parseExcelDate((raw as { result: unknown }).result);
    }

    if (typeof raw === 'number') {
        // Serial của Excel đếm từ 1899-12-30. Chặn số nhỏ vô nghĩa (VD khối lượng 24).
        if (raw < 1000 || raw > 2958465) return null;
        return fromDate(new Date(Math.round((raw - 25569) * 86400000)));
    }

    const text = cellText(raw).trim();
    if (!text) return null;

    // "dd/mm/yyyy" hoặc "dd-mm-yyyy"
    const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (dmy) return `${dmy[3]}-${pad(+dmy[2])}-${pad(+dmy[1])}`;

    // "yyyy-mm-dd"
    const ymd = text.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
    if (ymd) return `${ymd[1]}-${pad(+ymd[2])}-${pad(+ymd[3])}`;

    return null;
}

/** Bỏ dấu tiếng Việt + gộp khoảng trắng, để so khớp tiêu đề rich text hai dòng */
function normalizeHeader(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/gi, 'd')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Từ khoá nhận diện từng cột. THỨ TỰ TRONG MẢNG QUAN TRỌNG:
 *  - 'ke hoach' phải đứng trước để "Khối lượng đã thực hiện" không lọt vào plannedQty;
 *  - hai cột ngày dùng cụm dài ('ngay hoan thanh muc tieu') chứ không phải 'muc tieu'
 *    trần, vì "Mục tiêu (KPI)" ở nơi khác cũng chứa cụm đó.
 * Cột nào đã khớp thì bị loại khỏi vòng sau, nên một ô không thể nhận hai vai.
 */
const COLUMN_KEYS: Array<[key: string, patterns: string[]]> = [
    ['targetDate', ['ngay hoan thanh muc tieu', 'target date', 'ngay muc tieu', 'ngay ke hoach']],
    ['actualDate', ['ngay hoan thanh thuc te', 'actual date', 'ngay thuc te']],
    ['plannedQty', ['khoi luong ke hoach', 'planned qty', 'ke hoach', 'planned']],
    ['note', ['ghi chu', 'note']],
    ['unit', ['don vi', 'unit']],
    ['name', ['hang muc', 'work item']],
    ['code', ['stt', 'no']],
];

type ColumnMap = Partial<Record<'code' | 'name' | 'unit' | 'plannedQty' | 'targetDate' | 'actualDate' | 'note', number>>;

/**
 * Dò chỉ số cột từ dòng tiêu đề, để file 8 cột cũ và file có thêm hai cột ngày
 * đều đọc đúng, và người dùng đặt cột ở đâu trong file cũng được.
 */
function detectColumns(row: { getCell: (c: number) => { value: unknown } }, maxCol: number): ColumnMap {
    const map: ColumnMap = {};
    const taken = new Set<number>();
    const headers: Array<[number, string]> = [];
    for (let c = 1; c <= maxCol; c += 1) {
        headers.push([c, normalizeHeader(cellText(row.getCell(c).value))]);
    }
    COLUMN_KEYS.forEach(([key, patterns]) => {
        for (const pattern of patterns) {
            const hit = headers.find(([c, text]) => !taken.has(c) && text.includes(pattern));
            if (hit) {
                map[key as keyof ColumnMap] = hit[0];
                taken.add(hit[0]);
                return;
            }
        }
    });
    return map;
}

/**
 * Tìm dòng header: dòng đầu tiên có ô chứa "hạng mục"/"work item".
 *
 * BỎ QUA dòng có ô gộp: dòng chú thích phạm vi mà chính hàm xuất bên dưới ghi
 * ra là một ô gộp trải hết bề ngang bảng, và ExcelJS trả nội dung của ô gộp cho
 * MỌI cột trong vùng gộp. Không bỏ qua thì chỉ cần người dùng lọc bằng một từ
 * khoá có chữ "hạng mục" là dòng chú thích bị nhận nhầm làm tiêu đề, và lượt
 * import ngược đọc lệch toàn bộ file. Dòng tiêu đề thật không bao giờ bị gộp.
 */
function findHeaderRow(worksheet: { rowCount: number; getRow: (n: number) => { getCell: (c: number) => { value: unknown; isMerged?: boolean } } }): number {
    const limit = Math.min(worksheet.rowCount, 20);
    for (let r = 1; r <= limit; r += 1) {
        const row = worksheet.getRow(r);
        if (row.getCell(1).isMerged) continue;
        for (let c = 1; c <= 10; c += 1) {
            const text = cellText(row.getCell(c).value).toLowerCase();
            if (text.includes('hạng mục') || text.includes('work item')) return r;
        }
    }
    return 1; // không tìm thấy thì giả định dòng 1
}

/**
 * Parse file Excel danh mục hạng mục.
 * Mỗi worksheet = một hạng mục lớn, thành một tab con trên web.
 */
export async function parseWorkItemsExcel(file: File): Promise<ParseResult> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());

    const sheets: WorkItemSheetInput[] = [];
    const warnings: ParseWarning[] = [];
    let totalItems = 0;
    let leafCount = 0;

    workbook.worksheets.forEach(worksheet => {
        const headerRow = findHeaderRow(worksheet);
        const maxCol = Math.max(worksheet.columnCount || 0, 12);
        const detected = detectColumns(worksheet.getRow(headerRow), maxCol);
        // Không nhận ra được cột tên thì quay về bố cục cố định cũ, để file lạ
        // vẫn import được đúng như trước khi có tính năng dò tiêu đề.
        const col = detected.name
            ? { code: 1, unit: 3, plannedQty: 4, note: 8, ...detected }
            : { code: 1, name: 2, unit: 3, plannedQty: 4, note: 8 } as ColumnMap;
        const items: WorkItemSheetInput['items'] = [];

        for (let r = headerRow + 1; r <= worksheet.rowCount; r += 1) {
            const row = worksheet.getRow(r);
            const code = col.code ? cellText(row.getCell(col.code).value).trim() : '';
            const name = splitBilingual(row.getCell(col.name || 2).value);

            // Dòng trống hoàn toàn -> bỏ qua im lặng (file thường có dòng đệm)
            if (!name.vi && !name.en && !code) continue;
            if (!name.vi && !name.en) {
                warnings.push({ sheetName: worksheet.name, row: r, message: 'Có STT nhưng không có tên hạng mục — bỏ qua' });
                continue;
            }

            const level = deriveLevel(code);
            const unit = col.unit ? splitBilingual(row.getCell(col.unit).value) : { vi: '', en: '' };
            const planned = col.plannedQty ? parseQty(row.getCell(col.plannedQty).value) : null;

            const targetRaw = col.targetDate ? row.getCell(col.targetDate).value : null;
            const targetDate = parseExcelDate(targetRaw);
            if (level === 2 && targetRaw && !targetDate) {
                warnings.push({
                    sheetName: worksheet.name, row: r,
                    message: `"${name.vi}" có ngày hoàn thành mục tiêu không đọc được — bỏ trống`,
                });
            }

            if (level === 2) {
                if (planned === null) {
                    warnings.push({ sheetName: worksheet.name, row: r, message: `"${name.vi}" thiếu khối lượng kế hoạch — nhận 0` });
                } else if (planned < 0) {
                    warnings.push({ sheetName: worksheet.name, row: r, message: `"${name.vi}" có khối lượng âm — nhận 0` });
                }
                leafCount += 1;
            }

            items.push({
                level,
                code,
                nameVi: name.vi || name.en,
                nameEn: name.en,
                unitVi: unit.vi,
                unitEn: unit.en,
                plannedQty: level === 2 && planned !== null && planned > 0 ? planned : 0,
                targetDate: level === 2 ? targetDate : null,
                note: col.note ? cellText(row.getCell(col.note).value).trim() : '',
            });
            totalItems += 1;
        }

        // Sheet rỗng (bìa, hướng dẫn…) thì không tạo tab con
        if (items.length > 0) {
            sheets.push({ sheetName: worksheet.name, items });
        }
    });

    return { sheets, warnings, totalItems, leafCount };
}

// ── Ghi ──────────────────────────────────────────────────────────────────────

const STATUS_TEXT: Record<string, string> = {
    NOT_STARTED: 'Chưa thực hiện / Not started',
    IN_PROGRESS: 'Đang thực hiện / In progress',
    DONE: 'Hoàn thành / Completed',
};

// Màu theo file mẫu
const FILL_HEADER = 'FFBDD7EE';   // xanh nhạt
const FILL_LEVEL0 = 'FFF4A460';   // cam đậm
const FILL_LEVEL1 = 'FFF8CBA6';   // cam nhạt
const COLOR_EN = 'FF008000';      // xanh lá cho dòng tiếng Anh
const COLOR_VI = 'FF000000';

/** Excel cấm : \ / ? * [ ] trong tên sheet và giới hạn 31 ký tự */
function safeSheetName(name: string, used: Set<string>): string {
    const base = (name.replace(/[:\\/?*[\]]/g, '-').trim() || 'Sheet').slice(0, 31);
    if (!used.has(base)) return base;
    for (let i = 2; ; i += 1) {
        const suffix = ` (${i})`;
        const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
        if (!used.has(candidate)) return candidate;
    }
}

/** Ô song ngữ: dòng VI đen, dòng EN xanh — đúng như file gốc */
function bilingualCell(vi: string, en: string, bold = false) {
    if (!en) return vi;
    return {
        richText: [
            { text: `${vi}/\n`, font: { color: { argb: COLOR_VI }, bold } },
            { text: en, font: { color: { argb: COLOR_EN }, bold } },
        ],
    };
}

const HEADERS: Array<[string, string, number]> = [
    ['STT', 'No', 8],
    ['Hạng mục công việc', 'Work items', 42],
    ['Đơn vị', 'Unit', 12],
    ['Khối lượng kế hoạch', 'Planned Qty', 16],
    ['Khối lượng đã thực hiện', 'Completed Qty', 16],
    ['% Hoàn thành', '% Complete', 13],
    ['Ngày hoàn thành mục tiêu', 'Target date', 16],
    ['Ngày hoàn thành thực tế', 'Actual date', 16],
    ['Trạng thái', 'Status', 26],
    ['Ghi chú', 'Note', 24],
];

/** Chỉ số cột (1-based) trong HEADERS — dùng để gán numFmt sau khi dựng dòng */
const COL_PCT = 6;
const COL_TARGET_DATE = 7;
const COL_ACTUAL_DATE = 8;
const DATE_NUM_FMT = 'dd/mm/yyyy';

/**
 * Ô NGÀY THẬT của Excel, không phải chuỗi — để chủ đầu tư lọc/sắp xếp theo ngày.
 * Dùng Date.UTC để không múi giờ nào chen vào làm lệch một ngày; cùng lý do đã
 * ghi ở excelDateCell trong utils/excelExport.ts.
 */
function toExcelDate(value?: string | null): Date | null {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/**
 * Xuất danh mục ra file Excel đúng mẫu (mỗi hạng mục lớn một sheet).
 * `%` và Trạng thái ghi GIÁ TRỊ ĐÃ TÍNH chứ không ghi công thức, để mở bằng
 * phần mềm nào cũng ra đúng số.
 *
 * `scopeNote` chỉ truyền khi xuất MỘT PHẦN danh mục (theo sheet hoặc theo bộ
 * lọc). Nó thành một dòng chú thích ngay trên dòng tiêu đề: thiếu nó thì file
 * thiếu 300 dòng trông hệt file đầy đủ, người nhận không có cách nào biết.
 * Bản xuất toàn bộ KHÔNG có dòng này để bố cục khớp đúng file mẫu.
 */
export async function exportWorkItemsExcel(
    items: ProjectWorkItem[],
    fileName: string,
    projectName: string,
    scopeNote?: string,
): Promise<boolean> {
    if (items.length === 0) return false;

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VCM XDDD';
    workbook.created = new Date();
    // Ghi phạm vi vào Properties nữa — không chiếm ô nào trong lưới.
    if (scopeNote) workbook.subject = scopeNote;

    // Gom theo sheet, giữ đúng thứ tự gốc
    const bySheet = new Map<string, ProjectWorkItem[]>();
    items.forEach(item => {
        const key = item.sheetName || projectName || 'Sheet1';
        if (!bySheet.has(key)) bySheet.set(key, []);
        bySheet.get(key)!.push(item);
    });

    const used = new Set<string>();
    const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };

    bySheet.forEach((sheetItems, rawName) => {
        const name = safeSheetName(rawName, used);
        used.add(name);
        const ws = workbook.addWorksheet(name);

        ws.columns = HEADERS.map(([, , width]) => ({ width }));

        // Dòng chú thích phạm vi, chỉ khi xuất một phần. Nó đẩy tiêu đề xuống
        // dòng 2 nên autoFilter và freeze pane bên dưới phải bám theo
        // header.number, không được hardcode 1.
        if (scopeNote) {
            const noteRow = ws.addRow([scopeNote]);
            ws.mergeCells(noteRow.number, 1, noteRow.number, HEADERS.length);
            noteRow.height = 20;
            const noteCell = noteRow.getCell(1);
            noteCell.font = { italic: true, size: 10, color: { argb: 'FF7F7F7F' } };
            noteCell.alignment = { vertical: 'middle', horizontal: 'left' };
        }

        const header = ws.addRow(HEADERS.map(([vi, en]) => bilingualCell(vi, en, true)));
        header.height = 34;
        header.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL_HEADER } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = border;
        });

        sheetItems.forEach(item => {
            const isLeaf = item.level === 2;
            const row = ws.addRow([
                item.code,
                bilingualCell(item.nameVi, item.nameEn, !isLeaf),
                isLeaf ? bilingualCell(item.unitVi, item.unitEn) : '',
                isLeaf ? item.plannedQty : '',
                isLeaf ? item.completedQty : '',
                // Dòng nhóm là tiêu đề: server luôn trả progressPct 0 và status
                // NOT_STARTED cho chúng, ghi ra thì mọi dòng cam trong file gửi
                // chủ đầu tư đều hoá "0.0% / Chưa thực hiện". Để trống cho khớp
                // giao diện web và khớp các cột khối lượng ngay bên cạnh.
                isLeaf ? item.progressPct / 100 : null,
                isLeaf ? toExcelDate(item.targetDate) : null,
                isLeaf ? toExcelDate(item.actualDate) : null,
                isLeaf ? (STATUS_TEXT[item.status] || '') : '',
                item.note || '',
            ]);

            const fill = item.level === 0 ? FILL_LEVEL0 : item.level === 1 ? FILL_LEVEL1 : null;
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                cell.border = border;
                cell.alignment = {
                    vertical: 'middle',
                    wrapText: true,
                    horizontal: colNumber === 2 ? 'left' : 'center',
                };
                if (fill) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
                    cell.font = { bold: true };
                }
            });
            // Number format đặt sau eachCell để không bị alignment ghi đè
            row.getCell(COL_PCT).numFmt = '0.0%';
            row.getCell(COL_TARGET_DATE).numFmt = DATE_NUM_FMT;
            row.getCell(COL_ACTUAL_DATE).numFmt = DATE_NUM_FMT;
        });

        // Bám theo vị trí thật của dòng tiêu đề (1, hoặc 2 khi có scopeNote).
        ws.autoFilter = {
            from: { row: header.number, column: 1 },
            to: { row: header.number, column: HEADERS.length },
        };
        ws.views = [{ state: 'frozen', ySplit: header.number }];
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
}
