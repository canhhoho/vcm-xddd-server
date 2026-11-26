/**
 * VCM XDDD — Cấu hình upload file dùng chung
 *
 * Trước đây multer chỉ được cấu hình cục bộ trong `routes/contracts.js`, nên page
 * Project phải mượn `POST /contracts/upload` để đính kèm file. Sau khi
 * `/api/contracts` đứng sau `moduleAccess('contracts')`, user có quyền
 * `projects=EDIT` nhưng `contracts=NO_ACCESS` bị 403 khi đính kèm file cho dự án.
 *
 * Trích ra đây để mỗi module có endpoint upload riêng, đi qua đúng middleware
 * phân quyền của module đó, mà vẫn dùng chung một allowlist.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { badRequest } = require('../routes/_planValidators');

// Chỉ nhận các loại file thật sự cần. File tải lên nằm cùng origin với app;
// cho phép .html/.svg là mở đường stored XSS (script chạy trên origin của app
// đọc được JWT trong localStorage).
const ALLOWED_EXT = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt',
]);

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
  'application/octet-stream', // một số trình duyệt gửi kiểu này cho .docx/.xlsx
]);

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

// Tên lưu trên đĩa: "<timestamp>-<random>-<tên gốc>". Tiền tố giữ tên duy nhất
// (hai người cùng tải "HopDong.pdf" không đè nhau), phần đuôi giữ tên gốc để UI
// hiển thị/tải về đúng tên người dùng đã chọn. Định dạng cũ "<timestamp>-<random>.ext"
// (trước 2026-11) không có phần tên gốc — STORED_NAME_RE không khớp, hiển thị nguyên.
const STORED_NAME_RE = /^\d{13}-[a-z0-9]{4,16}-(.+)$/;
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

/**
 * multer 1.x (busboy) giải mã tên file theo latin1, nên "Hợp đồng.pdf" tới đây
 * thành mojibake. Đổi lại sang UTF-8; nếu kết quả có ký tự thay thế (tên vốn đã
 * đúng, không phải UTF-8 bị đọc nhầm) thì giữ nguyên.
 */
function decodeOriginalName(name) {
  const raw = String(name || '');
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  return utf8.includes(REPLACEMENT_CHAR) ? raw : utf8;
}

/** Bỏ ký tự cấm trên Windows/Linux và ký tự điều khiển, giới hạn độ dài. */
function sanitizeFileName(name) {
  const ext = path.extname(name);
  let base = path.basename(name, ext)
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  // ext4 giới hạn 255 BYTE; tiếng Việt UTF-8 tới 3 byte/ký tự → cắt theo byte.
  while (Buffer.byteLength(base, 'utf8') > 150) base = base.slice(0, -1);
  return (base || 'file') + ext.toLowerCase();
}

/** Tên gốc từ tên lưu trên đĩa (hoặc URL). Định dạng cũ trả về nguyên tên. */
function originalNameFromStored(stored) {
  const m = STORED_NAME_RE.exec(stored);
  return m ? m[1] : stored;
}

/** Thư mục con trong uploads/, tạo nếu chưa có. Tên phải là slug đơn giản. */
function resolveUploadDir(subdir) {
  if (!/^[a-z0-9_-]+$/i.test(subdir)) {
    throw new Error(`fileUpload: subdir không hợp lệ "${subdir}"`);
  }
  const dir = path.join(UPLOAD_ROOT, subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Tạo middleware multer ghi vào `uploads/<subdir>/`.
 * @param {string} subdir ví dụ 'contracts', 'projects'
 */
function createUploader(subdir) {
  const uploadDir = resolveUploadDir(subdir);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const safe = sanitizeFileName(decodeOriginalName(file.originalname));
      const rand = Math.random().toString(36).slice(2, 10) || 'x0';
      cb(null, `${Date.now()}-${rand}-${safe}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(file.mimetype)) {
        return cb(badRequest(`File type not allowed: ${file.originalname}`));
      }
      cb(null, true);
    },
  });
}

/**
 * Xoá file đã upload khỏi đĩa. Bỏ qua file không tồn tại.
 * Chỉ đụng tới file nằm trong `uploads/<subdir>/` của chính app — `path.basename`
 * cắt bỏ mọi thành phần đường dẫn nên URL bên ngoài không thể trỏ ra chỗ khác.
 */
function removeUploadedFiles(raw, subdir) {
  if (!raw) return;
  const uploadDir = resolveUploadDir(subdir);
  String(raw)
    .split(/[\r\n,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(url => {
      let name = path.basename(url.split('?')[0]);
      try { name = decodeURIComponent(name); } catch { /* giữ nguyên */ }
      name = path.basename(name); // decode có thể lộ ra "/" — cắt lại lần nữa
      if (!name || name === '.' || name === '..') return;
      const target = path.join(uploadDir, name);
      if (!target.startsWith(uploadDir)) return;
      fs.unlink(target, () => { /* ENOENT là bình thường */ });
    });
}

/**
 * Xoá khỏi đĩa những file có trong `oldRaw` nhưng không còn trong `newRaw`
 * (người dùng gỡ file đính kèm vì tải nhầm). Gọi SAU khi UPDATE thành công.
 */
function removeDroppedFiles(oldRaw, newRaw, subdir) {
  const split = s => String(s || '').split(/[\r\n,]+/).map(x => x.trim()).filter(Boolean);
  const kept = new Set(split(newRaw));
  const dropped = split(oldRaw).filter(u => !kept.has(u));
  if (dropped.length > 0) removeUploadedFiles(dropped.join('\n'), subdir);
}

/** Danh sách URL công khai từ `req.files` của multer */
function toPublicUrls(files, subdir) {
  // Tên file có thể chứa dấu cách, tiếng Việt, "#", "%"... → phải encode.
  return (files || []).map(f => `/uploads/${subdir}/${encodeURIComponent(f.filename)}`);
}

module.exports = {
  createUploader,
  removeUploadedFiles,
  removeDroppedFiles,
  toPublicUrls,
  originalNameFromStored,
  ALLOWED_EXT,
  ALLOWED_MIME,
};
