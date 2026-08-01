/**
 * Contract Routes — CRUD /contracts
 * Port of getContracts, createContract, updateContract, deleteContract from Code.gs
 *
 * Phân quyền: mount kèm moduleAccess('contracts') trong app.js.
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { badRequest, conflict, assertDateRange } = require('./_planValidators');
const { toInvoice } = require('./invoices');

// File upload config
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'contracts');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Chỉ nhận các loại file thật sự cần cho hợp đồng.
// File tải lên nằm cùng origin với app; cho phép .html/.svg là mở đường stored XSS
// (script chạy trên origin của app đọc được JWT trong localStorage).
const ALLOWED_EXT = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt',
]);
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
  'application/octet-stream', // một số trình duyệt gửi kiểu này cho .docx/.xlsx
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(file.mimetype)) {
      return cb(badRequest(`File type not allowed: ${file.originalname}`));
    }
    cb(null, true);
  },
});

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

/** Xoá file đã upload khỏi đĩa. Bỏ qua file không tồn tại. */
function removeUploadedFiles(raw) {
  if (!raw) return;
  String(raw)
    .split(/[\r\n,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(url => {
      // Chỉ đụng tới file nằm trong thư mục uploads của chính app.
      const name = path.basename(url);
      if (!name || name === '.' || name === '..') return;
      const target = path.join(uploadDir, name);
      if (!target.startsWith(uploadDir)) return;
      fs.unlink(target, () => { /* ENOENT là bình thường */ });
    });
}

/** Giá trị hợp đồng: số hữu hạn, không âm */
function assertValue(value) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest('value must be a number');
  if (n < 0) throw badRequest('value must not be negative');
  return n;
}

// IN_PROGRESS là giá trị chuẩn (khớp APP_CONFIG.STATUS). INPROCESS là biến thể cũ
// do form sinh ra trước đây — nhận vào rồi chuẩn hoá thay vì để hai giá trị cùng tồn tại.
const CONTRACT_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];

function normalizeStatus(status) {
  if (status === undefined || status === null || status === '') return 'TODO';
  const s = String(status).toUpperCase();
  const canonical = s === 'INPROCESS' ? 'IN_PROGRESS' : s;
  if (!CONTRACT_STATUSES.includes(canonical)) {
    throw badRequest(`Invalid status. Must be one of: ${CONTRACT_STATUSES.join(', ')}`);
  }
  return canonical;
}

function assertRequiredText(value, field, max = 500) {
  if (typeof value !== 'string' || !value.trim()) throw badRequest(`${field} is required`);
  if (value.length > max) throw badRequest(`${field} is too long (max ${max} characters)`);
  return value.trim();
}

// GET /contracts
router.get('/', async (req, res, next) => {
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
        // Tiến độ luôn tính lại từ hoá đơn; cột contracts.progress không được đọc.
        const progress = value > 0 ? Math.round((totalPayment / value) * 100) : 0;

        return {
          id: r.id,
          code: r.code,
          name: r.name,
          provinceId: r.branch_id,
          branchName: r.branch_name || '',
          branchCode: r.branch_code || '',
          businessField: r.business_field,
          value,
          startDate: r.start_date,
          endDate: r.end_date,
          status: r.status,
          fileUrl: r.file_urls || '',
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
    next(err);
  }
});

// POST /contracts
router.post('/', async (req, res, next) => {
  try {
    const d = req.body;
    const code = assertRequiredText(d.code, 'code', 100);
    const name = assertRequiredText(d.name, 'name', 1000);
    const value = assertValue(d.value);
    assertDateRange(d.startDate, d.endDate, 'startDate', 'endDate');

    const dup = await query('SELECT 1 FROM contracts WHERE code = $1', [code]);
    if (dup.rowCount > 0) throw conflict(`Contract code already exists: ${code}`);

    const id = uuidv4();
    const userId = req.user?.id || '';

    // Không ghi cột `progress` nữa — nó là cột chết, GET luôn tính lại từ invoices.
    await query(`
      INSERT INTO contracts (id, code, name, branch_id, business_field, value, start_date, end_date, status, file_urls, note, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `, [
      id, code, name, d.provinceId || d.branchId || '',
      d.businessField || '', value,
      d.startDate || null, d.endDate || null,
      normalizeStatus(d.status), d.fileUrls || d.fileUrl || '', d.note || '', userId
    ]);

    await logActivity(req.user?.email || userId, 'CONTRACT_CREATE', `Created contract ${code}`);
    CacheService.clear(['CONTRACTS_LIST']); CacheService.clearByPrefix('DASHBOARD_STATS');

    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
});

// PUT /contracts/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const d = req.body;

    if (d.code !== undefined) assertRequiredText(d.code, 'code', 100);
    if (d.name !== undefined) assertRequiredText(d.name, 'name', 1000);
    if (d.value !== undefined) assertValue(d.value);
    if (d.startDate !== undefined && d.endDate !== undefined) {
      assertDateRange(d.startDate, d.endDate, 'startDate', 'endDate');
    }

    if (d.code !== undefined) {
      const dup = await query('SELECT 1 FROM contracts WHERE code = $1 AND id <> $2', [d.code, id]);
      if (dup.rowCount > 0) throw conflict(`Contract code already exists: ${d.code}`);
    }

    // Mỗi cột chỉ nhận MỘT khoá đầu vào. Trước đây map cả `branchId` lẫn
    // `provinceId` về `branch_id`; gửi cả hai sinh "SET branch_id=$1, branch_id=$2"
    // → PostgreSQL 42701 multiple assignments to same column.
    const mapping = {
      code: 'code', name: 'name', provinceId: 'branch_id',
      businessField: 'business_field', value: 'value',
      startDate: 'start_date', endDate: 'end_date', status: 'status',
      fileUrls: 'file_urls', note: 'note'
    };

    const fields = [];
    const values = [];
    let idx = 1;

    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (d[jsKey] !== undefined) {
        fields.push(`${dbCol} = $${idx}`);
        values.push(jsKey === 'status' ? normalizeStatus(d[jsKey]) : d[jsKey]);
        idx++;
      }
    }

    if (fields.length === 0) throw badRequest('No fields to update');

    values.push(id);
    const result = await query(`UPDATE contracts SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    if (result.rowCount === 0) {
      const err = new Error('Contract not found');
      err.statusCode = 404;
      throw err;
    }

    await logActivity(req.user?.email || '', 'CONTRACT_UPDATE', `Updated contract ${id}`);
    CacheService.clear(['CONTRACTS_LIST']); CacheService.clearByPrefix('DASHBOARD_STATS');

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /contracts/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Lấy đường dẫn file trước khi xoá: invoices bị cascade nên sau DELETE
    // không còn cách nào biết file nào cần dọn.
    const files = await query(
      `SELECT c.file_urls,
              COALESCE(string_agg(i.files, chr(10)) FILTER (WHERE i.files <> ''), '') AS invoice_files
       FROM contracts c
       LEFT JOIN invoices i ON i.contract_id = c.id
       WHERE c.id = $1
       GROUP BY c.file_urls`,
      [id]
    );

    const result = await query('DELETE FROM contracts WHERE id = $1 RETURNING code', [id]);
    if (result.rowCount === 0) {
      const err = new Error('Contract not found');
      err.statusCode = 404;
      throw err;
    }

    if (files.rowCount > 0) {
      removeUploadedFiles(files.rows[0].file_urls);
      removeUploadedFiles(files.rows[0].invoice_files);
    }

    await logActivity(req.user?.email || '', 'CONTRACT_DELETE', `Deleted contract ${result.rows[0].code}`);
    CacheService.clear(['CONTRACTS_LIST']); CacheService.clearByPrefix('DASHBOARD_STATS');

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /contracts/upload — file upload
router.post('/upload', upload.array('files', 20), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw badRequest('No files uploaded');
    }

    const urls = req.files.map(f => `/uploads/contracts/${f.filename}`);

    res.json({
      success: true,
      data: { urls },
      message: `Uploaded ${req.files.length} file(s)`
    });
  } catch (err) {
    next(err);
  }
});

// GET /contracts/:contractId/invoices — invoices for a specific contract
router.get('/:contractId/invoices', async (req, res, next) => {
  try {
    const { contractId } = req.params;
    const result = await query(
      'SELECT * FROM invoices WHERE contract_id = $1 ORDER BY created_at ASC',
      [contractId]
    );
    // Dùng chung mapper của invoices.js để hai đường không lệch nhau.
    res.json({ success: true, data: result.rows.map(toInvoice) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
