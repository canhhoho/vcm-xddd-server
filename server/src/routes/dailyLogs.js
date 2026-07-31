const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { clampPct, assertRequiredDate, badRequest } = require('./_planValidators');

// GET /daily-logs?itemId=xxx
router.get('/', async (req, res, next) => {
    try {
        const { itemId } = req.query;
        if (!itemId) throw badRequest('itemId required');
        const result = await query(
            `SELECT dl.*, u.name as updater_name FROM daily_logs dl
             LEFT JOIN users u ON dl.updated_by = u.id
             WHERE dl.item_id = $1 ORDER BY dl.log_date DESC`,
            [itemId]
        );
        res.json({ success: true, data: result.rows.map(r => ({
            id: r.id, itemId: r.item_id, logDate: r.log_date,
            progressPct: r.progress_pct, note: r.note,
            updatedBy: r.updated_by, updaterName: r.updater_name,
            createdAt: r.created_at,
        }))});
    } catch (err) {
        next(err);
    }
});

// POST /daily-logs  (upsert: 1 log per item per day)
router.post('/', async (req, res, next) => {
    try {
        const { itemId, logDate, progressPct, note } = req.body;
        if (!itemId) throw badRequest('itemId required');
        const cleanDate = assertRequiredDate(logDate, 'logDate');
        const pct = clampPct(progressPct);

        // Dựa vào unique index (item_id, log_date) — tránh race của check-then-write
        await query(
            `INSERT INTO daily_logs (id, item_id, log_date, progress_pct, note, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (item_id, log_date)
             DO UPDATE SET progress_pct = EXCLUDED.progress_pct,
                           note         = EXCLUDED.note,
                           updated_by   = EXCLUDED.updated_by`,
            [uuidv4(), itemId, cleanDate, pct, note || null, req.user?.id]
        );

        // Đồng bộ tiến độ của đầu việc theo log có ngày MỚI NHẤT — không phải
        // log vừa ghi, để sửa log quá khứ không kéo tụt tiến độ hiện tại.
        await query(
            `UPDATE weekly_plan_items SET progress_pct = COALESCE(
                (SELECT progress_pct FROM daily_logs WHERE item_id=$1 ORDER BY log_date DESC LIMIT 1), 0
             ) WHERE id=$1`,
            [itemId]
        );

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
