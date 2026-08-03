/**
 * Đơn vị của targets.target_value — dùng chung cho dashboard.js và targets.js.
 *
 * Dữ liệu di cư từ Google Sheets không có đơn vị tường minh: chỉ tiêu NĂM/QUÝ cấp
 * công ty có bản nhập bằng **tỷ** (6.8), có bản nhập bằng **triệu** (6800). Toàn hệ
 * thống tính bằng triệu, nên chỗ đọc phải đoán và quy đổi.
 *
 * Trước đây phép đoán này được chép hai bản với phạm vi lệch nhau — dashboard.js chỉ
 * áp cho YEAR, targets.js áp cho cả YEAR lẫn QUARTER — nên cùng một dòng trong DB có
 * thể được hai màn hình hiểu theo hai đơn vị. Gom về đây để chỉ còn một quy tắc.
 *
 * QUAN TRỌNG — đây vẫn là phép ĐOÁN, không phải sự thật:
 * ngưỡng 100 không phân biệt được "6.8 tỷ" với "80 triệu". Nó chỉ đúng trên thực tế
 * vì chỉ tiêu năm/quý cấp công ty luôn ≥ 100 triệu. Cách sửa triệt để là chuẩn hoá
 * một lần lúc ghi/migrate rồi xoá hẳn hàm này — xem docs/lessons-learned.md.
 *
 * Chỉ tiêu THÁNG và chỉ tiêu theo CHI NHÁNH không bao giờ quy đổi: chúng vốn nhỏ,
 * áp ngưỡng vào sẽ thổi phồng 1000 lần đúng những giá trị hợp lệ.
 */

/** Ngưỡng dưới ngưỡng này thì coi là đang nhập bằng tỷ */
const TY_THRESHOLD = 100;

/** Kỳ nào được phép quy đổi. MONTH cố ý không có mặt. */
const CONVERTIBLE_PERIODS = ['YEAR', 'QUARTER'];

/**
 * @param {*} rawValue    giá trị thô từ DB (NUMERIC → node-postgres trả về chuỗi)
 * @param {string} periodType  'YEAR' | 'QUARTER' | 'MONTH' | ...
 * @param {boolean} isGeneral  true = chỉ tiêu chung, false = chỉ tiêu chi nhánh
 * @returns {number} giá trị tính bằng triệu
 */
function normalizeTargetValue(rawValue, periodType, isGeneral = true) {
  const value = parseFloat(rawValue) || 0;
  const period = String(periodType || '').toUpperCase();

  const convertible = isGeneral
    && CONVERTIBLE_PERIODS.some(p => period.includes(p))
    && value > 0
    && value < TY_THRESHOLD;

  return convertible ? Math.round(value * 1000 * 100) / 100 : value;
}

module.exports = { normalizeTargetValue, TY_THRESHOLD, CONVERTIBLE_PERIODS };
