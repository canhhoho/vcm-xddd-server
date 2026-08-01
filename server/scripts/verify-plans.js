#!/usr/bin/env node
/**
 * VCM XDDD — Verify page Plan
 *
 * Kiểm tra bằng assertion trên API thật + DB thật (không phải unit test).
 * Cần backend đang chạy ở http://localhost:3001.
 *
 *   node scripts/verify-plans.js --allow-writes          # chạy tất cả
 *   node scripts/verify-plans.js 1.2 --allow-writes      # chỉ chạy nhóm phân quyền
 *
 * Script tự tạo 2 user test rồi xoá lúc kết thúc, và tự dọn dữ liệu plan
 * năm 2030 mà nó sinh ra.
 */
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const args = process.argv.slice(2);
const ALLOW_WRITES = args.includes('--allow-writes');
const ONLY = args.find(a => !a.startsWith('--')) || null;

const BASE = process.env.VERIFY_API_BASE || 'http://localhost:3001/api';

// ---------------------------------------------------------------- guard rail
// Script tạo user đăng nhập được (role EDIT) và xoá dữ liệu -> không được phép
// chạy nhầm lên production. DB_HOST=localhost đúng cả trên server thật nên nó
// không phân biệt được gì; vì vậy bắt buộc opt-in tường minh bằng cờ CLI.
const DB_HOST = process.env.DB_HOST || 'localhost';
if (!ALLOW_WRITES) {
    console.error('❌ Script này TẠO USER đăng nhập được và XOÁ dữ liệu.');
    console.error(`   DB đích: ${process.env.DB_NAME || 'vcm_xddd'} @ ${DB_HOST}`);
    console.error('   Nếu đúng là DB local của bạn, chạy lại kèm cờ --allow-writes');
    process.exit(1);
}
if (!['localhost', '127.0.0.1', '::1'].includes(DB_HOST)) {
    console.error(`❌ Từ chối chạy: DB_HOST=${DB_HOST} không phải DB local.`);
    process.exit(1);
}

const pool = new Pool({
    host: DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'vcm_xddd',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

// ------------------------------------------------------------------- helpers
const TEST_PASSWORD = 'test1234';
const EDITOR = { id: 'u_verify_edit', email: 'verify-edit@vcm.local', plans_bd: 'EDIT' };
const VIEWER = { id: 'u_verify_view', email: 'verify-view@vcm.local', plans_bd: 'VIEW' };

let pass = 0, fail = 0, skipped = 0, currentGroup = '';

function group(id, label) {
    currentGroup = id;
    if (ONLY && !id.startsWith(ONLY)) return false;
    console.log(`\n[${id}] ${label}`);
    return true;
}

function check(name, ok, detail = '') {
    if (ONLY && !currentGroup.startsWith(ONLY)) { skipped++; return; }
    if (ok) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

async function api(method, urlPath, { token, body } = {}) {
    const res = await fetch(BASE + urlPath, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let json = null;
    try { json = await res.json(); } catch { /* không phải JSON */ }
    return { status: res.status, body: json };
}

async function login(email) {
    const r = await api('POST', '/auth/login', { body: { email, password: TEST_PASSWORD } });
    if (!r.body?.token) throw new Error(`Login thất bại cho ${email}: ${JSON.stringify(r.body)}`);
    return r.body.token;
}

function hashPassword(pwd) {
    return crypto.createHash('sha256').update(String(pwd)).digest('hex');
}

async function seedTestUsers() {
    const hash = hashPassword(TEST_PASSWORD);
    for (const u of [EDITOR, VIEWER]) {
        await pool.query(
            `INSERT INTO users (id, email, password, name, role, plans_bd)
             VALUES ($1, $2, $3, $4, 'EDIT', $5)
             ON CONFLICT (email) DO UPDATE
               SET password = EXCLUDED.password, role = EXCLUDED.role, plans_bd = EXCLUDED.plans_bd`,
            [u.id, u.email, hash, 'Verify script user', u.plans_bd]
        );
    }
}

async function cleanup() {
    await pool.query("DELETE FROM weekly_plans  WHERE department IN ('BD','PM') AND week_start  >= '2030-01-01'");
    await pool.query("DELETE FROM monthly_plans WHERE department IN ('BD','PM') AND month_start >= '2030-01-01'");
    await pool.query('DELETE FROM users WHERE email = ANY($1)', [[EDITOR.email, VIEWER.email]]);
}

// ---------------------------------------------------------------------- main
async function run() {
    await seedTestUsers();
    await cleanup().catch(() => { });
    await seedTestUsers();

    const editor = await login(EDITOR.email);
    const viewer = await login(VIEWER.email);

    const W1 = '2030-01-07', W1E = '2030-01-13';
    const W2 = '2030-01-14', W2E = '2030-01-20';
    let r, db, planId;

    // ---------------------------------------------------------- 1.2 phân quyền
    group('1.2', 'Phân quyền theo phòng ban');
    r = await api('POST', '/weekly-plans', { token: editor, body: { weekStart: W1, weekEnd: W1E, department: 'PM' } });
    check('editor (plans_pm=NO_ACCESS) tạo plan PM -> 403', r.status === 403, `got ${r.status} ${JSON.stringify(r.body)}`);

    r = await api('POST', '/weekly-plans', { token: editor, body: { weekStart: W1, weekEnd: W1E, department: 'BD' } });
    check('editor (plans_bd=EDIT) tạo plan BD -> 200', r.status === 200 && r.body.success, `got ${r.status} ${JSON.stringify(r.body)}`);
    planId = r.body?.data?.id;

    r = await api('GET', '/weekly-plans?department=BD', { token: viewer });
    check('viewer GET BD -> 200', r.status === 200 && r.body.success, `got ${r.status}`);

    r = await api('POST', '/weekly-plans', { token: viewer, body: { weekStart: W2, weekEnd: W2E, department: 'BD' } });
    check('viewer (plans_bd=VIEW) POST BD -> 403', r.status === 403, `got ${r.status} ${JSON.stringify(r.body)}`);

    r = await api('GET', '/weekly-plans', { token: editor });
    const depts = [...new Set((r.body?.data || []).map(p => p.department))];
    check('GET không lọc dept chỉ trả phòng ban được xem', depts.every(d => d === 'BD'), `got ${JSON.stringify(depts)}`);

    // Các nhóm sau cần planId; nếu chạy lọc nhóm khác thì tạo lại lặng lẽ.
    if (!planId) {
        r = await api('POST', '/weekly-plans', { token: editor, body: { weekStart: W1, weekEnd: W1E, department: 'BD' } });
        planId = r.body?.data?.id;
    }

    // -------------------------------------------------------- 1.6 chống trùng
    group('1.6', 'Chống trùng plan');
    r = await api('POST', '/weekly-plans', { token: editor, body: { weekStart: W1, weekEnd: W1E, department: 'BD' } });
    check('tạo lại plan trùng tuần/phòng ban -> 409', r.status === 409, `got ${r.status} ${JSON.stringify(r.body)}`);

    // ------------------------------------------------------ 2.7 validate input
    group('2.7', 'Validate input');
    r = await api('POST', `/weekly-plans/${planId}/items`, { token: editor, body: { sortOrder: 1 } });
    check('POST item thiếu title -> 400', r.status === 400, `got ${r.status} ${JSON.stringify(r.body)}`);

    r = await api('POST', `/weekly-plans/${planId}/items`, { token: editor, body: { title: 'X', status: 'BANANA' } });
    check('status không hợp lệ -> 400', r.status === 400, `got ${r.status} ${JSON.stringify(r.body)}`);

    r = await api('POST', `/weekly-plans/${planId}/items`, { token: editor, body: { title: 'X', startDate: '2030-02-10', endDate: '2030-02-01' } });
    check('startDate > endDate -> 400', r.status === 400, `got ${r.status} ${JSON.stringify(r.body)}`);

    const itemIds = [];
    for (const [i, title] of ['Item A', 'Item B', 'Item C'].entries()) {
        r = await api('POST', `/weekly-plans/${planId}/items`, {
            token: editor,
            body: { sortOrder: i + 1, title, status: 'TODO', assigneeId: '', monthlyItemId: '' },
        });
        itemIds.push(r.body?.data?.id);
    }
    check('tạo 3 item hợp lệ', itemIds.every(Boolean), JSON.stringify(itemIds));

    await api('PUT', `/weekly-plans/items/${itemIds[0]}`, { token: editor, body: { title: 'Item A', progressPct: 500 } });
    db = await pool.query('SELECT progress_pct FROM weekly_plan_items WHERE id=$1', [itemIds[0]]);
    check('progressPct=500 bị kẹp về 100', db.rows[0].progress_pct === 100, `got ${db.rows[0].progress_pct}`);

    // ------------------------------------------------------- 3.8 quy ước NULL
    group('3.8', 'Quy ước NULL cho khoá ngoại mềm');
    db = await pool.query('SELECT assignee_id, monthly_item_id FROM weekly_plan_items WHERE id=$1', [itemIds[0]]);
    check('assigneeId rỗng lưu NULL (không phải chuỗi rỗng)',
        db.rows[0].assignee_id === null && db.rows[0].monthly_item_id === null,
        JSON.stringify(db.rows[0]));

    // ------------------------------------------------------- 1.1 batch-status
    group('1.1', 'batch-status (trước đây chạy 0 dòng nhưng báo success)');
    await api('PUT', '/weekly-plans/items/batch-status', { token: editor, body: { ids: [itemIds[0], itemIds[1]], status: 'DONE' } });
    db = await pool.query('SELECT id,status FROM weekly_plan_items WHERE id = ANY($1) ORDER BY sort_order', [itemIds]);
    const statuses = db.rows.map(x => x.status);
    check('batch-status thực sự cập nhật DB',
        statuses[0] === 'DONE' && statuses[1] === 'DONE' && statuses[2] === 'TODO',
        JSON.stringify(statuses));

    r = await api('PUT', '/weekly-plans/items/batch-status', { token: editor, body: { ids: itemIds, status: 'NOPE' } });
    check('batch-status với status sai -> 400', r.status === 400, `got ${r.status}`);

    // ----------------------------------------------------------- 2.6 daily log
    group('2.6', 'Daily logs: upsert và đồng bộ tiến độ');
    r = await api('POST', '/daily-logs', { token: editor, body: { itemId: itemIds[2], logDate: '2030-01-10', progressPct: 40 } });
    check('ghi log ngày 10/01 -> 200', r.status === 200 && r.body.success, `got ${r.status} ${JSON.stringify(r.body)}`);

    await api('POST', '/daily-logs', { token: editor, body: { itemId: itemIds[2], logDate: '2030-01-10', progressPct: 60 } });
    db = await pool.query('SELECT count(*) FROM daily_logs WHERE item_id=$1 AND log_date=$2', [itemIds[2], '2030-01-10']);
    check('ghi 2 lần cùng ngày -> chỉ 1 dòng (upsert)', db.rows[0].count === '1', `got ${db.rows[0].count}`);

    await api('POST', '/daily-logs', { token: editor, body: { itemId: itemIds[2], logDate: '2030-01-12', progressPct: 90 } });
    await api('POST', '/daily-logs', { token: editor, body: { itemId: itemIds[2], logDate: '2030-01-10', progressPct: 10 } });
    db = await pool.query('SELECT progress_pct FROM weekly_plan_items WHERE id=$1', [itemIds[2]]);
    check('sửa log quá khứ KHÔNG kéo tụt tiến độ (giữ 90 của ngày mới nhất)',
        db.rows[0].progress_pct === 90, `got ${db.rows[0].progress_pct}`);

    r = await api('POST', '/daily-logs', { token: viewer, body: { itemId: itemIds[2], logDate: '2030-01-11', progressPct: 50 } });
    check('viewer ghi daily-log -> 403', r.status === 403, `got ${r.status}`);

    // ------------------------------------------------------------ 1.5 carry-over
    group('1.5', 'Carry-over trong transaction');
    r = await api('POST', '/weekly-plans', {
        token: editor,
        body: { weekStart: W2, weekEnd: W2E, department: 'BD', carryOverFromPlanId: planId },
    });
    check('tạo plan tuần 2 kèm carry-over -> 200', r.status === 200 && r.body.success, `got ${r.status} ${JSON.stringify(r.body)}`);
    const plan2 = r.body?.data?.id;

    db = await pool.query('SELECT title, sort_order, status, carried_from FROM weekly_plan_items WHERE plan_id=$1 ORDER BY sort_order', [plan2]);
    check('chỉ copy item chưa DONE (1 item: Item C)',
        db.rows.length === 1 && db.rows[0].title === 'Item C' && db.rows[0].status === 'TODO' && db.rows[0].carried_from === itemIds[2],
        JSON.stringify(db.rows));

    db = await pool.query('SELECT status FROM weekly_plan_items WHERE id=$1', [itemIds[2]]);
    check('item nguồn được đánh dấu CARRIED_OVER', db.rows[0].status === 'CARRIED_OVER', db.rows[0].status);

    // --------------------------------------------------------- 1.3 error handling
    group('1.3', 'Error handling');
    r = await api('GET', '/daily-logs', { token: editor });
    check('thiếu itemId -> 400 (không phải 200)', r.status === 400, `got ${r.status}`);

    r = await api('POST', '/weekly-plans/nonexistent-plan-id/items', { token: editor, body: { title: 'X' } });
    const leaks = JSON.stringify(r.body || '').match(/weekly_plan_items|constraint|violates|pg_/i);
    check('lỗi FK không lộ chi tiết PostgreSQL (chạy với NODE_ENV=production)',
        r.status >= 400 && !leaks, `status=${r.status} body=${JSON.stringify(r.body)}`);

    // ------------------------------------------------------------- 2.2 lọc theo tuần
    group('2.2', 'Lọc theo khoảng thời gian');
    r = await api('GET', '/weekly-plans?department=BD&weekFrom=2030-01-14&weekTo=2030-01-31&includeItems=true', { token: editor });
    const weeks = (r.body?.data || []).map(p => p.weekStart);
    check('weekFrom/weekTo chỉ trả tuần trong khoảng', weeks.length === 1, `got ${JSON.stringify(weeks)}`);

    r = await api('GET', '/weekly-plans?department=BD&limit=1', { token: editor });
    check('limit=1 trả đúng 1 plan', (r.body?.data || []).length === 1, `got ${(r.body?.data || []).length}`);
}

run()
    .then(async () => {
        await cleanup();
        await pool.end();
        const filter = ONLY ? ` (lọc nhóm "${ONLY}", bỏ qua ${skipped})` : '';
        console.log(`\n===== ${pass} passed, ${fail} failed${filter} =====`);
        process.exit(fail ? 1 : 0);
    })
    .catch(async (e) => {
        console.error('\nLỖI:', e.message);
        await cleanup().catch(() => { });
        await pool.end().catch(() => { });
        process.exit(1);
    });
