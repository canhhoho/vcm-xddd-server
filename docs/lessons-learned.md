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
