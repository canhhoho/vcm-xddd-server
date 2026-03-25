export type UserRole = 'ADMIN' | 'EDIT' | 'VIEW' | 'NO_ACCESS';
export type ModuleAccess = 'EDIT' | 'VIEW' | 'NO_ACCESS';

export interface ModulePermission {
    userId: string;
    userName?: string;
    contracts: ModuleAccess;
    projects: ModuleAccess;
    targets: ModuleAccess;
    branches: ModuleAccess;
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
    value: number;
    startDate: string;
    endDate: string;
    status: 'TODO' | 'INPROCESS' | 'DONE';
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
    progress?: number;
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
    status: 'TODO' | 'DOING' | 'DONE';
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
    thuTien: { value: number; valueYTD?: number; targetYTD?: number; valueAllTime?: number; target?: number; achievedPct?: number; pct: number; mom: number; yearPct: number };
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

export interface BusinessStructure {
    b2b: number;  // percentage
    b2c: number;  // percentage
}

export interface ProjectExecution {
    done: number;
    inProgress: number;
    waiting: number;
    total: number;
}

export interface RecentActivity {
    id: string;
    description: string;
    type: string;
    timestamp: string;
    date: string;
    userName?: string;
}

export interface PriorityTask {
    id: string;
    name: string;
    status: 'URGENT' | 'PENDING_APPROVAL' | 'HIGH';
    projectName?: string;
    dueDate?: string;
}

export interface DashboardStats {
    kpi: DashboardKPI;
    nguonViecTrend: MonthlyTrend[];
    doanhThuTrend: MonthlyTrend[];
    branchBreakdown: BranchData[];
    businessStructure: BusinessStructure;
    projectExecution: ProjectExecution;
    recentActivities: RecentActivity[];
    priorityTasks: PriorityTask[];
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
    value: number;
    paidAmount?: number; // Số tiền thực thu (null/undefined = bằng value)
    issuedDate: string;
    status: 'PAID' | 'UNPAID' | 'OVERDUE';
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
}

export interface WeeklyPlanItem {
    id: string;
    planId: string;
    sortOrder: number;
    title: string;
    description: string;
    assigneeId: string;
    assigneeName?: string;
    status: PlanItemStatus;
    result: string;
    carriedFrom: string;
    createdAt: string;
}
