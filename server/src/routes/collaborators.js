/**
 * Collaborator Routes — CRUD /collaborators
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function logActivity(email, action, desc) {
  try { await query('INSERT INTO activities (id, email, action, description) VALUES ($1,$2,$3,$4)', [uuidv4(), email, action, desc]); }
  catch (e) { console.error('logActivity:', e.message); }
}

const toCollaborator = (r) => ({
  id: r.id,
  name: r.name,
  company: r.company || '',
  speciality: r.speciality || '',
  phone: r.phone || '',
  email: r.email || '',
  address: r.address || '',
  note: r.note || '',
  branchId: r.branch_id || '',
  createdAt: r.created_at,
});

// GET /collaborators
router.get('/', async (req, res) => {
  try {
    const { branchId } = req.query;
    let sql = 'SELECT * FROM collaborators';
    const params = [];
    if (branchId) { sql += ' WHERE branch_id = $1'; params.push(branchId); }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows.map(toCollaborator) });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /collaborators
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const id = uuidv4();
    await query(
      'INSERT INTO collaborators (id, name, company, speciality, phone, email, address, note, branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, d.name, d.company || '', d.speciality || '', d.phone || '', d.email || '', d.address || '', d.note || '', d.branchId || '']
    );
    await logActivity(req.user?.email || '', 'CREATE_COLLABORATOR', `Created collaborator ${d.name}`);
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /collaborators/:id
router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    await query(
      'UPDATE collaborators SET name=$1, company=$2, speciality=$3, phone=$4, email=$5, address=$6, note=$7, branch_id=$8 WHERE id=$9',
      [d.name, d.company || '', d.speciality || '', d.phone || '', d.email || '', d.address || '', d.note || '', d.branchId || '', req.params.id]
    );
    await logActivity(req.user?.email || '', 'UPDATE_COLLABORATOR', `Updated collaborator ${d.name}`);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /collaborators/:id
router.delete('/:id', async (req, res) => {
  try {
    const r = await query('DELETE FROM collaborators WHERE id=$1 RETURNING name', [req.params.id]);
    if (r.rowCount === 0) return res.json({ success: false, error: 'Collaborator not found' });
    await logActivity(req.user?.email || '', 'DELETE_COLLABORATOR', `Deleted collaborator ${r.rows[0].name}`);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
