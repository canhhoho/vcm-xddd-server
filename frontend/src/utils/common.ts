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

// `toCsvCell` từng nằm ở đây để bọc ô CSV an toàn (nhân đôi dấu nháy kép + chặn
// CSV injection). Đã xoá khi export Hợp đồng/Hoá đơn chuyển sang .xlsx thật:
// aoa_to_sheet sinh cell string trơ (muốn thành công thức phải có `cell.f`), nên
// không còn rủi ro nào để chặn. Đừng dựng lại CSV — Excel sẽ đọc lại ngày tháng
// theo vùng miền của máy và đảo ngày/tháng. Xem utils/excelExport.ts.
