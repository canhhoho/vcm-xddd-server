const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const mapItem = (r) => ({
    id: r.id, planId: r.plan_id, sortOrder: r.sort_order,
    title: r.title, why: r.why, assigneeId: r.assignee_id,
    assigneeName: r.assignee_name || null, target: r.target,
    method: r.method, status: r.status, result: r.result,
    createdAt: r.created_at,
});

// GET /monthly-plans?department=BD&monthStart=2026-04-01
router.get('/', async (req, res) => {
    try {
        const { department, monthStart } = req.query;
        let sql = 'SELECT * FROM monthly_plans WHERE 1=1';
        const params = [];
        let idx = 1;
        if (department) { sql += ` AND department = $${idx++}`; params.push(department); }
        if (monthStart) { sql += ` AND month_start = $${idx++}`; params.push(monthStart); }
        sql += ' ORDER BY month_start DESC, department';
        const result = await query(sql, params);
        res.json({ success: true, data: result.rows.map(r => ({
            id: r.id, monthStart: r.month_start, department: r.department,
            createdBy: r.created_by, createdAt: r.created_at,
        }))});
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// POST /monthly-plans
router.post('/', async (req, res) => {
    try {
        const { monthStart, department } = req.body;
        if (!monthStart || !department) return res.json({ success: false, error: 'Missing monthStart or department' });
        const existing = await query('SELECT id FROM monthly_plans WHERE month_start = $1 AND department = $2', [monthStart, department]);
        if (existing.rows.length > 0) return res.json({ success: false, error: 'Plan already exists for this month/department' });
        const id = uuidv4();
        await query('INSERT INTO monthly_plans (id, month_start, department, created_by) VALUES ($1,$2,$3,$4)', [id, monthStart, department, req.user?.id]);
        const r = (await query('SELECT * FROM monthly_plans WHERE id = $1', [id])).rows[0];
        res.json({ success: true, data: { id: r.id, monthStart: r.month_start, department: r.department, createdBy: r.created_by, createdAt: r.created_at }});
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// DELETE /monthly-plans/:id
router.delete('/:id', async (req, res) => {
    try {
        await query('DELETE FROM monthly_plans WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// GET /monthly-plans/:planId/items
router.get('/:planId/items', async (req, res) => {
    try {
        const result = await query(
            `SELECT i.*, u.name as assignee_name FROM monthly_plan_items i
             LEFT JOIN users u ON i.assignee_id = u.id
             WHERE i.plan_id = $1 ORDER BY i.sort_order`,
            [req.params.planId]
        );
        res.json({ success: true, data: result.rows.map(mapItem) });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// POST /monthly-plans/:planId/items
router.post('/:planId/items', async (req, res) => {
    try {
        const { sortOrder, title, why, assigneeId, target, method, status } = req.body;
        if (!title) return res.json({ success: false, error: 'Title is required' });
        const id = uuidv4();
        await query(
            `INSERT INTO monthly_plan_items (id, plan_id, sort_order, title, why, assignee_id, target, method, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [id, req.params.planId, sortOrder || 1, title, why || null, assigneeId || null, target || null, method || null, status || 'TODO']
        );
        const result = await query(
            'SELECT i.*, u.name as assignee_name FROM monthly_plan_items i LEFT JOIN users u ON i.assignee_id = u.id WHERE i.id = $1', [id]
        );
        res.json({ success: true, data: mapItem(result.rows[0]) });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// PUT /monthly-plans/items/:id
router.put('/items/:id', async (req, res) => {
    try {
        const { sortOrder, title, why, assigneeId, target, method, status, result: itemResult } = req.body;
        await query(
            `UPDATE monthly_plan_items SET sort_order=$1, title=$2, why=$3, assignee_id=$4,
             target=$5, method=$6, status=$7, result=$8 WHERE id=$9`,
            [sortOrder || 1, title, why || null, assigneeId || null, target || null, method || null, status || 'TODO', itemResult || null, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// DELETE /monthly-plans/items/:id
router.delete('/items/:id', async (req, res) => {
    try {
        await query('DELETE FROM monthly_plan_items WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

module.exports = router;
