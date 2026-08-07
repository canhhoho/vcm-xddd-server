/**
 * Gom số theo tháng → quý → năm cho báo cáo Nguồn việc / Doanh thu / Thu tiền.
 *
 * VÌ SAO LÀM TRÒN Ở CẤP THÁNG, KHÔNG PHẢI Ở CẤP QUÝ/NĂM:
 * Bảng trên page Chỉ tiêu xếp Năm → 4 Quý → 12 Tháng chồng lên nhau, người dùng cộng
 * tay các dòng tháng để đối chiếu dòng quý. Bản cũ làm tròn HAI lần độc lập —
 * `months[m] = round2(v)` nhưng `quarters[q] += v` (số THÔ) — mà
 * `round2(v1+v2+v3)` ≠ `round2(v1)+round2(v2)+round2(v3)`. Đo bằng mô phỏng: dòng quý
 * lệch tổng ba dòng tháng ±0,01 triệu ở **33%** số quý, dòng năm lệch ở **62%** số năm.
 * `formatNumber` của frontend hiện tới 3 số lẻ nên chênh lệch đó nhìn thấy được.
 *
 * Quy tắc từ nay: **làm tròn ĐÚNG MỘT LẦN ở cấp tháng; quý và năm chỉ cộng các tháng
 * đã làm tròn.** Đánh đổi: sai số so với số thật ≤ 0,06 triệu (60.000 đ) trên các con
 * số hàng trăm triệu — đổi lại mọi số trên màn hình luôn cộng khớp tuyệt đối.
 *
 * MỌI chỗ tính Nguồn việc/Doanh thu/Thu tiền theo kỳ phải đi qua đây. Trước đây cùng
 * một thuật toán bị chép tay ba chỗ trong `dashboard.js` và một chỗ nữa trong
 * `targets.js`; sửa lệch một bản là hai màn hình ra hai con số cho cùng một kỳ — đúng
 * loại lỗi mà `_targetLookup.js` và `_targetNormalize.js` đã phải tồn tại để dập.
 *
 * ĐƠN VỊ: các hàm ở đây KHÔNG đổi đơn vị. Query gọi chúng phải tự chia 1000000 để ra
 * TRIỆU trước khi truyền vào (`SUM(value_before_tax)/1000000`).
 */

/** Làm tròn 2 số lẻ. */
const round2 = (v) => Math.round(v * 100) / 100;

/**
 * @param {Array<{m: number|string, total: number|string}>} rows kết quả `GROUP BY` tháng.
 *   `total` là NUMERIC nên node-postgres trả về CHUỖI — phải parseFloat.
 * @returns {{year: number, quarters: Record<1|2|3|4, number>, months: Record<number, number>}}
 *   `months` THƯA: tháng không có dữ liệu thì không có khoá (giữ nguyên hành vi cũ,
 *   frontend tự coi là 0). `quarters` luôn đủ bốn khoá.
 *   Bất biến: `year === Σ quarters === Σ months`, và `quarters[q] === Σ 3 tháng của q`.
 */
function rollupMonths(rows) {
  // Bước 1 — gộp THÔ theo tháng. Cộng dồn chứ không gán: query GROUP BY nhiều cột
  // (ví dụ theo chi nhánh) có thể trả nhiều dòng cùng một tháng.
  const raw = {};
  for (const r of rows) {
    const m = Number(r.m);
    if (!(m >= 1 && m <= 12)) continue; // dòng bẩn sẽ tạo khoá "NaN" trong map
    raw[m] = (raw[m] || 0) + (parseFloat(r.total) || 0);
  }

  // Bước 2 — làm tròn một lần ở cấp tháng, rồi mới cộng lên quý và năm.
  const months = {};
  const quarters = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let year = 0;
  for (const key of Object.keys(raw)) {
    const m = Number(key);
    const v = round2(raw[m]);
    months[m] = v;
    quarters[Math.ceil(m / 3)] += v;
    year += v;
  }

  // round2 ở đây CHỈ dọn nhiễu dấu phẩy động (0.1 + 0.2 = 0.30000000000000004),
  // không phải làm tròn thật — mọi số vừa cộng vào đã là bội của 0,01.
  for (const q of [1, 2, 3, 4]) quarters[q] = round2(quarters[q]);

  return { year: round2(year), quarters, months };
}

/**
 * Dạng phẳng cho `/dashboard/branch-performance`, vốn không có khái niệm quý.
 * @returns {{total: number, months: Record<number, number>}} `total === Σ months`.
 */
function rollupMonthsFlat(rows) {
  const { year, months } = rollupMonths(rows);
  return { total: year, months };
}

module.exports = { round2, rollupMonths, rollupMonthsFlat };
