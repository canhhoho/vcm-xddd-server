/**
 * Tiện ích cho file đính kèm (hợp đồng, hoá đơn, dự án).
 *
 * Server lưu file dưới tên "<timestamp>-<random>-<tên gốc>" (xem
 * server/src/middleware/fileUpload.js). File tải lên trước 2026-11 có dạng cũ
 * "<timestamp>-<random>.ext", không còn giữ tên gốc — hiển thị nguyên tên đó.
 */
const STORED_NAME_RE = /^\d{13}-[a-z0-9]{4,16}-(.+)$/;
const PREVIEW_EXT = /\.(pdf|jpe?g|png|webp|gif)$/i;

/** Tách chuỗi file_urls (xuống dòng hoặc dấu phẩy) thành mảng URL. */
export const splitFileUrls = (raw?: string | null): string[] =>
    raw ? raw.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean) : [];

/** Tên hiển thị (tên gốc người dùng đã tải lên) từ URL. */
export const getAttachmentName = (url: string, index = 0): string => {
    let name = url.split('?')[0].split('/').pop() || '';
    try { name = decodeURIComponent(name); } catch { /* URL cũ chưa encode */ }
    if (!name) return `file_${index + 1}`;
    const m = STORED_NAME_RE.exec(name);
    return m ? m[1] : name;
};

/** Trình duyệt mở xem trực tiếp được (PDF, ảnh). Word/Excel phải tải về. */
export const isPreviewable = (url: string): boolean => PREVIEW_EXT.test(url.split('?')[0]);

/** Mở file ở tab mới để xem. */
export const openAttachment = (url: string): void => {
    window.open(url, '_blank', 'noopener,noreferrer');
};

/** Tải file về với tên gốc. */
export const downloadAttachment = (url: string, index = 0): void => {
    const link = document.createElement('a');
    link.href = url;
    link.download = getAttachmentName(url, index);
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
