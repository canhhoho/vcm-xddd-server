-- ============================================================
-- VCM XDDD — Thêm cột "Chủ đầu tư" cho hợp đồng
--
-- Chạy TRƯỚC khi restart app: sau khi deploy, POST /contracts ghi thẳng cột
-- `investor`; restart trước khi migrate thì mọi lần tạo hợp đồng nổ
-- `column "investor" of relation "contracts" does not exist` → 500.
--
-- Ý nghĩa: tên chủ đầu tư của hợp đồng, text tự do, KHÔNG bắt buộc.
-- Không phải khoá ngoại sang bảng nào — nên để '' khi trống, không để NULL
-- (quy ước ở .claude/rules/database.md: cột text mô tả dùng '').
--
-- An toàn khi chạy lại nhiều lần (ADD COLUMN IF NOT EXISTS + UPDATE có điều kiện).
-- ============================================================

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS investor TEXT DEFAULT '';

-- Dòng cũ có investor NULL (cột thêm sau, DEFAULT chỉ áp cho INSERT mới)
UPDATE contracts SET investor = '' WHERE investor IS NULL;

-- Kiểm tra sau khi chạy (phải trả về 0 dòng NULL):
--   SELECT COUNT(*) FROM contracts WHERE investor IS NULL;
