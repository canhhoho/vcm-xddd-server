/**
 * common.ts
 * Tiện ích dùng chung cho nhiều module (Contract, Project, …).
 *
 * `normalizeId` trước đây nằm trong projectUtils.ts và bị chép lại nguyên si
 * ở Contracts.tsx + ContractDetailModal.tsx. Đưa về đây để mọi module dùng chung;
 * projectUtils.ts re-export lại nên các import cũ vẫn chạy.
 */

/**
 * Chuẩn hoá ID để so sánh khi frontend/backend lưu không đồng nhất
 * (hậu tố ".0" từ Google Sheets, số 0 đứng đầu, khoảng trắng thừa).
 */
export const normalizeId = (id: unknown): string => {
    if (id === null || id === undefined) return '';
    let str = String(id).trim();
    if (str.endsWith('.0')) str = str.slice(0, -2);
    if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        if (!isNaN(num)) return num.toString();
    }
    return str;
};

// Excel coi ô bắt đầu bằng các ký tự này là công thức và sẽ thực thi.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Bọc một giá trị thành ô CSV an toàn.
 *
 * Hai vấn đề được xử lý:
 * 1. Dấu ngoặc kép trong dữ liệu phải nhân đôi, nếu không cột bị vỡ khi mở bằng Excel.
 * 2. Ô bắt đầu bằng `=`, `+`, `-`, `@` bị Excel thực thi như công thức
 *    (CSV injection). Thêm dấu nháy đơn ở đầu để ép về text.
 */
export const toCsvCell = (value: unknown): string => {
    if (value === null || value === undefined) return '""';
    const str = String(value);
    const safe = FORMULA_PREFIX.test(str) ? `'${str}` : str;
    return `"${safe.replace(/"/g, '""')}"`;
};
