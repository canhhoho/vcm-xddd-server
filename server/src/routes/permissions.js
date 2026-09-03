/**
 * Permission Routes — GET/PUT /permissions
 * Port of getPermissions/savePermissions from Code.gs
 */
const router = require('express').Router();
const { query, getClient } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');
const { badRequest } = require('./_planValidators');
// normalizeAccess là NGUỒN DUY NHẤT quy đổi giá trị quyền — dùng chung với
// moduleAccess/planAccess nên ma trận trên UI hiện đúng thứ server thực thi.
// Trước đây file này có bản riêng map ADMIN -> EDIT: UI hiện EDIT trong khi
// server chỉ cho đọc, và một cú bấm Lưu là ghi EDIT thật vào DB (nâng quyền).
//
// PERMISSION_COLUMNS là allowlist tên cột — tên cột được nối thẳng vào câu SQL nên
// KHÔNG được lấy từ client. Lấy từ helper để không còn hai bản danh sách cột lệch nhau.
//
// Helper CỐ Ý không có cột `plans` (số ít): nó đã deprecated (xem init-db.sql) và
// có/không tuỳ lịch sử từng DB — `migrate-add-plans-permission.sql` thêm nó cho DB
// cũ, `CREATE TABLE IF NOT EXISTS` thì không thêm cột vào bảng đã có. Đọc nó làm cả
// route 500 với "column plans does not exist"; trước đây lỗi bị nuốt thành HTTP 200
// nên tab Phân quyền chỉ đơn giản là trống.
const {
  ACCESS_LEVELS, PERMISSION_COLUMNS, normalizeAccess, normalizeRole,
} = require('../services/accessLevels');

// `role` CHỈ để đọc. Cố ý nằm ngoài PERMISSION_COLUMNS — mảng đó là allowlist cột
// ĐƯỢC GHI của PUT /permissions, thêm 'role' vào là mở đường cho client tự đặt role
// ADMIN cho bất kỳ ai. Đổi role vẫn phải đi qua PUT /users (users.js).
//
// Phải trả về vì user có role='ADMIN' bypass toàn bộ moduleAccess/planAccess
// (moduleAccess.js:70, planAccess.js:134): không hiện role thì ma trận toàn
// NO_ACCESS trong khi người đó đang toàn quyền, admin đọc UI ra kết luận ngược.
const READONLY_COLUMNS = ['role'];

async function logActivity(email, action, desc) {
  try { await query('INSERT INTO activities (id, email, action, description) VALUES ($1,$2,$3,$4)', [uuidv4(), email, action, desc]); }
  catch (e) { console.error('logActivity:', e.message); }
}

// GET /permissions
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, name, position_name, position_id, category, ${READONLY_COLUMNS.join(', ')}, ${PERMISSION_COLUMNS.join(', ')} FROM users ORDER BY name`
    );
    const data = result.rows.map(r => {
      const row = {
        userId: r.id, userName: r.name,
        positionName: r.position_name || '', positionId: r.position_id || '',
        category: r.category || '', role: normalizeRole(r.role),
      };
      PERMISSION_COLUMNS.forEach(col => { row[col] = normalizeAccess(r[col]); });
      return row;
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// PUT /permissions
router.put('/', async (req, res, next) => {
  const { permissions } = req.body;
  if (!permissions || !Array.isArray(permissions)) {
    return next(badRequest('Invalid permissions data'));
  }

  // Transaction bắt buộc: vòng lặp chạy N UPDATE rời rạc, lỗi ở dòng thứ k để lại
  // ma trận quyền nửa vời — một nửa user quyền mới, một nửa quyền cũ.
  const client = await getClient();
  try {
    await client.query('BEGIN');

    for (const p of permissions) {
      if (typeof p?.userId !== 'string' || !p.userId.trim()) {
        throw badRequest('userId is required for every permission row');
      }

      const fields = []; const values = []; let idx = 1;
      for (const col of PERMISSION_COLUMNS) {
        if (!p[col]) continue;
        const level = String(p[col]).toUpperCase();
        // Giá trị lạ lọt vào cột quyền là nguy hiểm: moduleAccess/planAccess chỉ so
        // bằng với NO_ACCESS/EDIT, chuỗi khác sẽ được coi là "đọc được".
        if (!ACCESS_LEVELS.includes(level)) {
          throw badRequest(`Invalid access level "${p[col]}" for ${col}`);
        }
        fields.push(`${col} = $${idx}`); values.push(level); idx++;
      }

      if (fields.length === 0) continue;

      values.push(p.userId);
      const result = await client.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values);

      // WHERE id = <id không tồn tại> khớp 0 dòng và node-pg biến userId undefined
      // thành NULL — không kiểm rowCount thì route trả success:true trong khi không
      // ghi được gì, đúng cái bẫy đã ghi ở .claude/rules/route-ordering.md.
      if (result.rowCount === 0) {
        const err = new Error(`User not found: ${p.userId}`);
        err.statusCode = 404;
        throw err;
      }
    }

    await client.query('COMMIT');

    await logActivity(req.user?.email || 'ADMIN', 'SAVE_PERMISSIONS', 'Updated permissions');
    // Bắt buộc: GET /users cache theo USERS_LIST, không clear thì admin lưu quyền xong
    // reload vẫn thấy giá trị cũ suốt TTL.MEDIUM và tưởng lưu hỏng.
    CacheService.clear(['USERS_LIST']);
    res.json({ success: true });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { console.error('ROLLBACK:', e.message); }
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
