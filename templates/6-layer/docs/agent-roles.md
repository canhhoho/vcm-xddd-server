# 🤖 Agent Roles – {{PROJECT_NAME}}

> **Layer 4 – Agents**: Phân vai và điều phối Agent.
> Mỗi Agent có trách nhiệm rõ ràng, không chồng chéo.

---

## Cấu trúc team: {{TEAM_STRUCTURE}}

---

## Agent chính

### 🎯 Main Agent (Mặc định)
- **Vai trò**: Agent đa năng, xử lý mọi task khi chưa cần chuyên biệt hóa
- **Trách nhiệm**:
  - Phân tích yêu cầu, lập plan
  - Viết code, debug
  - Tạo tài liệu
  - Chạy verification
- **File phải đọc khi khởi tạo**:
  1. `antigravity-rules.md`
  2. `docs/active-tasks.md`
  3. `docs/architecture.md`
  4. `docs/lessons-learned.md`

---

## Agent chuyên biệt (Kích hoạt khi cần)

{{SPECIALIZED_AGENTS}}

---

## Quy tắc điều phối

1. **Mặc định dùng Main Agent** — chỉ kích hoạt Agent chuyên biệt khi task thuộc chuyên môn rõ ràng
2. **Handoff rõ ràng** — Agent chuyển giao phải ghi rõ context trong `docs/active-tasks.md`
3. **Không duplicate work** — kiểm tra `active-tasks.md` trước khi bắt đầu
4. **Tuân thủ rules** — mọi Agent đều phải đọc `.agent/rules.md` trước khi làm việc
