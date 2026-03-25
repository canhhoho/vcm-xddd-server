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
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. contracts
CREATE TABLE IF NOT EXISTS contracts (
  id             VARCHAR(50) PRIMARY KEY,
  code           VARCHAR(100),
  name           TEXT,
  branch_id      VARCHAR(50) DEFAULT '',
  business_field VARCHAR(50) DEFAULT '',
  value          NUMERIC(18,2) DEFAULT 0,
  start_date     DATE,
  end_date       DATE,
  status         VARCHAR(50) DEFAULT 'TODO',
  file_urls      TEXT DEFAULT '',
  note           TEXT DEFAULT '',
  progress       INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  created_by     VARCHAR(50) DEFAULT ''
);

-- 4. invoices
CREATE TABLE IF NOT EXISTS invoices (
  id              VARCHAR(50) PRIMARY KEY,
  contract_id     VARCHAR(50) REFERENCES contracts(id) ON DELETE CASCADE,
  invoice_number  VARCHAR(100) DEFAULT '',
  installment     VARCHAR(100) DEFAULT '',
  value           NUMERIC(18,2) DEFAULT 0,
  issued_date     DATE,
  payment         NUMERIC(18,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  files           TEXT DEFAULT ''
);

-- 5. projects
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
  id         VARCHAR(50) PRIMARY KEY,
  branch_id  VARCHAR(50) DEFAULT '',
  name       VARCHAR(255),
  position   VARCHAR(100) DEFAULT '',
  phone      VARCHAR(50) DEFAULT '',
  email      VARCHAR(255) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
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

-- 13. weekly_plan_items
CREATE TABLE IF NOT EXISTS weekly_plan_items (
  id           VARCHAR(50) PRIMARY KEY,
  plan_id      VARCHAR(50) REFERENCES weekly_plans(id) ON DELETE CASCADE,
  sort_order   INTEGER DEFAULT 1,
  title        TEXT NOT NULL,
  description  TEXT DEFAULT '',
  assignee_id  VARCHAR(50) DEFAULT '',
  status       VARCHAR(20) DEFAULT 'TODO',
  result       TEXT DEFAULT '',
  carried_from VARCHAR(50) DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_branch ON prospects(branch_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plans_week ON weekly_plans(week_start, department);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_items_plan ON weekly_plan_items(plan_id);
