/**
 * VCM XDDD — Validators dùng chung cho weekly/monthly plans + daily logs
 *
 * Mỗi hàm ném lỗi có `statusCode` để errorHandler trả đúng HTTP status
 * thay vì để lỗi constraint của PostgreSQL lọt ra client.
 */

const PLAN_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CARRIED_OVER'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function conflict(message) {
  const err = new Error(message);
  err.statusCode = 409;
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.statusCode = 403;
  return err;
}

/** Title bắt buộc, không rỗng, tối đa 500 ký tự */
function assertTitle(title) {
  if (typeof title !== 'string' || !title.trim()) {
    throw badRequest('Title is required');
  }
  if (title.length > 500) {
    throw badRequest('Title is too long (max 500 characters)');
  }
  return title.trim();
}

/** Text bắt buộc, không rỗng, có giới hạn độ dài. Trả về chuỗi đã trim. */
function assertRequiredText(value, field, max = 500) {
  if (typeof value !== 'string' || !value.trim()) throw badRequest(`${field} is required`);
  if (value.length > max) throw badRequest(`${field} is too long (max ${max} characters)`);
  return value.trim();
}

/** Số hữu hạn, không âm. undefined/rỗng → 0. */
function assertNonNegative(value, field) {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) throw badRequest(`${field} must be a number`);
  if (n < 0) throw badRequest(`${field} must not be negative`);
  return n;
}

/** Ép progress về 0..100 (tránh 500 hoặc -20 lọt vào DB) */
function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Status phải thuộc enum; undefined/rỗng → mặc định TODO */
function assertStatus(status, { allowCarriedOver = true } = {}) {
  if (status === undefined || status === null || status === '') return 'TODO';
  const allowed = allowCarriedOver
    ? PLAN_STATUSES
    : PLAN_STATUSES.filter(s => s !== 'CARRIED_OVER');
  if (!allowed.includes(status)) {
    throw badRequest(`Invalid status. Allowed: ${allowed.join(', ')}`);
  }
  return status;
}

/** Chuỗi ngày YYYY-MM-DD hoặc null */
function assertDate(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw badRequest(`${fieldName} must be a valid date (YYYY-MM-DD)`);
  }
  return value;
}

/** Ngày bắt đầu không được sau ngày kết thúc */
function assertDateRange(startDate, endDate, startField = 'startDate', endField = 'endDate') {
  const start = assertDate(startDate, startField);
  const end = assertDate(endDate, endField);
  if (start && end && start > end) {
    throw badRequest(`${startField} must not be after ${endField}`);
  }
  return { start, end };
}

/** Ngày bắt buộc (dùng cho weekStart/weekEnd/monthStart/logDate) */
function assertRequiredDate(value, fieldName) {
  const parsed = assertDate(value, fieldName);
  if (!parsed) throw badRequest(`${fieldName} is required`);
  return parsed;
}

/** Mảng id cho batch update */
function assertIds(ids, max = 200) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw badRequest('No IDs provided');
  }
  if (ids.length > max) {
    throw badRequest(`Too many IDs (max ${max})`);
  }
  if (ids.some(id => typeof id !== 'string' || !id)) {
    throw badRequest('IDs must be non-empty strings');
  }
  return ids;
}

/**
 * Khoá ngoại mềm (monthly_item_id, carried_from):
 * chuẩn hoá chuỗi rỗng thành NULL để weekly và monthly cùng một quy ước.
 *
 * `assignee_name` KHÔNG dùng hàm này — nó là cột text tự do nên đi qua
 * `textOrEmpty` ('') như mọi cột mô tả khác. Cột khoá ngoại `assignee_id` cũ đã
 * bị xoá, xem scripts/migrate-plan-assignee-text.sql.
 */
function nullIfBlank(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/** Cột text mô tả: giữ '' thay vì NULL cho khớp DEFAULT '' của schema */
function textOrEmpty(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

module.exports = {
  PLAN_STATUSES,
  badRequest,
  conflict,
  forbidden,
  assertTitle,
  assertRequiredText,
  assertNonNegative,
  clampPct,
  assertStatus,
  assertDate,
  assertDateRange,
  assertRequiredDate,
  assertIds,
  nullIfBlank,
  textOrEmpty,
};
