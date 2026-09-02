/**
 * VCM XDDD - API Service Interface
 * Abstraction layer cho phép chuyển đổi backend (GAS ↔ REST) mà không thay đổi UI code.
 * 
 * Tất cả các page, hook, component chỉ gọi qua interface này.
 */

import type {
    Department, PlanItemStatus,
    WeeklyPlan, WeeklyPlanItem, MonthlyPlan, MonthlyPlanItem, DailyLog,
    Contract, Invoice, Project, ProjectMember, Task, ProjectItemType,
    ProjectLog, ProjectLogPayload,
    ProjectWorkItem, WorkItemLog, WorkItemSheetInput,
} from '../types';

// ==================== CONTRACT / INVOICE PAYLOADS ====================

export interface ContractQuery {
    branchId?: string;
    status?: Contract['status'];
    businessField?: Contract['businessField'];
}

/**
 * Payload tạo/sửa hợp đồng.
 * Chi nhánh chỉ gửi qua `provinceId` — backend map khoá này sang cột branch_id.
 * KHÔNG thêm alias `branchId`: hai khoá cùng trỏ một cột sẽ sinh
 * "SET branch_id=$1, branch_id=$2" (PostgreSQL 42701).
 */
export interface ContractInput {
    code?: string;
    name?: string;
    provinceId?: string;
    businessField?: Contract['businessField'];
    value?: number;
    startDate?: string | null;
    endDate?: string | null;
    status?: Contract['status'];
    fileUrls?: string;
    note?: string;
    investor?: string;
}

/**
 * Payload tạo/sửa hoá đơn.
 * Số tiền thực thu chỉ gửi qua `paidAmount` (backend map sang cột payment);
 * không gửi kèm `payment`, và không gửi `status` vì bảng invoices không có cột đó.
 */
export interface InvoiceInput {
    contractId?: string;
    invoiceNumber?: string;
    installment?: string;
    value?: number;
    paidAmount?: number;
    issuedDate?: string | null;
    files?: string;
}

// ==================== PROJECT / TASK PAYLOADS ====================

/** Payload tạo/sửa dự án. `id` chỉ bắt buộc khi cập nhật. */
export interface ProjectInput {
    id?: string;
    code?: string;
    name?: string;
    status?: Project['status'];
    managerId?: string;
    contractId?: string;
    location?: string;
    investor?: string;
    startDate?: string | null;
    endDate?: string | null;
    budget?: number;
    description?: string;
    fileUrls?: string;
}

/**
 * Payload tạo/sửa task.
 * `startDate`/`endDate` phải là chuỗi `YYYY-MM-DD` — backend validate bằng
 * `assertDateRange` và từ chối chuỗi ISO đầy đủ bằng 400.
 */
export interface TaskInput {
    projectId?: string;
    itemType?: string;
    name?: string;
    assigneeId?: string;
    status?: Task['status'];
    progress?: number;
    startDate?: string | null;
    endDate?: string | null;
    description?: string;
    priority?: Task['priority'];
    order?: number;
}

// ==================== PLAN PAYLOADS ====================

export interface WeeklyPlanQuery {
    department?: Department;
    weekStart?: string;
    /** Lọc theo khoảng (week_start >= weekFrom, week_start <= weekTo) */
    weekFrom?: string;
    weekTo?: string;
    includeItems?: 'true';
    limit?: number;
}

export interface MonthlyPlanQuery {
    department?: Department;
    monthStart?: string;
    /** Chỉ lấy kế hoạch của các tháng TRƯỚC mốc này (month_start < monthBefore) */
    monthBefore?: string;
    includeItems?: 'true';
    limit?: number;
}

export interface CreateWeeklyPlanInput {
    weekStart: string;
    weekEnd: string;
    department: Department;
    /** Có giá trị => copy đầu việc chưa xong từ plan này sang */
    carryOverFromPlanId?: string;
}

export interface CreateMonthlyPlanInput {
    monthStart: string;
    department: Department;
}

/**
 * Copy mục tiêu chưa hoàn thành từ kế hoạch tháng gần nhất trước monthStart.
 * Không có trường chọn plan nguồn: server tự suy ra từ department + monthStart,
 * nếu để client truyền id thì planAccess không kiểm được phòng ban của plan đó.
 */
export interface CopyMonthlyPlanInput {
    monthStart: string;
    department: Department;
}

export interface CopyMonthlyPlanResult {
    planId: string;
    copiedCount: number;
    sourceMonthStart: string;
}

export interface WeeklyPlanItemInput {
    sortOrder?: number;
    title: string;
    description?: string;
    why?: string;
    assigneeId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    location?: string;
    method?: string;
    status?: PlanItemStatus;
    result?: string;
    progressPct?: number;
    monthlyItemId?: string | null;
}

export interface MonthlyPlanItemInput {
    sortOrder?: number;
    title: string;
    why?: string;
    assigneeId?: string | null;
    target?: string;
    method?: string;
    status?: Exclude<PlanItemStatus, 'CARRIED_OVER'>;
    result?: string;
}

export interface DailyLogInput {
    itemId: string;
    logDate: string;
    progressPct: number;
    note?: string | null;
}

// Generic API response wrapper
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    // Allow additional properties for backward compatibility with GAS responses
    // (e.g., response.token, response.user, response.urls)
    [key: string]: any;
}

export interface IApiService {
    // ==================== AUTH ====================
    login(email: string, password: string): Promise<ApiResponse>;
    changePassword(oldPassword: string, newPassword: string): Promise<ApiResponse>;

    // ==================== METADATA ====================
    getAppMetaData(): Promise<ApiResponse>;
    getProvinces(): Promise<ApiResponse>;
    getPositions(): Promise<ApiResponse>;
    getBranches(): Promise<ApiResponse>;

    // ==================== CONTRACTS ====================
    getContracts(filters?: ContractQuery): Promise<ApiResponse<Contract[]>>;
    createContract(data: ContractInput): Promise<ApiResponse<{ id: string }>>;
    updateContract(id: string, data: ContractInput): Promise<ApiResponse>;
    deleteContract(id: string): Promise<ApiResponse>;
    uploadContractFiles(files: File[]): Promise<ApiResponse<{ urls: string[] }>>;

    // ==================== INVOICES ====================
    getAllInvoices(): Promise<ApiResponse<Invoice[]>>;
    getInvoices(contractId: string): Promise<ApiResponse<Invoice[]>>;
    createInvoice(data: InvoiceInput): Promise<ApiResponse<{ id: string }>>;
    updateInvoice(data: InvoiceInput & { id: string }): Promise<ApiResponse>;
    deleteInvoice(id: string): Promise<ApiResponse>;

    // ==================== PROJECTS ====================
    getProjects(params?: Record<string, string | undefined>): Promise<ApiResponse<Project[]>>;
    createProject(data: ProjectInput): Promise<ApiResponse<{ id: string }>>;
    updateProject(data: ProjectInput & { id: string }): Promise<ApiResponse>;
    deleteProject(params: { id: string }): Promise<ApiResponse>;
    uploadProjectFiles(files: File[]): Promise<ApiResponse<{ urls: string[] }>>;

    // ==================== PROJECT ITEMS ====================
    // Chỉ có GET: danh sách hạng mục là hằng số trong APP_CONFIG, không CRUD được.
    getProjectItems(params: { projectId: string }): Promise<ApiResponse<ProjectItemType[]>>;

    // ==================== PROJECT MEMBERS ====================
    getProjectMembers(params: { projectId: string }): Promise<ApiResponse<ProjectMember[]>>;
    addProjectMember(data: { projectId: string; userId: string; role: string }): Promise<ApiResponse<{ id: string }>>;
    /** Cần cả projectId: members lưu trong cột JSONB của chính project đó. */
    removeProjectMember(params: { projectId: string; id: string }): Promise<ApiResponse>;

    // ==================== TASKS ====================
    getTasks(params: { projectId: string; itemType?: string }): Promise<ApiResponse<Task[]>>;
    createTask(data: TaskInput & { projectId: string; name: string }): Promise<ApiResponse<{ id: string }>>;
    updateTask(data: TaskInput & { id: string }): Promise<ApiResponse>;
    deleteTask(params: { id: string }): Promise<ApiResponse>;

    // ==================== TARGETS ====================
    getTargets(filters?: any): Promise<ApiResponse>;
    createTarget(data: any): Promise<ApiResponse>;
    updateTarget(id: string, data: any): Promise<ApiResponse>;
    deleteTarget(id: string): Promise<ApiResponse>;

    // ==================== BRANCHES (CRUD) ====================
    createBranch(data: any): Promise<ApiResponse>;
    updateBranch(data: any): Promise<ApiResponse>;
    deleteBranch(params: { id: string }): Promise<ApiResponse>;

    // ==================== POSITIONS ====================
    createPosition(data: any): Promise<ApiResponse>;
    updatePosition(data: any): Promise<ApiResponse>;
    deletePosition(params: { id: string }): Promise<ApiResponse>;

    // ==================== DASHBOARD ====================
    getDashboardStats(forceRefresh?: boolean, targetDate?: string, viewMode?: string): Promise<ApiResponse>;
    getBranchPerformance(year: string): Promise<ApiResponse>;
    getGeneralPerformance(year: string): Promise<ApiResponse>;

    // ==================== USERS (ADMIN) ====================
    getUsers(): Promise<ApiResponse>;
    createUser(data: any): Promise<ApiResponse>;
    updateUser(data: any): Promise<ApiResponse>;
    deleteUser(params: { id: string }): Promise<ApiResponse>;

    // ==================== PERMISSIONS (ADMIN) ====================
    getPermissions(): Promise<ApiResponse>;
    savePermissions(permissions: any[]): Promise<ApiResponse>;

    // ==================== STAFF ====================
    getStaff(): Promise<ApiResponse>;
    createStaff(data: any): Promise<ApiResponse>;
    updateStaff(data: any): Promise<ApiResponse>;
    deleteStaff(params: { id: string }): Promise<ApiResponse>;

    // ==================== ACTIVITIES (ADMIN) ====================
    getActivities(): Promise<ApiResponse>;

    // ==================== PRESENCE (mọi user đã đăng nhập) ====================
    getPresence(): Promise<ApiResponse>;
    sendHeartbeat(): Promise<ApiResponse>;

    // ==================== NOTIFICATIONS ====================
    getNotifications(): Promise<ApiResponse>;
    markNotificationsRead(): Promise<ApiResponse>;

    // ==================== PROSPECTS ====================
    getProspects(type?: string): Promise<ApiResponse>;
    createProspect(data: any): Promise<ApiResponse>;
    updateProspect(id: string, data: any): Promise<ApiResponse>;
    deleteProspect(id: string): Promise<ApiResponse>;

    // ==================== COLLABORATORS ====================
    getCollaborators(branchId?: string): Promise<ApiResponse>;
    createCollaborator(data: any): Promise<ApiResponse>;
    updateCollaborator(data: any): Promise<ApiResponse>;
    deleteCollaborator(params: { id: string }): Promise<ApiResponse>;

    // ==================== PARTNERS ====================
    getPartners(params?: { type?: string; branchId?: string }): Promise<ApiResponse>;
    createPartner(data: any): Promise<ApiResponse>;
    updatePartner(data: any): Promise<ApiResponse>;
    deletePartner(params: { id: string }): Promise<ApiResponse>;


    // ==================== WEEKLY PLANS ====================
    getWeeklyPlans(params?: WeeklyPlanQuery): Promise<ApiResponse<WeeklyPlan[]>>;
    createWeeklyPlan(data: CreateWeeklyPlanInput): Promise<ApiResponse<{ id: string }>>;
    deleteWeeklyPlan(id: string): Promise<ApiResponse>;
    getWeeklyPlanItems(planId: string): Promise<ApiResponse<WeeklyPlanItem[]>>;
    createWeeklyPlanItem(planId: string, data: WeeklyPlanItemInput): Promise<ApiResponse<{ id: string }>>;
    updateWeeklyPlanItem(id: string, data: WeeklyPlanItemInput): Promise<ApiResponse>;
    updateWeeklyPlanItemsStatus(ids: string[], status: PlanItemStatus): Promise<ApiResponse>;
    deleteWeeklyPlanItem(id: string): Promise<ApiResponse>;

    // ==================== MONTHLY PLANS ====================
    getMonthlyPlans(params?: MonthlyPlanQuery): Promise<ApiResponse<MonthlyPlan[]>>;
    createMonthlyPlan(data: CreateMonthlyPlanInput): Promise<ApiResponse<MonthlyPlan>>;
    copyMonthlyPlanFromPrevious(data: CopyMonthlyPlanInput): Promise<ApiResponse<CopyMonthlyPlanResult>>;
    deleteMonthlyPlan(id: string): Promise<ApiResponse>;
    getMonthlyPlanItems(planId: string): Promise<ApiResponse<MonthlyPlanItem[]>>;
    createMonthlyPlanItem(planId: string, data: MonthlyPlanItemInput): Promise<ApiResponse<MonthlyPlanItem>>;
    updateMonthlyPlanItem(id: string, data: MonthlyPlanItemInput): Promise<ApiResponse>;
    deleteMonthlyPlanItem(id: string): Promise<ApiResponse>;

    // ==================== DAILY LOGS ====================
    getDailyLogs(itemId: string): Promise<ApiResponse<DailyLog[]>>;
    upsertDailyLog(data: DailyLogInput): Promise<ApiResponse>;

    // ==================== PROJECT LOGS (Nhat ky Thi cong) ====================
    getProjectLogs(params: { projectId: string; month?: string }): Promise<ApiResponse<ProjectLog[]>>;
    upsertProjectLog(data: ProjectLogPayload): Promise<ApiResponse<{ id: string }>>;
    deleteProjectLog(id: string): Promise<ApiResponse>;

    // ============ PROJECT WORK ITEMS (Tien do hang muc cong viec) ============
    getProjectWorkItems(params: { projectId: string; date?: string }): Promise<ApiResponse<ProjectWorkItem[]>>;
    importProjectWorkItems(data: { projectId: string; sheets: WorkItemSheetInput[] }): Promise<ApiResponse<{ count: number; sheets: number }>>;
    updateWorkItemProgress(id: string, data: { logDate: string; completedQty: number; note?: string }): Promise<ApiResponse<ProjectWorkItem>>;
    updateWorkItemDates(id: string, data: { targetDate?: string | null; actualDate?: string | null }): Promise<ApiResponse<ProjectWorkItem>>;
    getWorkItemLogs(params: { id: string }): Promise<ApiResponse<WorkItemLog[]>>;
    deleteWorkItemLog(params: { id: string; logId: string }): Promise<ApiResponse>;
}
