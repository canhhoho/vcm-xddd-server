-- Migration: Tiến độ hạng mục công việc theo dự án
-- Chạy: node server/scripts/run-migration.js migrate-add-project-work-items.sql
--
-- Nội dung file này được nhân bản y hệt vào init-db.sql (SSOT chạy mỗi lần boot),
-- nên mọi câu lệnh phải idempotent.
--
-- Khác với project_logs (nhật ký thi công: văn bản tự do, 1 progress_pct cho cả
-- dự án), hai bảng dưới đây theo dõi tiến độ theo TỪNG hạng mục có khối lượng,
-- nhập từ file Excel nhiều sheet.

-- Danh mục hạng mục, import từ Excel. Một dòng = một dòng trong file.
CREATE TABLE IF NOT EXISTS project_work_items (
  id            VARCHAR(50) PRIMARY KEY,
  project_id    VARCHAR(50) REFERENCES projects(id) ON DELETE CASCADE,
  -- Tên sheet = một hạng mục lớn (PCCC, Điện, Nước...), thành tab con trên web
  sheet_name    VARCHAR(255) DEFAULT '',
  sheet_order   INTEGER DEFAULT 0,       -- giữ đúng thứ tự sheet trong file
  sort_order    INTEGER DEFAULT 0,       -- giữ đúng thứ tự dòng trong sheet
  -- 0 = nhóm ('E'), 1 = nhóm con ('E.2'), 2 = hạng mục lá (cột STT để trống)
  level         INTEGER DEFAULT 0,
  code          VARCHAR(50) DEFAULT '',  -- giá trị cột STT như trong file
  name_vi       TEXT NOT NULL,
  name_en       TEXT DEFAULT '',
  unit_vi       VARCHAR(50) DEFAULT '',
  unit_en       VARCHAR(50) DEFAULT '',
  planned_qty   NUMERIC(18,3) DEFAULT 0,
  -- LUỸ KẾ, đồng bộ từ log có log_date mới nhất. Không cộng dồn.
  completed_qty NUMERIC(18,3) DEFAULT 0,
  note          TEXT DEFAULT '',
  updated_by    VARCHAR(50) DEFAULT '',
  updated_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Lịch sử cập nhật khối lượng theo ngày.
-- completed_qty ở đây là LUỸ KẾ tại ngày đó, KHÔNG phải khối lượng phát sinh —
-- nên sửa một log quá khứ không kéo tụt được con số hiện tại.
CREATE TABLE IF NOT EXISTS project_work_item_logs (
  id            VARCHAR(50) PRIMARY KEY,
  item_id       VARCHAR(50) REFERENCES project_work_items(id) ON DELETE CASCADE,
  log_date      DATE NOT NULL,
  completed_qty NUMERIC(18,3) DEFAULT 0,
  note          TEXT DEFAULT '',
  created_by    VARCHAR(50) DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pwi_project ON project_work_items(project_id, sheet_order, sort_order);
CREATE INDEX IF NOT EXISTS idx_pwil_item   ON project_work_item_logs(item_id, log_date);

-- Bắt buộc cho INSERT ... ON CONFLICT (item_id, log_date): một lần ghi/hạng mục/ngày.
-- LƯU Ý KHI DEPLOY: nếu production đã có dữ liệu trùng thì lệnh dưới sẽ lỗi.
--   SELECT item_id, log_date, count(*) FROM project_work_item_logs
--   GROUP BY 1,2 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pwil_item_date ON project_work_item_logs(item_id, log_date);

-- Cố ý KHÔNG lưu progress_pct và status: tính khi đọc từ completed_qty/planned_qty
-- để hai con số không bao giờ lệch nhau.
