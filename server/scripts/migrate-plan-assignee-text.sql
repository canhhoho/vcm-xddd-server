-- ============================================================
-- VCM XDDD — Cột "Who" của Kế hoạch: chọn từ danh sách user -> điền tay
--
-- Chạy TRƯỚC khi restart app: sau khi deploy, weeklyPlans.js và monthlyPlans.js
-- đọc/ghi `assignee_name` và không còn JOIN bảng users. Restart trước khi migrate
-- thì mọi request của page Kế hoạch nổ `column "assignee_name" does not exist`.
--
-- Trước:  assignee_id VARCHAR(50)  -> khoá ngoại mềm tới users.id, UI là dropdown
-- Sau:    assignee_name VARCHAR(255) -> tên người phụ trách dạng text tự do
--
-- HỆ QUẢ ĐÃ ĐƯỢC CHẤP NHẬN: nhánh thông báo MY_PLAN_ITEM ("đầu việc kế hoạch tuần
-- được giao cho tôi", hiện qua chuông) đã bị xoá khỏi routes/notifications.js.
-- Nó lọc bằng `wi.assignee_id = <id user đang đăng nhập>`; với text tự do thì hệ
-- thống không còn biết dòng nào thuộc về ai nên nhánh đó không thể hoạt động.
--
-- An toàn khi chạy lại nhiều lần (IF NOT EXISTS / IF EXISTS).
-- ============================================================

ALTER TABLE weekly_plan_items  ADD COLUMN IF NOT EXISTS assignee_name VARCHAR(255) DEFAULT '';
ALTER TABLE monthly_plan_items ADD COLUMN IF NOT EXISTS assignee_name VARCHAR(255) DEFAULT '';

-- Chuyển dữ liệu cũ trước khi xoá cột. COALESCE giữ lại chính assignee_id khi user
-- đã bị xoá khỏi bảng users — thà hiện một chuỗi id còn hơn mất trắng người phụ trách.
-- Khối DO cần thiết vì sau lần chạy đầu, assignee_id không còn tồn tại và câu UPDATE
-- tham chiếu tới nó sẽ lỗi phân tích cú pháp ngay cả khi không có dòng nào khớp.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'weekly_plan_items' AND column_name = 'assignee_id') THEN
    EXECUTE $sql$
      UPDATE weekly_plan_items i
         SET assignee_name = COALESCE(u.name, i.assignee_id)
        FROM users u
       WHERE u.id = i.assignee_id
         AND COALESCE(i.assignee_name, '') = ''
    $sql$;
    EXECUTE $sql$
      UPDATE weekly_plan_items
         SET assignee_name = assignee_id
       WHERE COALESCE(assignee_name, '') = ''
         AND COALESCE(assignee_id, '') <> ''
    $sql$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'monthly_plan_items' AND column_name = 'assignee_id') THEN
    EXECUTE $sql$
      UPDATE monthly_plan_items i
         SET assignee_name = COALESCE(u.name, i.assignee_id)
        FROM users u
       WHERE u.id = i.assignee_id
         AND COALESCE(i.assignee_name, '') = ''
    $sql$;
    EXECUTE $sql$
      UPDATE monthly_plan_items
         SET assignee_name = assignee_id
       WHERE COALESCE(assignee_name, '') = ''
         AND COALESCE(assignee_id, '') <> ''
    $sql$;
  END IF;
END $$;

-- Quy ước cột text: chuỗi rỗng, KHÔNG phải NULL (ngược với quy ước của khoá ngoại
-- mềm mà assignee_id từng theo). Xem .claude/rules/database.md.
UPDATE weekly_plan_items  SET assignee_name = '' WHERE assignee_name IS NULL;
UPDATE monthly_plan_items SET assignee_name = '' WHERE assignee_name IS NULL;

ALTER TABLE weekly_plan_items  DROP COLUMN IF EXISTS assignee_id;
ALTER TABLE monthly_plan_items DROP COLUMN IF EXISTS assignee_id;

-- Kiểm tra sau khi chạy (phải trả về 0 dòng):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name IN ('weekly_plan_items','monthly_plan_items')
--      AND column_name = 'assignee_id';
