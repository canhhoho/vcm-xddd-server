-- ============================================================
-- VCM XDDD — PostgreSQL Database Schema
-- Migrated from Google Sheets (12 sheets → 12 tables)
-- ============================================================

-- 1. branches
CREATE TABLE IF NOT EXISTS branches (
  id         VARCHAR(50) PRIMARY KEY,
  name       VARCHAR(255),
  code       VARCHAR(50) UNIQUE,
  address    TEXT DEFAULT '',
  phone      VARCHAR(50) DEFAULT '',
  email      VARCHAR(255) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. users
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(50) PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password      VARCHAR(255) NOT NULL,
  name          VARCHAR(255),
  position_id   VARCHAR(50) DEFAULT '',
  position_code VARCHAR(50) DEFAULT '',
  position_name VARCHAR(100) DEFAULT '',
  category      VARCHAR(100) DEFAULT '',
  description   TEXT DEFAULT '',
  role          VARCHAR(20) DEFAULT 'VIEW',
  branches      VARCHAR(20) DEFAULT 'NO_ACCESS',
  contracts     VARCHAR(20) DEFAULT 'NO_ACCESS',
  projects      VARCHAR(20) DEFAULT 'NO_ACCESS',
  targets       VARCHAR(20) DEFAULT 'NO_ACCESS',
  business      VARCHAR(20) DEFAULT 'NO_ACCESS',
  plans         VARCHAR(20) DEFAULT 'NO_ACCESS',
  plans_bd      VARCHAR(20) DEFAULT 'NO_ACCESS',
  plans_mkt     VARCHAR(20) DEFAULT 'NO_ACCESS',
  plans_qs      VARCHAR(20) DEFAULT 'NO_ACCESS',
  plans_des     VARCHAR(20) DEFAULT 'NO_ACCESS',
  plans_pm      VARCHAR(20) DEFAULT 'NO_ACCESS',
  -- Thời điểm hoạt động cuối (tính năng "user đang online"). NULL = chưa từng
  -- đăng nhập. Ngưỡng coi là online nằm ở routes/presence.js, không ở schema.
  last_seen_at  TIMESTAMPTZ,
  -- Mốc "đã xem thông báo". NULL = chưa mở chuông lần nào -> mọi thông báo
  -- đều tính là chưa đọc. Xem routes/notifications.js.
  notifications_read_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. contracts
CREATE TABLE IF NOT EXISTS contracts (
  id             VARCHAR(50) PRIMARY KEY,
  code           VARCHAR(100),
  name           TEXT,
  branch_id      VARCHAR(50) DEFAULT '',
  business_field VARCHAR(50) DEFAULT '',
  -- `value` là số ĐÃ GỒM THUẾ (con số trên chứng từ). Chỉ số "Nguồn việc" trên
  -- Dashboard và trang Chỉ tiêu đọc `value_before_tax`, KHÔNG đọc cột này.
  value             NUMERIC(18,2) DEFAULT 0,
  value_before_tax  NUMERIC(18,2) DEFAULT 0,
  tax_rate          NUMERIC(5,2)  DEFAULT 5.00,  -- PHẦN TRĂM: 5.00 = 5%
  start_date     DATE,
  end_date       DATE,
  status         VARCHAR(50) DEFAULT 'TODO',
  file_urls      TEXT DEFAULT '',
  note           TEXT DEFAULT '',
  -- Tên chủ đầu tư, text tự do, không bắt buộc. Trống = '' (không phải NULL).
  investor       TEXT DEFAULT '',
  -- DEPRECATED: không còn được đọc hay ghi. GET /contracts luôn tính lại tiến độ
  -- từ SUM(invoices.payment)/value. Giữ lại để không mất dữ liệu cũ; sẽ DROP ở
  -- lần dọn schema sau (cùng đợt với users.plans).
  progress       INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  created_by     VARCHAR(50) DEFAULT ''
);

-- 4. invoices
CREATE TABLE IF NOT EXISTS invoices (
  id              VARCHAR(50) PRIMARY KEY,
  contract_id     VARCHAR(50) REFERENCES contracts(id) ON DELETE CASCADE,
  invoice_number  VARCHAR(500) DEFAULT '',
  installment     VARCHAR(100) DEFAULT '',
  -- `value` là số ĐÃ GỒM THUẾ (con số trên hoá đơn). Chỉ số "Doanh thu" trên
  -- Dashboard và trang Chỉ tiêu đọc `value_before_tax`, KHÔNG đọc cột này.
  -- `payment` (tiền đã thu) giữ nguyên là số đã gồm thuế.
  value             NUMERIC(18,2) DEFAULT 0,
  value_before_tax  NUMERIC(18,2) DEFAULT 0,
  tax_rate          NUMERIC(5,2)  DEFAULT 5.00,  -- PHẦN TRĂM: 5.00 = 5%
  issued_date     DATE,
  payment         NUMERIC(18,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  files           TEXT DEFAULT ''
);

-- 5. projects
-- KHÔNG có cột `progress`: tiến độ dự án là giá trị dẫn xuất, luôn tính lại bằng
-- AVG(tasks.progress) trong routes/projects.js -> toProject(). projectLogs.js từng
-- chạy `UPDATE projects SET progress = ...` ở đây và ném 42703 sau mỗi lần lưu
-- nhật ký. Đừng thêm cột này lại.
CREATE TABLE IF NOT EXISTS projects (
  id           VARCHAR(50) PRIMARY KEY,
  code         VARCHAR(100),
  name         TEXT,
  status       VARCHAR(50) DEFAULT 'TODO',
  manager_id   VARCHAR(50) DEFAULT '',
  contract_id  VARCHAR(50) DEFAULT '',
  location     TEXT DEFAULT '',
  investor     TEXT DEFAULT '',
  start_date   DATE,
  end_date     DATE,
  budget       NUMERIC(18,2) DEFAULT 0,
  description  TEXT DEFAULT '',
  file_urls    TEXT DEFAULT '',
  members      JSONB DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 6. tasks
CREATE TABLE IF NOT EXISTS tasks (
  id           VARCHAR(50) PRIMARY KEY,
  project_id   VARCHAR(50) REFERENCES projects(id) ON DELETE CASCADE,
  item_type    VARCHAR(100) DEFAULT '',
  item_name    VARCHAR(255) DEFAULT '',
  name         TEXT,
  assignee_id  VARCHAR(50) DEFAULT '',
  status       VARCHAR(50) DEFAULT 'TODO',
  progress     INTEGER DEFAULT 0,
  start_date   DATE,
  end_date     DATE,
  description  TEXT DEFAULT '',
  priority     VARCHAR(20) DEFAULT 'MEDIUM',
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 7. staff
CREATE TABLE IF NOT EXISTS staff (
  id          VARCHAR(50) PRIMARY KEY,
  branch_id   VARCHAR(50) DEFAULT '',
  name        VARCHAR(255),
  position    VARCHAR(100) DEFAULT '',
  phone       VARCHAR(50) DEFAULT '',
  email       VARCHAR(255) DEFAULT '',
  staff_group VARCHAR(100) DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 8. targets
CREATE TABLE IF NOT EXISTS targets (
  id           VARCHAR(50) PRIMARY KEY,
  name         VARCHAR(255),
  type         VARCHAR(50),
  period_type  VARCHAR(20),
  period       VARCHAR(20),
  unit_type    VARCHAR(20) DEFAULT 'GENERAL',
  unit_id      VARCHAR(50) DEFAULT '',
  target_value NUMERIC(18,2) DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 9. activities
CREATE TABLE IF NOT EXISTS activities (
  id          VARCHAR(50) PRIMARY KEY,
  email       VARCHAR(255) DEFAULT '',
  action      VARCHAR(100) DEFAULT '',
  description TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 10. positions
CREATE TABLE IF NOT EXISTS positions (
  id           VARCHAR(50) PRIMARY KEY,
  name         VARCHAR(255),
  code         VARCHAR(50) DEFAULT '',
  default_role VARCHAR(20) DEFAULT 'VIEW',
  category     VARCHAR(100) DEFAULT '',
  description  TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 11. prospects (Business Pipeline)
CREATE TABLE IF NOT EXISTS prospects (
  id              VARCHAR(50) PRIMARY KEY,
  name            TEXT NOT NULL,
  client          TEXT DEFAULT '',
  location        TEXT DEFAULT '',
  branch_id       VARCHAR(50) DEFAULT '',
  estimated_value NUMERIC(18,2) DEFAULT 0,
  contact_person  VARCHAR(255) DEFAULT '',
  contact_phone   VARCHAR(50) DEFAULT '',
  source          VARCHAR(50) DEFAULT 'DIRECT',
  status          VARCHAR(50) DEFAULT 'NEW',
  priority        VARCHAR(20) DEFAULT 'MEDIUM',
  note            TEXT DEFAULT '',
  expected_date   DATE,
  created_by      VARCHAR(50) DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 12. weekly_plans
CREATE TABLE IF NOT EXISTS weekly_plans (
  id          VARCHAR(50) PRIMARY KEY,
  week_start  DATE NOT NULL,
  week_end    DATE NOT NULL,
  department  VARCHAR(50) NOT NULL,
  created_by  VARCHAR(50) DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 13. weekly_plan_items (5W1H format)
CREATE TABLE IF NOT EXISTS weekly_plan_items (
  id           VARCHAR(50) PRIMARY KEY,
  plan_id      VARCHAR(50) REFERENCES weekly_plans(id) ON DELETE CASCADE,
  sort_order   INTEGER DEFAULT 1,
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  why          TEXT DEFAULT '',
  -- Người phụ trách là TEXT TỰ DO, không phải khoá ngoại tới users. Cột cũ
  -- `assignee_id` đã bị xoá (migrate-plan-assignee-text.sql) — đừng đưa lại.
  assignee_name VARCHAR(255) DEFAULT '',
  start_date   DATE,
  end_date     DATE,
  location     TEXT DEFAULT '',
  method       TEXT DEFAULT '',
  status       VARCHAR(20) DEFAULT 'TODO',
  result       TEXT DEFAULT '',
  progress_pct INTEGER DEFAULT 0,
  monthly_item_id VARCHAR(50) DEFAULT '',
  carried_from VARCHAR(50) DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 14. monthly_plans
CREATE TABLE IF NOT EXISTS monthly_plans (
  id          VARCHAR(50) PRIMARY KEY,
  month_start DATE NOT NULL,
  department  VARCHAR(50) NOT NULL,
  created_by  VARCHAR(50) DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 15. monthly_plan_items
CREATE TABLE IF NOT EXISTS monthly_plan_items (
  id           VARCHAR(50) PRIMARY KEY,
  plan_id      VARCHAR(50) REFERENCES monthly_plans(id) ON DELETE CASCADE,
  sort_order   INTEGER DEFAULT 1,
  title        TEXT NOT NULL,
  why          TEXT DEFAULT '',
  -- Người phụ trách là TEXT TỰ DO, không phải khoá ngoại tới users. Cột cũ
  -- `assignee_id` đã bị xoá (migrate-plan-assignee-text.sql) — đừng đưa lại.
  assignee_name VARCHAR(255) DEFAULT '',
  target       TEXT DEFAULT '',
  method       TEXT DEFAULT '',
  status       VARCHAR(20) DEFAULT 'TODO',
  result       TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 16. daily_logs
CREATE TABLE IF NOT EXISTS daily_logs (
  id           VARCHAR(50) PRIMARY KEY,
  item_id      VARCHAR(50) REFERENCES weekly_plan_items(id) ON DELETE CASCADE,
  log_date     DATE NOT NULL,
  progress_pct INTEGER DEFAULT 0,
  note         TEXT DEFAULT '',
  updated_by   VARCHAR(50) DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 17. collaborators
CREATE TABLE IF NOT EXISTS collaborators (
  id          VARCHAR(50) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  company     VARCHAR(255) DEFAULT '',
  speciality  VARCHAR(255) DEFAULT '',
  phone       VARCHAR(50) DEFAULT '',
  email       VARCHAR(255) DEFAULT '',
  address     TEXT DEFAULT '',
  note        TEXT DEFAULT '',
  branch_id   VARCHAR(50) DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contracts_branch ON contracts(branch_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_start_date ON contracts(start_date);
CREATE INDEX IF NOT EXISTS idx_invoices_contract ON invoices(contract_id);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_date ON invoices(issued_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_staff_branch ON staff(branch_id);
CREATE INDEX IF NOT EXISTS idx_targets_type ON targets(type, period_type);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_branch ON prospects(branch_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plans_week ON weekly_plans(week_start, department);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_plan ON weekly_plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_month ON monthly_plans(month_start, department);
CREATE INDEX IF NOT EXISTS idx_daily_logs_item ON daily_logs(item_id);

-- ============================================================
-- Migrations (safe to re-run: ADD COLUMN IF NOT EXISTS)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE weekly_plan_items ADD COLUMN IF NOT EXISTS why TEXT DEFAULT '';
  ALTER TABLE weekly_plan_items ADD COLUMN IF NOT EXISTS start_date DATE;
  ALTER TABLE weekly_plan_items ADD COLUMN IF NOT EXISTS end_date DATE;
  ALTER TABLE weekly_plan_items ADD COLUMN IF NOT EXISTS location TEXT DEFAULT '';
  ALTER TABLE weekly_plan_items ADD COLUMN IF NOT EXISTS method TEXT DEFAULT '';
  ALTER TABLE weekly_plan_items ADD COLUMN IF NOT EXISTS progress_pct INTEGER DEFAULT 0;
  ALTER TABLE weekly_plan_items ADD COLUMN IF NOT EXISTS monthly_item_id VARCHAR(50) DEFAULT '';
  -- Increase invoice_number from VARCHAR(100) to VARCHAR(500)
  ALTER TABLE invoices ALTER COLUMN invoice_number TYPE VARCHAR(500);
  -- Add file_urls column to projects for PDF attachments
  ALTER TABLE projects ADD COLUMN IF NOT EXISTS file_urls TEXT DEFAULT '';
  -- Add contact_date to prospects
  ALTER TABLE prospects ADD COLUMN IF NOT EXISTS contact_date DATE DEFAULT NULL;
  -- Add prospect type (B2B/B2C)
  ALTER TABLE prospects ADD COLUMN IF NOT EXISTS prospect_type VARCHAR(10) DEFAULT 'B2B';
  -- Add staff group
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS staff_group VARCHAR(100) DEFAULT '';
  -- Add tab-specific plan permissions
  -- (users.plans số ít ở trên là cột DEPRECATED - không còn được đọc bởi frontend
  --  hay backend; giữ lại để không mất dữ liệu cũ, sẽ DROP ở lần dọn schema sau)
  ALTER TABLE users ADD COLUMN IF NOT EXISTS plans_bd VARCHAR(20) DEFAULT 'NO_ACCESS';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS plans_mkt VARCHAR(20) DEFAULT 'NO_ACCESS';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS plans_qs VARCHAR(20) DEFAULT 'NO_ACCESS';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS plans_des VARCHAR(20) DEFAULT 'NO_ACCESS';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS plans_pm VARCHAR(20) DEFAULT 'NO_ACCESS';

  -- Thời điểm hoạt động cuối, phục vụ tính năng "user đang online".
  -- NULL = chưa bao giờ đăng nhập. Ngưỡng coi là online nằm ở routes/presence.js.
  -- Mirror của migrate-add-last-seen.sql.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

  -- Mốc "đã xem thông báo" — mirror của migrate-add-notifications-read.sql.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_read_at TIMESTAMPTZ;

  -- Giá trị TRƯỚC THUẾ tách thành cột riêng — mirror của migrate-add-pretax-value.sql.
  --   value            số ĐÃ GỒM THUẾ, đúng con số trên chứng từ (không đổi)
  --   value_before_tax số TRƯỚC THUẾ, nguồn DUY NHẤT của Doanh thu và Nguồn việc
  --   tax_rate         PHẦN TRĂM (5.00 = 5%), không phải phân số
  -- Quan hệ: value = ROUND(value_before_tax * (1 + tax_rate/100), 2)
  ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS value_before_tax NUMERIC(18,2) DEFAULT 0;
  ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS tax_rate         NUMERIC(5,2)  DEFAULT 5.00;
  ALTER TABLE contracts ADD COLUMN IF NOT EXISTS value_before_tax NUMERIC(18,2) DEFAULT 0;
  ALTER TABLE contracts ADD COLUMN IF NOT EXISTS tax_rate         NUMERIC(5,2)  DEFAULT 5.00;

  -- Chủ đầu tư của hợp đồng — mirror của migrate-add-contract-investor.sql.
  ALTER TABLE contracts ADD COLUMN IF NOT EXISTS investor TEXT DEFAULT '';
  UPDATE contracts SET investor = '' WHERE investor IS NULL;

  -- Backfill dữ liệu cũ (chỉ có số đã gồm thuế) theo thuế suất mặc định 5%.
  -- Đây là chỗ DUY NHẤT còn phép chia 1.05 — code chạy đọc thẳng value_before_tax.
  -- Điều kiện `= 0` để lần boot sau không ghi đè số đã nhập tay qua UI.
  UPDATE invoices  SET value_before_tax = ROUND(value / 1.05, 2)
    WHERE COALESCE(value_before_tax, 0) = 0 AND COALESCE(value, 0) <> 0;
  UPDATE contracts SET value_before_tax = ROUND(value / 1.05, 2)
    WHERE COALESCE(value_before_tax, 0) = 0 AND COALESCE(value, 0) <> 0;
  UPDATE invoices  SET tax_rate = 5.00 WHERE tax_rate IS NULL;
  UPDATE contracts SET tax_rate = 5.00 WHERE tax_rate IS NULL;

  -- Thống nhất quy ước NULL cho khoá ngoại mềm của plan items
  -- (weekly trước đây ghi '', monthly ghi NULL -> JOIN và so sánh dễ sai)
  --
  -- assignee_id CỐ Ý không còn ở đây: cột đã bị xoá, người phụ trách giờ là text
  -- tự do trong assignee_name. Để lại dòng UPDATE cũ thì mỗi lần server boot sẽ
  -- ném 42703 'column "assignee_id" does not exist' và autoCreateTables() hỏng.
  UPDATE weekly_plan_items SET monthly_item_id = NULL WHERE monthly_item_id = '';
  UPDATE weekly_plan_items SET carried_from    = NULL WHERE carried_from = '';

  -- Cột "Who" của Kế hoạch: chọn từ danh sách user -> điền tay.
  -- Mirror của migrate-plan-assignee-text.sql. Bản migration rời có thêm phần
  -- chuyển dữ liệu cũ từ assignee_id sang; ở đây chỉ cần đảm bảo cột tồn tại vì
  -- DB cài mới chưa bao giờ có assignee_id.
  ALTER TABLE weekly_plan_items  ADD COLUMN IF NOT EXISTS assignee_name VARCHAR(255) DEFAULT '';
  ALTER TABLE monthly_plan_items ADD COLUMN IF NOT EXISTS assignee_name VARCHAR(255) DEFAULT '';
  UPDATE weekly_plan_items  SET assignee_name = '' WHERE assignee_name IS NULL;
  UPDATE monthly_plan_items SET assignee_name = '' WHERE assignee_name IS NULL;
END $$;

-- ============================================================
-- Ràng buộc chống trùng cho Page Plan
-- Trước đây chỉ kiểm tra tồn tại ở tầng app (check-then-insert) nên hai request
-- đồng thời vẫn tạo được 2 plan cùng tuần/tháng, hoặc 2 daily log cùng ngày.
-- daily_logs cần unique index này để INSERT ... ON CONFLICT hoạt động.
--
-- LƯU Ý KHI DEPLOY: nếu production đã có dữ liệu trùng, lệnh dưới sẽ lỗi.
-- Kiểm tra trước bằng:
--   SELECT week_start, department, count(*) FROM weekly_plans  GROUP BY 1,2 HAVING count(*)>1;
--   SELECT month_start, department, count(*) FROM monthly_plans GROUP BY 1,2 HAVING count(*)>1;
--   SELECT item_id, log_date, count(*) FROM daily_logs          GROUP BY 1,2 HAVING count(*)>1;
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_plans_week_dept   ON weekly_plans(week_start, department);
CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_plans_month_dept ON monthly_plans(month_start, department);
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_logs_item_date     ON daily_logs(item_id, log_date);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_plan        ON monthly_plan_items(plan_id);

-- ============================================================
-- 14. collaborators
-- ============================================================
CREATE TABLE IF NOT EXISTS collaborators (
  id          VARCHAR(50) PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  company     VARCHAR(255) DEFAULT '',
  speciality  VARCHAR(255) DEFAULT '',
  phone       VARCHAR(50) DEFAULT '',
  email       VARCHAR(255) DEFAULT '',
  address     TEXT DEFAULT '',
  note        TEXT DEFAULT '',
  branch_id   VARCHAR(50) DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 18. partners (Nhân công / Vật tư / Thiết bị)
-- ============================================================
CREATE TABLE IF NOT EXISTS partners (
  id          VARCHAR(50)  PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,          -- Tên công ty / cá nhân
  type        VARCHAR(50)  NOT NULL,          -- 'LABOR' | 'MATERIAL' | 'EQUIPMENT'
  contact     VARCHAR(255) DEFAULT '',        -- Tên người liên hệ
  phone       VARCHAR(50)  DEFAULT '',
  email       VARCHAR(255) DEFAULT '',
  address     TEXT         DEFAULT '',
  tax_code    VARCHAR(50)  DEFAULT '',        -- Mã số thuế
  speciality  VARCHAR(255) DEFAULT '',        -- Chuyên môn / mặt hàng cung cấp
  branch_id   VARCHAR(50)  DEFAULT '',        -- Chi nhánh phụ trách (soft FK)
  note        TEXT         DEFAULT '',
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partners_type   ON partners(type);
CREATE INDEX IF NOT EXISTS idx_partners_branch ON partners(branch_id);

-- ============================================================
-- 19. project_logs (Nhật ký thi công hàng ngày — 1 record/ngày/project)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_logs (
  id              VARCHAR(50) PRIMARY KEY,
  project_id      VARCHAR(50) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  log_date        DATE NOT NULL,
  weather         VARCHAR(20),        -- 'SUNNY' | 'CLOUDY' | 'RAINY' | 'STORMY'
  workers_count   INTEGER DEFAULT 0,  -- Số lao động trong ngày
  progress_pct    INTEGER DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  activities      TEXT,               -- Công việc đã thực hiện trong ngày
  issues          TEXT,               -- Vướng mắc / sự cố
  materials       TEXT,               -- Vật tư sử dụng
  equipment       TEXT,               -- Thiết bị thi công
  note            TEXT,               -- Ghi chú thêm
  created_by      VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
  created_by_name VARCHAR(100),       -- Cache tên người tạo
  updated_by      VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, log_date)
);
CREATE INDEX IF NOT EXISTS idx_project_logs_project_date ON project_logs(project_id, log_date DESC);
