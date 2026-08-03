/**
 * Chuẩn hoá một dòng `targets` — dùng chung cho routes và script.
 *
 * Dữ liệu di cư từ Google Sheets không sạch: `type` có thể là "Nguồn việc" hoặc
 * "NGUON_VIEC"; `period_type` có thể là "Năm"/"NAM"/"YEAR"; `period` có thể là
 * "2026.0", "Năm 2026", "Q1", "3", hoặc **rỗng**. Trang Chỉ tiêu vẫn hiển thị
 * đúng vì nó chuẩn hoá lúc đọc — nhưng dữ liệu trong DB thì vẫn lệch nhau.
 *
 * Hệ quả phải nhớ:
 *
 * 1. Hai dòng khác nhau ở cột thô (`period = ''` và `period = '2026'`) sau chuẩn
 *    hoá lại thành **cùng một chỉ tiêu**. UNIQUE index trên cột thô không chặn
 *    được loại trùng này — phải chuẩn hoá dữ liệu trước rồi mới tạo index.
 *
 * 2. `period` rỗng ở kỳ YEAR được gán `currentYear`, nên dòng đó **tự nhảy năm**:
 *    năm nay nó là chỉ tiêu 2026, sang năm thành 2027. Đây là lý do phải ghi giá
 *    trị đã chuẩn hoá xuống DB thay vì tính lại mỗi lần đọc.
 */

/** Trả về currentYear dạng chuỗi — tách riêng để test bơm giá trị cố định vào */
function defaultYear() {
  return new Date().getFullYear().toString();
}

function normalizeType(rawType) {
  const t = String(rawType || '').toUpperCase().trim();
  if (t.includes('NGUON') || t.includes('NGUỒN')) return 'NGUON_VIEC';
  if (t.includes('DOANH')) return 'DOANH_THU';
  if (t.includes('THU')) return 'THU_TIEN';
  return t;
}

function normalizePeriodType(rawPeriodType) {
  const p = String(rawPeriodType || '').toUpperCase().trim();
  if (p.includes('NĂM') || p.includes('NAM')) return 'YEAR';
  if (p.includes('QUÝ') || p.includes('QUY')) return 'QUARTER';
  if (p.includes('THÁNG') || p.includes('THANG')) return 'MONTH';
  return p;
}

function normalizePeriod(rawPeriod, periodType, currentYear = defaultYear()) {
  let period = String(rawPeriod || '').trim()
    .replace(/\.0$/, '')
    .replace(/,/g, '')
    .toUpperCase();

  if (periodType === 'YEAR') {
    if (period.includes('NĂM') || period.includes('NAM') || !period.includes('-')) {
      period = period.replace(/[^\d]/g, '');
    }
    if (!period || period === '0') period = currentYear;
  } else if (periodType === 'QUARTER') {
    if (!period.includes('-')) {
      const digits = period.replace(/[^\d]/g, '');
      const q = digits ? digits.charAt(digits.length - 1) : '1';
      const yearPart = digits.length > 1 ? digits.slice(0, -1) : currentYear;
      period = `${yearPart}-Q${q}`;
    }
  } else if (periodType === 'MONTH') {
    if (!period.includes('-')) {
      const digits = period.replace(/[^\d]/g, '');
      if (digits.length >= 6) {
        period = `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
      } else if (digits.length <= 2) {
        period = `${currentYear}-${(digits || '01').padStart(2, '0')}`;
      } else {
        period = `${currentYear}-${digits.padStart(2, '0')}`;
      }
    }
  }

  return period;
}

/**
 * Chuẩn hoá cả dòng.
 * @param {object} row dòng thô từ bảng targets (snake_case)
 * @returns {{type, periodType, period, unitType, unitId, isGeneral}}
 */
function normalizeTargetRow(row, currentYear = defaultYear()) {
  const type = normalizeType(row.type);
  const periodType = normalizePeriodType(row.period_type);
  const period = normalizePeriod(row.period, periodType, currentYear);
  const isGeneral = row.unit_type === 'GENERAL' || !row.unit_type;

  return {
    type,
    periodType,
    period,
    unitType: isGeneral ? 'GENERAL' : 'BRANCH',
    unitId: isGeneral ? '' : String(row.unit_id || '').trim(),
    isGeneral,
  };
}

/** Khoá nghiệp vụ của một chỉ tiêu — hai dòng cùng khoá là trùng */
function targetKey(normalized) {
  return [
    normalized.type,
    normalized.periodType,
    normalized.period,
    normalized.unitType,
    normalized.unitId || '',
  ].join('|');
}

/** Dòng thô có cần chuẩn hoá lại không */
function needsNormalizing(row, currentYear = defaultYear()) {
  const n = normalizeTargetRow(row, currentYear);
  return row.type !== n.type
    || row.period_type !== n.periodType
    || String(row.period || '') !== n.period;
}

/**
 * Trong một nhóm trùng, chọn dòng được giữ lại.
 *
 * Thứ tự ưu tiên:
 *   1. `created_at` mới nhất
 *   2. dòng **không cần chuẩn hoá** — đây là dòng được nhập tử tế, và cũng là dòng
 *      giao diện đang hiển thị
 *   3. `id` lớn nhất, để kết quả xác định
 *
 * Bước 2 không thừa. DB local có hai chỉ tiêu Nguồn việc 2026 cùng `created_at`:
 * `t-001` (period='2026', giá trị 500) và `t-008` (period='', giá trị 100). Chỉ
 * dùng `created_at DESC, id DESC` sẽ giữ `t-008` và âm thầm kéo chỉ tiêu năm từ
 * 500 xuống 100, trong khi màn hình đang hiện 500.
 */
function pickWinner(rows, currentYear = defaultYear()) {
  return [...rows].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (tb !== ta) return tb - ta;

    const da = needsNormalizing(a, currentYear) ? 1 : 0;
    const db = needsNormalizing(b, currentYear) ? 1 : 0;
    if (da !== db) return da - db;

    return String(b.id).localeCompare(String(a.id));
  })[0];
}

module.exports = {
  normalizeType,
  normalizePeriodType,
  normalizePeriod,
  normalizeTargetRow,
  needsNormalizing,
  pickWinner,
  targetKey,
  defaultYear,
};
