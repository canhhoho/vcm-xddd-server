# 🚀 {{PROJECT_NAME}} – Quick Reference Card

> Tóm tắt 6 lớp vận hành Agent. Đọc chi tiết tại `.agent/rules.md` và `docs/`.

---

## Tổng quan 6 Lớp

| # | Lớp | Mục đích | File chính |
|---|-----|----------|------------|
| 1 | **Rules** (Luật) | Kỷ luật & tiêu chuẩn | `.agent/rules.md` |
| 2 | **Memory** (Bộ nhớ) | Quản trị tri thức SSOT | `docs/architecture.md`, `docs/active-tasks.md` |
| 3 | **Skills** (Kỹ năng) | Năng lực chuyên biệt | `skills/*/SKILL.md` |
| 4 | **Agents** (Tác tử) | Phân vai & điều phối | `docs/agent-roles.md` |
| 5 | **Verification** (Kiểm chứng) | Bằng chứng vật lý | `.agent/workflows/verify-task.md` |
| 6 | **Evolution** (Tiến hóa) | Tích lũy tri thức | `docs/lessons-learned.md`, `skills/session-end/` |

---

## Nguyên tắc cốt lõi

```
🎯 Truth over Speed – Sự thật hơn Tốc độ
📐 PLAN → REVIEW → CODE → VERIFY → REPORT
🔗 Single Source of Truth – Không duplicate dữ liệu
🧪 No verification = No "Done"
📚 Mỗi phiên phải tạo ra thặng dư tri thức
```

---

## Checklist khi bắt đầu phiên mới

1. ☐ Đọc `docs/active-tasks.md` – biết đang làm gì
2. ☐ Đọc `docs/lessons-learned.md` – không lặp lỗi cũ
3. ☐ Đọc `docs/architecture.md` – hiểu kiến trúc
4. ☐ Check Agent roles – đúng Agent làm đúng việc

## Checklist khi kết thúc phiên

1. ☐ Cập nhật `docs/active-tasks.md`
2. ☐ Chạy skill `/session-end` để trích xuất bài học
3. ☐ Review `docs/lessons-learned.md` đã cập nhật
