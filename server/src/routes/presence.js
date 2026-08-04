/**
 * Presence Routes — GET /presence, POST /presence/heartbeat
 *
 * Trạng thái online dựa trên heartbeat: frontend ping định kỳ, backend ghi
 * `users.last_seen_at`, online = ping gần đây hơn ONLINE_THRESHOLD.
 *
 * KHÔNG cache. Trạng thái online mà đi qua CacheService thì đứng hình đúng bằng
 * TTL — đó cũng là lý do không nhét cột này vào GET /users (endpoint đó cache 15
 * phút, và hook useUsers ở frontend còn để staleTime 15 phút nữa).
 *
 * Router này mount THẲNG sau authMiddleware, không kèm rbac: badge trên header
 * hiển thị cho mọi user đã đăng nhập, khác /api/users vốn chỉ ADMIN.
 */
const router = require('express').Router();
const { query } = require('../config/database');

/**
 * Ngưỡng coi là đang online — một nguồn sự thật duy nhất, chỉ server tính,
 * frontend không tự suy ra.
 *
 * 3 phút chứ không phải 2, dù nhịp ping là 60s: trình duyệt throttle
 * setInterval ở tab nền xuống tối đa 1 lần/phút, nên ngưỡng 2 phút sẽ khiến
 * user đang mở app nhảy sang offline chỉ vì lỡ một nhịp. 3 phút chịu được 2 nhịp lỡ.
 */
const ONLINE_THRESHOLD = '3 minutes';

// POST /presence/heartbeat — đánh dấu user hiện tại còn đang mở app
router.post('/heartbeat', async (req, res, next) => {
  try {
    await query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /presence — toàn bộ user kèm trạng thái, online xếp lên đầu
router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT u.id, u.email, u.name, u.last_seen_at,
        CASE
          WHEN p.name IS NOT NULL AND p.name != '' AND p.name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-' THEN p.name
          WHEN u.position_name IS NOT NULL AND u.position_name != '' AND u.position_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-' THEN u.position_name
          ELSE COALESCE(p.name, '')
        END as position_name,
        (u.last_seen_at IS NOT NULL AND u.last_seen_at > NOW() - $1::interval) as online
      FROM users u
      LEFT JOIN positions p ON u.position_id = p.id
      ORDER BY online DESC, u.last_seen_at DESC NULLS LAST, u.name
    `, [ONLINE_THRESHOLD]);

    const data = result.rows.map(r => ({
      id: r.id,
      email: r.email,
      name: r.name || r.email,
      positionName: r.position_name || '',
      lastSeenAt: r.last_seen_at,
      online: r.online === true,
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
