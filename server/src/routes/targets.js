/**
 * Target Routes — CRUD /targets
 * Port of getTargets, createTarget, updateTarget, deleteTarget from Code.gs
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');
const { normalizeTargetValue } = require('./_targetUnits');
const { normalizeTargetRow, targetKey } = require('./_targetNormalize');
const { conflict } = require('./_planValidators');

/**
 * Tìm chỉ tiêu đã tồn tại cùng khoá nghiệp vụ (so trên giá trị ĐÃ CHUẨN HOÁ).
 *
 * Không so bằng SQL trên cột thô được: dữ liệu di cư từ GAS có `period` dạng
 * '2026.0', 'Năm 2026' hoặc rỗng — khác nhau ở cột thô nhưng là cùng một chỉ tiêu
 * sau chuẩn hoá. So bằng `WHERE period = $1` sẽ không thấy và vẫn tạo ra dòng trùng.
 *
 * @param {object} input payload đã ở dạng camelCase từ req.body
 * @param {string} [excludeId] bỏ qua chính dòng đang sửa (dùng cho PUT)
 */
async function findDuplicate(input, excludeId) {
  const wanted = targetKey(normalizeTargetRow({
    type: input.type,
    period_type: input.periodType,
    period: input.period,
    unit_type: input.unitType || 'GENERAL',
    unit_id: input.unitId || '',
  }));

  const { rows } = await query(
    'SELECT id, type, period_type, period, unit_type, unit_id FROM targets'
  );
  return rows.find(r => r.id !== excludeId && targetKey(normalizeTargetRow(r)) === wanted) || null;
}

async function logActivity(email, action, description) {
  try {
    await query('INSERT INTO activities (id, email, action, description) VALUES ($1, $2, $3, $4)',
      [uuidv4(), email, action, description]);
  } catch (e) { console.error('logActivity:', e.message); }
}

/**
 * Pre-compute ALL actual values in 3 batch queries instead of N per-record queries.
 * Returns a lookup map: key = `${type}|${periodType}|${period}|${unitId}` -> actualValue
 */
async function calcAllActuals() {
  const actuals = {};

  const setActual = (type, periodType, period, unitId, value) => {
    const key = `${type}|${periodType}|${period}|${unitId || ''}`;
    actuals[key] = (actuals[key] || 0) + value;
  };

  // ── Batch 1: NGUON_VIEC ── contracts grouped by branch + year/month
  const nvRows = await query(`
    SELECT
      c.branch_id,
      EXTRACT(YEAR FROM c.start_date)::int AS yr,
      EXTRACT(MONTH FROM c.start_date)::int AS mo,
      COALESCE(SUM(c.value), 0) / 1000000.0 AS total
    FROM contracts c
    WHERE c.start_date IS NOT NULL
    GROUP BY c.branch_id, yr, mo
  `);
  for (const r of nvRows.rows) {
    const yr = r.yr, mo = String(r.mo).padStart(2, '0');
    const q = Math.ceil(r.mo / 3);
    const val = parseFloat(r.total);
    const branchId = r.branch_id || '';

    // MONTH
    setActual('NGUON_VIEC', 'MONTH', `${yr}-${mo}`, branchId, val);
    setActual('NGUON_VIEC', 'MONTH', `${yr}-${mo}`, '', val); // GENERAL
    // QUARTER
    setActual('NGUON_VIEC', 'QUARTER', `${yr}-Q${q}`, branchId, val);
    setActual('NGUON_VIEC', 'QUARTER', `${yr}-Q${q}`, '', val);
    // YEAR
    setActual('NGUON_VIEC', 'YEAR', `${yr}`, branchId, val);
    setActual('NGUON_VIEC', 'YEAR', `${yr}`, '', val);
  }

  // ── Batch 2: DOANH_THU ── invoices grouped by branch + year/month
  const dtRows = await query(`
    SELECT
      c.branch_id,
      EXTRACT(YEAR FROM i.issued_date)::int AS yr,
      EXTRACT(MONTH FROM i.issued_date)::int AS mo,
      COALESCE(SUM(i.value), 0) / 1000000.0 AS total
    FROM invoices i
    JOIN contracts c ON i.contract_id = c.id
    WHERE i.issued_date IS NOT NULL
    GROUP BY c.branch_id, yr, mo
  `);
  for (const r of dtRows.rows) {
    const yr = r.yr, mo = String(r.mo).padStart(2, '0');
    const q = Math.ceil(r.mo / 3);
    const val = parseFloat(r.total);
    const branchId = r.branch_id || '';

    setActual('DOANH_THU', 'MONTH', `${yr}-${mo}`, branchId, val);
    setActual('DOANH_THU', 'MONTH', `${yr}-${mo}`, '', val);
    setActual('DOANH_THU', 'QUARTER', `${yr}-Q${q}`, branchId, val);
    setActual('DOANH_THU', 'QUARTER', `${yr}-Q${q}`, '', val);
    setActual('DOANH_THU', 'YEAR', `${yr}`, branchId, val);
    setActual('DOANH_THU', 'YEAR', `${yr}`, '', val);
  }

  // ── Batch 3: THU_TIEN ── paid invoices grouped by branch + year/month
  const ttRows = await query(`
    SELECT
      c.branch_id,
      EXTRACT(YEAR FROM i.issued_date)::int AS yr,
      EXTRACT(MONTH FROM i.issued_date)::int AS mo,
      COALESCE(SUM(i.payment), 0) / 1000000.0 AS total
    FROM invoices i
    JOIN contracts c ON i.contract_id = c.id
    WHERE i.payment > 0 AND i.issued_date IS NOT NULL
    GROUP BY c.branch_id, yr, mo
  `);
  for (const r of ttRows.rows) {
    const yr = r.yr, mo = String(r.mo).padStart(2, '0');
    const q = Math.ceil(r.mo / 3);
    const val = parseFloat(r.total);
    const branchId = r.branch_id || '';

    setActual('THU_TIEN', 'MONTH', `${yr}-${mo}`, branchId, val);
    setActual('THU_TIEN', 'MONTH', `${yr}-${mo}`, '', val);
    setActual('THU_TIEN', 'QUARTER', `${yr}-Q${q}`, branchId, val);
    setActual('THU_TIEN', 'QUARTER', `${yr}-Q${q}`, '', val);
    setActual('THU_TIEN', 'YEAR', `${yr}`, branchId, val);
    setActual('THU_TIEN', 'YEAR', `${yr}`, '', val);
  }

  return actuals;
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
        if (b.code) branchMap[b.code.toUpperCase()] = b;
      });

      // ── Pre-compute ALL actuals in 3 batch queries (replaces N per-record queries) ──
      const actualsMap = await calcAllActuals();
      const getActual = (type, periodType, period, unitId) => {
        const key = `${type}|${periodType}|${period}|${unitId || ''}`;
        return Math.round((actualsMap[key] || 0) * 100) / 100;
      };

      const currentYear = new Date().getFullYear().toString();
      const targets = [];
      for (const r of result.rows) {
        const isGeneral = r.unit_type === 'GENERAL' || !r.unit_type;
        const unitIdStr = (r.unit_id || '').trim();
        const branch = branchMap[unitIdStr] || branchMap[unitIdStr.toUpperCase()];

        let tType = (r.type || '').toUpperCase().trim();
        if (tType.includes('NGUON') || tType.includes('NGUỒN')) tType = 'NGUON_VIEC';
        else if (tType.includes('DOANH')) tType = 'DOANH_THU';
        else if (tType.includes('THU')) tType = 'THU_TIEN';

        let pType = (r.period_type || '').toUpperCase().trim();
        if (pType.includes('NĂM') || pType.includes('NAM')) pType = 'YEAR';
        else if (pType.includes('QUÝ') || pType.includes('QUY')) pType = 'QUARTER';
        else if (pType.includes('THÁNG') || pType.includes('THANG')) pType = 'MONTH';

        let period = String(r.period || '').trim();
        period = period.replace(/\.0$/, '').replace(/,/g, '');
        period = period.toUpperCase();

        if (pType === 'YEAR') {
          if (period.includes('NĂM') || period.includes('NAM') || !period.includes('-')) {
            period = period.replace(/[^\d]/g, '');
          }
          if (!period || period === '0') period = currentYear;
        } else if (pType === 'QUARTER') {
          if (!period.includes('-')) {
            const digits = period.replace(/[^\d]/g, '');
            const q = digits ? digits.charAt(digits.length - 1) : '1';
            const yearPart = digits.length > 1 ? digits.slice(0, -1) : currentYear;
            period = `${yearPart}-Q${q}`;
          }
        } else if (pType === 'MONTH') {
          if (!period.includes('-')) {
            const digits = period.replace(/[^\d]/g, '');
            if (digits.length >= 6) {
              period = `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
            } else if (digits.length <= 2) {
              const m = (digits || '01').padStart(2, '0');
              period = `${currentYear}-${m}`;
            } else {
              period = `${currentYear}-${digits.padStart(2, '0')}`;
            }
          }
        }

        const resolvedUnitId = branch ? branch.id : unitIdStr;

        // ── Lookup actual from pre-computed map (O(1), no DB call) ──
        const lookupId = isGeneral ? '' : resolvedUnitId;
        const actualValue = getActual(tType, pType, period, lookupId);

        const typeLabel = tType === 'NGUON_VIEC' ? 'Nguồn việc' : tType === 'DOANH_THU' ? 'Doanh thu' : 'Thu tiền';
        const autoName = r.name || `${typeLabel} - ${period}`;

        const targetVal = normalizeTargetValue(r.target_value, pType, isGeneral);

        targets.push({
          id: r.id, name: autoName, type: tType,
          periodType: pType, period: period,
          unitType: isGeneral ? 'GENERAL' : 'BRANCH',
          unitId: resolvedUnitId || '',
          unitName: branch ? branch.name : (isGeneral ? 'Chung' : unitIdStr),
          targetValue: targetVal,
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
// Upsert theo khoá nghiệp vụ: gửi lại cùng một chỉ tiêu thì GHI ĐÈ dòng cũ thay vì
// tạo dòng thứ hai. Auto-link ở frontend dựa vào hành vi này — trước đây nó tự dò
// bản Nguồn việc hiện có bằng .find() trên danh sách phía client, danh sách chưa
// refetch kịp là sinh thêm dòng trùng.
router.post('/', async (req, res, next) => {
  try {
    const d = req.body;
    const existing = await findDuplicate(d);

    if (existing) {
      await query(`
        UPDATE targets SET name=$1, type=$2, period_type=$3, period=$4, unit_type=$5, unit_id=$6, target_value=$7
        WHERE id=$8
      `, [d.name, d.type, d.periodType, d.period, d.unitType || 'GENERAL', d.unitId || '', d.targetValue || 0, existing.id]);

      await logActivity(req.user?.email || '', 'UPDATE_TARGET', `Upserted target ${d.name}`);
      CacheService.clear(['TARGETS_LIST']); CacheService.invalidateDashboard();
      return res.json({ success: true, data: { id: existing.id, upserted: true } });
    }

    const id = uuidv4();
    await query(`
      INSERT INTO targets (id, name, type, period_type, period, unit_type, unit_id, target_value)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, d.name, d.type, d.periodType, d.period, d.unitType || 'GENERAL', d.unitId || '', d.targetValue || 0]);

    await logActivity(req.user?.email || '', 'CREATE_TARGET', `Created target ${d.name}`);
    CacheService.clear(['TARGETS_LIST']); CacheService.invalidateDashboard();

    res.json({ success: true, data: { id } });
  } catch (err) {
    next(err);
  }
});

// PUT /targets/:id
router.put('/:id', async (req, res, next) => {
  try {
    const d = req.body;
    // Sửa một chỉ tiêu thành trùng với chỉ tiêu khác thì chặn — ở đây không upsert
    // được vì sẽ phải xoá bớt một dòng mà người dùng không hề yêu cầu.
    const clash = await findDuplicate(d, req.params.id);
    if (clash) {
      throw conflict(`Đã có chỉ tiêu khác cùng loại và cùng kỳ (id: ${clash.id})`);
    }

    const result = await query(`
      UPDATE targets SET name=$1, type=$2, period_type=$3, period=$4, unit_type=$5, unit_id=$6, target_value=$7
      WHERE id=$8
    `, [d.name, d.type, d.periodType, d.period, d.unitType || 'GENERAL', d.unitId || '', d.targetValue || 0, req.params.id]);

    if (result.rowCount === 0) {
      const err = new Error('Target not found');
      err.statusCode = 404;
      throw err;
    }

    await logActivity(req.user?.email || '', 'UPDATE_TARGET', `Updated target ${d.name}`);
    CacheService.clear(['TARGETS_LIST']); CacheService.invalidateDashboard();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /targets/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM targets WHERE id = $1 RETURNING name', [req.params.id]);
    if (result.rowCount === 0) {
      const err = new Error('Target not found');
      err.statusCode = 404;
      throw err;
    }
    await logActivity(req.user?.email || '', 'DELETE_TARGET', 'Deleted target');
    CacheService.clear(['TARGETS_LIST']); CacheService.invalidateDashboard();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
