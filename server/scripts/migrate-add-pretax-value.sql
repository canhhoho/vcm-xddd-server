-- ============================================================
-- VCM XDDD — Tách giá trị TRƯỚC THUẾ ra cột riêng
--
-- Chạy TRƯỚC khi restart app: sau khi deploy, dashboard.js và targets.js đọc
-- `value_before_tax`; restart trước khi migrate thì mọi query thống kê nổ
-- `column "value_before_tax" does not exist` và Dashboard trắng hoàn toàn.
--
-- Ý nghĩa các cột sau migration:
--   value            số ĐÃ GỒM THUẾ — đúng con số in trên chứng từ. Không đổi.
--   value_before_tax số TRƯỚC THUẾ — nguồn DUY NHẤT của Doanh thu (invoices)
--                    và Nguồn việc (contracts).
--   tax_rate         thuế suất tính bằng PHẦN TRĂM (5.00 = 5%), KHÔNG phải phân số.
--
-- Quan hệ:  value = ROUND(value_before_tax * (1 + tax_rate/100), 2)
-- Chiều dẫn xuất là before_tax -> value; xem server/src/routes/_taxAmounts.js.
--
-- An toàn khi chạy lại nhiều lần (ADD COLUMN IF NOT EXISTS + UPDATE có điều kiện).
-- ============================================================

ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS value_before_tax NUMERIC(18,2) DEFAULT 0;
ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS tax_rate         NUMERIC(5,2)  DEFAULT 5.00;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS value_before_tax NUMERIC(18,2) DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS tax_rate         NUMERIC(5,2)  DEFAULT 5.00;

-- Backfill dữ liệu cũ: trước đây chỉ lưu số đã gồm thuế, suy ngược ra trước thuế
-- theo thuế suất mặc định 5%.
--
-- Đây là lần DUY NHẤT phép chia 1.05 xuất hiện trong toàn hệ thống — code chạy
-- không còn chỗ nào chia, mọi báo cáo đọc thẳng cột value_before_tax.
--
-- Chỉ chạm dòng chưa có giá trị để chạy lại migration không ghi đè số đã nhập tay
-- (sau lần chạy đầu, hoá đơn nhập qua UI có value_before_tax > 0).
UPDATE invoices
   SET value_before_tax = ROUND(value / 1.05, 2)
 WHERE COALESCE(value_before_tax, 0) = 0
   AND COALESCE(value, 0) <> 0;

UPDATE contracts
   SET value_before_tax = ROUND(value / 1.05, 2)
 WHERE COALESCE(value_before_tax, 0) = 0
   AND COALESCE(value, 0) <> 0;

-- Dòng cũ có tax_rate NULL (cột thêm sau, DEFAULT chỉ áp cho INSERT mới)
UPDATE invoices  SET tax_rate = 5.00 WHERE tax_rate IS NULL;
UPDATE contracts SET tax_rate = 5.00 WHERE tax_rate IS NULL;

-- Kiểm tra sau khi chạy (tổng phải bằng tổng cũ chia 1.05):
--   SELECT SUM(value) AS sau_thue, SUM(value_before_tax) AS truoc_thue FROM invoices;
--   SELECT SUM(value) AS sau_thue, SUM(value_before_tax) AS truoc_thue FROM contracts;
