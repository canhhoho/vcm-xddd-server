-- Migration: Thêm bảng project_logs cho tính năng Nhật ký Thi công
-- Chạy lệnh: psql -U <user> -d <db> -f add_project_logs_table.sql
-- Hoặc tích hợp vào auto-migrate.js

-- Bảng nhật ký thi công hàng ngày theo project
-- 1 record/ngày/project (UNIQUE constraint)
CREATE TABLE IF NOT EXISTS project_logs (
    id              VARCHAR(50) PRIMARY KEY,
    project_id      VARCHAR(50) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    log_date        DATE NOT NULL,

    -- Điều kiện thời tiết
    weather         VARCHAR(20),        -- 'SUNNY' | 'CLOUDY' | 'RAINY' | 'STORMY'

    -- Nhân sự
    workers_count   INTEGER DEFAULT 0,  -- Số lao động trong ngày

    -- Tiến độ tổng thể dự án
    progress_pct    INTEGER DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),

    -- Nội dung công việc
    activities      TEXT,               -- Công việc đã thực hiện trong ngày
    issues          TEXT,               -- Vướng mắc / sự cố
    materials       TEXT,               -- Vật tư sử dụng
    equipment       TEXT,               -- Thiết bị thi công
    note            TEXT,               -- Ghi chú thêm

    -- Audit
    created_by      VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(100),       -- Cache tên người tạo
    updated_by      VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 1 log duy nhất mỗi ngày cho mỗi project
    UNIQUE(project_id, log_date)
);

-- Index để query nhanh theo project + ngày giảm dần
CREATE INDEX IF NOT EXISTS idx_project_logs_project_date
    ON project_logs(project_id, log_date DESC);

COMMENT ON TABLE project_logs IS 'Nhật ký thi công hàng ngày theo project — 1 record/ngày/project';
COMMENT ON COLUMN project_logs.weather IS 'SUNNY=Nắng, CLOUDY=Nhiều mây, RAINY=Mưa, STORMY=Bão';
COMMENT ON COLUMN project_logs.workers_count IS 'Tổng số lao động làm việc trong ngày';
COMMENT ON COLUMN project_logs.progress_pct IS 'Tiến độ tổng thể dự án (0-100), auto-sync vào projects.progress';
COMMENT ON COLUMN project_logs.materials IS 'Danh sách vật tư sử dụng (free text)';
COMMENT ON COLUMN project_logs.equipment IS 'Danh sách thiết bị thi công (free text)';
