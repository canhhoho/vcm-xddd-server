-- Migration: Add monthly plans and daily progress logs
-- Run ONCE on the existing database before deploying new code.

-- 1. monthly_plans
CREATE TABLE IF NOT EXISTS monthly_plans (
  id            VARCHAR(50) PRIMARY KEY,
  month_start   DATE NOT NULL,
  department    VARCHAR(50) NOT NULL,
  created_by    VARCHAR(50),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month_start, department)
);

CREATE INDEX IF NOT EXISTS idx_monthly_plans_month ON monthly_plans(month_start, department);

-- 2. monthly_plan_items
CREATE TABLE IF NOT EXISTS monthly_plan_items (
  id            VARCHAR(50) PRIMARY KEY,
  plan_id       VARCHAR(50) REFERENCES monthly_plans(id) ON DELETE CASCADE,
  sort_order    INTEGER DEFAULT 1,
  title         TEXT NOT NULL,
  why           TEXT,
  assignee_id   VARCHAR(50),
  target        TEXT,
  method        TEXT,
  status        VARCHAR(20) DEFAULT 'TODO',
  result        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_plan ON monthly_plan_items(plan_id);

-- 3. Extend weekly_plan_items with progress tracking
ALTER TABLE weekly_plan_items ADD COLUMN IF NOT EXISTS progress_pct INTEGER DEFAULT 0;
ALTER TABLE weekly_plan_items ADD COLUMN IF NOT EXISTS monthly_item_id VARCHAR(50);

-- 4. daily_logs: one log per item per day (upsert pattern)
CREATE TABLE IF NOT EXISTS daily_logs (
  id            VARCHAR(50) PRIMARY KEY,
  item_id       VARCHAR(50) REFERENCES weekly_plan_items(id) ON DELETE CASCADE,
  log_date      DATE NOT NULL,
  progress_pct  INTEGER DEFAULT 0,
  note          TEXT,
  updated_by    VARCHAR(50),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_logs_item ON daily_logs(item_id, log_date);
