const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const {
  assertTitle,
  assertStatus,
  assertRequiredDate,
  nullIfBlank,
  textOrEmpty,
  conflict,
  badRequest,
} = require('./_planValidators');

const mapItem = (r) => ({
    id: r.id, planId: r.plan_id, sortOrder: r.sort_order,
    title: r.title, why: r.why, assigneeId: r.assignee_id,
    assigneeName: r.assignee_name || null, target: r.target,
    method: r.method, status: r.status, result: r.result,
    createdAt: r.created_at,
});

// GET /monthly-plans?department=BD&monthStart=2026-04-01
router.get('/', async (req, res, next) => {
    try {
        const { department, monthStart, includeItems } = req.query;
        let sql = 'SELECT * FROM monthly_plans WHERE 1=1';
        const params = [];

        if (department) {
            params.push(department);
            sql += ` AND department = $${params.length}`;
        } else if (req.planAccess && !req.planAccess.isAdmin) {
            params.push(req.planAccess.allowedDepartments);
            sql += ` AND department = ANY($${params.length})`;
        }
        if (monthStart) { params.push(monthStart); sql += ` AND month_start = $${params.length}`; }
        sql += ' ORDER BY month_start DESC, department';

        const result = await query(sql, params);
        const plans = result.rows.map(r => ({
            id: r.id, monthStart: r.month_start, department: r.department,
            createdBy: r.created_by, createdAt: r.created_at,
        }));

        if (includeItems === 'true' && plans.length > 0) {
            const planIds = plans.map(p => p.id);
            const itemsResult = await query(
                `SELECT i.*, u.name as assignee_name FROM monthly_plan_items i
                 LEFT JOIN users u ON i.assignee_id = u.id
                 WHERE i.plan_id = ANY($1) ORDER BY i.plan_id, i.sort_order`,
                [planIds]
            );
            const itemsMap = {};
            itemsResult.rows.forEach(row => {
                if (!itemsMap[row.plan_id]) itemsMap[row.plan_id] = [];
                itemsMap[row.plan_id].push(mapItem(row));
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

// POST /monthly-plans
router.post('/', async (req, res, next) => {
    try {
        const { monthStart, department } = req.body;
        const cleanMonth = assertRequiredDate(monthStart, 'monthStart');
        if (!department) throw badRequest('department is required');

        const id = uuidv4();
        await query(
            'INSERT INTO monthly_plans (id, month_start, department, created_by) VALUES ($1,$2,$3,$4)',
            [id, cleanMonth, department, req.user?.id]
        );
        const r = (await query('SELECT * FROM monthly_plans WHERE id = $1', [id])).rows[0];
        res.json({ success: true, data: { id: r.id, monthStart: r.month_start, department: r.department, createdBy: r.created_by, createdAt: r.created_at }});
    } catch (err) {
        if (err.code === '23505') {
            return next(conflict('Plan already exists for this month/department'));
        }
        next(err);
    }
});

// DELETE /monthly-plans/:id
router.delete('/:id', async (req, res, next) => {
    try {
        await query('DELETE FROM monthly_plans WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// GET /monthly-plans/:planId/items
router.get('/:planId/items', async (req, res, next) => {
    try {
        const result = await query(
            `SELECT i.*, u.name as assignee_name FROM monthly_plan_items i
             LEFT JOIN users u ON i.assignee_id = u.id
             WHERE i.plan_id = $1 ORDER BY i.sort_order`,
            [req.params.planId]
        );
        res.json({ success: true, data: result.rows.map(mapItem) });
    } catch (err) {
        next(err);
    }
});

// POST /monthly-plans/:planId/items
router.post('/:planId/items', async (req, res, next) => {
    try {
        const { sortOrder, title, why, assigneeId, target, method, status } = req.body;
        const cleanTitle = assertTitle(title);
        // Kế hoạch tháng không có khái niệm "chuyển sang kỳ sau"
        const cleanStatus = assertStatus(status, { allowCarriedOver: false });

        const id = uuidv4();
        await query(
            `INSERT INTO monthly_plan_items (id, plan_id, sort_order, title, why, assignee_id, target, method, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
                id, req.params.planId, parseInt(sortOrder, 10) || 1, cleanTitle,
                textOrEmpty(why), nullIfBlank(assigneeId), textOrEmpty(target),
                textOrEmpty(method), cleanStatus,
            ]
        );
        const result = await query(
            'SELECT i.*, u.name as assignee_name FROM monthly_plan_items i LEFT JOIN users u ON i.assignee_id = u.id WHERE i.id = $1', [id]
        );
        res.json({ success: true, data: mapItem(result.rows[0]) });
    } catch (err) {
        next(err);
    }
});

// PUT /monthly-plans/items/:id
router.put('/items/:id', async (req, res, next) => {
    try {
        const { sortOrder, title, why, assigneeId, target, method, status, result: itemResult } = req.body;
        const cleanTitle = assertTitle(title);
        const cleanStatus = assertStatus(status, { allowCarriedOver: false });

        await query(
            `UPDATE monthly_plan_items SET sort_order=$1, title=$2, why=$3, assignee_id=$4,
             target=$5, method=$6, status=$7, result=$8 WHERE id=$9`,
            [
                parseInt(sortOrder, 10) || 1, cleanTitle, textOrEmpty(why), nullIfBlank(assigneeId),
                textOrEmpty(target), textOrEmpty(method), cleanStatus, textOrEmpty(itemResult),
                req.params.id,
            ]
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// DELETE /monthly-plans/items/:id
router.delete('/items/:id', async (req, res, next) => {
    try {
        await query('DELETE FROM monthly_plan_items WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
