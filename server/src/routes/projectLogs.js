/**
 * Project Logs Routes — Nhật ký Thi công
 * 
 * GET  /project-logs?projectId=xxx&month=YYYY-MM  → Lấy logs theo project (filter tháng tuỳ chọn)
 * POST /project-logs                               → Tạo hoặc cập nhật nhật ký (upsert 1/ngày/project)
 * DELETE /project-logs/:id                         → Xóa nhật ký
 */

const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');

// Helper: map DB row → JS object
function toProjectLog(r) {
    return {
        id: r.id,
        projectId: r.project_id,
        logDate: r.log_date instanceof Date
            ? r.log_date.toISOString().slice(0, 10)
            : String(r.log_date).slice(0, 10),
        weather: r.weather || null,
        workersCount: r.workers_count || 0,
        progressPct: r.progress_pct || 0,
        activities: r.activities || '',
        issues: r.issues || '',
        materials: r.materials || '',
        equipment: r.equipment || '',
        note: r.note || '',
        createdBy: r.created_by || null,
        createdByName: r.created_by_name || '',
        updatedBy: r.updated_by || null,
        updatedAt: r.updated_at,
        createdAt: r.created_at,
    };
}

// ==================== GET /project-logs ====================
// Query params: projectId (bắt buộc), month (YYYY-MM, tuỳ chọn)
router.get('/', async (req, res) => {
    try {
        const { projectId, month } = req.query;
        if (!projectId) return res.json({ success: false, error: 'projectId is required' });

        let sql = `
            SELECT pl.*
            FROM project_logs pl
            WHERE pl.project_id = $1
        `;
        const params = [projectId];

        // Filter theo tháng nếu có (YYYY-MM)
        if (month && /^\d{4}-\d{2}$/.test(month)) {
            sql += ` AND TO_CHAR(pl.log_date, 'YYYY-MM') = $2`;
            params.push(month);
        }

        sql += ` ORDER BY pl.log_date DESC`;

        const result = await query(sql, params);
        res.json({ success: true, data: result.rows.map(toProjectLog) });
    } catch (err) {
        console.error('[project-logs GET]', err.message);
        res.json({ success: false, error: err.message });
    }
});

// ==================== POST /project-logs (upsert) ====================
router.post('/', async (req, res) => {
    try {
        const {
            projectId, logDate,
            weather, workersCount, progressPct,
            activities, issues, materials, equipment, note,
        } = req.body;

        if (!projectId || !logDate) {
            return res.json({ success: false, error: 'projectId và logDate là bắt buộc' });
        }

        // Validate
        const pct = Math.min(100, Math.max(0, parseInt(progressPct) || 0));
        const workers = Math.max(0, parseInt(workersCount) || 0);

        // Lấy tên người dùng để cache vào created_by_name
        let currentUserName = '';
        if (req.user?.id) {
            const userResult = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
            currentUserName = userResult.rows[0]?.name || '';
        }

        // Kiểm tra đã có log ngày này chưa
        const existing = await query(
            'SELECT id FROM project_logs WHERE project_id = $1 AND log_date = $2',
            [projectId, logDate]
        );

        let logId;
        if (existing.rows.length > 0) {
            // UPDATE
            logId = existing.rows[0].id;
            await query(`
                UPDATE project_logs SET
                    weather = $1, workers_count = $2, progress_pct = $3,
                    activities = $4, issues = $5, materials = $6,
                    equipment = $7, note = $8,
                    updated_by = $9, updated_at = NOW()
                WHERE project_id = $10 AND log_date = $11
            `, [
                weather || null, workers, pct,
                activities || null, issues || null, materials || null,
                equipment || null, note || null,
                req.user?.id || null, projectId, logDate
            ]);
        } else {
            // INSERT
            logId = uuidv4();
            await query(`
                INSERT INTO project_logs
                    (id, project_id, log_date, weather, workers_count, progress_pct,
                     activities, issues, materials, equipment, note,
                     created_by, created_by_name, updated_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            `, [
                logId, projectId, logDate,
                weather || null, workers, pct,
                activities || null, issues || null, materials || null,
                equipment || null, note || null,
                req.user?.id || null, currentUserName, req.user?.id || null
            ]);
        }

        // ── Auto-sync: Cập nhật project.progress = progress_pct của nhật ký mới nhất ──
        // Lấy progress_pct của ngày gần nhất (có thể không phải ngày vừa ghi)
        const latestLog = await query(`
            SELECT progress_pct FROM project_logs
            WHERE project_id = $1
            ORDER BY log_date DESC
            LIMIT 1
        `, [projectId]);

        if (latestLog.rows.length > 0) {
            await query(
                'UPDATE projects SET progress = $1 WHERE id = $2',
                [latestLog.rows[0].progress_pct, projectId]
            );
            // Invalidate projects cache
            CacheService.clear(['PROJECTS_LIST']);
        }

        res.json({ success: true, id: logId });
    } catch (err) {
        console.error('[project-logs POST]', err.message);
        res.json({ success: false, error: err.message });
    }
});

// ==================== DELETE /project-logs/:id ====================
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Lấy projectId trước khi xóa để re-sync progress
        const logRow = await query(
            'SELECT project_id FROM project_logs WHERE id = $1',
            [id]
        );
        if (logRow.rows.length === 0) {
            return res.json({ success: false, error: 'Nhật ký không tồn tại' });
        }
        const projectId = logRow.rows[0].project_id;

        await query('DELETE FROM project_logs WHERE id = $1', [id]);

        // Re-sync progress từ log mới nhất còn lại
        const latestLog = await query(`
            SELECT progress_pct FROM project_logs
            WHERE project_id = $1
            ORDER BY log_date DESC
            LIMIT 1
        `, [projectId]);

        if (latestLog.rows.length > 0) {
            await query(
                'UPDATE projects SET progress = $1 WHERE id = $2',
                [latestLog.rows[0].progress_pct, projectId]
            );
        } else {
            // Không còn log nào → reset về 0 hoặc giữ nguyên? Reset về 0
            await query('UPDATE projects SET progress = 0 WHERE id = $1', [projectId]);
        }
        CacheService.clear(['PROJECTS_LIST']);

        res.json({ success: true });
    } catch (err) {
        console.error('[project-logs DELETE]', err.message);
        res.json({ success: false, error: err.message });
    }
});

module.exports = router;
