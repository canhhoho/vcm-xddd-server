import * as XLSX from 'xlsx';

export interface ExportColumn<T> {
    /** Nhãn cột đã dịch — dùng làm header trong file Excel */
    header: string;
    value: (item: T, index: number) => string | number;
}

/**
 * Export danh sách đầu việc ra Excel.
 * Gom về một chỗ để nhãn trạng thái luôn đi qua statusLabel() — trước đây mỗi
 * section tự nối chuỗi key i18n và sinh ra key không tồn tại.
 */
export function exportPlanExcel<T>(
    items: T[],
    columns: ExportColumn<T>[],
    sheetName: string,
    fileName: string
): void {
    const rows = items.map((item, index) => {
        const row: Record<string, string | number> = {};
        columns.forEach(col => {
            row[col.header] = col.value(item, index);
        });
        return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
}
