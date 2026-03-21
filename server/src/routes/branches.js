/**
 * Branch Routes — CRUD /branches
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');

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
router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    await query('UPDATE branches SET name=$1, code=$2, address=$3, phone=$4, email=$5 WHERE id=$6',
      [d.name, d.code || '', d.address || '', d.phone || '', d.email || '', req.params.id]);
    await logActivity(req.user?.email || '', 'UPDATE_BRANCH', `Updated branch ${d.name}`);
    CacheService.clear(['BRANCHES_LIST']);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
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
