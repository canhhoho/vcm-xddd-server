-- VCM XDDD — Test Seed Data for Local Development
-- Run after init-db.sql to populate with sample data

-- Positions (with proper names — simulating what GAS has)
INSERT INTO positions (id, name, code, default_role, category, description) VALUES
  ('pos-001', 'Giám đốc', 'GD', 'ADMIN', 'leader', 'Giám đốc công ty'),
  ('pos-002', 'Phó giám đốc', 'PGD', 'ADMIN', 'leader', 'Phó giám đốc'),
  ('pos-003', 'Trưởng phòng kỹ thuật', 'TPKT', 'EDIT', 'construction', 'Trưởng phòng kỹ thuật'),
  ('pos-004', 'Kỹ sư xây dựng', 'KSXD', 'EDIT', 'construction', 'Kỹ sư xây dựng'),
  ('pos-005', 'Nhân viên kinh doanh', 'NVKD', 'VIEW', 'business', 'Nhân viên kinh doanh'),
  ('pos-006', 'Kế toán', 'KT', 'VIEW', 'other', 'Kế toán'),
  ('pos-007', 'QS Engineer', 'QS', 'EDIT', 'qs', 'Quantity Surveyor'),
  ('pos-008', 'Quản lý dự án', 'QLDA', 'EDIT', 'project', 'Quản lý dự án')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, code=EXCLUDED.code, category=EXCLUDED.category, description=EXCLUDED.description;

-- Branches
INSERT INTO branches (id, name, code) VALUES
  ('br-ygn', 'Yangon', 'YGN'),
  ('br-mdy', 'Mandalay', 'MDY'),
  ('br-npt', 'Naypyidaw', 'NPT')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, code=EXCLUDED.code;

-- Users (password: vcm123 hashed with bcrypt)
INSERT INTO users (id, email, password, name, position_id, position_code, position_name, category, description, role, branches, contracts, projects, targets, business) VALUES
  ('u-admin', 'admin@vcm.com', '$2b$10$XKxH.PXqV4JiG5u5c8Vy8.1QPfWm4wV5oXu5dK.xKBNQBCxA8CjWq', 'Admin User', 'pos-001', 'GD', 'Giám đốc', 'leader', 'Giám đốc', 'ADMIN', 'FULL', 'FULL', 'FULL', 'FULL', 'FULL'),
  ('u-user1', 'user1@vcm.com', '$2b$10$XKxH.PXqV4JiG5u5c8Vy8.1QPfWm4wV5oXu5dK.xKBNQBCxA8CjWq', 'Nguyen Van A', 'pos-003', 'TPKT', 'Trưởng phòng kỹ thuật', 'construction', 'Kỹ thuật', 'EDIT', 'VIEW', 'EDIT', 'EDIT', 'VIEW', 'VIEW'),
  ('u-user2', 'user2@vcm.com', '$2b$10$XKxH.PXqV4JiG5u5c8Vy8.1QPfWm4wV5oXu5dK.xKBNQBCxA8CjWq', 'Tran Thi B', 'pos-005', 'NVKD', 'Nhân viên kinh doanh', 'business', 'Kinh doanh', 'VIEW', 'VIEW', 'VIEW', 'VIEW', 'VIEW', 'VIEW')
ON CONFLICT (id) DO NOTHING;

-- Contracts
INSERT INTO contracts (id, code, name, branch_id, business_field, value, status, start_date, end_date) VALUES
  ('c-001', 'CT-2026-001', 'Dự án xây dựng tòa nhà A', 'br-ygn', 'CONSTRUCTION', 500000000, 'IN_PROGRESS', '2026-01-15', '2026-12-30'),
  ('c-002', 'CT-2026-002', 'Cải tạo văn phòng B', 'br-mdy', 'RENOVATION', 200000000, 'TODO', '2026-02-01', '2026-06-30'),
  ('c-003', 'CT-2026-003', 'Hạ tầng viễn thông C', 'br-ygn', 'TELECOM', 800000000, 'IN_PROGRESS', '2026-03-01', '2026-11-30')
ON CONFLICT (id) DO NOTHING;

-- Invoices
INSERT INTO invoices (id, contract_id, invoice_number, value, payment, issued_date) VALUES
  ('inv-001', 'c-001', 'INV-001', 150000000, 150000000, '2026-02-15'),
  ('inv-002', 'c-001', 'INV-002', 100000000, 0, '2026-03-15'),
  ('inv-003', 'c-003', 'INV-003', 300000000, 200000000, '2026-03-20')
ON CONFLICT (id) DO NOTHING;

-- Targets (simulate the GAS data — some with empty names, some with branch codes)
INSERT INTO targets (id, name, type, period_type, period, unit_type, unit_id, target_value) VALUES
  ('t-001', NULL, 'NGUON_VIEC', 'YEAR', '2026', 'GENERAL', '', 500),
  ('t-002', NULL, 'DOANH_THU', 'YEAR', '2026', 'GENERAL', '', 400),
  ('t-003', NULL, 'THU_TIEN', 'YEAR', '2026', 'GENERAL', '', 300),
  ('t-004', NULL, 'NGUON_VIEC', 'QUARTER', '2026-Q1', 'GENERAL', '', 150),
  ('t-005', NULL, 'DOANH_THU', 'MONTH', '2026-03', 'GENERAL', '', 50),
  ('t-006', NULL, 'NGUON_VIEC', 'YEAR', '2026', 'BRANCH', 'YGN', 200),
  ('t-007', '', 'DOANH_THU', 'YEAR', '2026.0', 'BRANCH', 'MDY', 150),
  ('t-008', '', 'NGUON_VIEC', 'YEAR', '', 'GENERAL', '', 100)
ON CONFLICT (id) DO NOTHING;

-- Activities
INSERT INTO activities (id, email, action, description) VALUES
  ('act-001', 'admin@vcm.com', 'LOGIN', 'User logged in'),
  ('act-002', 'admin@vcm.com', 'CREATE_CONTRACT', 'Created contract CT-2026-001')
ON CONFLICT (id) DO NOTHING;
