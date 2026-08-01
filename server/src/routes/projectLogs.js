/**
 * Project Logs Routes — Nhật ký Thi công
 *
 * GET  /project-logs?projectId=xxx&month=YYYY-MM  → Lấy logs theo project (filter tháng tuỳ chọn)
 * POST /project-logs                               → Tạo hoặc cập nhật nhật ký (upsert 1/ngày/project)
 * DELETE /project-logs/:id                         → Xóa nhật ký
 *
 * Phân quyền: mount kèm moduleAccess('projects') trong app.js. Trước đây route
 * này mount trần nên bất kỳ user đã đăng nhập nào cũng ghi/xoá được nhật ký của
 * mọi dự án — kiểm tra "chỉ member mới ghi" chỉ tồn tại ở client.
 */

const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');
const { badRequest, assertRequiredDate, assertRequiredText, clampPct, assertNonNegative } = require('./_planValidators');

const WEATHER_TYPES = ['SUNNY', 'CLOUDY', 'RAINY', 'STORMY'];

async function logActivity(email, action, description) {
    try {
        await query('INSERT INTO activities (id, email, action, description) VALUES ($1, $2, $3, $4)',
            [uuidv4(), email, action, description]);
    } catch (e) { console.error('logActivity:', e.message); }
}

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

function assertWeather(weather) {
    if (weather === undefined || weather === null || weather === '') return null;
    const w = String(weather).toUpperCase();
    if (!WEATHER_TYPES.includes(w)) {
        throw badRequest(`Invalid weather. Must be one of: ${WEATHER_TYPES.join(', ')}`);
    }
    return w;
}

// ==================== GET /project-logs ====================
// Query params: projectId (bắt buộc), month (YYYY-MM, tuỳ chọn)
router.get('/', async (req, res, next) => {
    try {
        const { projectId, month } = req.query;
        if (!projectId) throw badRequest('projectId is required');

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
        next(err);
    }
});

// ==================== POST /project-logs (upsert) ====================
router.post('/', async (req, res, next) => {
    try {
        const {
            projectId, logDate,
            weather, workersCount, progressPct,
            activities, issues, materials, equipment, note,
        } = req.body;

        assertRequiredText(projectId, 'projectId', 50);
        const date = assertRequiredDate(logDate, 'logDate');
        const pct = clampPct(progressPct);
        const workers = Math.round(assertNonNegative(workersCount, 'workersCount'));
        const sky = assertWeather(weather);

        const project = await query('SELECT 1 FROM projects WHERE id = $1', [projectId]);
        if (project.rowCount === 0) throw badRequest('Project not found');

        // Lấy tên người dùng để cache vào created_by_name
        let currentUserName = '';
        if (req.user?.id) {
            const userResult = await query('SELECT name FROM users WHERE id = $1', [req.user.id]);
            currentUserName = userResult.rows[0]?.name || '';
        }

        // Kiểm tra đã có log ngày này chưa
        const existing = await query(
            'SELECT id FROM project_logs WHERE project_id = $1 AND log_date = $2',
            [projectId, date]
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
                sky, workers, pct,
                activities || null, issues || null, materials || null,
                equipment || null, note || null,
                req.user?.id || null, projectId, date
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
                logId, projectId, date,
                sky, workers, pct,
                activities || null, issues || null, materials || null,
                equipment || null, note || null,
                req.user?.id || null, currentUserName, req.user?.id || null
            ]);
        }

        // KHÔNG ghi ngược tiến độ vào bảng `projects`: bảng đó không có cột
        // `progress`. Câu `UPDATE projects SET progress = ...` từng nằm ở đây và
        // ném PostgreSQL 42703 sau mỗi lần lưu — nhật ký vào DB nhưng API trả
        // success:false. Tiến độ dự án là giá trị dẫn xuất từ AVG(tasks.progress),
        // xem toProject() trong routes/projects.js.
        CacheService.clear(['PROJECTS_LIST']);

        await logActivity(req.user?.email || '', 'PROJECT_LOG_UPSERT', `Log ${date} for project ${projectId}`);
        res.json({ success: true, id: logId });
    } catch (err) {
        next(err);
    }
});

// ==================== DELETE /project-logs/:id ====================
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM project_logs WHERE id = $1 RETURNING project_id, log_date',
            [id]
        );
        if (result.rowCount === 0) {
            const err = new Error('Nhật ký không tồn tại');
            err.statusCode = 404;
            throw err;
        }

        CacheService.clear(['PROJECTS_LIST']);

        await logActivity(
            req.user?.email || '', 'PROJECT_LOG_DELETE',
            `Deleted log ${id} of project ${result.rows[0].project_id}`
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
