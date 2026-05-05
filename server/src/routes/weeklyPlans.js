/**
 * VCM XDDD — Weekly Plans Routes
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

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
    description: row.description || '',
    why: row.why || '',
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name || '',
    startDate: row.start_date,
    endDate: row.end_date,
    location: row.location || '',
    method: row.method || '',
    status: row.status,
    result: row.result || '',
    progressPct: row.progress_pct || 0,
    monthlyItemId: row.monthly_item_id || '',
    carriedFrom: row.carried_from,
    createdAt: row.created_at,
  };
}

// GET /weekly-plans
router.get('/', async (req, res) => {
  try {
    const { department, weekStart, includeItems } = req.query;
    let sql = 'SELECT * FROM weekly_plans WHERE 1=1';
    const params = [];
    if (department) { params.push(department); sql += ` AND department=$${params.length}`; }
    if (weekStart) { params.push(weekStart); sql += ` AND week_start=$${params.length}`; }
    sql += ' ORDER BY week_start DESC, department';
    
    const result = await query(sql, params);
    const plans = result.rows.map(toPlan);

    if (includeItems === 'true' && plans.length > 0) {
      const planIds = plans.map(p => p.id);
      const itemsResult = await query(
        `SELECT wi.*, u.name as assignee_name 
         FROM weekly_plan_items wi 
         LEFT JOIN users u ON wi.assignee_id = u.id 
         WHERE wi.plan_id = ANY($1) 
         ORDER BY wi.plan_id, wi.sort_order`,
        [planIds]
      );
      
      const itemsMap = {};
      itemsResult.rows.forEach(row => {
        if (!itemsMap[row.plan_id]) itemsMap[row.plan_id] = [];
        itemsMap[row.plan_id].push(toItem(row));
      });

      plans.forEach(p => {
        p.items = itemsMap[p.id] || [];
      });
    }

    res.json({ success: true, data: plans });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /weekly-plans
router.post('/', async (req, res) => {
  try {
    const { weekStart, weekEnd, department, carryOverFromPlanId } = req.body;
    const id = uuidv4();
    const createdBy = req.user?.id || '';

    const existing = await query(
      'SELECT id FROM weekly_plans WHERE week_start=$1 AND department=$2',
      [weekStart, department]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: false, error: 'Plan already exists for this week and department' });
    }

    await query(
      'INSERT INTO weekly_plans (id, week_start, week_end, department, created_by) VALUES ($1,$2,$3,$4,$5)',
      [id, weekStart, weekEnd, department, createdBy]
    );

    if (carryOverFromPlanId) {
      const incompleteItems = await query(
        `SELECT * FROM weekly_plan_items WHERE plan_id=$1 AND status != 'DONE' ORDER BY sort_order`,
        [carryOverFromPlanId]
      );
      for (let i = 0; i < incompleteItems.rows.length; i++) {
        const item = incompleteItems.rows[i];
        const newItemId = uuidv4();
        await query(
          `INSERT INTO weekly_plan_items (id, plan_id, sort_order, title, description, why, assignee_id, start_date, end_date, location, method, status, progress_pct, monthly_item_id, carried_from)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'TODO',$12,$13,$14)`,
          [newItemId, id, i + 1, item.title, item.description, item.why || '', item.assignee_id, item.start_date, item.end_date, item.location || '', item.method || '', item.progress_pct || 0, item.monthly_item_id || '', item.id]
        );
        await query('UPDATE weekly_plan_items SET status=\'CARRIED_OVER\' WHERE id=$1', [item.id]);
      }
    }

    res.json({ success: true, data: { id } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /weekly-plans/:id
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM weekly_plans WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==================== ITEMS ====================

// GET /weekly-plans/:planId/items
router.get('/:planId/items', async (req, res) => {
  try {
    const result = await query(
      `SELECT wi.*, u.name as assignee_name
       FROM weekly_plan_items wi
       LEFT JOIN users u ON wi.assignee_id = u.id
       WHERE wi.plan_id=$1 ORDER BY wi.sort_order`,
      [req.params.planId]
    );
    res.json({ success: true, data: result.rows.map(toItem) });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /weekly-plans/:planId/items
router.post('/:planId/items', async (req, res) => {
  try {
    const { sortOrder, title, description, why, assigneeId, startDate, endDate, location, method, status, monthlyItemId } = req.body;
    const id = uuidv4();
    await query(
      `INSERT INTO weekly_plan_items (id, plan_id, sort_order, title, description, why, assignee_id, start_date, end_date, location, method, status, monthly_item_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, req.params.planId, sortOrder || 1, title, description || '', why || '', assigneeId || '', startDate || null, endDate || null, location || '', method || '', status || 'TODO', monthlyItemId || '']
    );
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /weekly-plan-items/:id
router.put('/items/:id', async (req, res) => {
  try {
    const { sortOrder, title, description, why, assigneeId, startDate, endDate, location, method, status, result, progressPct, monthlyItemId } = req.body;
    await query(
      `UPDATE weekly_plan_items 
       SET sort_order=$1, title=$2, description=$3, why=$4, assignee_id=$5, start_date=$6, end_date=$7, 
           location=$8, method=$9, status=$10, result=$11, progress_pct=$12, monthly_item_id=$13 
       WHERE id=$14`,
      [sortOrder, title, description || '', why || '', assigneeId || '', startDate || null, endDate || null, location || '', method || '', status || 'TODO', result || '', progressPct || 0, monthlyItemId || '', req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// BATCH PUT /weekly-plans/items/batch-status
router.put('/items/batch-status', async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.json({ success: false, error: 'No IDs provided' });
    
    await query('UPDATE weekly_plan_items SET status=$1 WHERE id = ANY($2)', [status, ids]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /weekly-plan-items/:id
router.delete('/items/:id', async (req, res) => {
  try {
    await query('DELETE FROM weekly_plan_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
