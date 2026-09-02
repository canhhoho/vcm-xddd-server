/**
 * Project Routes — CRUD /projects + members + items
 *
 * Phân quyền: mount kèm moduleAccess('projects') trong app.js (áp cho cả
 * /api/tasks và /api/project-logs).
 */
const router = require('express').Router();
const { query, getClient } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');
const APP_CONFIG = require('../config');
const {
  badRequest, conflict, assertDateRange, assertRequiredText, assertNonNegative,
} = require('./_planValidators');
const { createUploader, removeUploadedFiles, toPublicUrls } = require('../middleware/fileUpload');

const UPLOAD_SUBDIR = 'projects';
const upload = createUploader(UPLOAD_SUBDIR);

const PROJECT_STATUSES = ['TODO', 'INPROCESS', 'DONE'];

/**
 * Status của project dùng 'INPROCESS' (khác contracts dùng 'IN_PROGRESS').
 * Nhận cả hai biến thể rồi chuẩn hoá về giá trị mà frontend đang gửi/hiển thị.
 */
function normalizeStatus(status) {
  if (status === undefined || status === null || status === '') return 'TODO';
  const s = String(status).toUpperCase();
  const canonical = s === 'IN_PROGRESS' ? 'INPROCESS' : s;
  if (!PROJECT_STATUSES.includes(canonical)) {
    throw badRequest(`Invalid status. Must be one of: ${PROJECT_STATUSES.join(', ')}`);
  }
  return canonical;
}

async function logActivity(email, action, description) {
  try {
    await query('INSERT INTO activities (id, email, action, description) VALUES ($1, $2, $3, $4)',
      [uuidv4(), email, action, description]);
  } catch (e) { console.error('logActivity:', e.message); }
}

function toProject(r) {
  // Calculate time progress
  let timeProgress = 0;
  if (r.start_date && r.end_date) {
    // start_date/end_date la chuoi 'YYYY-MM-DD' (xem setTypeParser 1082 trong
    // config/database.js). new Date('2026-07-05') thuan tuy la UTC midnight, nen
    // phai them 'T00:00:00' de parse theo gio dia phuong, khong lech ngay.
    const start = new Date(`${r.start_date}T00:00:00`); start.setHours(0,0,0,0);
    const end = new Date(`${r.end_date}T00:00:00`); end.setHours(0,0,0,0);
    const now = new Date(); now.setHours(0,0,0,0);
    const totalDays = (end - start) / 86400000 + 1;
    const daysToCurrent = (now - start) / 86400000 + 1;
    const elapsed = Math.max(0, Math.min(daysToCurrent, totalDays));
    timeProgress = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;
  }

  let members = [];
  try { members = typeof r.members === 'string' ? JSON.parse(r.members) : (r.members || []); }
  catch (e) { members = []; }

  return {
    id: r.id, code: r.code, name: r.name, status: r.status,
    managerId: r.manager_id, contractId: r.contract_id,
    location: r.location || '', investor: r.investor || '',
    startDate: r.start_date, endDate: r.end_date,
    budget: parseFloat(r.budget) || 0,
    description: r.description || '',
    fileUrls: r.file_urls || '',
    members, timeProgress,
    // `progress` là GIÁ TRỊ DẪN XUẤT từ khối lượng hạng mục công việc — bảng
    // projects KHÔNG có cột `progress`. Đừng thêm câu `UPDATE projects SET
    // progress` ở bất kỳ đâu: nó ném PostgreSQL 42703 (đã xảy ra ở projectLogs.js).
    // Trước đây tính bằng AVG(tasks.progress); đổi khi tab Công việc bị bỏ khỏi UI.
    progress: r.avg_progress !== undefined ? parseInt(r.avg_progress) || 0 : 0,
    createdAt: r.created_at,
  };
}

/** Đọc members JSONB của một project. Không tồn tại → null. */
async function loadMembers(projectId, client = null) {
  const run = client ? client.query.bind(client) : query;
  const result = await run('SELECT members FROM projects WHERE id = $1', [projectId]);
  if (result.rows.length === 0) return null;
  const raw = result.rows[0].members;
  try {
    return typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
  } catch (e) {
    return [];
  }
}

/** Gắn userName/email từ bảng users vào danh sách member */
async function enrichMembers(members) {
  if (!members.length) return [];
  const usersResult = await query('SELECT id, name, email FROM users');
  const usersMap = {};
  usersResult.rows.forEach(u => { usersMap[u.id] = u; });
  return members.map(m => ({
    ...m,
    userName: usersMap[m.userId]?.name || '',
    email: usersMap[m.userId]?.email || '',
  }));
}

// GET /projects
router.get('/', async (req, res, next) => {
  try {
    const data = await CacheService.getOrSet('PROJECTS_LIST', async () => {
      const result = await query(`
        SELECT p.*,
          -- Tiến độ theo KHỐI LƯỢNG hạng mục, phải khớp đúng công thức sheetPct
          -- ở frontend/src/pages/ProjectWorkItemsTab.tsx để hai chỗ không lệch nhau.
          --   level = 2        : chỉ dòng lá mới có khối lượng (dòng nhóm planned_qty = 0)
          --   LEAST(...)       : nhập vượt kế hoạch không đẩy dự án lên trên 100%
          --   NULLIF(SUM(),0)  : dự án chưa import hạng mục -> tránh chia cho 0
          COALESCE((
            SELECT ROUND(SUM(LEAST(wi.completed_qty, wi.planned_qty)) * 100.0
                         / NULLIF(SUM(wi.planned_qty), 0))
            FROM project_work_items wi
            WHERE wi.project_id = p.id AND wi.level = 2
          ), 0) as avg_progress
        FROM projects p
        ORDER BY p.created_at DESC
      `);

      // Enrich members with user info
      const usersResult = await query('SELECT id, name, email FROM users');
      const usersMap = {};
      usersResult.rows.forEach(u => usersMap[u.id] = u);

      const projects = result.rows.map(r => {
        const proj = toProject(r);
        proj.members = proj.members.map(m => ({
          ...m,
          userName: usersMap[m.userId]?.name || '',
          email: usersMap[m.userId]?.email || '',
        }));
        return proj;
      });

      return { success: true, data: projects };
    }, CacheService.TTL.SHORT);

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /projects/upload — đính kèm file cho dự án.
// ĐĂNG KÝ TRƯỚC mọi route `/:param` cùng cấp (xem .claude/rules/route-ordering.md).
router.post('/upload', upload.array('files', 20), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) throw badRequest('No files uploaded');
    res.json({
      success: true,
      data: { urls: toPublicUrls(req.files, UPLOAD_SUBDIR) },
      message: `Uploaded ${req.files.length} file(s)`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /projects
router.post('/', async (req, res, next) => {
  try {
    const d = req.body;
    const code = assertRequiredText(d.code, 'code', 100);
    const name = assertRequiredText(d.name, 'name', 1000);
    const budget = assertNonNegative(d.budget, 'budget');
    const status = normalizeStatus(d.status);
    assertDateRange(d.startDate, d.endDate, 'startDate', 'endDate');

    const dup = await query('SELECT 1 FROM projects WHERE code = $1', [code]);
    if (dup.rowCount > 0) throw conflict(`Project code already exists: ${code}`);

    const id = uuidv4();

    await query(`
      INSERT INTO projects (id, code, name, status, manager_id, contract_id, location, investor, start_date, end_date, budget, description, file_urls, members)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      id, code, name, status,
      d.managerId || '', d.contractId || '',
      d.location || '', d.investor || '',
      d.startDate || null, d.endDate || null,
      budget, d.description || '', d.fileUrls || '', '[]'
    ]);

    await logActivity(req.user?.email || '', 'PROJECT_CREATE', `Created project ${code}`);
    CacheService.clear(['PROJECTS_LIST']);

    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

// PUT /projects/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const d = req.body;

    if (d.code !== undefined) assertRequiredText(d.code, 'code', 100);
    if (d.name !== undefined) assertRequiredText(d.name, 'name', 1000);
    if (d.budget !== undefined) assertNonNegative(d.budget, 'budget');
    if (d.status !== undefined) d.status = normalizeStatus(d.status);
    if (d.startDate !== undefined || d.endDate !== undefined) {
      assertDateRange(d.startDate, d.endDate, 'startDate', 'endDate');
    }

    if (d.code !== undefined) {
      const dup = await query('SELECT 1 FROM projects WHERE code = $1 AND id <> $2', [String(d.code).trim(), id]);
      if (dup.rowCount > 0) throw conflict(`Project code already exists: ${d.code}`);
    }

    const fields = []; const values = []; let idx = 1;

    const mapping = {
      code: 'code', name: 'name', status: 'status',
      managerId: 'manager_id', contractId: 'contract_id',
      location: 'location', investor: 'investor',
      startDate: 'start_date', endDate: 'end_date',
      budget: 'budget', description: 'description',
      fileUrls: 'file_urls',
    };

    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (d[jsKey] !== undefined) {
        fields.push(`${dbCol} = $${idx}`); values.push(d[jsKey]); idx++;
      }
    }
    if (fields.length === 0) throw badRequest('No fields to update');

    values.push(id);
    const result = await query(`UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    if (result.rowCount === 0) {
      const err = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }

    await logActivity(req.user?.email || '', 'PROJECT_UPDATE', `Updated project ${id}`);
    CacheService.clear(['PROJECTS_LIST']);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /projects/:id
router.delete('/:id', async (req, res, next) => {
  try {
    // Lấy file đính kèm trước khi xoá — tasks/project_logs được ON DELETE CASCADE
    // dọn giúp, nhưng file trên đĩa thì không ai dọn.
    const result = await query(
      'DELETE FROM projects WHERE id = $1 RETURNING code, file_urls',
      [req.params.id]
    );
    if (result.rowCount === 0) {
      const err = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }

    removeUploadedFiles(result.rows[0].file_urls, UPLOAD_SUBDIR);

    await logActivity(req.user?.email || '', 'PROJECT_DELETE', `Deleted project ${result.rows[0].code}`);
    CacheService.clear(['PROJECTS_LIST']);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ==================== PROJECT ITEMS (predefined) ====================
router.get('/:projectId/items', (req, res) => {
  res.json({ success: true, data: APP_CONFIG.PROJECT_ITEM_TYPES });
});

// ==================== PROJECT MEMBERS ====================
router.get('/:projectId/members', async (req, res, next) => {
  try {
    const members = await loadMembers(req.params.projectId);
    if (members === null) return res.json({ success: true, data: [] });
    res.json({ success: true, data: await enrichMembers(members) });
  } catch (err) {
    next(err);
  }
});

router.post('/:projectId/members', async (req, res, next) => {
  const { projectId } = req.params;
  const { userId, role } = req.body;
  const client = await getClient();
  try {
    if (!userId) throw badRequest('userId is required');

    // Khoá dòng project: members là JSONB đọc-sửa-ghi, hai người thêm cùng lúc
    // mà không khoá thì một bản ghi bị nuốt mất.
    await client.query('BEGIN');
    const locked = await client.query('SELECT members FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
    if (locked.rows.length === 0) {
      const err = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }

    let members = [];
    try {
      const raw = locked.rows[0].members;
      members = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
    } catch (e) { members = []; }

    if (members.some(m => m.userId === userId)) {
      throw conflict('User is already a member');
    }

    const newMember = { id: uuidv4(), userId, role: role || 'MEMBER', addedAt: new Date().toISOString() };
    members.push(newMember);

    await client.query('UPDATE projects SET members = $1 WHERE id = $2', [JSON.stringify(members), projectId]);
    await client.query('COMMIT');

    CacheService.clear(['PROJECTS_LIST']);
    res.json({ success: true, id: newMember.id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

// DELETE /projects/:projectId/members/:memberId
// Trước đây frontend gọi `DELETE /project-members/:id` — route đó chưa bao giờ
// tồn tại, nên nút xoá thành viên luôn rơi vào 404 mặc định của Express.
router.delete('/:projectId/members/:memberId', async (req, res, next) => {
  const { projectId, memberId } = req.params;
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const locked = await client.query('SELECT members FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
    if (locked.rows.length === 0) {
      const err = new Error('Project not found');
      err.statusCode = 404;
      throw err;
    }

    let members = [];
    try {
      const raw = locked.rows[0].members;
      members = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
    } catch (e) { members = []; }

    const remaining = members.filter(m => m.id !== memberId);
    if (remaining.length === members.length) {
      const err = new Error('Member not found');
      err.statusCode = 404;
      throw err;
    }

    await client.query('UPDATE projects SET members = $1 WHERE id = $2', [JSON.stringify(remaining), projectId]);
    await client.query('COMMIT');

    await logActivity(req.user?.email || '', 'PROJECT_MEMBER_REMOVE', `Removed member ${memberId} from project ${projectId}`);
    CacheService.clear(['PROJECTS_LIST']);
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
