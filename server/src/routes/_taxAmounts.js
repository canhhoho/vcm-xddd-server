/**
 * Quan hệ giữa ba cột tiền của `invoices` và `contracts` — dùng chung cho hai route.
 *
 *   value = ROUND(value_before_tax * (1 + tax_rate/100), 2)
 *
 * `value_before_tax` là ĐẦU VÀO (người dùng gõ trên form), `value` là số DẪN XUẤT
 * — đúng con số in trên chứng từ. Chiều ngược lại (`beforeTaxFrom`) chỉ tồn tại cho
 * đường tương thích với client cũ chỉ gửi `value`; đường thường không đi qua nó.
 *
 * VÌ SAO QUAN TRỌNG: Doanh thu (invoices) và Nguồn việc (contracts) trên Dashboard
 * và trang Chỉ tiêu đọc THẲNG `value_before_tax`. Ghi bản ghi mà quên cột đó thì nó
 * bằng 0 và bản ghi biến mất khỏi mọi báo cáo — không có lỗi, không có cảnh báo.
 * Đó là lý do `value` không được map thẳng trong vòng lặp `mapping` của PUT: hai cột
 * phải luôn được tính lại cùng nhau.
 *
 * `tax_rate` tính bằng PHẦN TRĂM: 5 nghĩa là 5%, không phải 500%.
 */
const { badRequest, assertNonNegative } = require('./_planValidators');

/** Thuế suất mặc định khi client không gửi — khớp DEFAULT của cột trong DB */
const DEFAULT_TAX_RATE = 5;

const round2 = (v) => Math.round(v * 100) / 100;

/** Trước thuế + thuế suất (%) -> sau thuế */
function afterTax(beforeTax, rate) {
  return round2(beforeTax * (1 + rate / 100));
}

/** Sau thuế + thuế suất (%) -> trước thuế. Chỉ dùng cho đường tương thích. */
function beforeTaxFrom(after, rate) {
  return round2(after / (1 + rate / 100));
}

/** Thuế suất: số phần trăm trong [0, 100] */
function assertTaxRate(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest('taxRate must be a number');
  if (n < 0 || n > 100) throw badRequest('taxRate must be between 0 and 100');
  return n;
}

/**
 * Chuẩn hoá bộ ba (value_before_tax, tax_rate, value) từ payload client.
 *
 * @param {object} d       payload client gửi (camelCase)
 * @param {object} current bản ghi hiện có dạng snake_case (PUT); {} khi tạo mới
 * @returns {{valueBeforeTax: number, taxRate: number, value: number, touched: boolean}}
 *   `touched` = client có gửi ít nhất một trong ba khoá tiền hay không. PUT dùng nó
 *   để quyết định có đưa ba cột vào câu UPDATE không.
 */
function resolveAmounts(d, current = {}) {
  const touched = d.valueBeforeTax !== undefined
    || d.taxRate !== undefined
    || d.value !== undefined;

  // 1. Thuế suất: payload -> bản ghi cũ -> mặc định
  const sentRate = assertTaxRate(d.taxRate);
  const currentRate = current.tax_rate !== undefined && current.tax_rate !== null
    ? Number(current.tax_rate)
    : null;
  const taxRate = sentRate !== null
    ? sentRate
    : (currentRate !== null && Number.isFinite(currentRate) ? currentRate : DEFAULT_TAX_RATE);

  // 2. Đường CHÍNH — client gửi số trước thuế, số sau thuế là dẫn xuất
  if (d.valueBeforeTax !== undefined) {
    const valueBeforeTax = assertNonNegative(d.valueBeforeTax, 'valueBeforeTax');
    return { valueBeforeTax, taxRate, value: afterTax(valueBeforeTax, taxRate), touched };
  }

  // 3. Đường TƯƠNG THÍCH — client cũ (api.gas.ts, script cũ) chỉ biết `value`.
  //    Suy ngược ra trước thuế và giữ nguyên `value` client gửi, để con số trên
  //    chứng từ không bị lệch vài xu do làm tròn hai chiều.
  //    Thiếu nhánh này thì mọi bản ghi tạo bằng payload cũ có value_before_tax = 0
  //    và rơi khỏi báo cáo doanh thu mà không báo lỗi.
  if (d.value !== undefined) {
    const value = assertNonNegative(d.value, 'value');
    return { valueBeforeTax: beforeTaxFrom(value, taxRate), taxRate, value, touched };
  }

  // 4. Chỉ đổi thuế suất (PUT): giữ số trước thuế, tính lại số sau thuế
  const valueBeforeTax = assertNonNegative(current.value_before_tax, 'valueBeforeTax');
  return { valueBeforeTax, taxRate, value: afterTax(valueBeforeTax, taxRate), touched };
}

module.exports = {
  DEFAULT_TAX_RATE,
  afterTax,
  beforeTaxFrom,
  assertTaxRate,
  resolveAmounts,
};
