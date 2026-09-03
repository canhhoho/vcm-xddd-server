# 📚 Lessons Learned – Nhật ký tri thức tích lũy

> **SSOT** cho bài học rút ra qua từng phiên làm việc.
> Được cập nhật tự động qua skill `session-end`.
> Agent đọc file này khi bắt đầu phiên mới để không lặp lại lỗi cũ.

---

## Hướng dẫn đọc

| Biểu tượng | Loại bài học |
|-------------|-------------|
| 🐛 | Bug đã sửa |
| 🏗️ | Quyết định thiết kế |
| 📐 | Pattern hữu ích |
| ⚠️ | Bẫy cần tránh (Gotcha) |

---

## 📅 2026-03-20 | Phiên: Setup 6-Layer Agent Framework

### 🏗️ Design Decisions

- **Quyết định**: Sử dụng `.agent/` thay vì `.agents/` hoặc `.clauderc`
  - **Lý do**: `.agent/` là convention được Antigravity auto-detect cho cả rules và workflows
  - **Alternatives loại**: `.clauderc` (Claude-specific, không cross-platform), `_agent/` (underscore prefix)

- **Quyết định**: Skills dùng YAML frontmatter (`name` + `description`) trong SKILL.md
  - **Lý do**: Antigravity scan thư mục `skills/` và đọc frontmatter để nhận diện năng lực
  - **Ảnh hưởng**: Mọi skill mới phải tuân theo format này

- **Quyết định**: Tách riêng `antigravity-rules.md` (quick-ref) và `.agent/rules.md` (full rules)
  - **Lý do**: Quick-ref cho người dùng tra cứu nhanh, full rules cho Agent tự đọc

### 📐 Patterns

- **Pattern**: Cấu trúc output có `sources` field bắt buộc
  - **Use case**: Mọi tính toán (đơn giá, khối lượng) phải ghi rõ file nguồn, sheet, dòng
  - **Ví dụ**: `"sources": {"norm_file": "dinh_muc_2024.xlsx", "sheet": "Sheet1", "row": 15}`

- **Pattern**: Workflow với `// turbo` annotation
  - **Use case**: Đánh dấu các bước an toàn để auto-run mà không cần user approval
  - **Lưu ý**: Chỉ dùng cho lệnh không có side-effect (read-only, dev server)

### ⚠️ Gotchas

- **Bẫy**: BOQ Myanmar thường có merged cells → parser cần xử lý đặc biệt
  - **Context**: Khi dùng skill `parse-myanmar-boq`
  - **Workaround**: Luôn xác nhận format với user trước khi parse tự động

- **Bẫy**: Revit API breaking changes giữa các version
  - **Context**: Khi upgrade Revit Add-in
  - **Workaround**: Check [revitapidocs.com](https://www.revitapidocs.com/) trước khi upgrade

---

> _Các phiên tiếp theo sẽ được append bên dưới bởi skill `session-end`._

---

## 📅 2026-06-05 | Phiên: Fix TypeScript Build Errors (ProjectLogTab + GasApiService)

### 🐛 Bugs đã sửa

- **Bug**: 15 lỗi `TS7006: Parameter implicitly has an 'any' type` trong `ProjectLogTab.tsx`
  - **Nguyên nhân gốc**: TypeScript strict mode không thể infer type cho arrow function params khi context là `any[]` (ví dụ: `.forEach((log, index) => sheetData.push([...]))`). `sheetData` là `any[][]` nên TypeScript mất khả năng infer ngược.
  - **Fix**: Annotate explicit `: ProjectLog` và `: number` cho tất cả callback params
  - **Bài học**: Khi export function, callback trong context `any[]` → **luôn annotate type tường minh**

- **Bug**: Lỗi `TS2420: Class 'GasApiService' incorrectly implements interface 'IApiService'`
  - **Nguyên nhân gốc**: Thêm 3 methods vào `IApiService` và `RestApiService` cho feature `ProjectLog`, nhưng **quên cập nhật `GasApiService`**
  - **Fix**: Thêm `getProjectLogs`, `upsertProjectLog`, `deleteProjectLog` vào `api.gas.ts`
  - **Bài học**: Interface contract bắt buộc cả hai implementation. Xem quy trình trong `frontend-patterns.md`

### ⚠️ Gotchas

- **Bẫy `any[]` context**: Khi `sheetData: any[][]` và dùng `.forEach((log, index) => sheetData.push([index, log.date]))`, TypeScript strict mode sẽ lỗi vì không infer được type của `log` và `index`.
  - **Workaround**: Annotate explicit `(log: ProjectLog, index: number)` — không cần refactor logic

- **Bẫy dual-implementation**: `IApiService` có 2 class implement: `RestApiService` (REST) và `GasApiService` (Google Apps Script / mock). Khi thêm method mới vào interface, **cả hai đều phải implement** — TypeScript không báo lỗi cho REST nếu GAS thiếu cho đến khi build.

### 📐 Patterns hữu ích

- **Pattern tsc --noEmit**: Chạy `npx tsc --noEmit` trước khi `npm run build` để kiểm tra TypeScript nhanh (không mất thời gian bundle). Giúp detect lỗi type trong vài giây thay vì chờ 60 giây build Vite.

- **Pattern checklist khi thêm API method mới**:
  1. `api.interface.ts` → khai báo contract
  2. `api.rest.ts` → REST implementation  
  3. `api.gas.ts` → GAS/mock implementation  
  4. `tsc --noEmit` → verify không lỗi


---

## 📅 2026-09-02 | Phiên: Review & fix tab User Permissions

### 🐛 Bugs đã sửa

- **Bug**: Filter "Chức danh" chọn "Tất cả" làm trắng cả tab Người dùng và tab Phân quyền
  - **Nguyên nhân gốc**: `<Select.Option value="ALL">` gửi sentinel `'ALL'` (truthy), nhưng điều kiện lọc chỉ là `!selectedPosition || u.positionId === selectedPosition` → không dòng nào có `positionId === 'ALL'`
  - **Fix**: helper `noFilter(v) => !v || v === 'ALL'` trong `UserManagement.tsx`, dùng ở mọi điều kiện lọc + `value={noFilter(x) ? undefined : x}` trên Select
  - **Bài học**: `value="ALL"` là **quy ước sẵn có của repo** (xem `Branches.tsx:229-257`). Thêm Select filter mới thì phải xử lý sentinel này ở CẢ predicate lẫn prop `value`, không chỉ dựa vào `allowClear`

- **Bug**: Filter "Nhóm" không khớp một dòng nào
  - **Nguyên nhân gốc**: dropdown lấy option từ `APP_CONFIG.GROUPS` = UPPERCASE (`LEADER`, `BUSINESS`…) còn DB lưu lowercase/PascalCase (`leader`, `Leadership`, `Business`) hoặc nhãn tiếng Việt. So sánh `===` thô → 0 kết quả
  - **Fix**: `normalizeCategory()` (lowercase + bảng alias) gọi ở **cả hai đầu** mọi phép so sánh
  - **Bài học**: `positions.category` không có CHECK constraint và hiện có 10 giá trị khác nhau cho 6 nhóm. Mọi so sánh category phải normalize, đừng bao giờ `===` trực tiếp

- **Bug**: `PUT /api/permissions` trả `{success:true}` khi không ghi được dòng nào
  - **Nguyên nhân gốc**: `p.userId` sai/undefined → node-pg gửi `NULL` → `WHERE id = NULL` khớp 0 dòng; route không kiểm `rowCount`. Vòng `for` cũng chạy N `UPDATE` rời rạc không transaction
  - **Fix**: `getClient()` + `BEGIN/COMMIT/ROLLBACK`, validate `userId`, `rowCount === 0` → 404
  - **Bài học**: Cùng một bẫy đã ghi ở `.claude/rules/route-ordering.md`. **Mọi route ghi theo vòng lặp phải kiểm `rowCount` và bọc transaction** — không thì UI báo "Đã lưu" trong khi DB không đổi

- **Bug**: Refetch nền xoá sạch ô quyền đang chỉnh mà nút Lưu vẫn sáng
  - **Nguyên nhân gốc**: `useState([])` + `useEffect(() => setLocalPermissions(modulePermissions), [modulePermissions])`. Mọi `invalidateQueries(PERMISSION_KEYS.all)` (create/update/delete user) ghi đè bản đang sửa
  - **Fix**: bản nháp **nullable** — `useState<T[] | null>(null)`, `rows = draft ?? serverData`, `dirty = draft !== null`, `setDraft(null)` sau khi lưu. Bỏ hẳn `useEffect`
  - **Bài học**: Đừng copy server-state vào local state bằng effect. Dùng draft nullable: không effect nào ghi đè được, và `dirty` suy ra thay vì phải giữ đồng bộ tay

### ⚠️ Gotchas

- **`ADMIN` ở cột module/plan là quyền YẾU HƠN `EDIT`**: `moduleAccess.js:78` và `planAccess.js:126,153` chặn mọi ghi khi giá trị `!== 'EDIT'`, nên `contracts='ADMIN'` chỉ đọc được. Đã tách `ROLE_LEVELS` (có ADMIN, cho cột `role`) và `ACCESS_LEVELS` (3 mức, cho cột module/plan) ở `users.js` + `permissions.js`.

- **`role` bypass toàn bộ ma trận quyền**: user `role='ADMIN'` đi qua hết `moduleAccess.js:70`, `planAccess.js:134`, `projectMemberAccess.js:87`. Trước đây `GET /permissions` không trả `role` nên admin nhìn 10 cột `NO_ACCESS` và tin là đã khoá. Đã thêm cột Vai trò read-only + tooltip cảnh báo.

- **`users.category` của `u_admin` đang bị mojibake trong DB**: lưu literal `'LÃ£nh Ä‘áº¡o'` thay vì `'Lãnh đạo'` (UTF-8 bị decode như latin1 rồi encode lại). `server_encoding` và `client_encoding` đều UTF8 → lỗi nằm ở dữ liệu, không phải kết nối. Hệ quả: user **không có `position_id`** sẽ không khớp filter Nhóm nào, vì `GET /users` chỉ `COALESCE(NULLIF(p.category,''), u.category)`. Chưa sửa (cần UPDATE dữ liệu).

- **`moduleAccess`/`planAccess` fail-open với giá trị lạ**: cả hai chỉ chặn khi `=== 'NO_ACCESS'`, nên chuỗi như `'FULL'` (đang có trong `seed-test.sql:25`) được coi là **đọc được**. Cột quyền không có CHECK constraint nào nên mọi đường ghi ngoài 2 route đều nhét được giá trị bất kỳ. Chưa sửa.

- **Bề rộng cột của ma trận quyền**: nhóm 3 nút "Sửa/Xem/Không" đo được **109.8px** ở `font-size: 11px`. Cộng padding ô 8px×2 của antd `size="small"` là cần ~126px — nên `width: 115` cũ vẫn khiến nút xuống dòng và mỗi hàng cao gấp đôi (48px thay vì 24px). Đã bóp padding còn 2px (`.perm-cell`) + `PERM_COL_WIDTH = 116`. Đổi nhãn i18n của `common.edit/view/no` thì phải đo lại.

### 📐 Patterns hữu ích

- **Suy ra type key quyền từ chính interface** thay vì `string[]`:
  ```ts
  type ModuleKey = { [K in keyof ModulePermission]-?:
      ModulePermission[K] extends ModuleAccess | undefined ? K : never }[keyof ModulePermission];
  ```
  Viết sai một key trong `MODULE_GROUPS` là build đỏ ngay, thay vì lặng lẽ gửi cột không tồn tại lên `PUT /permissions`.

- **Cảnh báo lint là bug thật, đừng `eslint-disable`**: tab "Chức danh" từng biến mất khỏi UI vì bị gỡ khỏi `items` trong khi handler vẫn còn, và cảnh báo "biến không dùng" bị dập bằng `eslint-disable` thay vì xoá code. Link `?tab=positions` ra vùng trắng suốt thời gian đó.

- **Đừng dùng `npx tsc --noEmit`** (trái với ghi chú ở phiên 2026-06-05): `build` chạy `tsc -b`, và `-b` bắt được lỗi mà `--noEmit` bỏ qua. Xem CLAUDE.md.

---

## 📅 2026-09-03 | Phiên: Bịt fail-open tầng phân quyền + CHECK constraint cột quyền

### 🐛 Bugs đã sửa

- **Bug**: Giá trị lạ ở cột quyền được cấp quyền ĐỌC trên gần như toàn bộ API
  - **Nguyên nhân gốc**: ba middleware kiểm quyền đọc bằng **deny-list** `if (level === 'NO_ACCESS') return 403`. Mọi chuỗi khác `NO_ACCESS` — `'FULL'`, `'READ'`, `'x'` — đều lọt. `seed-test.sql:25` đang ghi `'FULL'` thật nên đây là lỗ **có dữ liệu kích hoạt**, không phải giả thuyết.
  - **Fix**: `server/src/services/accessLevels.js` — `canRead`/`canWrite`/`normalizeAccess`/`isAdminRole` dùng **allow-list**. Thay cả 4 bản cài đặt độc lập ở `moduleAccess`, `planAccess`, `projectMemberAccess`, `notifications`.
  - **Bài học**: cổng phân quyền phải hỏi "giá trị này CÓ trong danh sách được phép không", không bao giờ hỏi "có phải giá trị bị cấm không". Deny-list mặc định là fail-open.

- **Bug**: `rbac()` không tham số cho **mọi user đã đăng nhập** đi qua
  - **Nguyên nhân gốc**: `rbac.js:20` `if (allowed.length === 0) return next()` — một cổng mở toang trông y như đang bảo vệ.
  - **Fix**: `throw` ngay lúc mount. An toàn vì cả 4 call site đều truyền `['ADMIN']`.
  - **Bài học**: lỗi cấu hình phân quyền phải làm server chết lúc khởi động, không được degrade thành "cho qua".

- **Bug**: ma trận Phân quyền hiện `EDIT` cho cột đang là `ADMIN`, bấm Lưu là **nâng quyền thật**
  - **Nguyên nhân gốc**: `permissions.js` có bản `readAccess` riêng map `ADMIN → EDIT`, trong khi server enforce `ADMIN` ở cột module = chỉ đọc. UI nói dối, rồi cú Lưu tiếp theo biến lời nói dối thành sự thật trong DB.
  - **Fix**: dùng chung `normalizeAccess` (`ADMIN`/`FULL` → `VIEW`).
  - **Bài học**: endpoint hiển thị quyền và middleware thực thi quyền **phải gọi cùng một hàm**. Hai bản quy đổi song song là lỗi im lặng chờ ngày nổ.

### ⚠️ Gotchas

- **`CHECK (col IN (...))` KHÔNG chặn được NULL.** Với `col IS NULL` biểu thức trả NULL, và Postgres coi NULL là *không vi phạm* → pass. `NOT NULL` mới là thứ chặn NULL. Thứ tự bắt buộc: UPDATE chuẩn hoá → `SET DEFAULT` → `SET NOT NULL` → `ADD CONSTRAINT`.
- **`SET DEFAULT` phải đứng trước `SET NOT NULL`.** `import-data.js` và `seed-test.sql` INSERT mà không liệt kê các cột `plans_*`; thiếu DEFAULT là mọi INSERT nổ `23502`.
- **PostgreSQL không có `ADD CONSTRAINT IF NOT EXISTS`.** Phải bọc `DO $$` kiểm `pg_constraint` (lọc theo `conrelid` vì tên constraint chỉ unique trong phạm vi một bảng).
- **`RAISE NOTICE` biến mất khi chạy qua `run-migration.js`.** node-pg đưa NOTICE qua event `notice` của Client và script không gắn listener → im lặng hoàn toàn. Đã thêm listener; trước đó phải dùng `psql -f` mới thấy.
- **`init-db.sql` lỗi = rollback TOÀN BỘ file của lần boot đó.** `autoCreateTables()` gửi cả file trong một `query()` → một transaction, và `catch` chỉ `console.error` rồi cho boot tiếp. Trên DB cài mới hậu quả là **không có bảng nào** mà chỉ để lại một dòng log. Vì thế khối ràng buộc trong `init-db.sql` phải bọc `EXCEPTION WHEN others THEN RAISE WARNING` (subtransaction) — nhưng bản migration rời thì **không** bọc, để lỗi nổ ra và `run-migration.js` trả exit 1.
- **`'FULL'`/`'ADMIN'` ở cột module quy về `VIEW`, không phải `EDIT`.** Đó đúng là quyền chúng đang có hôm nay (đọc được, ghi không). Quy sang `EDIT` là để migration tự động **nâng quyền** cho người admin chưa bao giờ chủ ý cấp. Nhờ chọn `VIEW` mà thứ tự "migrate trước, restart sau" đạt zero-downtime.
- **`role` rác quy về `VIEW`, không phải `NO_ACCESS`.** `App.tsx` xoá localStorage và đẩy về `/login` khi `role='NO_ACCESS'` → user tự khoá ngoài. Fail-closed ở trục *quyền truy cập*, không fail-closed ở trục *tồn tại tài khoản*.

### 📐 Patterns hữu ích

- **Một hàm thuần cho mọi quyết định phân quyền.** `services/accessLevels.js` không phụ thuộc Express nên cả `middleware/` lẫn `routes/` import được, không require vòng tròn — và test được bằng `node -e` trong một dòng, không cần DB hay server.
- **Chứng minh thay đổi phân quyền bằng bảng so sánh cũ/mới**, không chỉ chạy test suite: dựng lại logic cũ (deny-list) cạnh logic mới rồi chạy cùng một tập giá trị. Đợt này cho ra con số đắt giá — **10/12 giá trị hành vi không đổi, đúng 2 giá trị bị siết** — thứ mà "45 tests passed" không nói được.
- **Vòng lặp `FOREACH ... IN ARRAY` + `format('%1$I')` cho migration nhiều cột giống nhau.** 12 cột × 4 lệnh viết tay là 48 câu và gần như chắc chắn sai một tên cột; vòng lặp cũng làm guard `information_schema` cho cột deprecated trở thành `CONTINUE` một dòng.
