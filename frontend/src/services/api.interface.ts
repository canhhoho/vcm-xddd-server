/**
 * VCM XDDD - API Service Interface
 * Abstraction layer cho phép chuyển đổi backend (GAS ↔ REST) mà không thay đổi UI code.
 * 
 * Tất cả các page, hook, component chỉ gọi qua interface này.
 */

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
    getContracts(filters?: any): Promise<ApiResponse>;
    createContract(data: any): Promise<ApiResponse>;
    updateContract(id: string, data: any): Promise<ApiResponse>;
    deleteContract(id: string): Promise<ApiResponse>;
    uploadContractFiles(files: any[]): Promise<ApiResponse>;

    // ==================== INVOICES ====================
    getAllInvoices(): Promise<ApiResponse>;
    getInvoices(contractId: string): Promise<ApiResponse>;
    createInvoice(data: any): Promise<ApiResponse>;
    updateInvoice(data: any): Promise<ApiResponse>;
    deleteInvoice(id: string): Promise<ApiResponse>;

    // ==================== PROJECTS ====================
    getProjects(params?: any): Promise<ApiResponse>;
    createProject(data: any): Promise<ApiResponse>;
    updateProject(data: any): Promise<ApiResponse>;
    deleteProject(params: { id: string }): Promise<ApiResponse>;

    // ==================== PROJECT ITEMS ====================
    getProjectItems(params: { projectId: string }): Promise<ApiResponse>;
    createProjectItem(data: { projectId: string; name: string; order?: number }): Promise<ApiResponse>;
    updateProjectItem(data: { id: string; name: string; order?: number }): Promise<ApiResponse>;
    deleteProjectItem(params: { id: string }): Promise<ApiResponse>;

    // ==================== PROJECT MEMBERS ====================
    getProjectMembers(params: { projectId: string }): Promise<ApiResponse>;
    addProjectMember(data: { projectId: string; userId: string; role: string }): Promise<ApiResponse>;
    removeProjectMember(params: { id: string }): Promise<ApiResponse>;

    // ==================== TASKS ====================
    getTasks(params: { projectId: string; itemType?: string }): Promise<ApiResponse>;
    createTask(data: {
        projectId: string;
        itemType?: string;
        name: string;
        assigneeId?: string;
        status?: string;
        progress?: number;
        startDate?: string;
        endDate?: string;
        description?: string;
        priority?: string;
        order?: number;
    }): Promise<ApiResponse>;
    updateTask(data: {
        id: string;
        itemType?: string;
        name?: string;
        assigneeId?: string;
        status?: string;
        progress?: number;
        startDate?: string;
        endDate?: string;
        description?: string;
        priority?: string;
        order?: number;
    }): Promise<ApiResponse>;
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

    // ==================== WEEKLY PLANS ====================
    getWeeklyPlans(params?: any): Promise<ApiResponse>;
    createWeeklyPlan(data: any): Promise<ApiResponse>;
    deleteWeeklyPlan(id: string): Promise<ApiResponse>;
    getWeeklyPlanItems(planId: string): Promise<ApiResponse>;
    createWeeklyPlanItem(planId: string, data: any): Promise<ApiResponse>;
    updateWeeklyPlanItem(id: string, data: any): Promise<ApiResponse>;
    deleteWeeklyPlanItem(id: string): Promise<ApiResponse>;

    // ==================== MONTHLY PLANS ====================
    getMonthlyPlans(params?: any): Promise<ApiResponse>;
    createMonthlyPlan(data: any): Promise<ApiResponse>;
    deleteMonthlyPlan(id: string): Promise<ApiResponse>;
    getMonthlyPlanItems(planId: string): Promise<ApiResponse>;
    createMonthlyPlanItem(planId: string, data: any): Promise<ApiResponse>;
    updateMonthlyPlanItem(id: string, data: any): Promise<ApiResponse>;
    deleteMonthlyPlanItem(id: string): Promise<ApiResponse>;

    // ==================== DAILY LOGS ====================
    getDailyLogs(itemId: string): Promise<ApiResponse>;
    upsertDailyLog(data: any): Promise<ApiResponse>;
}
