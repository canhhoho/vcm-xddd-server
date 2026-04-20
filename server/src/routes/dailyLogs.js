const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// GET /daily-logs?itemId=xxx
router.get('/', async (req, res) => {
    try {
        const { itemId } = req.query;
        if (!itemId) return res.json({ success: false, error: 'itemId required' });
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
        res.json({ success: false, error: err.message });
    }
});

// POST /daily-logs  (upsert: 1 log per item per day)
router.post('/', async (req, res) => {
    try {
        const { itemId, logDate, progressPct, note } = req.body;
        if (!itemId || !logDate) return res.json({ success: false, error: 'itemId and logDate required' });
        const pct = Math.min(100, Math.max(0, progressPct || 0));

        const existing = await query('SELECT id FROM daily_logs WHERE item_id = $1 AND log_date = $2', [itemId, logDate]);
        if (existing.rows.length > 0) {
            await query(
                'UPDATE daily_logs SET progress_pct=$1, note=$2, updated_by=$3 WHERE item_id=$4 AND log_date=$5',
                [pct, note || null, req.user?.id, itemId, logDate]
            );
        } else {
            await query(
                'INSERT INTO daily_logs (id, item_id, log_date, progress_pct, note, updated_by) VALUES ($1,$2,$3,$4,$5,$6)',
                [uuidv4(), itemId, logDate, pct, note || null, req.user?.id]
            );
        }

        // Sync progress_pct to the weekly plan item (latest value)
        await query('UPDATE weekly_plan_items SET progress_pct=$1 WHERE id=$2', [pct, itemId]);

        res.json({ success: true });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

module.exports = router;
