# 🔌 MCP Integration Guide – Hướng dẫn kết nối MCP

> Kết nối Agent với dữ liệu live thông qua Model Context Protocol.
> Nguyên tắc: **Không copy-paste schema** – kết nối trực tiếp.

---

## MCP là gì?

**Model Context Protocol (MCP)** cho phép Agent truy cập trực tiếp vào database, file system, API… mà không cần user copy-paste context. Đây là cách triển khai nguyên tắc **SSOT** (Single Source of Truth) – Agent luôn lấy dữ liệu mới nhất, chính xác nhất.

---

## Các MCP Server cần kết nối

### 1. PostgreSQL Database
- **Mục đích**: Truy vấn schema, xem dữ liệu live, viết migration
- **Cấu hình**: Kết nối tới `vcm-app-db-node-02` (10.201.42.65)
- **Cách dùng trong Antigravity**:
  ```json
  {
    "mcpServers": {
      "postgres": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres"],
        "env": {
          "DATABASE_URL": "postgresql://user:password@10.201.42.65:5432/vcm_db"
        }
      }
    }
  }
  ```
- **Lưu ý**: Thay `user`, `password`, `vcm_db` bằng giá trị thật

### 2. File System (Workspace)
- **Mục đích**: Agent đọc/ghi file dự án, BOQ data, config
- **Cấu hình**: Đã tích hợp sẵn trong Antigravity
- **Scope**: Workspace `d:\1. CONG VIEC\4. IT\`

### 3. GitHub/Git (Tùy chọn)
- **Mục đích**: Truy cập code repository, PR history, issues
- **Cấu hình**:
  ```json
  {
    "mcpServers": {
      "github": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": {
          "GITHUB_TOKEN": "<personal-access-token>"
        }
      }
    }
  }
  ```

---

## Nguyên tắc sử dụng MCP

### ✅ Nên
- Query schema trực tiếp thay vì hỏi user mô tả
- Kiểm tra dữ liệu live khi đối chiếu chéo kết quả tính toán
- Dùng MCP tools (list_resources, read_resource) để khám phá database

### ❌ Không nên
- Copy-paste schema output vào docs (vi phạm SSOT)
- Cache kết quả query quá lâu (dữ liệu có thể thay đổi)
- Chạy write query mà không có user approval

---

## Cách kiểm tra MCP đang hoạt động

1. Gọi `list_resources` với tên server
2. Nếu trả về danh sách resources → kết nối thành công
3. Nếu lỗi → kiểm tra:
   - Server MCP đã cài chưa?
   - Connection string đúng chưa?
   - Firewall cho phép kết nối chưa?

---

## Lộ trình kết nối

| Giai đoạn | Server | Trạng thái |
|-----------|--------|------------|
| Phase 1 | File System | ✅ Sẵn sàng |
| Phase 2 | PostgreSQL | ⏳ Chờ cấu hình |
| Phase 3 | GitHub | ⏳ Tùy chọn |
| Phase 4 | Custom API (Node.js) | 📋 Kế hoạch |
