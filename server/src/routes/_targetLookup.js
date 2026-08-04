/**
 * Tra cứu chỉ tiêu đã chuẩn hoá + khử trùng — tầng ĐỌC dùng chung.
 *
 * Đọc thẳng bảng `targets` bằng SQL rất dễ sai, vì dữ liệu di cư từ Google Sheets
 * không sạch: `period_type` có thể là 'Năm', `period` có thể là '2026.0' hoặc rỗng
 * (xem `_targetNormalize.js`). Trang Chỉ tiêu chuẩn hoá lúc đọc nên hiển thị đúng;
 * chỗ nào tự viết `WHERE period LIKE '%2026%'` thì lệch với nó.
 *
 * Ngoài ra một kỳ có thể có **nhiều dòng** — `LIMIT 1` không `ORDER BY` sẽ trả dòng
 * nào tuỳ Postgres. Ở đây gom theo khoá nghiệp vụ đã chuẩn hoá rồi chọn dòng thắng
 * bằng `pickWinner`, đúng dòng mà trang Chỉ tiêu đang hiển thị.
 *
 * ĐÂY LÀ ĐƯỜNG ĐỌC — không sửa gì trong DB. Dòng trùng vẫn nằm nguyên đó; muốn
 * thấy chúng thì chạy `node scripts/report-duplicate-targets.js`.
 */
const { query } = require('../config/database');
const { normalizeTargetRow, targetKey, pickWinner } = require('./_targetNormalize');
const { normalizeTargetValue } = require('./_targetUnits');

/**
 * Đọc cả bảng targets một lần.
 * @returns {Promise<Map<string, {id, norm, value, duplicates}>>} khoá là targetKey;
 *   `value` đã quy đổi về **triệu** qua `normalizeTargetValue`.
 */
async function loadTargetIndex() {
  const { rows } = await query(`
    SELECT id, type, period_type, period, unit_type, unit_id, target_value, created_at
    FROM targets
  `);

  const groups = new Map();
  for (const r of rows) {
    const norm = normalizeTargetRow(r);
    const key = targetKey(norm);
    if (!groups.has(key)) groups.set(key, { norm, rows: [] });
    groups.get(key).rows.push(r);
  }

  const index = new Map();
  for (const [key, g] of groups) {
    const winner = pickWinner(g.rows);
    index.set(key, {
      id: winner.id,
      norm: g.norm,
      value: normalizeTargetValue(winner.target_value, g.norm.periodType, g.norm.isGeneral),
      duplicates: g.rows.length - 1,
    });
  }
  return index;
}

/**
 * Chỉ tiêu chung (unit_type = GENERAL) của đúng một kỳ.
 * @param {string} period '2026' | '2026-Q1' | '2026-03' — dạng ĐÃ chuẩn hoá
 * @returns {number} tính bằng triệu; 0 nếu không có
 */
function getGeneralTarget(index, type, periodType, period) {
  const hit = index.get(targetKey({ type, periodType, period, unitType: 'GENERAL', unitId: '' }));
  return hit ? hit.value : 0;
}

/**
 * Lọc nhiều chỉ tiêu cùng lúc — dùng cho trend theo tháng và bảng chi nhánh.
 *
 * `year` lọc theo phần năm của period ('2026' khớp cả '2026', '2026-Q1', '2026-03');
 * để trống/null thì lấy mọi năm, đúng nhu cầu của chế độ xem ALL.
 *
 * @returns {Array<{id, norm, value, duplicates}>}
 */
function listTargets(index, { type, periodType, isGeneral, year = null } = {}) {
  const out = [];
  for (const entry of index.values()) {
    const n = entry.norm;
    if (type && n.type !== type) continue;
    if (periodType && n.periodType !== periodType) continue;
    if (isGeneral !== undefined && n.isGeneral !== isGeneral) continue;
    if (year && n.period.split('-')[0] !== String(year)) continue;
    out.push(entry);
  }
  return out;
}

module.exports = { loadTargetIndex, getGeneralTarget, listTargets };
