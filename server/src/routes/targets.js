/**
 * Target Routes — CRUD /targets
 * Port of getTargets, createTarget, updateTarget, deleteTarget from Code.gs
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');
const { normalizeTargetValue } = require('./_targetUnits');
const { normalizeTargetRow, targetKey, pickWinner } = require('./_targetNormalize');
const { round2 } = require('./_monthlyRollup');
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
 * Tính sẵn TOÀN BỘ giá trị thực hiện bằng vài query gộp, thay cho N query mỗi bản ghi.
 * Trả về map tra cứu: khoá = `${type}|${periodType}|${period}|${unitId}` -> actualValue
 *
 * ĐƠN VỊ: Doanh thu và Nguồn việc đọc `value_before_tax` (số TRƯỚC THUẾ), cùng đơn vị
 * với `targets.target_value`. Thu tiền đọc `payment` (đã gồm thuế) — xem _taxAmounts.js.
 *
 * VÌ SAO MỖI CHỈ SỐ HAI QUERY, KHÔNG PHẢI MỘT:
 * Bản cũ chỉ chạy một query gộp theo `c.branch_id` rồi suy số cấp công ty bằng cách
 * cộng các nhóm chi nhánh lại. Sai hai chỗ, cả hai đều âm thầm:
 *
 *   1. Hoá đơn `contract_id` NULL bị JOIN loại khỏi số GENERAL, trong khi
 *      /dashboard/general-performance và /dashboard/stats vẫn tính chúng. Cùng một kỳ
 *      ra hai con số, không có cảnh báo nào.
 *   2. Bản ghi thiếu `branch_id` bị CỘNG ĐÔI: `r.branch_id || ''` cho ra chuỗi rỗng,
 *      đúng bằng unitId của bucket GENERAL, mà setActual thì cộng dồn — nên hai lời
 *      gọi liên tiếp ghi vào cùng một khoá.
 *
 * Quy tắc thống nhất từ nay: **số cấp công ty tính trên MỌI bản ghi có ngày, không
 * JOIN; số cấp chi nhánh bắt buộc JOIN và bỏ qua bản ghi không có chi nhánh.**
 * Đúng cùng quy tắc mà dashboard.js đang dùng.
 */
async function calcAllActuals() {
  const actuals = {};

  const setActual = (type, periodType, period, unitId, value) => {
    const key = `${type}|${periodType}|${period}|${unitId || ''}`;
    actuals[key] = (actuals[key] || 0) + value;
  };

  /**
   * Một dòng {yr, mo, total} đóng góp vào cả ba kỳ MONTH/QUARTER/YEAR của một đơn vị.
   *
   * `val` làm tròn NGAY ở cấp tháng, trước khi cộng lên quý và năm — cùng quy tắc với
   * _monthlyRollup.js, để `actualValue` của kỳ QUARTER bằng đúng tổng ba kỳ MONTH của
   * nó. Bản cũ cộng số thô rồi mới làm tròn lúc tra cứu (getActual), nên quý lệch tổng
   * ba tháng ±0,01 triệu ở khoảng 1/3 số quý.
   */
  const spread = (type, unitId, rows) => {
    for (const r of rows) {
      const yr = r.yr;
      const mo = String(r.mo).padStart(2, '0');
      const q = Math.ceil(r.mo / 3);
      const val = round2(parseFloat(r.total));
      const unit = unitId === null ? (r.branch_id || '') : unitId;

      setActual(type, 'MONTH', `${yr}-${mo}`, unit, val);
      setActual(type, 'QUARTER', `${yr}-Q${q}`, unit, val);
      setActual(type, 'YEAR', `${yr}`, unit, val);
    }
  };

  const [nvBranch, nvGeneral, dtBranch, dtGeneral, ttBranch, ttGeneral] = await Promise.all([
    // ── NGUON_VIEC theo chi nhánh ──
    query(`
      SELECT c.branch_id,
             EXTRACT(YEAR FROM c.start_date)::int AS yr,
             EXTRACT(MONTH FROM c.start_date)::int AS mo,
             COALESCE(SUM(c.value_before_tax), 0) / 1000000.0 AS total
      FROM contracts c
      WHERE c.start_date IS NOT NULL AND COALESCE(c.branch_id, '') <> ''
      GROUP BY c.branch_id, yr, mo
    `),
    // ── NGUON_VIEC cấp công ty ──
    query(`
      SELECT EXTRACT(YEAR FROM start_date)::int AS yr,
             EXTRACT(MONTH FROM start_date)::int AS mo,
             COALESCE(SUM(value_before_tax), 0) / 1000000.0 AS total
      FROM contracts
      WHERE start_date IS NOT NULL
      GROUP BY yr, mo
    `),
    // ── DOANH_THU theo chi nhánh ──
    query(`
      SELECT c.branch_id,
             EXTRACT(YEAR FROM i.issued_date)::int AS yr,
             EXTRACT(MONTH FROM i.issued_date)::int AS mo,
             COALESCE(SUM(i.value_before_tax), 0) / 1000000.0 AS total
      FROM invoices i
      JOIN contracts c ON i.contract_id = c.id
      WHERE i.issued_date IS NOT NULL AND COALESCE(c.branch_id, '') <> ''
      GROUP BY c.branch_id, yr, mo
    `),
    // ── DOANH_THU cấp công ty ──
    query(`
      SELECT EXTRACT(YEAR FROM issued_date)::int AS yr,
             EXTRACT(MONTH FROM issued_date)::int AS mo,
             COALESCE(SUM(value_before_tax), 0) / 1000000.0 AS total
      FROM invoices
      WHERE issued_date IS NOT NULL
      GROUP BY yr, mo
    `),
    // ── THU_TIEN theo chi nhánh ── (payment: đã gồm thuế, không đổi cột)
    query(`
      SELECT c.branch_id,
             EXTRACT(YEAR FROM i.issued_date)::int AS yr,
             EXTRACT(MONTH FROM i.issued_date)::int AS mo,
             COALESCE(SUM(i.payment), 0) / 1000000.0 AS total
      FROM invoices i
      JOIN contracts c ON i.contract_id = c.id
      WHERE i.issued_date IS NOT NULL AND COALESCE(c.branch_id, '') <> ''
      GROUP BY c.branch_id, yr, mo
    `),
    // ── THU_TIEN cấp công ty ──
    // Bỏ điều kiện `payment > 0` của bản cũ: dashboard.js không lọc, và
    // assertNonNegative đã chặn số âm ở đường ghi nên hai bên ra cùng tổng.
    query(`
      SELECT EXTRACT(YEAR FROM issued_date)::int AS yr,
             EXTRACT(MONTH FROM issued_date)::int AS mo,
             COALESCE(SUM(payment), 0) / 1000000.0 AS total
      FROM invoices
      WHERE issued_date IS NOT NULL
      GROUP BY yr, mo
    `),
  ]);

  // unitId = null nghĩa là lấy từ cột branch_id của từng dòng; '' là bucket GENERAL
  spread('NGUON_VIEC', null, nvBranch.rows);
  spread('NGUON_VIEC', '', nvGeneral.rows);
  spread('DOANH_THU', null, dtBranch.rows);
  spread('DOANH_THU', '', dtGeneral.rows);
  spread('THU_TIEN', null, ttBranch.rows);
  spread('THU_TIEN', '', ttGeneral.rows);

  return actuals;
}

// GET /targets
router.get('/', async (req, res, next) => {
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
        // round2 ở đây chỉ dọn nhiễu dấu phẩy động của phép cộng dồn trong spread();
        // các số cộng vào đã là bội của 0,01 nên nó không làm tròn thật.
        return round2(actualsMap[key] || 0);
      };

      // Chuẩn hoá dùng chung với dashboard.js qua _targetNormalize.js. Trước đây
      // đoạn này là bản CHÉP TAY của cùng thuật toán; hai bản sửa lệch nhau là cách
      // Dashboard và trang Chỉ tiêu ra hai số khác nhau cho cùng một kỳ.
      //
      // Dữ liệu di cư từ Google Sheets khiến nhiều dòng THÔ khác nhau quy về CÙNG
      // một chỉ tiêu (period='' và period='2026' đều là YEAR/2026). DB hiện có đúng
      // ca đó: t-001 (=500) và t-008 (period rỗng, =100).
      //
      // Vẫn trả về ĐỦ mọi dòng để admin còn thấy và xoá được dòng trùng qua UI;
      // dòng thua chỉ bị gắn cờ `isDuplicate` để frontend không cộng/hiển thị nhầm.
      // Quy tắc chọn dòng thắng nằm ở _targetNormalize.js:pickWinner — cùng quy tắc
      // mà dashboard.js dùng, nên hai màn hình luôn chọn cùng một dòng.
      const groups = new Map();
      for (const r of result.rows) {
        const norm = normalizeTargetRow(r);
        const key = targetKey(norm);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }
      const winnerIds = new Set();
      for (const rows of groups.values()) winnerIds.add(pickWinner(rows).id);

      const targets = [];
      for (const r of result.rows) {
        const norm = normalizeTargetRow(r);
        const unitIdStr = (r.unit_id || '').trim();
        const branch = branchMap[unitIdStr] || branchMap[unitIdStr.toUpperCase()];
        const resolvedUnitId = branch ? branch.id : unitIdStr;

        // ── Lookup actual from pre-computed map (O(1), no DB call) ──
        const lookupId = norm.isGeneral ? '' : resolvedUnitId;
        const actualValue = getActual(norm.type, norm.periodType, norm.period, lookupId);

        const typeLabel = norm.type === 'NGUON_VIEC' ? 'Nguồn việc'
          : norm.type === 'DOANH_THU' ? 'Doanh thu' : 'Thu tiền';

        targets.push({
          id: r.id,
          name: r.name || `${typeLabel} - ${norm.period}`,
          type: norm.type,
          periodType: norm.periodType,
          period: norm.period,
          unitType: norm.unitType,
          unitId: resolvedUnitId || '',
          unitName: branch ? branch.name : (norm.isGeneral ? 'Chung' : unitIdStr),
          targetValue: normalizeTargetValue(r.target_value, norm.periodType, norm.isGeneral),
          actualValue,
          isDuplicate: !winnerIds.has(r.id),
          createdAt: r.created_at,
        });
      }

      return { success: true, data: targets };
    }, CacheService.TTL.SHORT);

    res.json(data);
  } catch (err) {
    // next(err) chứ không phải res.json({success:false}) với status 200: status 200
    // khiến client coi lỗi là thành công, và err.message phơi tên bảng/cột/constraint
    // PostgreSQL ra ngoài. errorHandler che message khi NODE_ENV=production.
    next(err);
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
