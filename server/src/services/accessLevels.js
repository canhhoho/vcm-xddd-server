/**
 * VCM XDDD — Chuẩn hoá và kiểm giá trị cột quyền của bảng `users`
 *
 * Nguồn duy nhất cho câu hỏi "level này đọc được / ghi được không". Trước đây có
 * BỐN bản cài đặt độc lập (moduleAccess, planAccess, projectMemberAccess,
 * notifications) và ba bản trong đó kiểm quyền đọc bằng DENY-LIST:
 *
 *     if (level === 'NO_ACCESS') return 403;
 *
 * Deny-list là FAIL-OPEN: `'FULL'` (đang có thật trong seed-test.sql), `'READ'`,
 * `'x'`, `''`, `null` đều KHÁC 'NO_ACCESS' nên đều được cấp quyền ĐỌC. Mọi kiểm
 * tra ở đây là ALLOW-LIST: không nhận diện được thì coi như chưa cấp.
 *
 * Logic thuần, không phụ thuộc Express — để cả middleware/ lẫn routes/ import
 * được mà không tạo require vòng tròn.
 */

/**
 * Cột module/plan KHÔNG có 'ADMIN'. Nghe như quyền cao nhất nhưng cổng ghi đòi
 * đúng 'EDIT', nên đặt ADMIN vào cột module thực tế cho quyền YẾU HƠN EDIT —
 * ngược ý định người bấm. Quyền ADMIN toàn cục nằm ở cột `role`.
 */
const ACCESS_LEVELS = ['EDIT', 'VIEW', 'NO_ACCESS'];
const ROLE_LEVELS = ['ADMIN', ...ACCESS_LEVELS];

const MODULE_COLUMNS = ['contracts', 'projects', 'targets', 'branches', 'business'];
const PLAN_COLUMNS = ['plans_bd', 'plans_mkt', 'plans_qs', 'plans_des', 'plans_pm'];
// Mọi cột quyền theo module/phòng ban. KHÔNG gồm `role` (thang giá trị khác) và
// KHÔNG gồm `plans` số ít (deprecated, không code nào đọc/ghi).
const PERMISSION_COLUMNS = [...MODULE_COLUMNS, ...PLAN_COLUMNS];

/**
 * Giá trị cũ còn sót trong DB, quy đổi sang mức tương đương về HÀNH VI THỰC TẾ.
 *
 * `ADMIN` và `FULL` ở cột module/plan hôm nay cho ĐỌC (vì !== 'NO_ACCESS') nhưng
 * KHÔNG cho ghi (vì !== 'EDIT') — tức đúng bằng VIEW. Quy về VIEW nên không ai
 * bị thêm hay mất quyền; quy về EDIT sẽ là NÂNG QUYỀN âm thầm.
 *
 * migrate-users-permission-constraints.sql dọn hai giá trị này khỏi DB, nhưng
 * bảng vẫn phải ở đây để DB chưa chạy migration hành xử đúng.
 */
const LEGACY_ALIAS = { ADMIN: 'VIEW', FULL: 'VIEW' };

/** trim + uppercase. `null`/`undefined`/số đều thành chuỗi rỗng, không ném lỗi. */
function canonical(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

/**
 * Về đúng một trong 3 mức của cột module/plan. Giá trị không nhận diện được ->
 * 'NO_ACCESS' (fail-closed).
 */
function normalizeAccess(value) {
  const v = canonical(value);
  const mapped = LEGACY_ALIAS[v] || v;
  return ACCESS_LEVELS.includes(mapped) ? mapped : 'NO_ACCESS';
}

/**
 * Về đúng một trong 4 mức của cột `role`. KHÔNG dùng LEGACY_ALIAS: 'ADMIN' ở cột
 * role là hợp lệ và có nghĩa hoàn toàn khác.
 */
function normalizeRole(value) {
  const v = canonical(value);
  return ROLE_LEVELS.includes(v) ? v : 'NO_ACCESS';
}

/** Đọc được? (VIEW hoặc EDIT). Allow-list, không phải `!== 'NO_ACCESS'`. */
function canRead(value) {
  return normalizeAccess(value) !== 'NO_ACCESS';
}

/** Ghi được? Chỉ EDIT. */
function canWrite(value) {
  return normalizeAccess(value) === 'EDIT';
}

/** role toàn cục là ADMIN? ADMIN bypass toàn bộ ma trận quyền theo module. */
function isAdminRole(value) {
  return normalizeRole(value) === 'ADMIN';
}

module.exports = {
  ACCESS_LEVELS,
  ROLE_LEVELS,
  MODULE_COLUMNS,
  PLAN_COLUMNS,
  PERMISSION_COLUMNS,
  normalizeAccess,
  normalizeRole,
  canRead,
  canWrite,
  isAdminRole,
};
