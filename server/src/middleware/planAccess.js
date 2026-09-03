/**
 * VCM XDDD — Phân quyền Page Plan theo phòng ban
 *
 * authMiddleware chỉ verify JWT (id/email/role), không mang theo quyền module.
 * Middleware này đọc plans_bd/mkt/qs/des/pm trực tiếp từ bảng users nên quyền
 * luôn là bản mới nhất (admin đổi quyền có hiệu lực ngay, không cần user F5).
 *
 * Quy tắc:
 *   - role=ADMIN       → toàn quyền.
 *   - EDIT             → toàn quyền trên phòng ban đó.
 *   - VIEW             → chỉ GET; POST/PUT/DELETE → 403.
 *   - còn lại          → 403. ALLOW-LIST, không phải deny-list: trước đây cổng
 *                        đọc là `!== 'NO_ACCESS'` nên `plans_qs='FULL'` đưa QS
 *                        vào allowedDepartments và lọt thẳng vào SQL
 *                        `department = ANY($n)` ở weeklyPlans.js/monthlyPlans.js.
 *                        Xem services/accessLevels.js.
 *   - GET không chỉ định department → không chặn, chỉ giới hạn danh sách phòng
 *     ban user được xem qua req.planAccess.allowedDepartments (route tự lọc).
 */
const { query } = require('../config/database');
const { forbidden, badRequest } = require('../routes/_planValidators');
const { PLAN_COLUMNS, normalizeAccess, isAdminRole, canRead, canWrite } = require('../services/accessLevels');

const DEPARTMENTS = ['BD', 'MKT', 'QS', 'DES', 'PM'];
// PLAN_COLUMNS của helper đã theo đúng thứ tự DEPARTMENTS; assert để nếu ai đổi
// một trong hai thì nổ ngay lúc require, không phải lúc phân quyền sai.
const PERM_COLUMNS = DEPARTMENTS.map(d => `plans_${d.toLowerCase()}`);
if (PERM_COLUMNS.join() !== PLAN_COLUMNS.join()) {
  throw new Error('planAccess: DEPARTMENTS lệch với PLAN_COLUMNS trong services/accessLevels.js');
}

/** Đọc quyền plan của user từ DB, cache trong req cho các lần gọi sau */
async function loadPermissions(req) {
  if (req._planPermissions) return req._planPermissions;

  const result = await query(
    `SELECT role, ${PERM_COLUMNS.join(', ')} FROM users WHERE id = $1`,
    [req.user.id]
  );
  if (result.rows.length === 0) {
    throw forbidden('Forbidden: User not found');
  }

  const row = result.rows[0];
  const perms = {};
  DEPARTMENTS.forEach(dept => {
    perms[dept] = normalizeAccess(row[`plans_${dept.toLowerCase()}`]);
  });

  req._planPermissions = {
    isAdmin: isAdminRole(row.role),
    byDepartment: perms,
  };
  return req._planPermissions;
}

/**
 * Suy ra department mà request đang tác động.
 * Trả về mảng (batch-status có thể chạm nhiều phòng ban) hoặc null nếu
 * request không gắn với phòng ban cụ thể (GET danh sách).
 */
async function resolveDepartments(req, scope) {
  // 1. Có sẵn trên query/body (GET có filter, POST tạo plan)
  const explicit = req.query.department || req.body?.department;
  if (explicit) return [String(explicit).toUpperCase()];

  const planTable = scope === 'monthly' ? 'monthly_plans' : 'weekly_plans';
  const itemTable = scope === 'monthly' ? 'monthly_plan_items' : 'weekly_plan_items';

  // 2. Batch update: gom department của tất cả item được nhắc tới
  if (Array.isArray(req.body?.ids) && req.body.ids.length > 0) {
    const rows = await query(
      `SELECT DISTINCT p.department FROM ${itemTable} i
       JOIN ${planTable} p ON i.plan_id = p.id
       WHERE i.id = ANY($1)`,
      [req.body.ids]
    );
    return rows.rows.map(r => String(r.department).toUpperCase());
  }

  // 3. daily-logs: itemId → weekly_plan_items → weekly_plans
  if (scope === 'daily') {
    const itemId = req.query.itemId || req.body?.itemId;
    if (!itemId) throw badRequest('itemId required');
    const rows = await query(
      `SELECT p.department FROM weekly_plan_items i
       JOIN weekly_plans p ON i.plan_id = p.id
       WHERE i.id = $1`,
      [itemId]
    );
    if (rows.rows.length === 0) throw badRequest('Item not found');
    return [String(rows.rows[0].department).toUpperCase()];
  }

  // 4. Route theo path param
  const { planId, id } = req.params;

  if (planId) {
    const rows = await query(`SELECT department FROM ${planTable} WHERE id = $1`, [planId]);
    if (rows.rows.length === 0) throw badRequest('Plan not found');
    return [String(rows.rows[0].department).toUpperCase()];
  }

  if (id) {
    // /items/:id → tra qua bảng item; /:id → tra thẳng bảng plan
    const isItemRoute = req.path.startsWith('/items/');
    const rows = isItemRoute
      ? await query(
          `SELECT p.department FROM ${itemTable} i
           JOIN ${planTable} p ON i.plan_id = p.id WHERE i.id = $1`,
          [id]
        )
      : await query(`SELECT department FROM ${planTable} WHERE id = $1`, [id]);
    if (rows.rows.length === 0) throw badRequest('Not found');
    return [String(rows.rows[0].department).toUpperCase()];
  }

  return null;
}

/**
 * @param {'weekly'|'monthly'|'daily'} scope - quyết định bảng dùng để suy ra department
 */
function planAccess(scope) {
  return async function planAccessMiddleware(req, res, next) {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const { isAdmin, byDepartment } = await loadPermissions(req);
      const isWrite = req.method !== 'GET';

      const allowedView = DEPARTMENTS.filter(d => canRead(byDepartment[d]));
      const allowedEdit = DEPARTMENTS.filter(d => canWrite(byDepartment[d]));

      req.planAccess = {
        isAdmin,
        byDepartment,
        allowedDepartments: isAdmin ? DEPARTMENTS : allowedView,
      };

      if (isAdmin) return next();

      if (allowedView.length === 0) {
        return res.status(403).json({ success: false, error: 'Forbidden: No plan access' });
      }

      const departments = await resolveDepartments(req, scope);

      // GET danh sách không chỉ định phòng ban: route tự lọc theo allowedDepartments
      if (!departments) return next();

      for (const dept of departments) {
        if (!DEPARTMENTS.includes(dept)) {
          return res.status(400).json({ success: false, error: `Unknown department: ${dept}` });
        }
        const level = byDepartment[dept];
        if (!canRead(level)) {
          return res.status(403).json({ success: false, error: `Forbidden: No access to department ${dept}` });
        }
        if (isWrite && !canWrite(level)) {
          return res.status(403).json({ success: false, error: `Forbidden: Read-only access to department ${dept}` });
        }
      }

      req.planAccess.allowedEditDepartments = allowedEdit;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = planAccess;
module.exports.DEPARTMENTS = DEPARTMENTS;
