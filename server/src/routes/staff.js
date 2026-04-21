/**
 * Staff Routes — CRUD /staff
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function logActivity(email, action, desc) {
  try { await query('INSERT INTO activities (id, email, action, description) VALUES ($1,$2,$3,$4)', [uuidv4(), email, action, desc]); }
  catch (e) { console.error('logActivity:', e.message); }
}

// GET /staff
router.get('/', async (req, res) => {
  try {
    const { branchId } = req.query;
    let sql = `
      SELECT s.*, b.code AS branch_code, b.name AS branch_name
      FROM staff s
      LEFT JOIN branches b ON s.branch_id = b.id
    `;
    const params = [];
    if (branchId) { sql += ' WHERE s.branch_id = $1'; params.push(branchId); }
    sql += ' ORDER BY s.created_at DESC';

    const result = await query(sql, params);
    const data = result.rows.map(r => ({
      id: r.id, branchId: r.branch_id, branchCode: r.branch_code || '',
      branchName: r.branch_name || '', name: r.name,
      position: r.position || '', phone: r.phone || '',
      email: r.email || '', createdAt: r.created_at,
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /staff
router.post('/', async (req, res) => {
  try {
    const d = req.body; const id = uuidv4();
    await query('INSERT INTO staff (id,branch_id,name,position,phone,email) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, d.branchId || '', d.name, d.position || '', d.phone || '', d.email || '']);
    await logActivity(req.user?.email || '', 'CREATE_STAFF', `Created staff ${d.name}`);
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /staff/:id
router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    await query('UPDATE staff SET branch_id=$1,name=$2,position=$3,phone=$4,email=$5 WHERE id=$6',
      [d.branchId || '', d.name, d.position || '', d.phone || '', d.email || '', req.params.id]);
    await logActivity(req.user?.email || '', 'UPDATE_STAFF', `Updated staff ${d.name}`);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /staff/:id
router.delete('/:id', async (req, res) => {
  try {
    const r = await query('DELETE FROM staff WHERE id=$1 RETURNING name', [req.params.id]);
    if (r.rowCount === 0) return res.json({ success: false, error: 'Staff not found' });
    await logActivity(req.user?.email || '', 'DELETE_STAFF', `Deleted staff ${r.rows[0].name}`);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
