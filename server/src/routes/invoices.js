/**
 * Invoice Routes — CRUD /invoices
 * Port of getAllInvoices, getInvoices, createInvoice, updateInvoice, deleteInvoice from Code.gs
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');

async function logActivity(email, action, description) {
  try {
    await query('INSERT INTO activities (id, email, action, description) VALUES ($1, $2, $3, $4)',
      [uuidv4(), email, action, description]);
  } catch (e) { console.error('logActivity:', e.message); }
}

// Helper: transform DB row → camelCase
function toInvoice(r) {
  return {
    id: r.id,
    contractId: r.contract_id,
    invoiceNumber: r.invoice_number,
    installment: r.installment || '',
    value: parseFloat(r.value) || 0,
    issuedDate: r.issued_date,
    paidAmount: r.payment !== null && r.payment !== undefined ? parseFloat(r.payment) : null,
    payment: parseFloat(r.payment) || 0,
    createdAt: r.created_at,
    files: r.files || '',
    // joined fields
    contractCode: r.contract_code || '',
    contractName: r.contract_name || '',
    branchCode: r.branch_code || '',
  };
}

// GET /invoices — all invoices
router.get('/', async (req, res) => {
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
    res.json({ success: false, error: err.message });
  }
});

// POST /invoices
router.post('/', async (req, res) => {
  try {
    const d = req.body.data || req.body;
    const id = uuidv4();

    await query(`
      INSERT INTO invoices (id, contract_id, invoice_number, installment, value, issued_date, payment, files)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      id, d.contractId, d.invoiceNumber || '', d.installment || '',
      d.value || 0, d.issuedDate || null,
      d.paidAmount !== undefined ? d.paidAmount : (d.payment || 0),
      d.files || ''
    ]);

    await logActivity(d.userId || req.user?.email || '', 'INVOICE_CREATE', `Created invoice ${d.invoiceNumber}`);
    CacheService.clear(['CONTRACTS_LIST']); CacheService.clearByPrefix('DASHBOARD_STATS');

    res.json({ success: true, data: { id } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /invoices/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body.data || req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    const mapping = {
      contractId: 'contract_id', invoiceNumber: 'invoice_number',
      installment: 'installment', value: 'value',
      issuedDate: 'issued_date', paidAmount: 'payment', payment: 'payment',
      files: 'files'
    };

    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (d[jsKey] !== undefined) {
        fields.push(`${dbCol} = $${idx}`);
        values.push(d[jsKey]);
        idx++;
      }
    }

    if (fields.length === 0) return res.json({ success: false, error: 'No fields to update' });

    values.push(id);
    await query(`UPDATE invoices SET ${fields.join(', ')} WHERE id = $${idx}`, values);

    await logActivity(req.user?.email || '', 'INVOICE_UPDATE', `Updated invoice ${id}`);
    CacheService.clear(['CONTRACTS_LIST']); CacheService.clearByPrefix('DASHBOARD_STATS');

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /invoices/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM invoices WHERE id = $1 RETURNING invoice_number', [req.params.id]);
    if (result.rowCount === 0) return res.json({ success: false, error: 'Invoice not found' });

    await logActivity(req.user?.email || '', 'INVOICE_DELETE', `Deleted invoice ${result.rows[0].invoice_number}`);
    CacheService.clear(['CONTRACTS_LIST']); CacheService.clearByPrefix('DASHBOARD_STATS');

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
