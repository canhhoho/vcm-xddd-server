# 📋 Active Tasks – Bảng theo dõi công việc đang chạy

> **SSOT** cho trạng thái công việc. Cập nhật liên tục mỗi phiên.
> Agent đọc file này đầu tiên khi khởi tạo.

---

## Hướng dẫn sử dụng

| Ký hiệu | Trạng thái |
|----------|------------|
| `[ ]` | Chưa bắt đầu |
| `[/]` | Đang thực hiện |
| `[x]` | Hoàn thành |
| `[!]` | Blocked / Cần xử lý |

---

## Công việc hiện tại

### 🔵 VCM Web App
- [x] Fix i18n dashboard (chart labels, duplicate keys)
- [x] Deploy changes (contract dedup, invoice export i18n, dashboard i18n)
- [x] Deploy Google Apps Script Web App lên Ubuntu Server
- [ ] _Thêm task mới tại đây..._

### 🟢 Revit Add-in (HVC Tools)
- [x] Rebrand QTOAddin → "HVC Tools – Made by Cavaho"
- [x] Tạo installer (.exe)
- [ ] _Thêm task mới tại đây..._

### 🟡 Server Infrastructure
- [x] Setup Ubuntu Server 24.04 simulator (hardware, network, partitioning)
- [x] Mô phỏng cài đặt 11 software packages
- [ ] _Thêm task mới tại đây..._

### 🤖 Google Antigravity Framework
- [/] Setup 6-layer agent framework
- [ ] Kết nối MCP servers (PostgreSQL, Node.js API)
- [ ] _Thêm task mới tại đây..._

---

## Backlog (Chờ xử lý)

- [ ] Viết unit tests cho module tính toán dự toán
- [ ] Nghiên cứu Oracle → PostgreSQL migration path
- [ ] _Thêm backlog tại đây..._

---

> **Quy tắc**: Mỗi khi bắt đầu hoặc kết thúc task, cập nhật file này.
> Agent cuối phiên chạy `session-end` sẽ tự nhắc cập nhật.
