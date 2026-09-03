/**
 * VCM XDDD — Phân quyền theo TỪNG DỰ ÁN cho tiến độ hạng mục công việc
 *
 * Vì sao KHÔNG xếp chồng sau moduleAccess('projects'): moduleAccess chặn thẳng
 * mọi request ghi khi quyền chỉ là VIEW (`Forbidden: read-only access`), nên
 * middleware chạy sau nó không bao giờ có cơ hội nới cho thành viên dự án.
 * Vì thế cổng này TỰ ĐỦ — tự đọc quyền và quyết định, mount một mình:
 *
 *   app.use('/api/project-work-items', projectMemberAccess(), workItemRoutes);
 *
 * Quy tắc:
 *   - ADMIN / projects=EDIT  → toàn quyền.
 *   - GET                    → cần tối thiểu VIEW.
 *   - projects=VIEW + là thành viên dự án → được ghi tiến độ (PUT /:id/progress).
 *   - Import và DELETE       → luôn đòi EDIT/admin. Thành viên thường KHÔNG được
 *                              đụng danh mục vì import xoá sạch dữ liệu cũ.
 *   - còn lại                → 403 mọi method. ALLOW-LIST: trước đây cổng đọc là
 *                              `level === 'NO_ACCESS'` nên `projects='FULL'` lọt
 *                              vào nhánh thành viên và ghi được tiến độ.
 *                              Xem services/accessLevels.js.
 *
 * Quyền đọc từ bảng `users` mỗi request nên admin đổi quyền có hiệu lực ngay,
 * không cần user đăng nhập lại — giống moduleAccess và planAccess.
 *
 * Cố ý chỉ gác /api/project-work-items. Không nới quyền cho /api/projects,
 * /api/tasks hay /api/project-logs — đó là thay đổi lớn hơn, phải làm riêng.
 */
const { query } = require('../config/database');
const { forbidden, badRequest } = require('../routes/_planValidators');
const { normalizeAccess, isAdminRole, canRead, canWrite } = require('../services/accessLevels');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Suy ra dự án mà request đang tác động.
 * Trả về projectId, hoặc null nếu không lần ra được.
 */
async function resolveProjectId(req) {
  // 1. Có sẵn trên body (POST /import) hoặc query (GET danh sách)
  const explicit = req.body?.projectId || req.query?.projectId;
  if (explicit) return String(explicit);

  // 2. Route theo item: /:id/progress, /:id/logs, /:id/logs/:logId
  //
  // KHÔNG dùng req.params ở đây: middleware này mount ở tầng app, chạy TRƯỚC khi
  // router match route, nên req.params luôn là {} và mọi request ghi sẽ rơi vào
  // nhánh "không lần ra dự án". Phải tự cắt từ req.path (Express đã lược bỏ phần
  // mount '/api/project-work-items').
  const matched = req.path.match(/^\/([^/]+)\//);
  const itemId = matched && matched[1];
  if (itemId) {
    const rows = await query(
      'SELECT project_id FROM project_work_items WHERE id = $1',
      [itemId]
    );
    if (rows.rows.length === 0) throw badRequest('Work item not found');
    return rows.rows[0].project_id;
  }

  return null;
}

/** Người dùng có nằm trong mảng JSONB `projects.members` không */
async function isProjectMember(projectId, userId) {
  const rows = await query(
    'SELECT 1 FROM projects WHERE id = $1 AND members @> $2::jsonb',
    [projectId, JSON.stringify([{ userId }])]
  );
  return rows.rows.length > 0;
}

function projectMemberAccess() {
  return async function projectMemberAccessMiddleware(req, res, next) {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }

      const result = await query(
        'SELECT role, projects FROM users WHERE id = $1',
        [req.user.id]
      );
      if (result.rows.length === 0) return next(forbidden('Forbidden: User not found'));

      const row = result.rows[0];
      const isAdmin = isAdminRole(row.role);
      const level = normalizeAccess(row.projects);

      req.projectAccess = { isAdmin, level };

      if (isAdmin || canWrite(level)) return next();
      if (!canRead(level)) return next(forbidden('Forbidden: no access to projects'));

      // Từ đây level CHẮC CHẮN là 'VIEW': normalizeAccess chỉ trả về 3 mức, hai
      // mức kia đã return ở trên. (Trước khi có helper, giá trị rác cũng rơi vào
      // đây nên comment cũ khẳng định === 'VIEW' là sai.)
      if (!WRITE_METHODS.has(req.method)) return next();

      // Danh mục hạng mục chỉ quyền EDIT mới được đụng — import xoá sạch dữ liệu
      // cũ nên không thể để thành viên thường chạy.
      const isImport = req.method === 'POST' && req.path.startsWith('/import');
      if (isImport || req.method === 'DELETE') {
        return next(forbidden('Forbidden: chỉ quyền projects=EDIT mới sửa được danh mục hạng mục'));
      }

      const projectId = await resolveProjectId(req);
      // Không lần ra dự án thì TỪ CHỐI, không cho qua ngầm.
      if (!projectId) return next(badRequest('projectId is required'));

      if (!(await isProjectMember(projectId, req.user.id))) {
        return next(forbidden('Forbidden: bạn không phải thành viên của dự án này'));
      }

      req.projectAccess.viaMembership = true;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = projectMemberAccess;
