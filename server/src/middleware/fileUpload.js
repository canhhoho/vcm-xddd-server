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
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`);
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
      const name = path.basename(url);
      if (!name || name === '.' || name === '..') return;
      const target = path.join(uploadDir, name);
      if (!target.startsWith(uploadDir)) return;
      fs.unlink(target, () => { /* ENOENT là bình thường */ });
    });
}

/** Danh sách URL công khai từ `req.files` của multer */
function toPublicUrls(files, subdir) {
  return (files || []).map(f => `/uploads/${subdir}/${f.filename}`);
}

module.exports = {
  createUploader,
  removeUploadedFiles,
  toPublicUrls,
  ALLOWED_EXT,
  ALLOWED_MIME,
};
