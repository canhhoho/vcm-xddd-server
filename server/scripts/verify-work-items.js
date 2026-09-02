#!/usr/bin/env node
/**
 * VCM XDDD — Verify tiến độ hạng mục công việc
 *
 * Kiểm tra bằng assertion trên API thật + DB thật (không phải unit test).
 * Cần backend đang chạy ở http://localhost:3001.
 *
 *   node scripts/verify-work-items.js --allow-writes      # chạy tất cả
 *   node scripts/verify-work-items.js 1.1 --allow-writes  # chỉ nhóm phân quyền
 *
 * Script tự tạo 3 user test + 1 dự án test rồi xoá lúc kết thúc.
 * Trọng tâm là PHÂN QUYỀN THEO DỰ ÁN — cơ chế mới, chưa từng có ở codebase này.
 */
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const args = process.argv.slice(2);
const ALLOW_WRITES = args.includes('--allow-writes');
const ONLY = args.find(a => !a.startsWith('--')) || null;

const BASE = process.env.VERIFY_API_BASE || 'http://localhost:3001/api';

// ---------------------------------------------------------------- guard rail
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
const PROJECT_ID = 'p_verify_wi';

// projects=EDIT: toàn quyền mọi dự án
const MANAGER = { id: 'u_wi_manager', email: 'wi-manager@vcm.local', projects: 'EDIT' };
// projects=VIEW + là member của dự án: được ghi tiến độ, KHÔNG được import
const ENGINEER = { id: 'u_wi_engineer', email: 'wi-engineer@vcm.local', projects: 'VIEW' };
// projects=VIEW nhưng KHÔNG phải member: không được ghi gì
const OUTSIDER = { id: 'u_wi_outsider', email: 'wi-outsider@vcm.local', projects: 'VIEW' };
// projects=NO_ACCESS: moduleAccess chặn từ vòng ngoài
const NOACCESS = { id: 'u_wi_noaccess', email: 'wi-noaccess@vcm.local', projects: 'NO_ACCESS' };
const ALL_USERS = [MANAGER, ENGINEER, OUTSIDER, NOACCESS];

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
    let parsed = null;
    try { parsed = await res.json(); } catch { /* body rỗng */ }
    return { status: res.status, body: parsed };
}

async function login(email) {
    const r = await api('POST', '/auth/login', { body: { email, password: TEST_PASSWORD } });
    if (!r.body?.token) throw new Error(`Login thất bại cho ${email}: ${JSON.stringify(r.body)}`);
    return r.body.token;
}

async function seedTestUsers() {
    const hash = crypto.createHash('sha256').update(TEST_PASSWORD).digest('hex');
    for (const u of ALL_USERS) {
        await pool.query(
            `INSERT INTO users (id, email, password, name, role, projects)
             VALUES ($1, $2, $3, 'Verify WI user', 'EDIT', $4)
             ON CONFLICT (email) DO UPDATE
               SET password = EXCLUDED.password, role = EXCLUDED.role, projects = EXCLUDED.projects`,
            [u.id, u.email, hash, u.projects]
        );
    }
}

/** Dự án test với ENGINEER là thành viên, OUTSIDER thì không */
async function seedProject() {
    const members = [{ id: uuidv4(), userId: ENGINEER.id, role: 'MEMBER', addedAt: new Date().toISOString() }];
    await pool.query(
        `INSERT INTO projects (id, code, name, status, members)
         VALUES ($1, 'VERIFY-WI', 'Verify work items', 'TODO', $2)
         ON CONFLICT (id) DO UPDATE SET members = EXCLUDED.members`,
        [PROJECT_ID, JSON.stringify(members)]
    );
}

async function cleanup() {
    // project_work_items cascade từ projects, logs cascade từ items
    await pool.query('DELETE FROM projects WHERE id = $1', [PROJECT_ID]);
    await pool.query('DELETE FROM users WHERE email = ANY($1)', [ALL_USERS.map(u => u.email)]);
}

const sampleSheets = () => ([
    {
        sheetName: 'PCCC',
        items: [
            { level: 0, code: 'E', nameVi: 'HỆ THỐNG PCCC', nameEn: 'FIRE PROTECTION', unitVi: '', unitEn: '', plannedQty: 0, note: '' },
            { level: 1, code: 'E.2', nameVi: 'TẦNG 6', nameEn: 'FLOOR 6', unitVi: '', unitEn: '', plannedQty: 0, note: '' },
            { level: 2, code: '', nameVi: 'Ống thép mạ kẽm D114x4,5mm', nameEn: 'Galvanized Steel Pipe D114', unitVi: 'Mét', unitEn: 'Metre', plannedQty: 24, note: '', targetDate: '2030-01-20' },
            { level: 2, code: '', nameVi: 'Co hàn mạ kẽm D114', nameEn: 'Galvanized Welded Elbow D114', unitVi: 'Cái', unitEn: 'pcs', plannedQty: 2, note: '' },
        ],
    },
    {
        sheetName: 'Điện',
        items: [
            { level: 2, code: '', nameVi: 'Dây cáp điện', nameEn: 'Power cable', unitVi: 'Mét', unitEn: 'Metre', plannedQty: 100, note: '' },
        ],
    },
]);

// ---------------------------------------------------------------------- main
async function run() {
    await cleanup().catch(() => { });
    await seedTestUsers();
    await seedProject();

    const manager = await login(MANAGER.email);
    const engineer = await login(ENGINEER.email);
    const outsider = await login(OUTSIDER.email);
    const noaccess = await login(NOACCESS.email);

    let r, db;

    // ------------------------------------------------------- 1.1 phân quyền import
    group('1.1', 'Phân quyền import danh mục');

    r = await api('POST', '/project-work-items/import', {
        token: noaccess, body: { projectId: PROJECT_ID, sheets: sampleSheets() },
    });
    check('projects=NO_ACCESS import -> 403', r.status === 403, `got ${r.status} ${JSON.stringify(r.body)}`);

    r = await api('POST', '/project-work-items/import', {
        token: engineer, body: { projectId: PROJECT_ID, sheets: sampleSheets() },
    });
    check('kỹ sư là member nhưng projects=VIEW import -> 403 (chỉ EDIT được sửa danh mục)',
        r.status === 403, `got ${r.status} ${JSON.stringify(r.body)}`);

    r = await api('POST', '/project-work-items/import', {
        token: manager, body: { projectId: PROJECT_ID, sheets: sampleSheets() },
    });
    check('projects=EDIT import -> 200', r.status === 200 && r.body.success, `got ${r.status} ${JSON.stringify(r.body)}`);
    check('trả đúng số hạng mục và số sheet',
        r.body?.data?.count === 5 && r.body?.data?.sheets === 2, JSON.stringify(r.body?.data));

    db = await pool.query(
        'SELECT sheet_name, sheet_order, sort_order, level, name_vi, planned_qty FROM project_work_items WHERE project_id=$1 ORDER BY sheet_order, sort_order',
        [PROJECT_ID]
    );
    check('DB có đúng 5 dòng, giữ thứ tự sheet và thứ tự dòng',
        db.rows.length === 5 && db.rows[0].sheet_name === 'PCCC' && db.rows[0].level === 0
        && db.rows[4].sheet_name === 'Điện',
        JSON.stringify(db.rows.map(x => [x.sheet_name, x.level, x.name_vi])));
    check('dòng nhóm không nhận khối lượng kế hoạch',
        Number(db.rows[0].planned_qty) === 0 && Number(db.rows[1].planned_qty) === 0,
        JSON.stringify(db.rows.slice(0, 2).map(x => x.planned_qty)));

    const pipeItem = db.rows.find(x => x.name_vi.startsWith('Ống thép'));
    const groupItem = db.rows.find(x => x.level === 0);
    const itemsFull = await pool.query('SELECT id, name_vi, level FROM project_work_items WHERE project_id=$1', [PROJECT_ID]);
    const pipeId = itemsFull.rows.find(x => x.name_vi.startsWith('Ống thép')).id;
    const groupId = itemsFull.rows.find(x => x.level === 0).id;
    void pipeItem; void groupItem;

    // -------------------------------------------------- 1.2 phân quyền ghi tiến độ
    group('1.2', 'Phân quyền ghi tiến độ theo dự án');

    r = await api('PUT', `/project-work-items/${pipeId}/progress`, {
        token: engineer, body: { logDate: '2030-01-10', completedQty: 10 },
    });
    check('kỹ sư projects=VIEW + LÀ member ghi tiến độ -> 200',
        r.status === 200 && r.body.success, `got ${r.status} ${JSON.stringify(r.body)}`);

    r = await api('PUT', `/project-work-items/${pipeId}/progress`, {
        token: outsider, body: { logDate: '2030-01-10', completedQty: 99 },
    });
    check('projects=VIEW + KHÔNG phải member -> 403', r.status === 403, `got ${r.status} ${JSON.stringify(r.body)}`);

    r = await api('PUT', `/project-work-items/${pipeId}/progress`, {
        token: noaccess, body: { logDate: '2030-01-10', completedQty: 99 },
    });
    check('projects=NO_ACCESS ghi tiến độ -> 403', r.status === 403, `got ${r.status}`);

    db = await pool.query('SELECT completed_qty FROM project_work_items WHERE id=$1', [pipeId]);
    check('người ngoài dự án KHÔNG ghi được gì vào DB (vẫn là 10)',
        Number(db.rows[0].completed_qty) === 10, `got ${db.rows[0].completed_qty}`);

    r = await api('PUT', `/project-work-items/${groupId}/progress`, {
        token: manager, body: { logDate: '2030-01-10', completedQty: 5 },
    });
    check('không cho ghi khối lượng vào dòng nhóm -> 400', r.status === 400, `got ${r.status} ${JSON.stringify(r.body)}`);

    // ------------------------------------------------ 1.3 luỹ kế, không cộng dồn
    group('1.3', 'Khối lượng luỹ kế theo ngày');

    await api('PUT', `/project-work-items/${pipeId}/progress`, {
        token: engineer, body: { logDate: '2030-01-12', completedQty: 16 },
    });
    db = await pool.query('SELECT completed_qty FROM project_work_items WHERE id=$1', [pipeId]);
    check('ghi ngày 12 giá trị 16 -> hiện tại là 16 (KHÔNG cộng thành 26)',
        Number(db.rows[0].completed_qty) === 16, `got ${db.rows[0].completed_qty}`);

    // Sửa log quá khứ: đây đúng là lỗi đã gặp ở daily-logs page Plan
    await api('PUT', `/project-work-items/${pipeId}/progress`, {
        token: engineer, body: { logDate: '2030-01-10', completedQty: 12 },
    });
    db = await pool.query('SELECT completed_qty FROM project_work_items WHERE id=$1', [pipeId]);
    check('sửa log ngày 10 KHÔNG kéo tụt giá trị hiện tại (vẫn 16 của ngày 12)',
        Number(db.rows[0].completed_qty) === 16, `got ${db.rows[0].completed_qty}`);

    db = await pool.query('SELECT count(*)::int c FROM project_work_item_logs WHERE item_id=$1', [pipeId]);
    check('ghi 2 lần cùng ngày chỉ tạo 1 dòng log (upsert theo item+ngày)',
        db.rows[0].c === 2, `got ${db.rows[0].c} dòng cho 2 ngày khác nhau`);

    r = await api('GET', `/project-work-items?projectId=${PROJECT_ID}`, { token: engineer });
    const pipe = (r.body?.data || []).find(x => x.id === pipeId);
    check('progressPct tính đúng 16/24 = 66.7%', pipe && pipe.progressPct === 66.7, JSON.stringify(pipe));
    check('status suy ra IN_PROGRESS', pipe && pipe.status === 'IN_PROGRESS', pipe && pipe.status);

    // --------------------------------------------------------- 1.4 xoá log
    group('1.4', 'Xoá lần ghi và tính lại');

    r = await api('GET', `/project-work-items/${pipeId}/logs`, { token: engineer });
    const logs = r.body?.data || [];
    check('lịch sử trả về 2 lần ghi', logs.length === 2, JSON.stringify(logs.map(l => l.logDate)));
    const latestLog = logs.find(l => String(l.logDate).startsWith('2030-01-12'));

    r = await api('DELETE', `/project-work-items/${pipeId}/logs/${latestLog.id}`, { token: outsider });
    check('người ngoài dự án xoá log -> 403', r.status === 403, `got ${r.status}`);

    r = await api('DELETE', `/project-work-items/${pipeId}/logs/${latestLog.id}`, { token: manager });
    check('projects=EDIT xoá log -> 200', r.status === 200, `got ${r.status} ${JSON.stringify(r.body)}`);

    db = await pool.query('SELECT completed_qty FROM project_work_items WHERE id=$1', [pipeId]);
    check('xoá log mới nhất -> lùi về giá trị log còn lại (12 của ngày 10)',
        Number(db.rows[0].completed_qty) === 12, `got ${db.rows[0].completed_qty}`);

    // ------------------------------------------------------- 1.7 hai cột ngày
    group('1.7', 'Ngày hoàn thành mục tiêu / thực tế');

    db = await pool.query('SELECT target_date::text, actual_date::text FROM project_work_items WHERE id=$1', [pipeId]);
    check('import đọc được targetDate', db.rows[0].target_date === '2030-01-20', JSON.stringify(db.rows[0]));

    db = await pool.query('SELECT target_date FROM project_work_items WHERE id=$1', [groupId]);
    check('dòng nhóm không nhận ngày mục tiêu', db.rows[0].target_date === null, JSON.stringify(db.rows[0]));

    // pipeId hiện có log ngày 10 = 12 (chưa đủ 24) -> chưa có ngày thực tế
    db = await pool.query('SELECT actual_date FROM project_work_items WHERE id=$1', [pipeId]);
    check('chưa đạt 100% thì chưa có ngày thực tế', db.rows[0].actual_date === null, JSON.stringify(db.rows[0]));

    // Ghi đủ 24 vào ngày 15 -> tự điền ngày thực tế
    await api('PUT', `/project-work-items/${pipeId}/progress`, {
        token: engineer, body: { logDate: '2030-01-15', completedQty: 24 },
    });
    db = await pool.query('SELECT actual_date::text FROM project_work_items WHERE id=$1', [pipeId]);
    check('đạt 100% -> tự điền ngày thực tế = 2030-01-15',
        db.rows[0].actual_date === '2030-01-15', JSON.stringify(db.rows[0]));

    // Ghi bù một ngày SỚM HƠN cũng đã đủ 24 -> phải lùi về ngày sớm nhất đạt đủ.
    // Nhưng actual_date đã có nên KHÔNG ghi đè (chỉ điền khi đang trống).
    await api('PUT', `/project-work-items/${pipeId}/progress`, {
        token: engineer, body: { logDate: '2030-01-13', completedQty: 24 },
    });
    db = await pool.query('SELECT actual_date::text FROM project_work_items WHERE id=$1', [pipeId]);
    check('đã có ngày thực tế thì lần ghi sau không ghi đè',
        db.rows[0].actual_date === '2030-01-15', JSON.stringify(db.rows[0]));

    // Sửa tụt xuống dưới 100% -> KHÔNG tự xoá ngày thực tế (tránh huỷ dữ liệu nhập tay)
    await api('PUT', `/project-work-items/${pipeId}/progress`, {
        token: engineer, body: { logDate: '2030-01-20', completedQty: 5 },
    });
    db = await pool.query('SELECT completed_qty, actual_date::text FROM project_work_items WHERE id=$1', [pipeId]);
    check('tụt dưới 100% thì ngày thực tế KHÔNG bị tự xoá',
        Number(db.rows[0].completed_qty) === 5 && db.rows[0].actual_date === '2030-01-15',
        JSON.stringify(db.rows[0]));

    // Phân quyền sửa ngày
    r = await api('PUT', `/project-work-items/${pipeId}/dates`, {
        token: engineer, body: { actualDate: '2030-01-18' },
    });
    check('kỹ sư (member) sửa ngày THỰC TẾ -> 200', r.status === 200 && r.body.success, `got ${r.status} ${JSON.stringify(r.body)}`);

    r = await api('PUT', `/project-work-items/${pipeId}/dates`, {
        token: engineer, body: { targetDate: '2030-02-01' },
    });
    check('kỹ sư (member) sửa ngày MỤC TIÊU -> 403', r.status === 403, `got ${r.status} ${JSON.stringify(r.body)}`);

    db = await pool.query('SELECT target_date::text FROM project_work_items WHERE id=$1', [pipeId]);
    check('ngày mục tiêu không đổi sau lần bị chặn', db.rows[0].target_date === '2030-01-20', JSON.stringify(db.rows[0]));

    r = await api('PUT', `/project-work-items/${pipeId}/dates`, {
        token: outsider, body: { actualDate: '2030-01-19' },
    });
    check('người ngoài dự án sửa ngày -> 403', r.status === 403, `got ${r.status}`);

    r = await api('PUT', `/project-work-items/${pipeId}/dates`, {
        token: manager, body: { targetDate: '2030-02-05' },
    });
    check('quản lý (projects=EDIT) sửa ngày mục tiêu -> 200', r.status === 200, `got ${r.status} ${JSON.stringify(r.body)}`);

    r = await api('PUT', `/project-work-items/${pipeId}/dates`, {
        token: manager, body: { targetDate: null },
    });
    db = await pool.query('SELECT target_date FROM project_work_items WHERE id=$1', [pipeId]);
    check('truyền null để xoá ngày', r.status === 200 && db.rows[0].target_date === null, JSON.stringify(db.rows[0]));

    r = await api('PUT', `/project-work-items/${groupId}/dates`, {
        token: manager, body: { targetDate: '2030-02-01' },
    });
    check('không cho đặt ngày cho dòng nhóm -> 400', r.status === 400, `got ${r.status}`);

    r = await api('PUT', `/project-work-items/${pipeId}/dates`, {
        token: manager, body: { targetDate: 'khong-phai-ngay' },
    });
    check('ngày sai định dạng -> 400', r.status === 400, `got ${r.status}`);

    // ------------------------------------------------- 1.5 import thay thế
    group('1.5', 'Import lần hai thay thế toàn bộ');

    r = await api('POST', '/project-work-items/import', {
        token: manager,
        body: {
            projectId: PROJECT_ID,
            sheets: [{ sheetName: 'Nước', items: [
                { level: 2, code: '', nameVi: 'Ống nhựa PVC', nameEn: 'PVC pipe', unitVi: 'Mét', unitEn: 'Metre', plannedQty: 50, note: '' },
            ] }],
        },
    });
    check('import lần hai -> 200', r.status === 200 && r.body.success, `got ${r.status} ${JSON.stringify(r.body)}`);

    db = await pool.query('SELECT count(*)::int c FROM project_work_items WHERE project_id=$1', [PROJECT_ID]);
    check('danh mục cũ bị xoá sạch, chỉ còn 1 dòng mới', db.rows[0].c === 1, `got ${db.rows[0].c}`);

    db = await pool.query(
        `SELECT count(*)::int c FROM project_work_item_logs l
         WHERE NOT EXISTS (SELECT 1 FROM project_work_items i WHERE i.id = l.item_id)`
    );
    check('không còn log mồ côi (cascade hoạt động)', db.rows[0].c === 0, `got ${db.rows[0].c}`);

    // -------------------------------------------------------- 1.6 validate + route
    group('1.6', 'Validate input và thứ tự route');

    r = await api('POST', '/project-work-items/import', {
        token: manager, body: { projectId: PROJECT_ID, sheets: [] },
    });
    check('import sheets rỗng -> 400', r.status === 400, `got ${r.status}`);

    r = await api('GET', '/project-work-items', { token: manager });
    check('GET thiếu projectId -> 400', r.status === 400, `got ${r.status}`);

    r = await api('PUT', `/project-work-items/khong-ton-tai/progress`, {
        token: manager, body: { logDate: '2030-01-10', completedQty: 1 },
    });
    check('ghi vào hạng mục không tồn tại -> 400', r.status === 400, `got ${r.status}`);

    // '/import' không được rơi vào handler '/:id/...' — lỗi kiểu batch-status
    const leaks = JSON.stringify(r.body || '').match(/project_work_item|constraint|violates|pg_/i);
    check('lỗi không lộ chi tiết PostgreSQL (NODE_ENV=production)', !leaks, JSON.stringify(r.body));

    r = await api('PUT', `/project-work-items/${(await pool.query('SELECT id FROM project_work_items WHERE project_id=$1', [PROJECT_ID])).rows[0].id}/progress`, {
        token: manager, body: { logDate: 'khong-phai-ngay', completedQty: 1 },
    });
    check('logDate sai định dạng -> 400', r.status === 400, `got ${r.status}`);
}

run()
    .then(async () => {
        await cleanup();
        await pool.end();
        const filter = ONLY ? ` (lọc nhóm "${ONLY}", bỏ qua ${skipped})` : '';
        console.log(`\n===== ${pass} passed, ${fail} failed${filter} =====`);
        process.exit(fail > 0 ? 1 : 0);
    })
    .catch(async err => {
        console.error('\n❌ Lỗi khi chạy:', err.message);
        await cleanup().catch(() => { });
        await pool.end();
        process.exit(1);
    });
