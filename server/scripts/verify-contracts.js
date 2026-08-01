#!/usr/bin/env node
/**
 * VCM XDDD — Verify page Contract
 *
 * Kiểm tra bằng assertion trên API thật + DB thật. Cần backend đang chạy ở :3001.
 *
 *   node scripts/verify-contracts.js --allow-writes        # chạy tất cả
 *   node scripts/verify-contracts.js 1.2 --allow-writes    # chỉ nhóm phân quyền
 *
 * Tự tạo 3 user test (EDIT / VIEW / NO_ACCESS) rồi xoá lúc kết thúc, và tự dọn
 * hợp đồng có prefix VERIFY- mà nó sinh ra.
 */
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const args = process.argv.slice(2);
const ALLOW_WRITES = args.includes('--allow-writes');
const ONLY = args.find(a => !a.startsWith('--')) || null;

const BASE = process.env.VERIFY_API_BASE || 'http://localhost:3001/api';
const DB_HOST = process.env.DB_HOST || 'localhost';

// ---------------------------------------------------------------- guard rail
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
const PWD = 'test1234';
const PREFIX = 'VERIFY-';
const USERS = [
    { id: 'u_vc_edit', email: 'vc-edit@vcm.local', contracts: 'EDIT' },
    { id: 'u_vc_view', email: 'vc-view@vcm.local', contracts: 'VIEW' },
    { id: 'u_vc_none', email: 'vc-none@vcm.local', contracts: 'NO_ACCESS' },
];

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

async function upload(token, filename, mime, content) {
    const form = new FormData();
    form.append('files', new Blob([content], { type: mime }), filename);
    const res = await fetch(`${BASE}/contracts/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    let json = null;
    try { json = await res.json(); } catch { /* ignore */ }
    return { status: res.status, body: json };
}

async function login(email) {
    const r = await api('POST', '/auth/login', { body: { email, password: PWD } });
    if (!r.body?.token) throw new Error(`Login thất bại cho ${email}: ${JSON.stringify(r.body)}`);
    return r.body.token;
}

async function seedUsers() {
    const hash = crypto.createHash('sha256').update(PWD).digest('hex');
    for (const u of USERS) {
        await pool.query(
            `INSERT INTO users (id, email, password, name, role, contracts)
             VALUES ($1, $2, $3, 'Verify contracts', 'EDIT', $4)
             ON CONFLICT (email) DO UPDATE
               SET password = EXCLUDED.password, role = EXCLUDED.role, contracts = EXCLUDED.contracts`,
            [u.id, u.email, hash, u.contracts]
        );
    }
}

async function cleanup() {
    await pool.query('DELETE FROM contracts WHERE code LIKE $1', [PREFIX + '%']);
    await pool.query('DELETE FROM users WHERE email = ANY($1)', [USERS.map(u => u.email)]);
}

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'contracts');

// ---------------------------------------------------------------------- main
async function run() {
    await cleanup().catch(() => { });
    await seedUsers();

    const editor = await login(USERS[0].email);
    const viewer = await login(USERS[1].email);
    const nobody = await login(USERS[2].email);

    let r, db, contractId;
    const CODE = PREFIX + 'A1';

    // -------------------------------------------------------- 1.2 phân quyền
    group('1.2', 'Phân quyền theo module (trước đây không có kiểm tra nào)');

    r = await api('GET', '/contracts', { token: nobody });
    check('user contracts=NO_ACCESS GET -> 403', r.status === 403, `got ${r.status}`);

    r = await api('POST', '/contracts', {
        token: nobody,
        body: { code: PREFIX + 'X', name: 'X', provinceId: '1', startDate: '2030-01-01', endDate: '2030-02-01' },
    });
    check('user contracts=NO_ACCESS POST -> 403', r.status === 403, `got ${r.status}`);

    r = await api('GET', '/contracts', { token: viewer });
    check('user contracts=VIEW GET -> 200', r.status === 200 && r.body.success, `got ${r.status}`);

    r = await api('POST', '/contracts', {
        token: viewer,
        body: { code: PREFIX + 'V', name: 'V', provinceId: '1', startDate: '2030-01-01', endDate: '2030-02-01' },
    });
    check('user contracts=VIEW POST -> 403', r.status === 403, `got ${r.status}`);

    r = await api('GET', '/invoices', { token: nobody });
    check('invoices dùng chung quyền contracts -> 403', r.status === 403, `got ${r.status}`);

    r = await api('POST', '/contracts', {
        token: editor,
        body: { code: CODE, name: 'Hợp đồng verify', provinceId: '1', businessField: 'B2B', value: 1000, startDate: '2030-01-01', endDate: '2030-02-01' },
    });
    check('user contracts=EDIT POST -> 200', r.status === 200 && r.body.success, `got ${r.status} ${JSON.stringify(r.body)}`);
    contractId = r.body?.data?.id;

    if (!contractId) {
        db = await pool.query('SELECT id FROM contracts WHERE code = $1', [CODE]);
        contractId = db.rows[0]?.id;
    }

    // ------------------------------------------------------ 2.7 validate input
    group('2.7', 'Validate input');
    r = await api('POST', '/contracts', { token: editor, body: { name: 'thiếu code' } });
    check('thiếu code -> 400', r.status === 400, `got ${r.status}`);

    r = await api('POST', '/contracts', { token: editor, body: { code: PREFIX + 'B', name: '' } });
    check('name rỗng -> 400', r.status === 400, `got ${r.status}`);

    r = await api('POST', '/contracts', {
        token: editor,
        body: { code: PREFIX + 'C', name: 'C', startDate: '2030-05-01', endDate: '2030-01-01' },
    });
    check('startDate > endDate -> 400', r.status === 400, `got ${r.status}`);

    r = await api('POST', '/contracts', {
        token: editor,
        body: { code: PREFIX + 'D', name: 'D', value: -5 },
    });
    check('value âm -> 400', r.status === 400, `got ${r.status}`);

    r = await api('POST', '/contracts', {
        token: editor,
        body: { code: PREFIX + 'E', name: 'E', status: 'BANANA' },
    });
    check('status không hợp lệ -> 400', r.status === 400, `got ${r.status}`);

    r = await api('POST', '/contracts', { token: editor, body: { code: CODE, name: 'trùng code' } });
    check('code trùng -> 409', r.status === 409, `got ${r.status}`);

    // ------------------------------------------------------------ 1.5 rowCount
    group('1.5', 'PUT/DELETE trên id không tồn tại');
    r = await api('PUT', '/contracts/khong-ton-tai', { token: editor, body: { name: 'X' } });
    check('PUT id không tồn tại -> 404 (trước đây trả success:true)', r.status === 404, `got ${r.status} ${JSON.stringify(r.body)}`);

    r = await api('DELETE', '/contracts/khong-ton-tai', { token: editor });
    check('DELETE id không tồn tại -> 404', r.status === 404, `got ${r.status}`);

    // ---------------------------------------------------------- 1.6 alias trùng
    group('1.6', 'Hai alias cùng trỏ một cột (PostgreSQL 42701)');
    r = await api('PUT', `/contracts/${contractId}`, {
        token: editor,
        body: { branchId: '2', provinceId: '3', name: 'Sau khi sửa' },
    });
    check('gửi cả branchId lẫn provinceId -> không lỗi 42701', r.status === 200 && r.body.success,
        `got ${r.status} ${JSON.stringify(r.body)}`);
    db = await pool.query('SELECT branch_id, name FROM contracts WHERE id = $1', [contractId]);
    check('chỉ provinceId được áp dụng (branchId bị bỏ qua)',
        db.rows[0].branch_id === '3' && db.rows[0].name === 'Sau khi sửa',
        JSON.stringify(db.rows[0]));

    // ------------------------------------------------------------- 3.8 status
    group('3.8', 'Chuẩn hoá enum trạng thái');
    await api('PUT', `/contracts/${contractId}`, { token: editor, body: { status: 'INPROCESS' } });
    db = await pool.query('SELECT status FROM contracts WHERE id = $1', [contractId]);
    check('INPROCESS được chuẩn hoá thành IN_PROGRESS', db.rows[0].status === 'IN_PROGRESS', db.rows[0].status);

    // -------------------------------------------------------------- 1.4 upload
    group('1.4', 'Lọc loại file upload');
    r = await upload(editor, 'evil.html', 'text/html', '<script>alert(1)</script>');
    check('upload .html -> 400', r.status === 400, `got ${r.status} ${JSON.stringify(r.body)}`);

    r = await upload(editor, 'evil.svg', 'image/svg+xml', '<svg onload="alert(1)"/>');
    check('upload .svg -> 400', r.status === 400, `got ${r.status}`);

    r = await upload(editor, 'ok.pdf', 'application/pdf', '%PDF-1.4 test');
    check('upload .pdf -> 200', r.status === 200 && r.body?.success, `got ${r.status} ${JSON.stringify(r.body)}`);
    const uploadedUrl = r.body?.data?.urls?.[0] || '';

    // ------------------------------------------------------- 1.3 error handling
    group('1.3', 'Error handling');
    r = await api('POST', '/invoices', { token: editor, body: { contractId: 'khong-ton-tai', value: 1 } });
    const leaks = JSON.stringify(r.body || '').match(/invoices|contracts|constraint|violates|pg_/i);
    check('lỗi không lộ chi tiết PostgreSQL', r.status >= 400 && !leaks,
        `status=${r.status} body=${JSON.stringify(r.body)}`);

    // ------------------------------------------------- 2.8 dọn file khi xoá
    group('2.8', 'Xoá hợp đồng thì dọn cả file và hoá đơn');
    await api('PUT', `/contracts/${contractId}`, { token: editor, body: { fileUrls: uploadedUrl } });
    r = await api('POST', '/invoices', {
        token: editor,
        body: { contractId, invoiceNumber: 'HD-VERIFY-1', value: 500, paidAmount: 200, issuedDate: '2030-01-15' },
    });
    check('tạo hoá đơn cho hợp đồng -> 200', r.status === 200 && r.body.success, `got ${r.status} ${JSON.stringify(r.body)}`);

    const diskName = path.basename(uploadedUrl);
    const diskPath = path.join(UPLOAD_DIR, diskName);
    check('file .pdf có thật trên đĩa trước khi xoá', diskName && fs.existsSync(diskPath), diskPath);

    r = await api('DELETE', `/contracts/${contractId}`, { token: editor });
    check('xoá hợp đồng -> 200', r.status === 200 && r.body.success, `got ${r.status}`);

    db = await pool.query('SELECT count(*) FROM invoices WHERE contract_id = $1', [contractId]);
    check('hoá đơn bị cascade', db.rows[0].count === '0', `còn ${db.rows[0].count}`);

    // fs.unlink chạy bất đồng bộ trong route -> chờ một nhịp
    await new Promise(r2 => setTimeout(r2, 300));
    check('file upload bị dọn khỏi đĩa (trước đây mồ côi vĩnh viễn)',
        !diskName || !fs.existsSync(diskPath), diskPath);
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
