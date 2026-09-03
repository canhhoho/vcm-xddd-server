/**
 * VCM XDDD - RBAC Middleware
 * Chặn theo role toàn cục (ADMIN/EDIT/VIEW/NO_ACCESS).
 *
 * Role đọc thẳng từ bảng `users` mỗi request, KHÔNG lấy từ `req.user.role` của JWT:
 * token không refresh, nên admin hạ quyền một user thì token cũ vẫn mang role cao
 * cho tới khi hết hạn. Cùng lý do với moduleAccess.js và planAccess.js — đổi quyền
 * có hiệu lực ngay, không cần user đăng nhập lại.
 *
 * Usage: app.use('/api/users', rbac(['ADMIN']), userRoutes)
 */
const { query } = require('../config/database');
const { forbidden } = require('../routes/_planValidators');
const { normalizeRole } = require('../services/accessLevels');

function rbac(requiredRoles = []) {
  const allowed = requiredRoles.map(r => String(r).toUpperCase());

  // Nổ ngay lúc mount, KHÔNG lặng lẽ cho qua. `rbac()` không tham số trước đây
  // `return next()` cho MỌI user đã đăng nhập — một cổng phân quyền mở toang mà
  // trông y như đang bảo vệ. Lỗi cấu hình phải làm server chết lúc khởi động.
  if (allowed.length === 0) {
    throw new Error("rbac(): thiếu danh sách role. Truyền rõ, ví dụ rbac(['ADMIN']).");
  }

  return async function rbacMiddleware(req, res, next) {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const result = await query('SELECT role FROM users WHERE id = $1', [req.user.id]);
      if (result.rows.length === 0) {
        return next(forbidden('Forbidden: User not found'));
      }

      const role = normalizeRole(result.rows[0].role);
      if (!allowed.includes(role)) {
        return next(forbidden('Forbidden: Insufficient permissions'));
      }

      req.userRole = role;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = rbac;
