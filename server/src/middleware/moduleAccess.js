/**
 * VCM XDDD — Phân quyền theo module (contracts, projects, targets, branches, business)
 *
 * Trước đây các router này mount trần sau authMiddleware, mà authMiddleware chỉ
 * verify JWT (id/email/role) — không mang theo cột quyền. Hệ quả: bất kỳ user đã
 * đăng nhập nào, kể cả `contracts='NO_ACCESS'`, đều POST/PUT/DELETE được.
 * Quyền chỉ được kiểm ở client (usePermissions đọc localStorage) nên vô hiệu.
 *
 * Middleware này đọc cột quyền trực tiếp từ bảng `users` mỗi request, nên admin
 * đổi quyền có hiệu lực ngay, không cần user đăng nhập lại.
 *
 * Quy tắc (giống planAccess.js):
 *   - role=ADMIN → toàn quyền, bỏ qua mọi cột module.
 *   - EDIT       → toàn quyền trên module đó.
 *   - VIEW       → chỉ GET; POST/PUT/PATCH/DELETE → 403.
 *   - còn lại    → 403 mọi method. ALLOW-LIST, không phải deny-list: trước đây
 *                  cổng đọc là `level === 'NO_ACCESS'` nên mọi giá trị lạ
 *                  ('FULL' trong seed-test.sql, '', NULL, 'x') đều KHÁC
 *                  'NO_ACCESS' và được cấp quyền ĐỌC. Xem services/accessLevels.js.
 */
const { query } = require('../config/database');
const { forbidden } = require('../routes/_planValidators');
const { MODULE_COLUMNS, normalizeAccess, isAdminRole, canRead, canWrite } = require('../services/accessLevels');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Đọc quyền của user từ DB, cache trong req cho các middleware sau */
async function loadModulePermissions(req) {
  if (req._modulePermissions) return req._modulePermissions;

  const result = await query(
    `SELECT role, ${MODULE_COLUMNS.join(', ')} FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (result.rows.length === 0) {
    throw forbidden('Forbidden: User not found');
  }

  const row = result.rows[0];
  const byModule = {};
  MODULE_COLUMNS.forEach(col => {
    byModule[col] = normalizeAccess(row[col]);
  });

  req._modulePermissions = {
    isAdmin: isAdminRole(row.role),
    byModule,
  };
  return req._modulePermissions;
}

/**
 * @param {string} moduleName tên cột quyền trong bảng users (phải nằm trong MODULE_COLUMNS)
 */
function moduleAccess(moduleName) {
  if (!MODULE_COLUMNS.includes(moduleName)) {
    throw new Error(`moduleAccess: module không hợp lệ "${moduleName}"`);
  }

  return async function moduleAccessMiddleware(req, res, next) {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { isAdmin, byModule } = await loadModulePermissions(req);

      req.moduleAccess = { module: moduleName, isAdmin, level: byModule[moduleName] };

      if (isAdmin) return next();

      const level = byModule[moduleName];

      if (!canRead(level)) {
        return next(forbidden(`Forbidden: no access to ${moduleName}`));
      }

      if (WRITE_METHODS.has(req.method) && !canWrite(level)) {
        return next(forbidden(`Forbidden: read-only access to ${moduleName}`));
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = moduleAccess;
