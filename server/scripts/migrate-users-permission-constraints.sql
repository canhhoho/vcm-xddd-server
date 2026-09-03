-- ============================================================
-- VCM XDDD — NOT NULL + CHECK constraint cho các cột quyền của bảng `users`
-- Chạy: node server/scripts/run-migration.js migrate-users-permission-constraints.sql
--
-- Chạy TRƯỚC khi restart app. Cùng đợt này moduleAccess.js / planAccess.js /
-- projectMemberAccess.js được sửa FAIL-CLOSED (giá trị lạ -> NO_ACCESS thay vì
-- "đọc được"). Restart trước khi migrate thì user đang có branches='FULL' bị 403
-- kể cả GET — hôm nay 'FULL' rơi vào nhánh "không phải NO_ACCESS, không phải
-- EDIT" nên vẫn xem được. Migrate trước, 'FULL' thành 'VIEW', hành vi không đổi
-- một giây nào.
--
-- HAI THANG GIÁ TRỊ KHÁC NHAU, ĐỪNG GỘP:
--   role            ADMIN | EDIT | VIEW | NO_ACCESS
--   cột module/plan EDIT  | VIEW | NO_ACCESS          (KHÔNG có ADMIN)
-- Vì sao cột module không có ADMIN: cổng ghi đòi đúng 'EDIT', nên 'ADMIN' ở cột
-- module thực tế YẾU HƠN 'EDIT' — ngược ý người bấm. Quyền toàn cục ở cột `role`.
-- Khớp server/src/services/accessLevels.js.
--
-- QUY ĐỔI DỮ LIỆU CŨ (chạy TRƯỚC khi thêm constraint, cùng transaction):
--   cột module/plan  'ADMIN','FULL'            -> 'VIEW'
--                    giá trị khác / NULL / ''  -> 'NO_ACCESS'   (fail-closed)
--   role             4 giá trị hợp lệ giữ nguyên
--                    giá trị khác / NULL / ''  -> 'VIEW'
--
-- 'ADMIN'/'FULL' -> 'VIEW' chứ KHÔNG 'EDIT': giữ ĐÚNG quyền thực tế hôm nay (đọc
-- được, không ghi được). Quy sang 'EDIT' là NÂNG QUYỀN cho người mà admin chưa
-- bao giờ chủ ý cấp quyền ghi.
--
-- Vì sao `role` rác đổ về 'VIEW' chứ không 'NO_ACCESS':
--   1. Không nới quyền gì. Sức mạnh duy nhất của `role` là ADMIN bypass, và
--      rbac.js dùng allowlist nên MỌI giá trị khác 'ADMIN' đã bị chặn y như nhau.
--      Quyền đọc/ghi từng module do 10 cột kia quyết định, và chúng fail-closed
--      độc lập ngay trong file này.
--   2. 'NO_ACCESS' không an toàn hơn, chỉ phá hơn: App.tsx xoá localStorage và đẩy
--      về /login khi role='NO_ACCESS' -> user tự khoá ngoài, phải nhờ ADMIN mở.
--      Một role rỗng/rác trên production gần như chắc chắn là lỗi dữ liệu, không
--      phải quyết định cấm cửa. Fail-closed ở trục QUYỀN TRUY CẬP, không
--      fail-closed ở trục TỒN TẠI TÀI KHOẢN.
--   3. 'VIEW' là giá trị mà 3 chỗ trong code đã coi là mặc định: schema DEFAULT,
--      users.js khi tạo user, permissions.js khi đọc.
--   'NO_ACCESS' đặt CÓ Ý vẫn giữ nguyên vì nó nằm trong whitelist.
--
-- CHỮ HOA/THƯỜNG: bắt buộc UPPER(BTRIM(...)) TRƯỚC khi so whitelist. rbac.js,
-- moduleAccess.js, planAccess.js đều .toUpperCase() nên 'admin'/'edit' lưu chữ
-- thường ĐANG chạy bình thường. So thẳng chuỗi gốc thì 'edit' bị coi là rác và
-- tụt xuống NO_ACCESS — mất quyền im lặng.
--
-- Nội dung được mirror vào init-db.sql (SSOT chạy mỗi lần boot) nên phải idempotent.
-- An toàn khi chạy lại nhiều lần: kiểm pg_constraint trước khi ADD, UPDATE lọc bằng
-- IS DISTINCT FROM, SET NOT NULL / SET DEFAULT vốn no-op khi đã đúng.
--
-- ------------------------------------------------------------
-- BẮT BUỘC TRƯỚC KHI CHẠY TRÊN PRODUCTION — lưu nguyên trạng.
-- Chuẩn hoá dữ liệu KHÔNG đảo ngược được: 'FULL' thành 'VIEW' rồi thì không còn
-- dấu vết. DROP CONSTRAINT lùi được schema, KHÔNG lùi được dữ liệu. CSV này LÀ
-- đường lùi duy nhất:
--   \copy (SELECT id, email, role, branches, contracts, projects, targets,
--                 business, plans_bd, plans_mkt, plans_qs, plans_des, plans_pm
--            FROM users ORDER BY email)
--     TO 'users-permissions-before.csv' CSV HEADER
--
-- XEM TRƯỚC — BLAST RADIUS: đúng những dòng sẽ bị UPDATE, kèm giá trị mới.
-- (RAISE NOTICE bên dưới chỉ hiện khi chạy bằng `psql -f`, hoặc qua
--  run-migration.js sau khi nó được gắn listener 'notice'.)
--   WITH x AS (
--     SELECT p.col, p.val,
--            CASE UPPER(BTRIM(COALESCE(p.val, '')))
--              WHEN 'EDIT' THEN 'EDIT' WHEN 'VIEW' THEN 'VIEW'
--              WHEN 'NO_ACCESS' THEN 'NO_ACCESS'
--              WHEN 'ADMIN' THEN 'VIEW' WHEN 'FULL' THEN 'VIEW'
--              ELSE 'NO_ACCESS'
--            END AS want
--       FROM users u
--       CROSS JOIN LATERAL (VALUES
--         ('branches', u.branches), ('contracts', u.contracts), ('projects', u.projects),
--         ('targets', u.targets), ('business', u.business),
--         ('plans_bd', u.plans_bd), ('plans_mkt', u.plans_mkt), ('plans_qs', u.plans_qs),
--         ('plans_des', u.plans_des), ('plans_pm', u.plans_pm)
--       ) AS p(col, val)
--   )
--   SELECT col, COALESCE(val, '<NULL>') AS truoc, want AS sau, count(*) AS so_user
--     FROM x WHERE val IS DISTINCT FROM want GROUP BY 1,2,3 ORDER BY 1,2;
--
-- Và ai đang bị chạm (để thông báo trước cho họ):
--   SELECT id, email, role, branches, contracts, projects, targets, business
--     FROM users
--    WHERE UPPER(BTRIM(COALESCE(branches, ''))) NOT IN ('EDIT','VIEW','NO_ACCESS')
--       OR UPPER(BTRIM(COALESCE(contracts,''))) NOT IN ('EDIT','VIEW','NO_ACCESS')
--       OR UPPER(BTRIM(COALESCE(projects, ''))) NOT IN ('EDIT','VIEW','NO_ACCESS')
--       OR UPPER(BTRIM(COALESCE(targets,  ''))) NOT IN ('EDIT','VIEW','NO_ACCESS')
--       OR UPPER(BTRIM(COALESCE(business, ''))) NOT IN ('EDIT','VIEW','NO_ACCESS')
--       OR UPPER(BTRIM(COALESCE(role,     ''))) NOT IN ('ADMIN','EDIT','VIEW','NO_ACCESS');
-- ============================================================

-- ALTER TABLE giữ ACCESS EXCLUSIVE trên `users` tới lúc COMMIT, mà rbac.js /
-- moduleAccess.js / planAccess.js đọc bảng này ở MỌI request. Bảng chỉ vài chục
-- dòng nên scan tính bằng milli-giây, nhưng nếu đang có transaction dài giữ lock
-- thì thà migration chết sớm (55P03 -> rollback sạch -> exit 1 -> chạy lại) còn
-- hơn khoá API vô thời hạn.
-- SET LOCAL hợp lệ vì run-migration.js gửi cả file trong MỘT pool.query -> Postgres
-- bọc trong một transaction ngầm. CỐ Ý không mirror 2 dòng này sang init-db.sql:
-- ở đó chúng sẽ áp cho toàn bộ transaction boot.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $mig$
DECLARE
  -- 10 cột quyền theo module/phòng ban, CỘNG `plans` (số ít, DEPRECATED).
  --
  -- `plans` nằm trong danh sách CÓ Ý: tới lần dọn schema nó vẫn là cột thật, để
  -- lại đúng một cột quyền không ràng buộc là cái bẫy cho người sau nếu cột được
  -- dùng lại.
  --
  -- Cột này CÓ hay KHÔNG tuỳ lịch sử từng DB, không đoán được:
  -- migrate-add-plans-permission.sql thêm nó cho DB cũ, init-db.sql có nó trong
  -- CREATE TABLE (chỉ áp cho DB tạo mới — CREATE TABLE IF NOT EXISTS KHÔNG thêm
  -- cột vào bảng đã có). Vì vậy vòng lặp phải hỏi information_schema từng cột.
  module_cols text[] := ARRAY[
    'branches', 'contracts', 'projects', 'targets', 'business',
    'plans_bd', 'plans_mkt', 'plans_qs', 'plans_des', 'plans_pm',
    'plans'
  ];
  col        text;
  con_name   text;
  n_changed  bigint;
BEGIN
  -- ==========================================================
  -- 1. role — thang RIÊNG, thang duy nhất được chứa ADMIN
  -- ==========================================================
  -- Dạng UPDATE ... FROM (subquery) để biểu thức quy đổi chỉ viết MỘT lần: đặt
  -- CASE ở cả SET và WHERE thì sửa một chỗ quên chỗ kia là mất quyền im lặng.
  UPDATE users u
     SET role = x.want
    FROM (
      SELECT id,
             CASE UPPER(BTRIM(COALESCE(role, '')))
               WHEN 'ADMIN'     THEN 'ADMIN'
               WHEN 'EDIT'      THEN 'EDIT'
               WHEN 'VIEW'      THEN 'VIEW'
               WHEN 'NO_ACCESS' THEN 'NO_ACCESS'
               ELSE 'VIEW'
             END AS want
        FROM users
    ) AS x
   WHERE x.id = u.id
     AND u.role IS DISTINCT FROM x.want;
  GET DIAGNOSTICS n_changed = ROW_COUNT;
  IF n_changed > 0 THEN
    RAISE NOTICE 'users.role: chuan hoa % dong', n_changed;
  END IF;

  ALTER TABLE users ALTER COLUMN role SET DEFAULT 'VIEW';
  ALTER TABLE users ALTER COLUMN role SET NOT NULL;

  -- PostgreSQL không có ADD CONSTRAINT IF NOT EXISTS -> phải tự kiểm pg_constraint.
  -- Lọc theo conrelid vì tên constraint chỉ unique trong phạm vi một bảng.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'users'::regclass AND conname = 'chk_users_role'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_users_role
      CHECK (role IN ('ADMIN', 'EDIT', 'VIEW', 'NO_ACCESS'));
    RAISE NOTICE 'users.role: da them chk_users_role';
  END IF;

  -- ==========================================================
  -- 2. Cột module/plan — thang 3 mức, KHÔNG có ADMIN
  -- ==========================================================
  FOREACH col IN ARRAY module_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'users' AND column_name = col
    ) THEN
      RAISE NOTICE 'users.%: cot khong ton tai tren DB nay -> bo qua', col;
      CONTINUE;
    END IF;

    con_name := 'chk_users_' || col;

    -- %1$I: một tham số dùng lại nhiều lần. Tên cột đến từ mảng hằng viết cứng ở
    -- trên, không phải input, và vẫn qua quote_ident của %I.
    EXECUTE format($fmt$
      UPDATE users u
         SET %1$I = x.want
        FROM (
          SELECT id,
                 CASE UPPER(BTRIM(COALESCE(%1$I, '')))
                   WHEN 'EDIT'      THEN 'EDIT'
                   WHEN 'VIEW'      THEN 'VIEW'
                   WHEN 'NO_ACCESS' THEN 'NO_ACCESS'
                   WHEN 'ADMIN'     THEN 'VIEW'
                   WHEN 'FULL'      THEN 'VIEW'
                   ELSE 'NO_ACCESS'
                 END AS want
            FROM users
        ) AS x
       WHERE x.id = u.id
         AND u.%1$I IS DISTINCT FROM x.want
    $fmt$, col);
    GET DIAGNOSTICS n_changed = ROW_COUNT;
    IF n_changed > 0 THEN
      RAISE NOTICE 'users.%: chuan hoa % dong', col, n_changed;
    END IF;

    -- Khẳng định lại DEFAULT TRƯỚC khi SET NOT NULL. Bắt buộc: import-data.js và
    -- seed-test.sql INSERT mà KHÔNG liệt kê các cột plans_* / plans — không có
    -- DEFAULT thì NOT NULL biến chúng thành lỗi 23502.
    EXECUTE format($q$ALTER TABLE users ALTER COLUMN %I SET DEFAULT 'NO_ACCESS'$q$, col);
    EXECUTE format($q$ALTER TABLE users ALTER COLUMN %I SET NOT NULL$q$, col);

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'users'::regclass AND conname = con_name
    ) THEN
      EXECUTE format(
        $q$ALTER TABLE users ADD CONSTRAINT %I CHECK (%I IN ('EDIT','VIEW','NO_ACCESS'))$q$,
        con_name, col);
      RAISE NOTICE 'users.%: da them %', col, con_name;
    END IF;
  END LOOP;
END $mig$;

-- Kiểm tra sau khi chạy (phải trả về 0 dòng):
--   SELECT id, email, COALESCE(role, '<NULL>') AS role FROM users
--    WHERE role IS NULL OR role NOT IN ('ADMIN','EDIT','VIEW','NO_ACCESS');
--
--   SELECT u.id, u.email, p.col, COALESCE(p.val, '<NULL>') AS gia_tri_sai
--     FROM users u
--     CROSS JOIN LATERAL (VALUES
--       ('branches', u.branches), ('contracts', u.contracts), ('projects', u.projects),
--       ('targets', u.targets), ('business', u.business),
--       ('plans_bd', u.plans_bd), ('plans_mkt', u.plans_mkt), ('plans_qs', u.plans_qs),
--       ('plans_des', u.plans_des), ('plans_pm', u.plans_pm)
--     ) AS p(col, val)
--    WHERE p.val IS NULL OR p.val NOT IN ('EDIT','VIEW','NO_ACCESS');
--
-- Và (phải trả về 11 dòng — 12 nếu DB có cột `plans` số ít):
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'users'::regclass AND contype = 'c' AND conname LIKE 'chk_users_%'
--    ORDER BY conname;
--
-- Và (mọi dòng phải là is_nullable = 'NO' và có column_default):
--   SELECT column_name, is_nullable, column_default FROM information_schema.columns
--    WHERE table_name = 'users'
--      AND column_name IN ('role','branches','contracts','projects','targets','business',
--                          'plans_bd','plans_mkt','plans_qs','plans_des','plans_pm','plans')
--    ORDER BY column_name;
--
-- ĐƯỜNG LÙI (chỉ lùi được schema; dữ liệu lùi bằng users-permissions-before.csv):
--   DO $rb$
--   DECLARE c record;
--   BEGIN
--     FOR c IN SELECT conname FROM pg_constraint
--               WHERE conrelid = 'users'::regclass AND conname LIKE 'chk_users_%' LOOP
--       EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', c.conname);
--     END LOOP;
--     FOR c IN SELECT column_name FROM information_schema.columns
--               WHERE table_name = 'users'
--                 AND column_name IN ('role','branches','contracts','projects','targets',
--                                     'business','plans_bd','plans_mkt','plans_qs',
--                                     'plans_des','plans_pm','plans') LOOP
--       EXECUTE format('ALTER TABLE users ALTER COLUMN %I DROP NOT NULL', c.column_name);
--     END LOOP;
--   END $rb$;
