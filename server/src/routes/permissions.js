/**
 * Permission Routes — GET/PUT /permissions
 * Port of getPermissions/savePermissions from Code.gs
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');
const { badRequest } = require('./_planValidators');

// Allowlist tên cột: tên cột được nối thẳng vào câu SQL nên không được lấy từ client.
//
// KHÔNG có cột `plans` (số ít) ở đây: nó đã deprecated (xem init-db.sql:304) và chỉ
// tồn tại trên DB tạo mới — bảng `users` cũ không có, vì CREATE TABLE IF NOT EXISTS
// không thêm cột và cột này không nằm trong khối ALTER idempotent như plans_*.
// Đọc nó làm cả route 500 với "column plans does not exist"; trước đây lỗi bị nuốt
// thành HTTP 200 nên tab Phân quyền chỉ đơn giản là trống.
const PERMISSION_COLUMNS = [
  'contracts', 'projects', 'targets', 'business', 'branches',
  'plans_bd', 'plans_mkt', 'plans_qs', 'plans_des', 'plans_pm',
];
const ACCESS_LEVELS = ['ADMIN', 'EDIT', 'VIEW', 'NO_ACCESS'];

async function logActivity(email, action, desc) {
  try { await query('INSERT INTO activities (id, email, action, description) VALUES ($1,$2,$3,$4)', [uuidv4(), email, action, desc]); }
  catch (e) { console.error('logActivity:', e.message); }
}

// GET /permissions
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, position_name, category, ${PERMISSION_COLUMNS.join(', ')} FROM users ORDER BY name`
    );
    const data = result.rows.map(r => {
      const row = {
        userId: r.id, userName: r.name,
        positionName: r.position_name || '', category: r.category || '',
      };
      PERMISSION_COLUMNS.forEach(col => { row[col] = r[col] || 'NO_ACCESS'; });
      return row;
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// PUT /permissions
router.put('/', async (req, res, next) => {
  try {
    const { permissions } = req.body;
    if (!permissions || !Array.isArray(permissions)) {
      return next(badRequest('Invalid permissions data'));
    }

    for (const p of permissions) {
      const fields = []; const values = []; let idx = 1;
      for (const col of PERMISSION_COLUMNS) {
        if (!p[col]) continue;
        const level = String(p[col]).toUpperCase();
        // Giá trị lạ lọt vào cột quyền là nguy hiểm: moduleAccess/planAccess chỉ so
        // bằng với NO_ACCESS/EDIT, chuỗi khác sẽ được coi là "đọc được".
        if (!ACCESS_LEVELS.includes(level)) {
          return next(badRequest(`Invalid access level "${p[col]}" for ${col}`));
        }
        fields.push(`${col} = $${idx}`); values.push(level); idx++;
      }

      if (fields.length > 0) {
        values.push(p.userId);
        await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values);
      }
    }

    await logActivity(req.user?.email || 'ADMIN', 'SAVE_PERMISSIONS', 'Updated permissions');
    // Bắt buộc: GET /users cache theo USERS_LIST, không clear thì admin lưu quyền xong
    // reload vẫn thấy giá trị cũ suốt TTL.MEDIUM và tưởng lưu hỏng.
    CacheService.clear(['USERS_LIST']);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
