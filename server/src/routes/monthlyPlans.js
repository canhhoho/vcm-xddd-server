const router = require('express').Router();
const { query, getClient } = require('../config/database');
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
    title: r.title, why: r.why,
    // Người phụ trách là TEXT TỰ DO do người dùng gõ, không tra sang bảng users.
    // Cột assignee_id cũ đã bị xoá — xem migrate-plan-assignee-text.sql.
    assigneeName: r.assignee_name || '', target: r.target,
    method: r.method, status: r.status, result: r.result,
    createdAt: r.created_at,
});

// GET /monthly-plans?department=BD&monthStart=2026-04-01
router.get('/', async (req, res, next) => {
    try {
        const { department, monthStart, monthBefore, includeItems, limit } = req.query;
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
        // monthBefore + limit=1: lấy kế hoạch tháng gần nhất TRƯỚC một mốc, dùng cho
        // nút "Copy từ tháng trước". Mirror weekFrom/weekTo/limit của weeklyPlans.js.
        if (monthBefore) { params.push(monthBefore); sql += ` AND month_start < $${params.length}`; }
        sql += ' ORDER BY month_start DESC, department';

        const parsedLimit = parseInt(limit, 10);
        if (Number.isInteger(parsedLimit) && parsedLimit > 0) {
            params.push(Math.min(parsedLimit, 500));
            sql += ` LIMIT $${params.length}`;
        }

        const result = await query(sql, params);
        const plans = result.rows.map(r => ({
            id: r.id, monthStart: r.month_start, department: r.department,
            createdBy: r.created_by, createdAt: r.created_at,
        }));

        if (includeItems === 'true' && plans.length > 0) {
            const planIds = plans.map(p => p.id);
            const itemsResult = await query(
                `SELECT i.* FROM monthly_plan_items i
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

// POST /monthly-plans/copy-previous
// Copy các mục tiêu CHƯA HOÀN THÀNH của kế hoạch tháng gần nhất trước tháng đích
// sang tháng đích (tạo kế hoạch tháng đích nếu chưa có, nối tiếp nếu đã có).
//
// LƯU Ý 1: segment tĩnh phải đăng ký TRƯỚC mọi route '/:param' cùng cấp bên dưới,
//   nếu không Express sẽ match 'copy-previous' như một id. Xem .claude/rules/route-ordering.md.
// LƯU Ý 2: plan nguồn được suy ra ở SERVER từ department + month_start, KHÔNG nhận
//   id từ client. planAccess chỉ kiểm req.body.department nên nếu cho client chọn
//   plan nguồn thì user có EDIT ở một phòng ban sẽ kéo được item của phòng ban khác.
router.post('/copy-previous', async (req, res, next) => {
    let client;
    try {
        const { monthStart, department } = req.body;
        const cleanMonth = assertRequiredDate(monthStart, 'monthStart');
        if (!department) throw badRequest('department is required');

        client = await getClient();
        await client.query('BEGIN');

        // 1. Kế hoạch tháng gần nhất TRƯỚC tháng đích, cùng phòng ban
        const src = await client.query(
            `SELECT id, month_start FROM monthly_plans
             WHERE department = $1 AND month_start < $2
             ORDER BY month_start DESC LIMIT 1`,
            [department, cleanMonth]
        );
        if (src.rows.length === 0) throw badRequest('No previous monthly plan to copy from');

        // 2. Chỉ mục tiêu chưa hoàn thành. Khác weekly: KHÔNG đánh dấu item nguồn,
        //    vì monthly không có status CARRIED_OVER.
        const items = await client.query(
            `SELECT * FROM monthly_plan_items
             WHERE plan_id = $1 AND status != 'DONE'
             ORDER BY sort_order, created_at`,
            [src.rows[0].id]
        );
        if (items.rows.length === 0) throw badRequest('Previous monthly plan has no unfinished goals');

        // 3. Plan đích: dùng lại nếu có, tạo mới nếu chưa
        const existing = await client.query(
            'SELECT id FROM monthly_plans WHERE month_start = $1 AND department = $2',
            [cleanMonth, department]
        );
        let targetId = existing.rows[0] && existing.rows[0].id;
        if (!targetId) {
            targetId = uuidv4();
            await client.query(
                'INSERT INTO monthly_plans (id, month_start, department, created_by) VALUES ($1,$2,$3,$4)',
                [targetId, cleanMonth, department, req.user?.id || '']
            );
        }

        // 4. Nối tiếp sort_order sau item đang có
        const maxRow = await client.query(
            'SELECT COALESCE(MAX(sort_order), 0) AS m FROM monthly_plan_items WHERE plan_id = $1',
            [targetId]
        );
        const base = parseInt(maxRow.rows[0].m, 10) || 0;

        // 5. Bulk insert một câu thay vì N round-trip. Bỏ qua cột status/result để
        //    DEFAULT của schema ('TODO' / '') tự áp dụng.
        const COLS = 8;
        const values = [];
        const placeholders = items.rows.map((it, i) => {
            values.push(
                uuidv4(), targetId, base + i + 1, it.title, it.why || '',
                it.assignee_name || '', it.target || '', it.method || ''
            );
            const b = i * COLS;
            return `(${Array.from({ length: COLS }, (_, c) => `$${b + c + 1}`).join(',')})`;
        });
        await client.query(
            `INSERT INTO monthly_plan_items
               (id, plan_id, sort_order, title, why, assignee_name, target, method)
             VALUES ${placeholders.join(',')}`,
            values
        );

        await client.query('COMMIT');
        res.json({
            success: true,
            data: {
                planId: targetId,
                copiedCount: items.rows.length,
                sourceMonthStart: src.rows[0].month_start,
            },
        });
    } catch (err) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        }
        if (err.code === '23505') {
            return next(conflict('Plan already exists for this month/department'));
        }
        next(err);
    } finally {
        if (client) client.release();
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
            `SELECT i.* FROM monthly_plan_items i
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
        const { sortOrder, title, why, assigneeName, target, method, status } = req.body;
        const cleanTitle = assertTitle(title);
        // Kế hoạch tháng không có khái niệm "chuyển sang kỳ sau"
        const cleanStatus = assertStatus(status, { allowCarriedOver: false });

        const id = uuidv4();
        await query(
            `INSERT INTO monthly_plan_items (id, plan_id, sort_order, title, why, assignee_name, target, method, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
                id, req.params.planId, parseInt(sortOrder, 10) || 1, cleanTitle,
                // assignee_name là cột TEXT nên dùng textOrEmpty (''), không phải
                // nullIfBlank (NULL) như hồi nó còn là khoá ngoại mềm assignee_id.
                textOrEmpty(why), textOrEmpty(assigneeName).trim(), textOrEmpty(target),
                textOrEmpty(method), cleanStatus,
            ]
        );
        const result = await query(
            'SELECT i.* FROM monthly_plan_items i WHERE i.id = $1', [id]
        );
        res.json({ success: true, data: mapItem(result.rows[0]) });
    } catch (err) {
        next(err);
    }
});

// PUT /monthly-plans/items/:id
router.put('/items/:id', async (req, res, next) => {
    try {
        const { sortOrder, title, why, assigneeName, target, method, status, result: itemResult } = req.body;
        const cleanTitle = assertTitle(title);
        const cleanStatus = assertStatus(status, { allowCarriedOver: false });

        await query(
            `UPDATE monthly_plan_items SET sort_order=$1, title=$2, why=$3, assignee_name=$4,
             target=$5, method=$6, status=$7, result=$8 WHERE id=$9`,
            [
                parseInt(sortOrder, 10) || 1, cleanTitle, textOrEmpty(why), textOrEmpty(assigneeName).trim(),
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
