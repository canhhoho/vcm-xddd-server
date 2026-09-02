-- Migration: Ngày hoàn thành mục tiêu + ngày hoàn thành thực tế cho hạng mục công việc
-- Chạy: node server/scripts/run-migration.js migrate-add-work-item-dates.sql
--
-- Nội dung được mirror vào init-db.sql (SSOT chạy mỗi lần boot) nên phải idempotent.
--
-- LƯU Ý: bảng project_work_items đã tồn tại từ migrate-add-project-work-items.sql,
-- mà CREATE TABLE IF NOT EXISTS KHÔNG thêm cột vào bảng đã có. Vì vậy init-db.sql
-- phải giữ cả hai câu ALTER dưới đây, không chỉ sửa khối CREATE TABLE.

-- Ngày cam kết hoàn thành, đọc từ cột mới trong file Excel khi import.
-- Chỉ người có quyền projects=EDIT sửa được (dữ liệu kế hoạch).
ALTER TABLE project_work_items ADD COLUMN IF NOT EXISTS target_date DATE;

-- Ngày thực sự hoàn thành. Tự điền khi khối lượng luỹ kế đạt đủ kế hoạch
-- (lấy MIN ngày đạt đủ, xem routes/projectWorkItems.js), vẫn sửa tay được.
ALTER TABLE project_work_items ADD COLUMN IF NOT EXISTS actual_date DATE;

-- Bộ lọc "chỉ xem hạng mục trễ" quét theo mốc này
CREATE INDEX IF NOT EXISTS idx_pwi_target_date ON project_work_items(project_id, target_date);
