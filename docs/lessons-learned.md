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

