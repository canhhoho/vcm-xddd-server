/**
 * Notification Routes — GET /notifications, POST /notifications/read
 *
 * Thông báo được TÍNH TRỰC TIẾP từ dữ liệu nghiệp vụ, không có bảng lưu riêng và
 * không có job nền nào sinh ra chúng. Đổi lại, "đã đọc" chỉ là một mốc thời gian
 * cho mỗi user (`users.notifications_read_at`).
 *
 * ── occurredAt: chỗ dễ hiểu sai nhất ────────────────────────────────────────
 * `unreadCount` đếm các mục có occurredAt > notifications_read_at. Nếu lấy chính
 * HẠN làm occurredAt thì mục "sắp đến hạn" có mốc ở TƯƠNG LAI, luôn lớn hơn
 * read_at, và badge không bao giờ về 0.
 *
 * Nên occurredAt là **thời điểm mục đó bắt đầu đáng báo** — luôn ở quá khứ với
 * mọi mục đang hiển thị:
 *   - sắp/quá hạn      -> end_date - DUE_SOON_DAYS
 *   - hoá đơn chưa thu -> issued_date + INVOICE_OVERDUE_DAYS
 *   - prospect quá hạn -> expected_date
 *   - hoạt động        -> created_at
 *
 * ── Quyền ───────────────────────────────────────────────────────────────────
 * Router này mount trần sau authMiddleware vì nó gộp nhiều nguồn với nhiều cột
 * quyền khác nhau — không middleware nào gánh hộ được. Mỗi nhánh UNION chỉ được
 * ghép vào câu lệnh khi user có quyền tương ứng (xem buildBranches).
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { normalizeAccess, isAdminRole, canRead } = require('../services/accessLevels');

/** Số ngày trước hạn thì bắt đầu báo (task, đầu việc kế hoạch, hợp đồng, dự án) */
const DUE_SOON_DAYS = 3;
/** Hoá đơn phát hành quá số ngày này mà chưa thu đủ thì báo */
const INVOICE_OVERDUE_DAYS = 30;
/** Trần số mục trả về, tránh popover dài vô tận */
const MAX_ITEMS = 30;
/**
 * Trần riêng cho nhật ký hoạt động, và cửa sổ thời gian của nó.
 *
 * Bảng `activities` ghi mọi thao tác của toàn hệ thống nên nó luôn là thứ mới
 * nhất và không có giới hạn tự nhiên nào. Không chặn riêng thì ORDER BY
 * occurred_at DESC cho ra 30/30 mục đều là ACTIVITY, còn hoá đơn chưa thu và
 * việc quá hạn — những thứ thật sự cần hành động — bị đẩy hết ra ngoài.
 * Đã xảy ra đúng như vậy lúc kiểm trên DB local.
 */
const ACTIVITY_LIMIT = 8;
const ACTIVITY_WINDOW_DAYS = 7;

// Không còn đọc cột quyền plans_*: từ khi nhánh MY_PLAN_ITEM bị bỏ, không thông
// báo nào lấy dữ liệu từ bảng kế hoạch nữa nên không có gì để lọc theo phòng ban.
//
// Tên có tiền tố NOTIFY_ để không lẫn với MODULE_COLUMNS của
// services/accessLevels.js (5 cột) — thông báo chỉ cần 3 cột này.
const NOTIFY_MODULE_COLUMNS = ['contracts', 'projects', 'business'];

/**
 * Đọc role + mọi cột quyền cần dùng bằng MỘT query.
 * Cùng cách làm với loadModulePermissions trong middleware/moduleAccess.js:
 * đọc thẳng từ bảng users mỗi request nên admin đổi quyền có hiệu lực ngay.
 */
async function loadPermissions(userId) {
  const cols = NOTIFY_MODULE_COLUMNS.join(', ');
  const { rows } = await query(`SELECT role, ${cols} FROM users WHERE id = $1`, [userId]);
  if (rows.length === 0) return null;

  const row = rows[0];
  const isAdmin = isAdminRole(row.role);
  // ADMIN bypass -> trả 'EDIT' (mức cao nhất của thang cột module) thay vì 'ADMIN':
  // 'ADMIN' không phải giá trị hợp lệ của cột module, và canRead/canWrite của
  // helper quy nó về VIEW nên sẽ vô tình HẠ quyền admin.
  const level = (col) => (isAdmin ? 'EDIT' : normalizeAccess(row[col]));

  return {
    isAdmin,
    contracts: level('contracts'),
    projects: level('projects'),
    business: level('business'),
  };
}

/**
 * Các nhánh UNION ALL. Mọi nhánh trả cùng bộ cột:
 * id, type, title, detail, occurred_at, due_date, link.
 *
 * Tham số, thứ tự cố định:
 *   $1 userId, $2 DUE_SOON_DAYS, $3 INVOICE_OVERDUE_DAYS,
 *   $4 xem được contracts, $5 projects, $6 business, $7 là ADMIN,
 *   $8 ACTIVITY_WINDOW_DAYS
 *
 * Quyền được gate bằng THAM SỐ BOOLEAN trong WHERE chứ không phải bằng cách bỏ
 * bớt nhánh lúc ghép chuỗi. Bỏ nhánh khiến một số $n không còn được tham chiếu
 * và Postgres từ chối cả câu lệnh ("bind message supplies N parameters, but
 * prepared statement requires M") — user NO_ACCESS mọi module nhận 500.
 * Với `AND $4::boolean` = false, planner cắt nhánh bằng one-time filter nên
 * không hề quét bảng; kết quả vẫn là không có dòng nào lọt ra.
 */
function buildBranches() {
  const branches = [];

  // ── Task dự án được giao cho tôi ──
  branches.push(`
    SELECT t.id, 'MY_TASK' AS type, t.name AS title,
           COALESCE(p.name, '') AS detail,
           (t.end_date - ($2 || ' days')::interval) AS occurred_at,
           t.end_date AS due_date, '#/projects' AS link
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.assignee_id = $1
      AND t.end_date IS NOT NULL
      AND UPPER(COALESCE(t.status, '')) <> 'DONE'
      AND t.end_date <= CURRENT_DATE + ($2 || ' days')::interval
  `);

  // ── ĐÃ BỎ: nhánh MY_PLAN_ITEM ("đầu việc kế hoạch tuần được giao cho tôi") ──
  // Cột "Who" của Kế hoạch giờ là TEXT TỰ DO (weekly_plan_items.assignee_name),
  // không còn khoá ngoại tới users. Nhánh cũ lọc bằng `wi.assignee_id = $1` nên
  // không thể xác định đầu việc thuộc về ai nữa. Xem migrate-plan-assignee-text.sql.
  //
  // Bỏ nhánh này cũng là chỗ duy nhất tham chiếu $4 (allowedDepartments), nên toàn
  // bộ tham số sau đó đã được ĐÁNH SỐ LẠI ($5..$9 -> $4..$8). Bắt buộc, vì tham số
  // không được tham chiếu khiến Postgres từ chối cả câu lệnh — xem chú thích trên.

  // ── Hoá đơn phát hành lâu mà chưa thu đủ + hợp đồng sắp hết hạn ──
  branches.push(`
    SELECT i.id, 'INVOICE_UNPAID' AS type,
           COALESCE(NULLIF(i.invoice_number, ''), 'HĐ ' || c.code) AS title,
           c.name AS detail,
           (i.issued_date + ($3 || ' days')::interval) AS occurred_at,
           i.issued_date AS due_date, '#/contracts' AS link
    FROM invoices i
    LEFT JOIN contracts c ON i.contract_id = c.id
    WHERE $4::boolean
      AND i.issued_date IS NOT NULL
      AND COALESCE(i.payment, 0) < COALESCE(i.value, 0)
      AND i.issued_date + ($3 || ' days')::interval <= NOW()
  `);
  branches.push(`
    SELECT c.id, 'CONTRACT_ENDING' AS type, c.name AS title,
           c.code AS detail,
           (c.end_date - ($2 || ' days')::interval) AS occurred_at,
           c.end_date AS due_date, '#/contracts' AS link
    FROM contracts c
    WHERE $4::boolean
      AND c.end_date IS NOT NULL
      AND UPPER(COALESCE(c.status, '')) <> 'DONE'
      AND c.end_date <= CURRENT_DATE + ($2 || ' days')::interval
  `);

  // ── Dự án sắp hết hạn ──
  branches.push(`
    SELECT p.id, 'PROJECT_ENDING' AS type, p.name AS title,
           COALESCE(p.code, '') AS detail,
           (p.end_date - ($2 || ' days')::interval) AS occurred_at,
           p.end_date AS due_date, '#/projects' AS link
    FROM projects p
    WHERE $5::boolean
      AND p.end_date IS NOT NULL
      AND UPPER(COALESCE(p.status, '')) <> 'DONE'
      AND p.end_date <= CURRENT_DATE + ($2 || ' days')::interval
  `);

  // ── Prospect quá ngày dự kiến mà chưa chốt ──
  branches.push(`
    SELECT pr.id, 'PROSPECT_OVERDUE' AS type, pr.name AS title,
           COALESCE(pr.client, '') AS detail,
           pr.expected_date::timestamptz AS occurred_at,
           pr.expected_date AS due_date, '#/business' AS link
    FROM prospects pr
    WHERE $6::boolean
      AND pr.expected_date IS NOT NULL
      AND UPPER(COALESCE(pr.status, '')) NOT IN ('WON', 'LOST')
      AND pr.expected_date < CURRENT_DATE
  `);

  // ── Hoạt động hệ thống ──
  // Giữ nguyên hiện trạng: /api/activities đang bọc rbac(['ADMIN']), nên thông
  // báo loại này cũng chỉ ADMIN thấy. Mở cho mọi user là quyết định riêng tư.
  // Bọc trong subquery để có ORDER BY + LIMIT riêng: bên trong UNION ALL không
  // đặt trực tiếp được, và không giới hạn thì nhánh này nuốt sạch MAX_ITEMS.
  branches.push(`
    SELECT * FROM (
      SELECT a.id, 'ACTIVITY' AS type, a.action AS title,
             COALESCE(a.email, '') || ' — ' || COALESCE(a.description, '') AS detail,
             a.created_at AS occurred_at,
             NULL::date AS due_date, '#/users?tab=activities' AS link
      FROM activities a
      WHERE $7::boolean
        AND a.created_at >= NOW() - ($8 || ' days')::interval
      ORDER BY a.created_at DESC
      LIMIT ${ACTIVITY_LIMIT}
    ) act
  `);

  return branches;
}

// GET /notifications
router.get('/', async (req, res, next) => {
  try {
    const perms = await loadPermissions(req.user.id);
    if (!perms) {
      return res.json({ success: true, data: { unreadCount: 0, items: [] } });
    }

    const branches = buildBranches();

    const { rows } = await query(
      `${branches.join(' UNION ALL ')} ORDER BY occurred_at DESC LIMIT ${MAX_ITEMS}`,
      [
        req.user.id,
        String(DUE_SOON_DAYS),
        String(INVOICE_OVERDUE_DAYS),
        canRead(perms.contracts),
        canRead(perms.projects),
        canRead(perms.business),
        perms.isAdmin,
        String(ACTIVITY_WINDOW_DAYS),
      ]
    );

    const readAtRow = await query('SELECT notifications_read_at FROM users WHERE id = $1', [req.user.id]);
    const readAt = readAtRow.rows[0]?.notifications_read_at;
    const readAtMs = readAt ? new Date(readAt).getTime() : 0;

    const today = new Date().setHours(0, 0, 0, 0);
    const items = rows.map(r => ({
      // id thô có thể trùng giữa các bảng, ghép type vào cho chắc chắn duy nhất
      id: `${r.type}:${r.id}`,
      type: r.type,
      title: r.title || '',
      detail: r.detail || '',
      occurredAt: r.occurred_at,
      dueDate: r.due_date,
      // due_date la cot DATE -> ve dang chuoi 'YYYY-MM-DD' (setTypeParser 1082 trong
      // config/database.js). new Date('2026-01-15') thuan tuy parse theo UTC midnight,
      // trong khi `today` o tren la nua dem GIO DIA PHUONG -> hai moc lech nhau dung
      // bang offset, va tren server offset AM thi moi viec den han HOM NAY bi gan
      // 'overdue'. Them 'T00:00:00' de parse theo gio dia phuong cho khop voi `today`.
      severity: r.due_date && new Date(`${r.due_date}T00:00:00`).getTime() < today ? 'overdue' : 'soon',
      link: r.link,
    }));

    // Đếm trên chính kết quả vừa lấy. Query đếm riêng sẽ chạy ở thời điểm khác
    // nên NOW()/CURRENT_DATE lệch, số đếm không khớp danh sách.
    const unreadCount = items.filter(i => new Date(i.occurredAt).getTime() > readAtMs).length;

    res.json({ success: true, data: { unreadCount, items } });
  } catch (err) {
    next(err);
  }
});

// POST /notifications/read — đánh dấu đã xem tới thời điểm hiện tại
router.post('/read', async (req, res, next) => {
  try {
    await query('UPDATE users SET notifications_read_at = NOW() WHERE id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
