/**
 * Target Routes — CRUD /targets
 * Port of getTargets, createTarget, updateTarget, deleteTarget from Code.gs
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

/**
 * Calculate actual value for a target based on type and period
 */
async function calcActualValue(type, periodType, period, unitType, unitId) {
  const isGeneral = unitType === 'GENERAL' || !unitType;

  // Parse period for date filtering
  let dateFilter = '';
  const params = [];
  let pIdx = 1;

  if (periodType === 'YEAR') {
    dateFilter = `EXTRACT(YEAR FROM {date_col}) = $${pIdx}`;
    params.push(parseInt(period));
    pIdx++;
  } else if (periodType === 'QUARTER') {
    // period = "2026-Q1"
    const [year, q] = period.split('-Q');
    dateFilter = `EXTRACT(YEAR FROM {date_col}) = $${pIdx} AND CEIL(EXTRACT(MONTH FROM {date_col}) / 3.0) = $${pIdx + 1}`;
    params.push(parseInt(year), parseInt(q));
    pIdx += 2;
  } else if (periodType === 'MONTH') {
    // period = "2026-03"
    const [year, month] = period.split('-');
    dateFilter = `EXTRACT(YEAR FROM {date_col}) = $${pIdx} AND EXTRACT(MONTH FROM {date_col}) = $${pIdx + 1}`;
    params.push(parseInt(year), parseInt(month));
    pIdx += 2;
  }

  if (!dateFilter) return 0;

  let branchFilter = '';
  if (!isGeneral && unitId) {
    branchFilter = ` AND c.branch_id = $${pIdx}`;
    params.push(unitId);
    pIdx++;
  }

  let actual = 0;

  if (type === 'NGUON_VIEC') {
    const sql = `SELECT COALESCE(SUM(c.value), 0) as total FROM contracts c WHERE ${dateFilter.replace(/{date_col}/g, 'c.start_date')}${branchFilter}`;
    const r = await query(sql, params);
    actual = parseFloat(r.rows[0].total) / 1000000;
  } else if (type === 'DOANH_THU') {
    const sql = `SELECT COALESCE(SUM(i.value), 0) as total FROM invoices i JOIN contracts c ON i.contract_id = c.id WHERE ${dateFilter.replace(/{date_col}/g, 'i.issued_date')}${branchFilter}`;
    const r = await query(sql, params);
    actual = parseFloat(r.rows[0].total) / 1000000;
  } else if (type === 'THU_TIEN') {
    const sql = `SELECT COALESCE(SUM(i.payment), 0) as total FROM invoices i JOIN contracts c ON i.contract_id = c.id WHERE i.payment > 0 AND ${dateFilter.replace(/{date_col}/g, 'i.issued_date')}${branchFilter}`;
    const r = await query(sql, params);
    actual = parseFloat(r.rows[0].total) / 1000000;
  }

  return Math.round(actual * 100) / 100;
}

// GET /targets
router.get('/', async (req, res) => {
  try {
    const data = await CacheService.getOrSet('TARGETS_LIST', async () => {
      const result = await query('SELECT * FROM targets ORDER BY created_at DESC');
      const branchResult = await query('SELECT id, name, code FROM branches');
      const branchMap = {};
      branchResult.rows.forEach(b => {
        branchMap[b.id] = b;
        branchMap[b.code] = b;
        // Also map by uppercase code for GAS-migrated data
        if (b.code) branchMap[b.code.toUpperCase()] = b;
      });

      const currentYear = new Date().getFullYear().toString();
      const targets = [];
      for (const r of result.rows) {
        const isGeneral = r.unit_type === 'GENERAL' || !r.unit_type;
        // Lookup branch by id first, then by code (GAS saves code as unitId)
        const unitIdStr = (r.unit_id || '').trim();
        const branch = branchMap[unitIdStr] || branchMap[unitIdStr.toUpperCase()];

        // Dynamic normalization for robustness
        let tType = (r.type || '').toUpperCase().trim();
        if (tType.includes('NGUON') || tType.includes('NGUỒN')) tType = 'NGUON_VIEC';
        else if (tType.includes('DOANH')) tType = 'DOANH_THU';
        else if (tType.includes('THU')) tType = 'THU_TIEN';

        let pType = (r.period_type || '').toUpperCase().trim();
        if (pType.includes('NĂM') || pType.includes('NAM')) pType = 'YEAR';
        else if (pType.includes('QUÝ') || pType.includes('QUY')) pType = 'QUARTER';
        else if (pType.includes('THÁNG') || pType.includes('THANG')) pType = 'MONTH';

        // Period normalization — handle numeric values, empty strings, .0 suffix
        let period = String(r.period || '').trim();
        period = period.replace(/\.0$/, '').replace(/,/g, ''); // "2026.0" -> "2026", "2,026" -> "2026"
        period = period.toUpperCase();

        if (pType === 'YEAR') {
          if (period.includes('NĂM') || period.includes('NAM') || !period.includes('-')) {
            period = period.replace(/[^\d]/g, '');
          }
          // Fallback: if period is empty or 0, use current year
          if (!period || period === '0') period = currentYear;
        } else if (pType === 'QUARTER') {
          if (!period.includes('-')) {
            const digits = period.replace(/[^\d]/g, '');
            const q = digits ? digits.charAt(digits.length - 1) : '1'; // last digit = quarter number
            const yearPart = digits.length > 1 ? digits.slice(0, -1) : currentYear;
            period = `${yearPart}-Q${q}`;
          }
        } else if (pType === 'MONTH') {
          if (!period.includes('-')) {
            const digits = period.replace(/[^\d]/g, '');
            if (digits.length >= 6) {
              // e.g., "202603" -> "2026-03"
              period = `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
            } else if (digits.length <= 2) {
              const m = (digits || '01').padStart(2, '0');
              period = `${currentYear}-${m}`;
            } else {
              period = `${currentYear}-${digits.padStart(2, '0')}`;
            }
          }
        }

        // Resolve actual unitId to branch ID for calcActualValue
        const resolvedUnitId = branch ? branch.id : unitIdStr;

        const actualValue = await calcActualValue(tType, pType, period, r.unit_type, resolvedUnitId);

        // Auto-generate name if missing (GAS import didn't include name)
        const typeLabel = tType === 'NGUON_VIEC' ? 'Nguồn việc' : tType === 'DOANH_THU' ? 'Doanh thu' : 'Thu tiền';
        const autoName = r.name || `${typeLabel} - ${period}`;

        targets.push({
          id: r.id, name: autoName, type: tType,
          periodType: pType, period: period,
          unitType: isGeneral ? 'GENERAL' : 'BRANCH',
          unitId: resolvedUnitId || '',
          unitName: branch ? branch.name : (isGeneral ? 'Chung' : unitIdStr),
          targetValue: parseFloat(r.target_value) || 0,
          actualValue,
          createdAt: r.created_at,
        });
      }

      return { success: true, data: targets };
    }, CacheService.TTL.SHORT);

    res.json(data);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /targets
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const id = uuidv4();

    await query(`
      INSERT INTO targets (id, name, type, period_type, period, unit_type, unit_id, target_value)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, d.name, d.type, d.periodType, d.period, d.unitType || 'GENERAL', d.unitId || '', d.targetValue || 0]);

    await logActivity(req.user?.email || '', 'CREATE_TARGET', `Created target ${d.name}`);
    CacheService.clear(['DASHBOARD_STATS', 'TARGETS_LIST']);

    res.json({ success: true, data: { id } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /targets/:id
router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    await query(`
      UPDATE targets SET name=$1, type=$2, period_type=$3, period=$4, unit_type=$5, unit_id=$6, target_value=$7
      WHERE id=$8
    `, [d.name, d.type, d.periodType, d.period, d.unitType || 'GENERAL', d.unitId || '', d.targetValue || 0, req.params.id]);

    await logActivity(req.user?.email || '', 'UPDATE_TARGET', `Updated target ${d.name}`);
    CacheService.clear(['DASHBOARD_STATS', 'TARGETS_LIST']);

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /targets/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM targets WHERE id = $1 RETURNING name', [req.params.id]);
    if (result.rowCount === 0) return res.json({ success: false, error: 'Target not found' });
    await logActivity(req.user?.email || '', 'DELETE_TARGET', 'Deleted target');
    CacheService.clear(['DASHBOARD_STATS', 'TARGETS_LIST']);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
