/**
 * VCM XDDD - App Configuration
 * Port of APP_CONFIG from Config.gs
 */

const APP_CONFIG = {
  VERSION: '1.0.0-server',

  // Business Types
  BUSINESS_TYPES: ['B2B', 'B2C'],

  // Contract/Project Status
  STATUS: {
    TODO: 'Chưa thực hiện',
    IN_PROGRESS: 'Đang thực hiện',
    DONE: 'Hoàn thành'
  },

  // Fixed Positions with Metadata
  POSITIONS: [
    { code: 'DIRECTOR', name: 'Giám đốc', color: '#E11D2E', icon: 'CrownOutlined' },
    { code: 'DEPUTY_DIRECTOR', name: 'Phó Giám đốc', color: '#1890ff', icon: 'SafetyCertificateOutlined' },
    { code: 'MANAGER', name: 'Trưởng phòng', color: '#52c41a', icon: 'TeamOutlined' },
    { code: 'DEPUTY_MANAGER', name: 'Phó phòng', color: '#722ed1', icon: 'UsergroupAddOutlined' },
    { code: 'LEADER', name: 'Quản lý', color: '#fa8c16', icon: 'SolutionOutlined' },
    { code: 'STAFF', name: 'Nhân viên', color: '#595959', icon: 'UserOutlined' }
  ],

  // Professional Groups
  GROUPS: ['Lãnh đạo', 'Xây dựng', 'Kinh doanh', 'QS', 'Dự án', 'Khác'],

  // Standard Action Buttons
  ACTIONS: {
    VIEW: { code: 'VIEW', label: 'Chi tiết', icon: 'EyeOutlined', color: '#52c41a', backgroundColor: '#f6ffed' },
    EDIT: { code: 'EDIT', label: 'Chỉnh sửa', icon: 'EditOutlined', color: '#1890ff', backgroundColor: '#e6f7ff' },
    DELETE: { code: 'DELETE', label: 'Xóa', icon: 'DeleteOutlined', color: '#ff4d4f', backgroundColor: '#fff1f0' }
  },

  // Time Periods
  PERIODS: {
    MONTHS: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    QUARTERS: ['Q1', 'Q2', 'Q3', 'Q4']
  },

  // Project Item Types (predefined)
  PROJECT_ITEM_TYPES: [
    { id: 'THI_CONG', name: 'Thi công', order: 1 },
    { id: 'HO_SO_CHAT_LUONG', name: 'Hồ sơ chất lượng', order: 2 },
    { id: 'HO_SO_THANH_TOAN', name: 'Hồ sơ thanh toán', order: 3 },
    { id: 'KHAC', name: 'Khác', order: 4 }
  ],

  // File Folders
  FOLDERS: {
    CONTRACT_FILES: 'contracts',
    INVOICE_FILES: 'invoices'
  }
};

module.exports = APP_CONFIG;
