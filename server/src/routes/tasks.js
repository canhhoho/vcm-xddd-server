/**
 * Task Routes — CRUD /tasks
 * Port of getTasks, createTask, updateTask, deleteTask from Code.gs
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const APP_CONFIG = require('../config');

async function logActivity(email, action, description) {
  try {
    await query('INSERT INTO activities (id, email, action, description) VALUES ($1, $2, $3, $4)',
      [uuidv4(), email, action, description]);
  } catch (e) { console.error('logActivity:', e.message); }
}

// GET /tasks?projectId=xxx&itemType=yyy
router.get('/', async (req, res) => {
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
    res.json({ success: false, error: err.message });
  }
});

// POST /tasks
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const id = uuidv4();

    // Resolve item name from type
    let itemName = '';
    if (d.itemType) {
      const itemObj = APP_CONFIG.PROJECT_ITEM_TYPES.find(t => t.id === d.itemType);
      itemName = itemObj ? itemObj.name : d.itemType;
    }

    await query(`
      INSERT INTO tasks (id, project_id, item_type, item_name, name, assignee_id, status, progress, start_date, end_date, description, priority, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      id, d.projectId, d.itemType || '', itemName,
      d.name, d.assigneeId || '', d.status || 'TODO', d.progress || 0,
      d.startDate || null, d.endDate || null,
      d.description || '', d.priority || 'MEDIUM', d.order || 0
    ]);

    await logActivity(req.user?.email || '', 'TASK_CREATE', `Created task ${d.name}`);
    res.json({ success: true, id });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /tasks/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
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
      const itemObj = APP_CONFIG.PROJECT_ITEM_TYPES.find(t => t.id === d.itemType);
      fields.push(`item_name = $${idx}`);
      values.push(itemObj ? itemObj.name : d.itemType);
      idx++;
    }

    if (fields.length === 0) return res.json({ success: false, error: 'No fields to update' });

    values.push(id);
    await query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx}`, values);

    await logActivity(req.user?.email || '', 'TASK_UPDATE', `Updated task ${id}`);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM tasks WHERE id = $1 RETURNING name', [req.params.id]);
    if (result.rowCount === 0) return res.json({ success: false, error: 'Task not found' });
    await logActivity(req.user?.email || '', 'TASK_DELETE', `Deleted task ${result.rows[0].name}`);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
