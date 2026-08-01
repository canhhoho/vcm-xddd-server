/**
 * Branch Routes — CRUD /branches
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');
const { badRequest } = require('./_planValidators');

async function logActivity(email, action, desc) {
  try { await query('INSERT INTO activities (id, email, action, description) VALUES ($1,$2,$3,$4)', [uuidv4(), email, action, desc]); }
  catch (e) { console.error('logActivity:', e.message); }
}

// GET /branches
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM branches ORDER BY name');
    const data = result.rows.map(r => ({
      id: r.id, name: r.name, code: r.code,
      address: r.address || '', phone: r.phone || '', email: r.email || '',
      createdAt: r.created_at,
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /branches
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const id = uuidv4();
    await query('INSERT INTO branches (id, name, code, address, phone, email) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, d.name, d.code || '', d.address || '', d.phone || '', d.email || '']);
    await logActivity(req.user?.email || '', 'CREATE_BRANCH', `Created branch ${d.name}`);
    CacheService.clear(['BRANCHES_LIST']);
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /branches/:id
// Chỉ ghi những cột thực sự có trong body. Form sửa chi nhánh chỉ gửi
// code/name/address, nên bản UPDATE cũ (ghi đè cả 5 cột, undefined -> '')
// xoá trắng phone/email đang có trong DB mỗi lần lưu.
router.put('/:id', async (req, res, next) => {
  try {
    const d = req.body;
    const fields = []; const values = []; let idx = 1;

    const mapping = {
      name: 'name', code: 'code', address: 'address',
      phone: 'phone', email: 'email',
    };

    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (d[jsKey] !== undefined) {
        fields.push(`${dbCol} = $${idx}`); values.push(d[jsKey]); idx++;
      }
    }
    if (fields.length === 0) throw badRequest('No fields to update');

    values.push(req.params.id);
    const result = await query(`UPDATE branches SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    if (result.rowCount === 0) {
      const err = new Error('Branch not found');
      err.statusCode = 404;
      throw err;
    }

    await logActivity(req.user?.email || '', 'UPDATE_BRANCH', `Updated branch ${d.name || req.params.id}`);
    CacheService.clear(['BRANCHES_LIST']);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /branches/:id
router.delete('/:id', async (req, res) => {
  try {
    const r = await query('DELETE FROM branches WHERE id=$1 RETURNING name', [req.params.id]);
    if (r.rowCount === 0) return res.json({ success: false, error: 'Branch not found' });
    await logActivity(req.user?.email || '', 'DELETE_BRANCH', `Deleted branch ${r.rows[0].name}`);
    CacheService.clear(['BRANCHES_LIST']);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
