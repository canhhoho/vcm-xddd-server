/**
 * VCM XDDD — Weekly Plans Routes
 */
const express = require('express');
const router = express.Router();
const { query, getClient } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const {
  assertTitle,
  clampPct,
  assertStatus,
  assertDateRange,
  assertRequiredDate,
  assertIds,
  nullIfBlank,
  textOrEmpty,
  conflict,
} = require('./_planValidators');

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
    assigneeId: row.assignee_id || '',
    assigneeName: row.assignee_name || '',
    startDate: row.start_date,
    endDate: row.end_date,
    location: row.location || '',
    method: row.method || '',
    status: row.status,
    result: row.result || '',
    progressPct: row.progress_pct || 0,
    monthlyItemId: row.monthly_item_id || '',
    carriedFrom: row.carried_from || '',
    createdAt: row.created_at,
  };
}

// GET /weekly-plans
router.get('/', async (req, res, next) => {
  try {
    const { department, weekStart, weekFrom, weekTo, includeItems, limit } = req.query;
    let sql = 'SELECT * FROM weekly_plans WHERE 1=1';
    const params = [];

    if (department) {
      params.push(department);
      sql += ` AND department=$${params.length}`;
    } else if (req.planAccess && !req.planAccess.isAdmin) {
      // Không chỉ định phòng ban: chỉ trả về phòng ban user được xem
      params.push(req.planAccess.allowedDepartments);
      sql += ` AND department = ANY($${params.length})`;
    }
    if (weekStart) { params.push(weekStart); sql += ` AND week_start=$${params.length}`; }
    if (weekFrom) { params.push(weekFrom); sql += ` AND week_start>=$${params.length}`; }
    if (weekTo) { params.push(weekTo); sql += ` AND week_start<=$${params.length}`; }

    sql += ' ORDER BY week_start DESC, department';

    const parsedLimit = parseInt(limit, 10);
    if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
      params.push(Math.min(parsedLimit, 500));
      sql += ` LIMIT $${params.length}`;
    }

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
    next(err);
  }
});

// POST /weekly-plans
router.post('/', async (req, res, next) => {
  const { weekStart, weekEnd, department, carryOverFromPlanId } = req.body;
  let client;
  try {
    const { start, end } = assertDateRange(
      assertRequiredDate(weekStart, 'weekStart'),
      assertRequiredDate(weekEnd, 'weekEnd'),
      'weekStart',
      'weekEnd'
    );
    if (!department) throw conflict('department is required');

    const id = uuidv4();
    const createdBy = req.user?.id || '';

    client = await getClient();
    await client.query('BEGIN');

    await client.query(
      'INSERT INTO weekly_plans (id, week_start, week_end, department, created_by) VALUES ($1,$2,$3,$4,$5)',
      [id, start, end, department, createdBy]
    );

    if (carryOverFromPlanId) {
      // Copy các đầu việc chưa hoàn thành sang tuần mới.
      // 3 query trong transaction thay vì 2N+1 round-trip như trước.
      const incomplete = await client.query(
        `SELECT * FROM weekly_plan_items
         WHERE plan_id=$1 AND status != 'DONE'
         ORDER BY sort_order, created_at`,
        [carryOverFromPlanId]
      );

      if (incomplete.rows.length > 0) {
        const COLS = 15;
        const values = [];
        const placeholders = incomplete.rows.map((item, i) => {
          values.push(
            uuidv4(), id, i + 1, item.title, item.description || '', item.why || '',
            item.assignee_id, item.start_date, item.end_date, item.location || '',
            item.method || '', 'TODO', item.progress_pct || 0, item.monthly_item_id, item.id
          );
          const base = i * COLS;
          return `(${Array.from({ length: COLS }, (_, c) => `$${base + c + 1}`).join(',')})`;
        });

        await client.query(
          `INSERT INTO weekly_plan_items
             (id, plan_id, sort_order, title, description, why, assignee_id, start_date, end_date,
              location, method, status, progress_pct, monthly_item_id, carried_from)
           VALUES ${placeholders.join(',')}`,
          values
        );
        await client.query(
          `UPDATE weekly_plan_items SET status='CARRIED_OVER' WHERE plan_id=$1 AND status != 'DONE'`,
          [carryOverFromPlanId]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, data: { id } });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    }
    if (err.code === '23505') {
      return next(conflict('Plan already exists for this week and department'));
    }
    next(err);
  } finally {
    if (client) client.release();
  }
});

// DELETE /weekly-plans/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM weekly_plans WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ==================== ITEMS ====================

// GET /weekly-plans/:planId/items
router.get('/:planId/items', async (req, res, next) => {
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
    next(err);
  }
});

// POST /weekly-plans/:planId/items
router.post('/:planId/items', async (req, res, next) => {
  try {
    const { sortOrder, title, description, why, assigneeId, startDate, endDate, location, method, status, monthlyItemId } = req.body;
    const cleanTitle = assertTitle(title);
    const cleanStatus = assertStatus(status);
    const { start, end } = assertDateRange(startDate, endDate);

    const id = uuidv4();
    await query(
      `INSERT INTO weekly_plan_items (id, plan_id, sort_order, title, description, why, assignee_id, start_date, end_date, location, method, status, monthly_item_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id, req.params.planId, parseInt(sortOrder, 10) || 1, cleanTitle,
        textOrEmpty(description), textOrEmpty(why), nullIfBlank(assigneeId),
        start, end, textOrEmpty(location), textOrEmpty(method), cleanStatus,
        nullIfBlank(monthlyItemId),
      ]
    );
    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
});

// BATCH PUT /weekly-plans/items/batch-status
// LƯU Ý: phải đứng TRƯỚC '/items/:id', nếu không Express sẽ match 'batch-status'
// như một id và câu UPDATE chạy 0 dòng mà vẫn trả success.
router.put('/items/batch-status', async (req, res, next) => {
  try {
    const ids = assertIds(req.body.ids);
    const status = assertStatus(req.body.status);
    await query('UPDATE weekly_plan_items SET status=$1 WHERE id = ANY($2)', [status, ids]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PUT /weekly-plans/items/:id
router.put('/items/:id', async (req, res, next) => {
  try {
    const { sortOrder, title, description, why, assigneeId, startDate, endDate, location, method, status, result, progressPct, monthlyItemId } = req.body;
    const cleanTitle = assertTitle(title);
    const cleanStatus = assertStatus(status);
    const { start, end } = assertDateRange(startDate, endDate);

    await query(
      `UPDATE weekly_plan_items
       SET sort_order=$1, title=$2, description=$3, why=$4, assignee_id=$5, start_date=$6, end_date=$7,
           location=$8, method=$9, status=$10, result=$11, progress_pct=$12, monthly_item_id=$13
       WHERE id=$14`,
      [
        parseInt(sortOrder, 10) || 1, cleanTitle, textOrEmpty(description), textOrEmpty(why),
        nullIfBlank(assigneeId), start, end, textOrEmpty(location), textOrEmpty(method),
        cleanStatus, textOrEmpty(result), clampPct(progressPct), nullIfBlank(monthlyItemId),
        req.params.id,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /weekly-plans/items/:id
router.delete('/items/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM weekly_plan_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
