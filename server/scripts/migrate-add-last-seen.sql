-- Migration: thêm users.last_seen_at cho tính năng "user đang online".
-- Chạy TRƯỚC khi restart app: GET /api/presence sẽ lỗi 500 nếu cột chưa tồn tại.
--
-- NULL = user chưa bao giờ đăng nhập. Ngưỡng coi là online nằm ở
-- server/src/routes/presence.js, không đặt trong schema.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);
