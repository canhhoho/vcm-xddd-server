export type UserRole = 'ADMIN' | 'EDIT' | 'VIEW' | 'NO_ACCESS';
export type ModuleAccess = 'EDIT' | 'VIEW' | 'NO_ACCESS';

export interface ModulePermission {
    userId: string;
    userName?: string;
    contracts: ModuleAccess;
    projects: ModuleAccess;
    targets: ModuleAccess;
    business: ModuleAccess;
    branches: ModuleAccess;
    plans_bd: ModuleAccess;
    plans_mkt: ModuleAccess;
    plans_qs: ModuleAccess;
    plans_des: ModuleAccess;
    plans_pm: ModuleAccess;
}

export interface Position {
    id: string;
    name: string;
    code: string;
    defaultRole: UserRole;
    category: string;
    description?: string;
    createdAt: string;
}

export interface User {
    id: string;
    email: string;
    name: string;
    positionCode?: string;
    positionId?: string;
    positionName?: string;
    category?: string;
    description?: string;
    role?: UserRole;
}

export interface Contract {
    id: string;
    code: string;
    name: string;
    provinceId: string;
    businessField: 'ALL' | 'B2B' | 'B2C';
    // `value` là số ĐÃ GỒM THUẾ — con số trên hợp đồng. Chỉ tiêu "Nguồn việc" trên
    // Dashboard và trang Chỉ tiêu đọc `valueBeforeTax`. Server tính `value` từ
    // `valueBeforeTax` × (1 + taxRate/100), đừng gửi hai số lệch nhau.
    value: number;
    valueBeforeTax: number;
    taxRate: number;    // phần trăm: 5 = 5%
    startDate: string;
    endDate: string;
    // IN_PROGRESS là giá trị chuẩn (khớp APP_CONFIG.STATUS ở backend và dữ liệu
    // đang có trong DB). INPROCESS là biến thể cũ, còn chấp nhận khi đọc.
    status: 'TODO' | 'IN_PROGRESS' | 'INPROCESS' | 'DONE';
    fileUrl?: string;
    note?: string;
    progress?: number;
    invoicedAmount?: number;
    createdAt: string;
    createdBy: string;
}

export interface Project {
    id: string;
    code: string;
    name: string;
    status: 'TODO' | 'INPROCESS' | 'DONE';  // FIX: Synced with backend/UI
    managerId?: string;
    contractId?: string;
    location?: string;
    investor?: string;
    startDate?: string;
    endDate?: string;
    budget?: number;
    description?: string;   // NEW: Project description
    members?: ProjectMember[];  // NEW: Embedded members
    createdAt?: string;
    /** Danh sách URL file đính kèm, phân tách bằng xuống dòng hoặc dấu phẩy */
    fileUrls?: string;
    /** % thời gian đã trôi qua, backend tính từ start_date/end_date */
    timeProgress?: number;
    /**
     * Tiến độ thi công 0-100. GIÁ TRỊ DẪN XUẤT — backend tính bằng
     * AVG(tasks.progress); bảng `projects` không có cột này.
     */
    progress?: number;
}

/** Hạng mục công việc định sẵn, backend trả từ APP_CONFIG.PROJECT_ITEM_TYPES */
export interface ProjectItemType {
    id: string;
    name: string;
    order: number;
}

export interface ProjectMember {
    id: string;
    userId: string;
    role: string;
    addedAt?: string;
    userName?: string;  // Enriched from Users
    email?: string;     // Enriched from Users
    avatar?: string;    // Enriched from Users
}

export interface Task {
    id: string;
    projectId: string;
    itemType?: string;  // e.g., THI_CONG, HO_SO_CHAT_LUONG
    itemName?: string;  // e.g., 'Thi công', 'Hồ sơ chất lượng'
    name: string;
    assigneeId?: string;
    status: 'TODO' | 'INPROCESS' | 'DONE';
    progress?: number;
    startDate?: string;
    endDate?: string;
    description?: string;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    order?: number;
    createdAt?: string;
}

export interface Province {
    id: string;
    name: string;
    code?: string;
}

// === Dashboard Types ===

export interface DashboardKPI {
    nguonViec: { value: number; valueYTD?: number; targetYTD?: number; valueAllTime?: number; mom: number; achievedPct: number; target: number; yearPct: number; unit?: string };
    doanhThu: { value: number; valueYTD?: number; targetYTD?: number; valueAllTime?: number; valueSuffix?: string; mom: number; achievedPct: number; target: number; yearPct: number; unit?: string };
    thuTien: { value: number; valueYTD?: number; targetYTD?: number; valueAllTime?: number; target?: number; achievedPct?: number; mom: number; yearPct: number };
    duAn: { total: number; valueYTD?: number; targetYTD?: number; inProgress: number; delayed: number };
}

export interface MonthlyTrend {
    month: string;      // "T1", "T2", ...
    actual: number;
    plan: number;
}

export interface BranchData {
    branchCode: string;
    branchName: string;
    actual: number;
    plan: number;
    actualDT: number;
    planDT: number;
}

export interface BusinessData {
    field: string;
    value: number;
    percent: number;
}

export interface BusinessStructure {
    sourceWork: BusinessData[];
    revenue: BusinessData[];
    payment: BusinessData[];
}

export interface ProjectExecution {
    done: number;
    inProgress: number;
    waiting: number;
    total: number;
}

export interface PipelineItem {
    stage: 'NEW' | 'CONTACTED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON';
    count: number;
    value: number;
}

export interface DashboardStats {
    kpi: DashboardKPI;
    nguonViecTrend: MonthlyTrend[];
    doanhThuTrend: MonthlyTrend[];
    branchBreakdown: BranchData[];
    businessStructure: BusinessStructure;
    projectExecution: ProjectExecution;
    pipelineData: PipelineItem[];
    pipelineDataB2C: PipelineItem[];
    // Legacy fields for backward compatibility
    totalContracts: number;
    totalValue: number;
    expiringSoon: number;
    statusCount: {
        TODO: number;
        INPROCESS: number;
        DONE: number;
    };
    projStatusCount?: {
        TODO: number;
        INPROCESS: number;
        DONE: number;
    };
    projDelayed?: number;
    userName?: string;
    VERSION?: string;
}

export interface Activity {
    id: string;
    createdAt: string;
    email: string;
    action: string;
    description: string;
}

export interface Invoice {
    id: string;
    contractId: string;
    invoiceNumber: string;
    installment: string; // Đợt thanh toán (e.g. "Đợt 1")
    // `value` là số ĐÃ GỒM THUẾ — con số trên hoá đơn. Chỉ tiêu "Doanh thu" trên
    // Dashboard và trang Chỉ tiêu đọc `valueBeforeTax`. Server tính `value` từ
    // `valueBeforeTax` × (1 + taxRate/100), đừng gửi hai số lệch nhau.
    value: number;
    valueBeforeTax: number;
    taxRate: number;     // phần trăm: 5 = 5%
    paidAmount?: number; // Số tiền thực thu, ĐÃ GỒM THUẾ (null/undefined = bằng value)
    issuedDate: string;
    // KHÔNG có trường `status`: bảng invoices không có cột tương ứng và API không
    // trả về. Trạng thái thanh toán suy ra từ paidAmount so với value.
    createdAt: string;
    files?: string;
    contractCode?: string;
    contractName?: string;
    branchCode?: string;
}

export type ProspectSource = 'BIDDING' | 'REFERRAL' | 'DIRECT' | 'OTHER';
export type ProspectStatus = 'NEW' | 'CONTACTED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';
export type ProspectPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type Department = 'BD' | 'MKT' | 'QS' | 'PM' | 'DES';
export type PlanItemStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CARRIED_OVER';

export interface Prospect {
    id: string;
    name: string;
    client: string;
    location: string;
    branchId: string;
    branchCode?: string;
    estimatedValue: number;
    contactPerson: string;
    contactPhone: string;
    source: ProspectSource;
    status: ProspectStatus;
    priority: ProspectPriority;
    note: string;
    expectedDate: string;
    contactDate?: string;
    prospectType: 'B2B' | 'B2C';
    createdBy: string;
    createdAt: string;
}

export interface WeeklyPlan {
    id: string;
    weekStart: string;
    weekEnd: string;
    department: Department;
    createdBy: string;
    createdAt: string;
    items?: WeeklyPlanItem[];
}

export interface WeeklyPlanItem {
    id: string;
    planId: string;
    sortOrder: number;
    title: string;
    description: string;
    why: string;
    assigneeId: string;
    assigneeName?: string;
    startDate: string;
    endDate: string;
    location: string;
    method: string;
    status: PlanItemStatus;
    result: string;
    carriedFrom: string;
    progressPct: number;
    monthlyItemId?: string;
    createdAt: string;
}

export interface MonthlyPlan {
    id: string;
    monthStart: string;
    department: Department;
    createdBy?: string;
    createdAt: string;
    items?: MonthlyPlanItem[];
}

export interface MonthlyPlanItem {
    id: string;
    planId: string;
    sortOrder: number;
    title: string;
    why?: string;
    assigneeId?: string;
    assigneeName?: string;
    target?: string;
    method?: string;
    status: 'TODO' | 'IN_PROGRESS' | 'DONE';
    result?: string;
    createdAt: string;
}

export interface DailyLog {
    id: string;
    itemId: string;
    logDate: string;
    progressPct: number;
    note?: string;
    updatedBy?: string;
    updaterName?: string;
    createdAt: string;
}

// ==================== PROJECT LOGS (Nhat ky Thi cong) ====================

export type WeatherType = 'SUNNY' | 'CLOUDY' | 'RAINY' | 'STORMY';

export interface ProjectLog {
    id: string;
    projectId: string;
    logDate: string;           // 'YYYY-MM-DD'
    weather?: WeatherType;
    workersCount?: number;     // So lao dong trong ngay
    progressPct?: number;      // Tien do tong the (0-100)
    activities?: string;       // Cong viec da thuc hien
    issues?: string;           // Vuong mac / su co
    materials?: string;        // Vat tu su dung
    equipment?: string;        // Thiet bi thi cong
    note?: string;
    createdBy?: string;
    createdByName?: string;
    updatedBy?: string;
    updatedAt?: string;
    createdAt?: string;
}

export interface ProjectLogPayload {
    projectId: string;
    logDate: string;
    weather?: WeatherType;
    workersCount?: number;
    progressPct?: number;
    activities?: string;
    issues?: string;
    materials?: string;
    equipment?: string;
    note?: string;
}
