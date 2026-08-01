-- ============================================================
-- VCM XDDD — Ràng buộc & chuẩn hoá dữ liệu cho Page Plan
--
-- Chạy TRƯỚC khi restart app: dailyLogs.js dùng
-- INSERT ... ON CONFLICT (item_id, log_date) nên bắt buộc phải có
-- unique index uq_daily_logs_item_date, nếu không mọi lần lưu tiến độ sẽ lỗi.
--
-- Nếu lệnh CREATE UNIQUE INDEX báo lỗi thì DB đang có dữ liệu trùng.
-- Kiểm tra bằng:
--   SELECT week_start, department, count(*) FROM weekly_plans  GROUP BY 1,2 HAVING count(*)>1;
--   SELECT month_start, department, count(*) FROM monthly_plans GROUP BY 1,2 HAVING count(*)>1;
--   SELECT item_id, log_date, count(*) FROM daily_logs          GROUP BY 1,2 HAVING count(*)>1;
-- Dọn trùng xong rồi chạy lại file này.
--
-- An toàn khi chạy lại nhiều lần (IF NOT EXISTS + UPDATE idempotent).
-- ============================================================

-- 1. Thống nhất quy ước NULL cho khoá ngoại mềm.
--    weekly trước đây ghi chuỗi rỗng, monthly ghi NULL -> JOIN và so sánh dễ sai.
UPDATE weekly_plan_items  SET assignee_id     = NULL WHERE assignee_id = '';
UPDATE weekly_plan_items  SET monthly_item_id = NULL WHERE monthly_item_id = '';
UPDATE weekly_plan_items  SET carried_from    = NULL WHERE carried_from = '';
UPDATE monthly_plan_items SET assignee_id     = NULL WHERE assignee_id = '';

-- 2. Chống trùng: trước đây chỉ kiểm tra ở tầng app (check-then-insert)
--    nên hai request đồng thời vẫn tạo được bản ghi trùng.
CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_plans_week_dept   ON weekly_plans(week_start, department);
CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_plans_month_dept ON monthly_plans(month_start, department);
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_logs_item_date     ON daily_logs(item_id, log_date);

-- 3. Index còn thiếu (weekly_plan_items đã có, monthly thì chưa)
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_plan ON monthly_plan_items(plan_id);
