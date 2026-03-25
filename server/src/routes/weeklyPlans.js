/**
 * VCM XDDD — Weekly Plans Routes
 * CRUD for weekly work plans + items (5 per plan, carry-over support)
 */
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD
});

const MAX_ITEMS = 5;

function toPlan(row) {
  return {
    id: row.id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    department: row.department,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toItem(row) {
  return {
    id: row.id,
    planId: row.plan_id,
    sortOrder: row.sort_order,
    title: row.title,
    description: row.description,
    why: row.why || '',
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name || '',
    startDate: row.start_date,
    endDate: row.end_date,
    location: row.location || '',
    method: row.method || '',
    status: row.status,
    result: row.result,
    carriedFrom: row.carried_from,
    createdAt: row.created_at,
  };
}

// GET /weekly-plans?department=BD&weekStart=2026-03-24
router.get('/', async (req, res) => {
  try {
    const { department, weekStart } = req.query;
    let query = 'SELECT * FROM weekly_plans WHERE 1=1';
    const params = [];
    if (department) { params.push(department); query += ` AND department=$${params.length}`; }
    if (weekStart) { params.push(weekStart); query += ` AND week_start=$${params.length}`; }
    query += ' ORDER BY week_start DESC, department';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows.map(toPlan) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /weekly-plans — Create new plan (with optional carry-over)
router.post('/', async (req, res) => {
  try {
    const { weekStart, weekEnd, department, carryOverFromPlanId } = req.body;
    const id = uuidv4();
    const createdBy = req.user?.id || '';

    // Check if plan already exists for this week + department
    const existing = await pool.query(
      'SELECT id FROM weekly_plans WHERE week_start=$1 AND department=$2',
      [weekStart, department]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Plan already exists for this week and department' });
    }

    await pool.query(
      'INSERT INTO weekly_plans (id, week_start, week_end, department, created_by) VALUES ($1,$2,$3,$4,$5)',
      [id, weekStart, weekEnd, department, createdBy]
    );

    // Auto carry-over: copy incomplete items from previous plan
    if (carryOverFromPlanId) {
      const incompleteItems = await pool.query(
        `SELECT * FROM weekly_plan_items WHERE plan_id=$1 AND status != 'DONE' ORDER BY sort_order`,
        [carryOverFromPlanId]
      );
      for (let i = 0; i < incompleteItems.rows.length && i < MAX_ITEMS; i++) {
        const item = incompleteItems.rows[i];
        const newItemId = uuidv4();
        await pool.query(
          `INSERT INTO weekly_plan_items (id, plan_id, sort_order, title, description, why, assignee_id, start_date, end_date, location, method, status, carried_from)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'TODO',$12)`,
          [newItemId, id, i + 1, item.title, item.description, item.why || '', item.assignee_id, item.start_date, item.end_date, item.location || '', item.method || '', item.id]
        );
        // Mark original item as CARRIED_OVER
        await pool.query(
          `UPDATE weekly_plan_items SET status='CARRIED_OVER' WHERE id=$1`,
          [item.id]
        );
      }
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /weekly-plans/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM weekly_plans WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== ITEMS ====================

// GET /weekly-plans/:planId/items
router.get('/:planId/items', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT wi.*, u.name as assignee_name
       FROM weekly_plan_items wi
       LEFT JOIN users u ON wi.assignee_id = u.id
       WHERE wi.plan_id=$1 ORDER BY wi.sort_order`,
      [req.params.planId]
    );
    res.json({ success: true, data: result.rows.map(toItem) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /weekly-plans/:planId/items
router.post('/:planId/items', async (req, res) => {
  try {
    // Check item limit
    const count = await pool.query('SELECT COUNT(*) as c FROM weekly_plan_items WHERE plan_id=$1', [req.params.planId]);
    if (parseInt(count.rows[0].c) >= MAX_ITEMS) {
      return res.status(400).json({ success: false, error: `Maximum ${MAX_ITEMS} items per plan` });
    }

    const { sortOrder, title, description, why, assigneeId, startDate, endDate, location, method, status } = req.body;
    const id = uuidv4();
    await pool.query(
      `INSERT INTO weekly_plan_items (id, plan_id, sort_order, title, description, why, assignee_id, start_date, end_date, location, method, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, req.params.planId, sortOrder || 1, title, description || '', why || '', assigneeId || '', startDate || null, endDate || null, location || '', method || '', status || 'TODO']
    );
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /weekly-plan-items/:id
router.put('/items/:id', async (req, res) => {
  try {
    const { sortOrder, title, description, why, assigneeId, startDate, endDate, location, method, status, result } = req.body;
    await pool.query(
      `UPDATE weekly_plan_items SET sort_order=$1, title=$2, description=$3, why=$4, assignee_id=$5, start_date=$6, end_date=$7, location=$8, method=$9, status=$10, result=$11 WHERE id=$12`,
      [sortOrder, title, description || '', why || '', assigneeId || '', startDate || null, endDate || null, location || '', method || '', status || 'TODO', result || '', req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /weekly-plan-items/:id
router.delete('/items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM weekly_plan_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
