/**
 * excelExport.ts
 * Tầng ghi file Excel dùng chung (Plan, Hợp đồng, Hoá đơn, …).
 *
 * Trước đây file này nằm ở components/plan/exportPlanExcel.ts dù không có logic
 * riêng của Plan. Chuyển ra utils/ khi trang Hợp đồng dùng chung, để người sau
 * debug export Hợp đồng không phải mò vào thư mục plan/.
 */
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';

/**
 * Một ô trong sheet.
 *
 * `XLSX.CellObject` cho phép truyền thẳng ô đã dựng sẵn (kèm number format `z`).
 * `undefined` sinh ra ô TRỐNG THẬT — sheet_add_aoa bỏ qua phần tử undefined,
 * khác hẳn chuỗi rỗng hay dấu gạch ngang.
 */
export type ExcelCell = string | number | XLSX.CellObject | undefined;

export interface ExportColumn<T> {
    /** Nhãn cột đã dịch — dùng làm header trong file Excel */
    header: string;
    value: (item: T, index: number) => ExcelCell;
    /** Độ rộng cột (đơn vị ký tự của Excel) */
    width?: number;
}

/** Một sheet trong workbook xuất ra */
export interface ExcelSheetSpec<T> {
    sheetName: string;
    /** Khối tiêu đề đặt phía trên bảng — mỗi phần tử là một dòng */
    headerRows?: ExcelCell[][];
    columns: ExportColumn<T>[];
    items: T[];
}

const DEFAULT_COL_WIDTH = 18;

/** Number format của Excel — KHÁC cú pháp dayjs ('dd' của Excel là ngày, không phải thứ). */
const DATE_NUM_FMT = 'dd/mm/yyyy';
const DATETIME_NUM_FMT = 'dd/mm/yyyy hh:mm';

/** Serial của Excel đếm từ 1899-12-30; 25569 là số ngày tới epoch Unix. */
const EXCEL_EPOCH_OFFSET = 25569;
const MS_PER_DAY = 86400000;
const SECONDS_PER_DAY = 86400;

/**
 * Ô NGÀY THẬT của Excel, không phải chuỗi.
 *
 * Vì sao không truyền thẳng `Date` cho SheetJS: hàm datenum của nó bù trừ theo
 * getTimezoneOffset() so với basedate 1899-12-30, nên ở múi giờ có offset lẻ
 * giây (LMT) phần dư rò vào serial — ô hiển thị đúng "13/07/2026" nhưng
 * `=ô=DATE(2026,7,13)` trả FALSE và Date Filters không khớp. Tính bằng số học
 * trên các thành phần y/m/d thì không múi giờ nào chen vào được.
 *
 * Trả `undefined` khi thiếu/không hợp lệ để ô trống thay vì in "Invalid Date".
 */
export const excelDateCell = (value?: string | null): ExcelCell => {
    if (!value) return undefined;
    const d = dayjs(value);
    if (!d.isValid()) return undefined;
    const serial = Date.UTC(d.year(), d.month(), d.date()) / MS_PER_DAY + EXCEL_EPOCH_OFFSET;
    return { v: serial, t: 'n', z: DATE_NUM_FMT };
};

/** Như excelDateCell nhưng giữ cả giờ:phút — dùng cho cột gốc TIMESTAMPTZ. */
export const excelDateTimeCell = (value?: string | null): ExcelCell => {
    if (!value) return undefined;
    const d = dayjs(value);
    if (!d.isValid()) return undefined;
    const days = Date.UTC(d.year(), d.month(), d.date()) / MS_PER_DAY + EXCEL_EPOCH_OFFSET;
    const timeFraction = (d.hour() * 3600 + d.minute() * 60 + d.second()) / SECONDS_PER_DAY;
    return { v: days + timeFraction, t: 'n', z: DATETIME_NUM_FMT };
};

/**
 * Excel cấm : \ / ? * [ ] trong tên sheet và giới hạn 31 ký tự.
 * Nhãn tuần dạng "06/07 - 12/07" sẽ làm book_append_sheet ném lỗi nếu không lọc.
 */
const safeSheetName = (name: string): string =>
    (name.replace(/[:\\/?*[\]]/g, '-').trim() || 'Sheet').slice(0, 31);

/** Tên sheet trùng nhau cũng làm book_append_sheet ném lỗi → thêm hậu tố */
const uniqueSheetName = (name: string, used: Set<string>): string => {
    if (!used.has(name)) return name;
    for (let i = 2; ; i += 1) {
        const suffix = ` (${i})`;
        const candidate = `${name.slice(0, 31 - suffix.length)}${suffix}`;
        if (!used.has(candidate)) return candidate;
    }
};

const buildSheet = <T>(spec: ExcelSheetSpec<T>): XLSX.WorkSheet => {
    const colCount = spec.columns.length;
    const headerRows = spec.headerRows || [];
    const rows: ExcelCell[][] = [...headerRows];
    if (headerRows.length > 0) rows.push([]);

    rows.push(spec.columns.map(col => col.header));
    spec.items.forEach((item, index) => {
        rows.push(spec.columns.map(col => col.value(item, index)));
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = spec.columns.map(col => ({ wch: col.width || DEFAULT_COL_WIDTH }));
    // Gộp dòng tiêu đề đầu tiên qua hết bảng cho dễ đọc (chỉ khi có khối tiêu đề)
    if (headerRows.length > 0 && colCount > 1) {
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }];
    }
    return ws;
};

/**
 * Xuất workbook nhiều sheet.
 * Trả về false khi không sheet nào có dữ liệu — caller tự cảnh báo, không ghi file rỗng.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportExcelWorkbook(sheets: ExcelSheetSpec<any>[], fileName: string): boolean {
    const filled = sheets.filter(s => s.items.length > 0);
    if (filled.length === 0) return false;

    const wb = XLSX.utils.book_new();
    const used = new Set<string>();
    filled.forEach(spec => {
        const name = uniqueSheetName(safeSheetName(spec.sheetName), used);
        used.add(name);
        XLSX.utils.book_append_sheet(wb, buildSheet(spec), name);
    });

    XLSX.writeFile(wb, fileName);
    return true;
}

/**
 * Export một sheet duy nhất.
 * Gom về một chỗ để nhãn trạng thái luôn đi qua statusLabel() — trước đây mỗi
 * section tự nối chuỗi key i18n và sinh ra key không tồn tại.
 */
export function exportExcelSheet<T>(
    items: T[],
    columns: ExportColumn<T>[],
    sheetName: string,
    fileName: string,
    headerRows?: ExcelCell[][]
): boolean {
    return exportExcelWorkbook([{ sheetName, headerRows, columns, items }], fileName);
}
