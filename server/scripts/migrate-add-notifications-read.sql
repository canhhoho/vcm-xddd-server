-- Migration: thêm users.notifications_read_at cho nút chuông thông báo.
-- Chạy TRƯỚC khi restart app: GET /api/notifications lỗi 500 nếu cột chưa tồn tại.
--
-- NULL = user chưa mở chuông lần nào -> mọi thông báo đều tính là chưa đọc.
-- Không cần index: bảng users vài chục dòng và cột này chỉ đọc theo id.

ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_read_at TIMESTAMPTZ;
