/**
 * Partner Routes — CRUD /partners
 * Types: LABOR (Nhân công) | MATERIAL (Vật tư) | EQUIPMENT (Thiết bị)
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function logActivity(email, action, desc) {
  try {
    await query(
      'INSERT INTO activities (id, email, action, description) VALUES ($1,$2,$3,$4)',
      [uuidv4(), email, action, desc]
    );
  } catch (e) {
    console.error('logActivity:', e.message);
  }
}

const toPartner = (r) => ({
  id: r.id,
  name: r.name,
  type: r.type,
  contact: r.contact || '',
  phone: r.phone || '',
  email: r.email || '',
  address: r.address || '',
  taxCode: r.tax_code || '',
  speciality: r.speciality || '',
  branchId: r.branch_id || '',
  note: r.note || '',
  createdAt: r.created_at,
});

// GET /partners?type=LABOR&branchId=xxx
router.get('/', async (req, res) => {
  try {
    const { type, branchId } = req.query;
    const conditions = [];
    const params = [];

    if (type && type !== 'ALL') {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }
    if (branchId && branchId !== 'ALL') {
      params.push(branchId);
      conditions.push(`branch_id = $${params.length}`);
    }

    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
    const sql = `SELECT * FROM partners${where} ORDER BY type, name`;
    const result = await query(sql, params);
    res.json({ success: true, data: result.rows.map(toPartner) });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /partners
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    if (!d.name || !d.type) {
      return res.json({ success: false, error: 'name và type là bắt buộc' });
    }
    const id = uuidv4();
    await query(
      `INSERT INTO partners (id, name, type, contact, phone, email, address, tax_code, speciality, branch_id, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id, d.name, d.type,
        d.contact || '', d.phone || '', d.email || '',
        d.address || '', d.taxCode || '', d.speciality || '',
        d.branchId || '', d.note || '',
      ]
    );
    await logActivity(req.user?.email || '', 'CREATE_PARTNER', `Created partner ${d.name} (${d.type})`);
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /partners/:id
router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    const result = await query(
      `UPDATE partners
       SET name=$1, type=$2, contact=$3, phone=$4, email=$5, address=$6, tax_code=$7, speciality=$8, branch_id=$9, note=$10
       WHERE id=$11`,
      [
        d.name, d.type,
        d.contact || '', d.phone || '', d.email || '',
        d.address || '', d.taxCode || '', d.speciality || '',
        d.branchId || '', d.note || '',
        req.params.id,
      ]
    );
    if (result.rowCount === 0) return res.json({ success: false, error: 'Partner not found' });
    await logActivity(req.user?.email || '', 'UPDATE_PARTNER', `Updated partner ${d.name}`);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /partners/:id
router.delete('/:id', async (req, res) => {
  try {
    const r = await query('DELETE FROM partners WHERE id=$1 RETURNING name', [req.params.id]);
    if (r.rowCount === 0) return res.json({ success: false, error: 'Partner not found' });
    await logActivity(req.user?.email || '', 'DELETE_PARTNER', `Deleted partner ${r.rows[0].name}`);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
