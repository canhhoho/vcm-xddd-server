-- ============================================================
-- Seed: 14 Myanmar Branches (Default Data)
-- ============================================================
INSERT INTO branches (id, name, code) VALUES
  ('1',  'Ayeyarwady & Rakhine',  'AYY&RKE'),
  ('2',  'East Bago',             'EBG'),
  ('3',  'East Shan',             'ESH'),
  ('4',  'Kachin',                'KCN'),
  ('5',  'Kayin',                 'KYN'),
  ('6',  'Magway',                'MGY'),
  ('7',  'Mandalay & Sagaing',    'MDY&SGG'),
  ('8',  'Mon',                   'MON'),
  ('9',  'Naypyidaw',             'NPW'),
  ('10', 'North Shan',            'NSH'),
  ('11', 'South Shan',            'SSH'),
  ('12', 'Tanintharyi',           'TNI'),
  ('13', 'West Bago',             'WBG'),
  ('14', 'Yangon',                'YGN')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Seed: Default Admin User (password: vcm123 SHA-256 hashed)
-- ============================================================
INSERT INTO users (id, email, password, name, position_code, position_name, category, role, branches, contracts, projects, targets, business)
VALUES (
  'u_admin',
  'admin@vcm.com',
  -- SHA-256 of 'vcm123'
  '63441a9df064ec1b993fa68652a6139161a49892084f39272b71fd20bee8e20b',
  'System Admin',
  'ADMIN',
  'Quản trị hệ thống',
  'Lãnh đạo',
  'ADMIN',
  'EDIT', 'EDIT', 'EDIT', 'EDIT', 'EDIT'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Seed: Default Positions
-- ============================================================
INSERT INTO positions (id, name, code, default_role, category, description) VALUES
  ('pos_001', 'Giám đốc',    'GD',  'ADMIN', 'Lãnh đạo',   'Giám đốc điều hành'),
  ('pos_002', 'Phó Giám đốc','PGD', 'ADMIN', 'Lãnh đạo',   'Hỗ trợ Giám đốc điều hành'),
  ('pos_003', 'Trưởng phòng', 'TP',  'EDIT',  'Xây dựng',   'Trưởng phòng ban'),
  ('pos_004', 'Phó phòng',    'PP',  'EDIT',  'Xây dựng',   'Phó phòng ban'),
  ('pos_005', 'Quản lý',      'QL',  'EDIT',  'Dự án',      'Quản lý dự án'),
  ('pos_006', 'Nhân viên',    'NV',  'VIEW',  'Kinh doanh', 'Nhân viên')
ON CONFLICT (id) DO NOTHING;
