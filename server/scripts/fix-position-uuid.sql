-- Fix: cột Position hiển thị UUID thô thay vì tên chức danh
-- Chạy trên DB production: psql -U postgres -d vcm_xddd -f fix-position-uuid.sql

-- 1. Yu Thandar Oo: trỏ về chức danh "Quản lý" (pos_005)
UPDATE users
SET position_id = 'pos_005', position_code = 'QL', position_name = 'Quản lý'
WHERE name = 'Yu Thandar Oo'
  AND position_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-';

-- 2. Dọn các user khác có position_name bị dính UUID (nếu có):
--    xoá tên rác để UI hiển thị '-' thay vì UUID; giữ nguyên position_id để trace
UPDATE users
SET position_name = ''
WHERE position_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-';

-- Kiểm tra kết quả
SELECT u.id, u.name, u.position_id, u.position_name, p.name AS resolved_position
FROM users u
LEFT JOIN positions p ON u.position_id = p.id
ORDER BY u.created_at DESC;
