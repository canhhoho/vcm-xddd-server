/**
 * Task Routes — CRUD /tasks
 *
 * Phân quyền: mount kèm moduleAccess('projects') trong app.js — task thuộc về
 * dự án nên dùng chung cột quyền `users.projects`.
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const APP_CONFIG = require('../config');
const CacheService = require('../services/cacheService');
const { badRequest, assertRequiredText, assertDateRange, clampPct } = require('./_planValidators');

const TASK_STATUSES = ['TODO', 'INPROCESS', 'DONE'];
const TASK_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];

function normalizeStatus(status) {
  if (status === undefined || status === null || status === '') return 'TODO';
  const s = String(status).toUpperCase();
  const canonical = s === 'IN_PROGRESS' ? 'INPROCESS' : s;
  if (!TASK_STATUSES.includes(canonical)) {
    throw badRequest(`Invalid status. Must be one of: ${TASK_STATUSES.join(', ')}`);
  }
  return canonical;
}

function normalizePriority(priority) {
  if (priority === undefined || priority === null || priority === '') return 'MEDIUM';
  const p = String(priority).toUpperCase();
  if (!TASK_PRIORITIES.includes(p)) {
    throw badRequest(`Invalid priority. Must be one of: ${TASK_PRIORITIES.join(', ')}`);
  }
  return p;
}

/** Tên hạng mục suy từ itemType (allowlist trong APP_CONFIG) */
function resolveItemName(itemType) {
  if (!itemType) return '';
  const itemObj = APP_CONFIG.PROJECT_ITEM_TYPES.find(t => t.id === itemType);
  return itemObj ? itemObj.name : itemType;
}

async function logActivity(email, action, description) {
  try {
    await query('INSERT INTO activities (id, email, action, description) VALUES ($1, $2, $3, $4)',
      [uuidv4(), email, action, description]);
  } catch (e) { console.error('logActivity:', e.message); }
}

/**
 * Tiến độ dự án (`toProject.progress`) là AVG(tasks.progress), và danh sách
 * project được cache dưới key PROJECTS_LIST. Mọi thay đổi task phải xoá cache
 * đó, nếu không card ngoài danh sách vẫn hiện số cũ tới khi hết TTL.
 */
function invalidateProjectsCache() {
  CacheService.clear(['PROJECTS_LIST']);
}

// GET /tasks?projectId=xxx&itemType=yyy
router.get('/', async (req, res, next) => {
  try {
    const { projectId, itemType } = req.query;
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];
    let idx = 1;

    if (projectId) { sql += ` AND project_id = $${idx}`; params.push(projectId); idx++; }
    if (itemType) { sql += ` AND item_type = $${idx}`; params.push(itemType); idx++; }

    sql += ' ORDER BY sort_order ASC, created_at ASC';

    const result = await query(sql, params);
    const tasks = result.rows.map(r => ({
      id: r.id, projectId: r.project_id,
      itemType: r.item_type, itemName: r.item_name,
      name: r.name, assigneeId: r.assignee_id,
      status: r.status, progress: r.progress,
      startDate: r.start_date, endDate: r.end_date,
      description: r.description || '', priority: r.priority,
      order: r.sort_order, createdAt: r.created_at,
    }));

    res.json({ success: true, data: tasks });
  } catch (err) {
    next(err);
  }
});

// POST /tasks
router.post('/', async (req, res, next) => {
  try {
    const d = req.body;
    const projectId = assertRequiredText(d.projectId, 'projectId', 50);
    const name = assertRequiredText(d.name, 'name', 1000);
    const status = normalizeStatus(d.status);
    const priority = normalizePriority(d.priority);
    const progress = clampPct(d.progress);
    assertDateRange(d.startDate, d.endDate, 'startDate', 'endDate');

    const project = await query('SELECT 1 FROM projects WHERE id = $1', [projectId]);
    if (project.rowCount === 0) throw badRequest('Project not found');

    const id = uuidv4();

    await query(`
      INSERT INTO tasks (id, project_id, item_type, item_name, name, assignee_id, status, progress, start_date, end_date, description, priority, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      id, projectId, d.itemType || '', resolveItemName(d.itemType),
      name, d.assigneeId || '', status, progress,
      d.startDate || null, d.endDate || null,
      d.description || '', priority, Number(d.order) || 0
    ]);

    await logActivity(req.user?.email || '', 'TASK_CREATE', `Created task ${name}`);
    invalidateProjectsCache();
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

// PUT /tasks/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const d = req.body;

    if (d.name !== undefined) d.name = assertRequiredText(d.name, 'name', 1000);
    if (d.status !== undefined) d.status = normalizeStatus(d.status);
    if (d.priority !== undefined) d.priority = normalizePriority(d.priority);
    if (d.progress !== undefined) d.progress = clampPct(d.progress);
    if (d.startDate !== undefined || d.endDate !== undefined) {
      assertDateRange(d.startDate, d.endDate, 'startDate', 'endDate');
    }

    const fields = []; const values = []; let idx = 1;

    const mapping = {
      name: 'name', itemType: 'item_type', assigneeId: 'assignee_id',
      status: 'status', progress: 'progress',
      startDate: 'start_date', endDate: 'end_date',
      description: 'description', priority: 'priority', order: 'sort_order'
    };

    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (d[jsKey] !== undefined) {
        fields.push(`${dbCol} = $${idx}`); values.push(d[jsKey]); idx++;
      }
    }

    // Auto-update item_name if item_type changed
    if (d.itemType !== undefined) {
      fields.push(`item_name = $${idx}`);
      values.push(resolveItemName(d.itemType));
      idx++;
    }

    if (fields.length === 0) throw badRequest('No fields to update');

    values.push(id);
    const result = await query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    if (result.rowCount === 0) {
      const err = new Error('Task not found');
      err.statusCode = 404;
      throw err;
    }

    await logActivity(req.user?.email || '', 'TASK_UPDATE', `Updated task ${id}`);
    invalidateProjectsCache();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /tasks/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM tasks WHERE id = $1 RETURNING name', [req.params.id]);
    if (result.rowCount === 0) {
      const err = new Error('Task not found');
      err.statusCode = 404;
      throw err;
    }
    await logActivity(req.user?.email || '', 'TASK_DELETE', `Deleted task ${result.rows[0].name}`);
    invalidateProjectsCache();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
