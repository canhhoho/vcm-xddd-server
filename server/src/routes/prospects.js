/**
 * VCM XDDD — Prospects Routes
 * CRUD for business prospect projects
 */
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD
});

// Helper: DB row → API object
function toProspect(row) {
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    location: row.location,
    branchId: row.branch_id,
    branchCode: row.branch_code || '',
    estimatedValue: parseFloat(row.estimated_value) || 0,
    contactPerson: row.contact_person,
    contactPhone: row.contact_phone,
    source: row.source,
    status: row.status,
    priority: row.priority,
    note: row.note,
    expectedDate: row.expected_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// GET /prospects
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, b.code as branch_code
      FROM prospects p
      LEFT JOIN branches b ON p.branch_id = b.id
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, data: result.rows.map(toProspect) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /prospects
router.post('/', async (req, res) => {
  try {
    const { name, client, location, branchId, estimatedValue, contactPerson, contactPhone, source, status, priority, note, expectedDate } = req.body;
    const id = uuidv4();
    const createdBy = req.user?.id || '';
    await pool.query(
      `INSERT INTO prospects (id, name, client, location, branch_id, estimated_value, contact_person, contact_phone, source, status, priority, note, expected_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, name, client || '', location || '', branchId || '', estimatedValue || 0, contactPerson || '', contactPhone || '', source || 'DIRECT', status || 'NEW', priority || 'MEDIUM', note || '', expectedDate || null, createdBy]
    );
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /prospects/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, client, location, branchId, estimatedValue, contactPerson, contactPhone, source, status, priority, note, expectedDate } = req.body;
    await pool.query(
      `UPDATE prospects SET name=$1, client=$2, location=$3, branch_id=$4, estimated_value=$5, contact_person=$6, contact_phone=$7, source=$8, status=$9, priority=$10, note=$11, expected_date=$12
       WHERE id=$13`,
      [name, client || '', location || '', branchId || '', estimatedValue || 0, contactPerson || '', contactPhone || '', source || 'DIRECT', status || 'NEW', priority || 'MEDIUM', note || '', expectedDate || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /prospects/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM prospects WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
