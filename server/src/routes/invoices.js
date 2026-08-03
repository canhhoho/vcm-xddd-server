/**
 * Invoice Routes — CRUD /invoices
 * Port of getAllInvoices, getInvoices, createInvoice, updateInvoice, deleteInvoice from Code.gs
 *
 * Phân quyền: mount kèm moduleAccess('contracts') trong app.js (hoá đơn không có
 * cột quyền riêng, dùng chung quyền hợp đồng).
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');
const { badRequest, assertRequiredDate } = require('./_planValidators');

async function logActivity(email, action, description) {
  try {
    await query('INSERT INTO activities (id, email, action, description) VALUES ($1, $2, $3, $4)',
      [uuidv4(), email, action, description]);
  } catch (e) { console.error('logActivity:', e.message); }
}

// Helper: transform DB row → camelCase
// Export để contracts.js dùng lại, tránh hai bản mapping lệch nhau.
function toInvoice(r) {
  return {
    id: r.id,
    contractId: r.contract_id,
    invoiceNumber: r.invoice_number,
    installment: r.installment || '',
    value: parseFloat(r.value) || 0,
    issuedDate: r.issued_date,
    paidAmount: r.payment !== null && r.payment !== undefined ? parseFloat(r.payment) : null,
    createdAt: r.created_at,
    files: r.files || '',
    // joined fields
    contractCode: r.contract_code || '',
    contractName: r.contract_name || '',
    branchCode: r.branch_code || '',
  };
}

/** Số tiền: phải là số hữu hạn và không âm */
function assertAmount(value, field) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest(`${field} must be a number`);
  if (n < 0) throw badRequest(`${field} must not be negative`);
  return n;
}

// GET /invoices — all invoices
router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT i.*, c.code as contract_code, c.name as contract_name,
             b.code as branch_code
      FROM invoices i
      LEFT JOIN contracts c ON i.contract_id = c.id
      LEFT JOIN branches b ON c.branch_id = b.id
      ORDER BY i.created_at DESC
    `);
    res.json({ success: true, data: result.rows.map(toInvoice) });
  } catch (err) {
    next(err);
  }
});

// POST /invoices
router.post('/', async (req, res, next) => {
  try {
    const d = req.body.data || req.body;

    if (!d.contractId) throw badRequest('contractId is required');

    const exists = await query('SELECT 1 FROM contracts WHERE id = $1', [d.contractId]);
    if (exists.rowCount === 0) throw badRequest('Contract not found');

    const value = assertAmount(d.value, 'value');
    const paid = assertAmount(d.paidAmount !== undefined ? d.paidAmount : d.payment, 'paidAmount');

    // issued_date là mốc duy nhất để dashboard xếp hoá đơn vào kỳ nào. Bỏ trống thì
    // bản ghi rơi khỏi mọi thống kê theo năm/tháng nhưng vẫn cộng vào tổng all-time,
    // khiến hai con số không bao giờ khớp. Form đã bắt buộc trường này; chặn thêm ở
    // đây để đường ghi không qua UI cũng không tạo được bản ghi mồ côi.
    assertRequiredDate(d.issuedDate, 'issuedDate');

    const id = uuidv4();
    await query(`
      INSERT INTO invoices (id, contract_id, invoice_number, installment, value, issued_date, payment, files)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      id, d.contractId, d.invoiceNumber || '', d.installment || '',
      value, d.issuedDate, paid, d.files || ''
    ]);

    // Người thực hiện lấy từ JWT, không lấy d.userId do client gửi (giả mạo được).
    await logActivity(req.user?.email || '', 'INVOICE_CREATE', `Created invoice ${d.invoiceNumber || id}`);
    CacheService.clear(['CONTRACTS_LIST']); CacheService.invalidateDashboard();

    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
});

// PUT /invoices/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const d = req.body.data || req.body;

    // Mỗi cột chỉ nhận MỘT khoá đầu vào. Trước đây map cả `paidAmount` lẫn
    // `payment` về cột `payment`; gửi cả hai sinh "SET payment=$1, payment=$2"
    // → PostgreSQL 42701 multiple assignments to same column.
    const mapping = {
      contractId: 'contract_id', invoiceNumber: 'invoice_number',
      installment: 'installment', value: 'value',
      issuedDate: 'issued_date', paidAmount: 'payment',
      files: 'files'
    };

    if (d.value !== undefined) assertAmount(d.value, 'value');
    if (d.paidAmount !== undefined) assertAmount(d.paidAmount, 'paidAmount');

    const fields = [];
    const values = [];
    let idx = 1;

    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (d[jsKey] !== undefined) {
        fields.push(`${dbCol} = $${idx}`);
        values.push(d[jsKey]);
        idx++;
      }
    }

    if (fields.length === 0) throw badRequest('No fields to update');

    values.push(id);
    const result = await query(`UPDATE invoices SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    if (result.rowCount === 0) {
      const err = new Error('Invoice not found');
      err.statusCode = 404;
      throw err;
    }

    await logActivity(req.user?.email || '', 'INVOICE_UPDATE', `Updated invoice ${id}`);
    CacheService.clear(['CONTRACTS_LIST']); CacheService.invalidateDashboard();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /invoices/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM invoices WHERE id = $1 RETURNING invoice_number', [req.params.id]);
    if (result.rowCount === 0) {
      const err = new Error('Invoice not found');
      err.statusCode = 404;
      throw err;
    }

    await logActivity(req.user?.email || '', 'INVOICE_DELETE', `Deleted invoice ${result.rows[0].invoice_number}`);
    CacheService.clear(['CONTRACTS_LIST']); CacheService.invalidateDashboard();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.toInvoice = toInvoice;
