/**
 * Contract Routes — CRUD /contracts
 * Port of getContracts, createContract, updateContract, deleteContract from Code.gs
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// File upload config
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'contracts');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Helper: log activity
async function logActivity(email, action, description) {
  try {
    await query(
      'INSERT INTO activities (id, email, action, description) VALUES ($1, $2, $3, $4)',
      [uuidv4(), email, action, description]
    );
  } catch (err) {
    console.error('logActivity error:', err.message);
  }
}

// GET /contracts
router.get('/', async (req, res) => {
  try {
    const data = await CacheService.getOrSet('CONTRACTS_LIST', async () => {
      const result = await query(`
        SELECT c.*, b.name as branch_name, b.code as branch_code,
               COALESCE(inv.total_payment, 0) as total_payment
        FROM contracts c
        LEFT JOIN branches b ON c.branch_id = b.id
        LEFT JOIN (
          SELECT contract_id, SUM(payment) as total_payment
          FROM invoices
          GROUP BY contract_id
        ) inv ON inv.contract_id = c.id
        ORDER BY c.created_at DESC
      `);

      const contracts = result.rows.map(r => {
        const value = parseFloat(r.value) || 0;
        const totalPayment = parseFloat(r.total_payment) || 0;
        // Calculate progress from invoices (same as App Script)
        const progress = value > 0 ? Math.round((totalPayment / value) * 100) : 0;

        return {
          id: r.id,
          code: r.code,
          name: r.name,
          branchId: r.branch_id,
          branchName: r.branch_name || '',
          branchCode: r.branch_code || '',
          businessField: r.business_field,
          value,
          startDate: r.start_date,
          endDate: r.end_date,
          status: r.status,
          fileUrls: r.file_urls || '',
          note: r.note || '',
          progress,
          createdAt: r.created_at,
          createdBy: r.created_by || '',
        };
      });

      return { success: true, data: contracts };
    }, CacheService.TTL.SHORT);

    res.json(data);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /contracts
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const id = uuidv4();
    const userId = req.user?.id || '';

    await query(`
      INSERT INTO contracts (id, code, name, branch_id, business_field, value, start_date, end_date, status, file_urls, note, progress, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      id, d.code, d.name, d.branchId || d.provinceId || '',
      d.businessField || '', d.value || 0,
      d.startDate || null, d.endDate || null,
      d.status || 'TODO', d.fileUrls || '', d.note || '', d.progress || 0, userId
    ]);

    await logActivity(req.user?.email || userId, 'CONTRACT_CREATE', `Created contract ${d.code}`);
    CacheService.clear(['CONTRACTS_LIST', 'DASHBOARD_STATS']);

    res.json({ success: true, data: { id } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /contracts/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;

    // Build dynamic SET clause
    const fields = [];
    const values = [];
    let idx = 1;

    const mapping = {
      code: 'code', name: 'name', branchId: 'branch_id', provinceId: 'branch_id',
      businessField: 'business_field', value: 'value',
      startDate: 'start_date', endDate: 'end_date', status: 'status',
      fileUrls: 'file_urls', note: 'note', progress: 'progress'
    };

    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (d[jsKey] !== undefined) {
        fields.push(`${dbCol} = $${idx}`);
        values.push(d[jsKey]);
        idx++;
      }
    }

    if (fields.length === 0) {
      return res.json({ success: false, error: 'No fields to update' });
    }

    values.push(id);
    await query(`UPDATE contracts SET ${fields.join(', ')} WHERE id = $${idx}`, values);

    await logActivity(req.user?.email || '', 'CONTRACT_UPDATE', `Updated contract ${id}`);
    CacheService.clear(['CONTRACTS_LIST', 'DASHBOARD_STATS']);

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /contracts/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM contracts WHERE id = $1 RETURNING code', [id]);

    if (result.rowCount === 0) {
      return res.json({ success: false, error: 'Contract not found' });
    }

    await logActivity(req.user?.email || '', 'CONTRACT_DELETE', `Deleted contract ${result.rows[0].code}`);
    CacheService.clear(['CONTRACTS_LIST', 'DASHBOARD_STATS']);

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /contracts/upload — file upload
router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.json({ success: false, error: 'No files uploaded' });
    }

    const urls = req.files.map(f => `/uploads/contracts/${f.filename}`);

    res.json({
      success: true,
      data: { urls },
      message: `Uploaded ${req.files.length} file(s)`
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
