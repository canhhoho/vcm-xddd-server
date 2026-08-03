import * as XLSX from 'xlsx';

export interface ExportColumn<T> {
    /** Nhãn cột đã dịch — dùng làm header trong file Excel */
    header: string;
    value: (item: T, index: number) => string | number;
    /** Độ rộng cột (đơn vị ký tự của Excel) */
    width?: number;
}

/** Một sheet trong workbook xuất ra */
export interface PlanSheetSpec<T> {
    sheetName: string;
    /** Khối tiêu đề đặt phía trên bảng — mỗi phần tử là một dòng */
    headerRows?: (string | number)[][];
    columns: ExportColumn<T>[];
    items: T[];
}

const DEFAULT_COL_WIDTH = 18;

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

const buildSheet = <T>(spec: PlanSheetSpec<T>): XLSX.WorkSheet => {
    const colCount = spec.columns.length;
    const headerRows = spec.headerRows || [];
    const rows: (string | number)[][] = [...headerRows];
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
export function exportPlanWorkbook(sheets: PlanSheetSpec<any>[], fileName: string): boolean {
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
export function exportPlanExcel<T>(
    items: T[],
    columns: ExportColumn<T>[],
    sheetName: string,
    fileName: string,
    headerRows?: (string | number)[][]
): boolean {
    return exportPlanWorkbook([{ sheetName, headerRows, columns, items }], fileName);
}
