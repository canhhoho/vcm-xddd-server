/**
 * VCM XDDD - Google Apps Script API Implementation
 * 
 * Đây là implementation gốc, giữ nguyên logic gọi google.script.run.
 * Dùng khi VITE_API_MODE='gas' (mặc định, tương thích ngược).
 */

import type { IApiService, ApiResponse } from './api.interface';

// Declare google for TypeScript
declare const google: any;

export class GasApiService implements IApiService {
    private isGasEnvironment: boolean;

    constructor() {
        this.isGasEnvironment = typeof google !== 'undefined' && google.script && google.script.run;
    }

    // Generic handler for GAS calls
    private runGasFunction(action: string, params: any = {}): Promise<ApiResponse> {
        return new Promise(async (resolve, reject) => {
            if (!this.isGasEnvironment) {
                console.log(`[Local Dev] Mocking GAS call: ${action}`, params);
                await new Promise(r => setTimeout(r, 800));

                // MOCK DATA FOR LOCAL DEV
                switch (action) {
                    case 'getAppMetaData':
                        resolve({
                            success: true,
                            data: {
                                appName: 'VCM Contract Management',
                                version: '2.6.6',
                                VERSION: '2.6.6',
                                environment: 'development',
                                lastUpdated: new Date().toISOString(),
                                SHEETS: {
                                    ACTIVITIES: 'Activities',
                                    TARGETS: 'Targets',
                                    CONTRACTS: 'Contracts',
                                    INVOICES: 'Invoices',
                                    PROJECTS: 'Projects',
                                    TASKS: 'Tasks',
                                    BRANCHES: 'Branches',
                                    STAFF: 'Staff',
                                    USERS: 'Users',
                                    POSITIONS: 'Positions'
                                },
                                BRANCHES: [
                                    { id: '1', name: 'Ayeyarwady & Rakhine', code: 'AYY&RKE', address: '' },
                                    { id: '2', name: 'East Bago', code: 'EBG', address: '' },
                                    { id: '3', name: 'East Shan', code: 'ESH', address: '' },
                                    { id: '4', name: 'Kachin', code: 'KCN', address: '' },
                                    { id: '5', name: 'Kayin', code: 'KYN', address: '' },
                                    { id: '6', name: 'Magway', code: 'MGY', address: '' },
                                    { id: '7', name: 'Mandalay & Sagaing', code: 'MDY&SGG', address: '' },
                                    { id: '8', name: 'Mon', code: 'MON', address: '' },
                                    { id: '9', name: 'Naypyidaw', code: 'NPY', address: '' },
                                    { id: '10', name: 'North Shan', code: 'NSH', address: '' },
                                    { id: '11', name: 'South Shan', code: 'SSH', address: '' },
                                    { id: '12', name: 'Tanintharyi', code: 'TNI', address: '' },
                                    { id: '13', name: 'West Bago', code: 'WBG', address: '' },
                                    { id: '14', name: 'Yangon', code: 'YGN', address: '' }
                                ],
                                BUSINESS_TYPES: ['B2B', 'B2C'],
                                STATUS: {
                                    TODO: 'Chưa thực hiện',
                                    IN_PROGRESS: 'Đang thực hiện',
                                    DONE: 'Hoàn thành'
                                },
                                POSITIONS: [
                                    { code: 'DIRECTOR', name: 'Giám đốc', color: '#E11D2E', icon: 'CrownOutlined' },
                                    { code: 'DEPUTY_DIRECTOR', name: 'Phó Giám đốc', color: '#1890ff', icon: 'SafetyCertificateOutlined' },
                                    { code: 'MANAGER', name: 'Trưởng phòng', color: '#52c41a', icon: 'TeamOutlined' },
                                    { code: 'DEPUTY_MANAGER', name: 'Phó phòng', color: '#722ed1', icon: 'UsergroupAddOutlined' },
                                    { code: 'LEADER', name: 'Quản lý', color: '#fa8c16', icon: 'SolutionOutlined' },
                                    { code: 'STAFF', name: 'Nhân viên', color: '#595959', icon: 'UserOutlined' }
                                ],
                                GROUPS: ['LEADER', 'CONSTRUCTION', 'BUSINESS', 'MARKETING', 'QS', 'DESIGN', 'PROJECT', 'OTHER'],
                                ACTIONS: {
                                    VIEW: { code: 'VIEW', label: 'Chi tiết', icon: 'EyeOutlined', color: '#52c41a', backgroundColor: '#f6ffed' },
                                    EDIT: { code: 'EDIT', label: 'Chỉnh sửa', icon: 'EditOutlined', color: '#1890ff', backgroundColor: '#e6f7ff' },
                                    DELETE: { code: 'DELETE', label: 'Xóa', icon: 'DeleteOutlined', color: '#ff4d4f', backgroundColor: '#fff1f0' }
                                }
                            }
                        });
                        return;

                    case 'login':
                        if (params.email === 'admin@vcm.com' && params.password === 'admin123') {
                            resolve({
                                success: true,
                                data: {
                                    user: { id: 'u_admin', name: 'Administrator', email: 'admin@vcm.com', role: 'ADMIN' },
                                    token: 'mock_token_' + Date.now()
                                }
                            });
                        } else {
                            resolve({ success: false, error: 'Thông tin đăng nhập không chính xác (Demo: admin@vcm.com / admin123)' });
                        }
                        return;

                    case 'getDashboardStats':
                        resolve({
                            success: true,
                            data: {
                                kpi: {
                                    nguonViec: { value: 142, mom: 12, achievedPct: 88.7, target: 160, yearPct: 71 },
                                    doanhThu: { value: 4800, valueSuffix: 'M', mom: -2, achievedPct: 96.0, target: 5000, yearPct: 64 },
                                    thuTien: { value: 3200, target: 5000, achievedPct: 64, pct: 64, mom: 3.4, yearPct: 64 },
                                    duAn: { total: 85, inProgress: 77, delayed: 8 }
                                },
                                nguonViecTrend: [
                                    { month: 'T1', actual: 28, plan: 30 }, { month: 'T2', actual: 32, plan: 30 },
                                    { month: 'T3', actual: 25, plan: 32 }, { month: 'T4', actual: 30, plan: 34 },
                                    { month: 'T5', actual: 27, plan: 34 }, { month: 'T6', actual: 35, plan: 35 },
                                    { month: 'T7', actual: 22, plan: 30 }, { month: 'T8', actual: 29, plan: 32 },
                                    { month: 'T9', actual: 0, plan: 33 }, { month: 'T10', actual: 0, plan: 35 },
                                    { month: 'T11', actual: 0, plan: 36 }, { month: 'T12', actual: 0, plan: 38 },
                                ],
                                doanhThuTrend: [
                                    { month: 'T1', actual: 850, plan: 900 }, { month: 'T2', actual: 1020, plan: 950 },
                                    { month: 'T3', actual: 780, plan: 1000 }, { month: 'T4', actual: 1150, plan: 1050 },
                                    { month: 'T5', actual: 1000, plan: 1100 }, { month: 'T6', actual: 1200, plan: 1100 },
                                    { month: 'T7', actual: 900, plan: 1050 }, { month: 'T8', actual: 1100, plan: 1100 },
                                    { month: 'T9', actual: 0, plan: 1150 }, { month: 'T10', actual: 0, plan: 1200 },
                                    { month: 'T11', actual: 0, plan: 1250 }, { month: 'T12', actual: 0, plan: 1300 },
                                ],
                                branchBreakdown: [
                                    { branchCode: 'YGN', branchName: 'Yangon', actual: 820, plan: 900, actualDT: 650, planDT: 700 },
                                    { branchCode: 'MDY&SGG', branchName: 'Mandalay & Sagaing', actual: 650, plan: 700, actualDT: 520, planDT: 600 },
                                ],
                                businessStructure: {
                                    sourceWork: [{ field: 'B2B', value: 68532000000, percent: 100 }, { field: 'B2C', value: 0, percent: 0 }],
                                    revenue: [{ field: 'B2B', value: 1500000000, percent: 90 }, { field: 'B2C', value: 166666667, percent: 10 }],
                                    payment: [{ field: 'B2B', value: 800000000, percent: 100 }, { field: 'B2C', value: 0, percent: 0 }]
                                },
                                projectExecution: { done: 42, inProgress: 35, waiting: 8, total: 85 },
                                recentActivities: [],
                                pipelineData: [
                                    { stage: 'NEW', count: 12, value: 50000000000 },
                                    { stage: 'CONTACTED', count: 8, value: 30000000000 },
                                    { stage: 'PROPOSAL', count: 5, value: 15000000000 },
                                    { stage: 'NEGOTIATION', count: 3, value: 5000000000 },
                                    { stage: 'WON', count: 2, value: 1500000000 }
                                ],
                                totalContracts: 142, totalValue: 4800000000, expiringSoon: 5,
                                statusCount: { TODO: 12, INPROCESS: 77, DONE: 53 }
                            }
                        });
                        return;

                    case 'getBranches':
                        resolve({
                            success: true,
                            data: [
                                { id: '1', name: 'Ayeyarwady & Rakhine', code: 'AYY&RKE' },
                                { id: '2', name: 'East Bago', code: 'EBG' },
                                { id: '3', name: 'East Shan', code: 'ESH' },
                                { id: '4', name: 'Kachin', code: 'KCN' },
                                { id: '5', name: 'Kayin', code: 'KYN' },
                                { id: '6', name: 'Magway', code: 'MGY' },
                                { id: '7', name: 'Mandalay & Sagaing', code: 'MDY&SGG' },
                                { id: '8', name: 'Mon', code: 'MON' },
                                { id: '9', name: 'Naypyidaw', code: 'NPY' },
                                { id: '10', name: 'North Shan', code: 'NSH' },
                                { id: '11', name: 'South Shan', code: 'SSH' },
                                { id: '12', name: 'Tanintharyi', code: 'TNI' },
                                { id: '13', name: 'West Bago', code: 'WBG' },
                                { id: '14', name: 'Yangon', code: 'YGN' }
                            ]
                        });
                        return;

                    case 'getTargets':
                        resolve({
                            success: true,
                            data: [
                                { id: 'g1', name: 'Nguồn việc Năm 2026', type: 'NGUON_VIEC', periodType: 'YEAR', period: '2026', unitType: 'GENERAL', targetValue: 50, actualValue: 32, createdAt: new Date().toISOString() },
                                { id: 'g10', name: 'Doanh thu Năm 2026', type: 'DOANH_THU', periodType: 'YEAR', period: '2026', unitType: 'GENERAL', targetValue: 50000000000, actualValue: 32000000000, createdAt: new Date().toISOString() },
                            ]
                        });
                        return;

                    case 'getBranchPerformance':
                        resolve({
                            success: true,
                            data: {
                                '2': {
                                    id: '2', name: 'Yangon', code: 'YGN',
                                    sourceWork: { total: 10.5, months: { 1: 5.5, 2: 5.0 } },
                                    revenue: { total: 8500, months: { 1: 4000, 2: 4500 } }
                                }
                            }
                        });
                        return;

                    case 'getGeneralPerformance':
                        resolve({
                            success: true,
                            data: {
                                nguonViec: { year: 32, quarters: { 1: 10, 2: 8, 3: 0, 4: 0 }, months: { 1: 4, 2: 3, 3: 3 } },
                                doanhThu: { year: 18, quarters: { 1: 10, 2: 8, 3: 0, 4: 0 }, months: { 1: 4, 2: 3, 3: 3 } }
                            }
                        });
                        return;

                    case 'getProjects':
                        resolve({
                            success: true,
                            data: [
                                { id: 'p1', code: 'DA-001', name: 'Vinhomes Ocean Park', status: 'INPROCESS', startDate: '2025-01-01', endDate: '2025-12-31', description: 'Dự án thi công khu đô thị', members: [] },
                                { id: 'p2', code: 'DA-002', name: 'Masteri West Heights', status: 'TODO', startDate: '2025-03-01', endDate: '2025-11-30', description: 'Dự án xây dựng tòa nhà', members: [] }
                            ]
                        });
                        return;

                    case 'getProvinces':
                        resolve({
                            success: true,
                            data: [
                                { id: '1', name: 'Ayeyarwady & Rakhine', code: 'AYY&RKE' },
                                { id: '2', name: 'East Bago', code: 'EBG' },
                                { id: '3', name: 'East Shan', code: 'ESH' },
                                { id: '4', name: 'Kachin', code: 'KCN' },
                                { id: '5', name: 'Kayin', code: 'KYN' },
                                { id: '6', name: 'Magway', code: 'MGY' },
                                { id: '7', name: 'Mandalay & Sagaing', code: 'MDY&SGG' },
                                { id: '8', name: 'Mon', code: 'MON' },
                                { id: '9', name: 'Naypyidaw', code: 'NPY' },
                                { id: '10', name: 'North Shan', code: 'NSH' },
                                { id: '11', name: 'South Shan', code: 'SSH' },
                                { id: '12', name: 'Tanintharyi', code: 'TNI' },
                                { id: '13', name: 'West Bago', code: 'WBG' },
                                { id: '14', name: 'Yangon', code: 'YGN' }
                            ]
                        });
                        return;

                    case 'getAllInvoices':
                        resolve({
                            success: true,
                            data: [
                                { id: 'inv1', contractId: 'c1', invoiceNumber: 'INV-001', installment: '1', value: 500000000, paidAmount: null, issuedDate: '2025-01-15', status: 'PAID', createdAt: new Date().toISOString() },
                            ]
                        });
                        return;

                    case 'getContracts':
                        resolve({
                            success: true,
                            data: [
                                { id: 'c1', code: 'HD-001', name: 'Hợp đồng thi công móng', value: 2000000000, status: 'INPROCESS', startDate: '2025-01-01' }
                            ]
                        });
                        return;

                    case 'getPositions':
                        resolve({
                            success: true,
                            data: [
                                { id: 'pos_001', name: 'Giám đốc', code: 'GD', defaultRole: 'ADMIN', category: 'Lãnh đạo', description: 'Điều hành toàn bộ hoạt động công ty', createdAt: new Date().toISOString() },
                                { id: 'pos_002', name: 'Phó Giám đốc', code: 'PGD', defaultRole: 'ADMIN', category: 'Lãnh đạo', description: 'Hỗ trợ Giám đốc điều hành', createdAt: new Date().toISOString() },
                                { id: 'pos_003', name: 'Trưởng phòng', code: 'TP', defaultRole: 'EDIT', category: 'Xây dựng', createdAt: new Date().toISOString() },
                                { id: 'pos_004', name: 'Phó phòng', code: 'PP', defaultRole: 'EDIT', category: 'Xây dựng', createdAt: new Date().toISOString() },
                                { id: 'pos_005', name: 'Quản lý', code: 'QL', defaultRole: 'EDIT', category: 'Dự án', createdAt: new Date().toISOString() },
                                { id: 'pos_006', name: 'Nhân viên', code: 'NV', defaultRole: 'VIEW', category: 'Kinh doanh', createdAt: new Date().toISOString() },
                            ]
                        });
                        return;

                    case 'getUsers':
                        resolve({
                            success: true,
                            data: [
                                { id: 'u_001', email: 'admin@vcm.com', name: 'Nguyễn Văn An', positionCode: 'GD', positionName: 'Giám đốc', category: 'Lãnh đạo' },
                            ]
                        });
                        return;

                    case 'getModulePermissions':
                        resolve({
                            success: true,
                            data: [
                                { userId: 'u_001', userName: 'Nguyễn Văn An', positionName: 'Giám đốc', category: 'Lãnh đạo', contracts: 'EDIT', projects: 'EDIT', targets: 'EDIT', business: 'EDIT' },
                            ]
                        });
                        return;

                    default:
                        console.warn('Mocking default success for:', action);
                        resolve({ success: true, data: { id: 'mock_id_' + Date.now() }, message: 'Thao tác thành công (Mock)' });
                        return;
                }
            }

            // REAL GOOGLE APPS SCRIPT CALL
            const token = localStorage.getItem('token');
            const payload = { action, token, ...params };

            google.script.run
                .withSuccessHandler((response: any) => {
                    if (response && !response.success && response.error &&
                        (typeof response.error === 'string') &&
                        response.error.includes('Unauthorized')) {
                        console.warn('🔒 Token expired or invalid. Auto-logging out...');
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        localStorage.removeItem('userId');
                        window.location.reload();
                        reject(new Error(response.error));
                        return;
                    }
                    resolve(response);
                })
                .withFailureHandler((error: any) => {
                    const errMsg = error?.message || error?.toString() || '';
                    if (errMsg.includes('Unauthorized')) {
                        console.warn('🔒 Token expired or invalid. Auto-logging out...');
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        localStorage.removeItem('userId');
                        window.location.reload();
                    }
                    reject(error);
                })
                .handleAPICall(payload);
        });
    }

    // ==================== AUTH ====================
    async login(email: string, password: string) {
        return this.runGasFunction('login', { email, password });
    }

    async changePassword(oldPassword: string, newPassword: string) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('changePassword', { userId, oldPassword, newPassword });
    }

    // ==================== METADATA ====================
    async getAppMetaData() {
        return this.runGasFunction('getAppMetaData', {});
    }

    async getProvinces() {
        return this.runGasFunction('getProvinces');
    }

    async getPositions() {
        return this.runGasFunction('getPositions', {});
    }

    async getBranches() {
        const response = await this.runGasFunction('getBranches', {});
        if (response && response.success && Array.isArray(response.data)) {
            const ygnItems = response.data.filter((item: any) => item.code === 'YGN');
            const otherItems = response.data.filter((item: any) => item.code !== 'YGN');
            response.data = [...ygnItems, ...otherItems];
        }
        return response;
    }

    // ==================== CONTRACTS ====================
    async getContracts(filters?: any) {
        return this.runGasFunction('getContracts', filters);
    }

    async createContract(data: any) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('createContract', { ...data, userId });
    }

    async updateContract(id: string, data: any) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('updateContract', { id, ...data, userId });
    }

    async deleteContract(id: string) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('deleteContract', { id, userId });
    }

    async uploadContractFiles(files: any[]) {
        return this.runGasFunction('uploadContractFiles', { data: files });
    }

    // ==================== INVOICES ====================
    async getAllInvoices() {
        return this.runGasFunction('getAllInvoices');
    }

    async getInvoices(contractId: string) {
        return this.runGasFunction('getInvoices', { contractId });
    }

    async createInvoice(data: any) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('createInvoice', { data: { ...data, userId } });
    }

    async updateInvoice(data: any) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('updateInvoice', { data: { ...data, userId } });
    }

    async deleteInvoice(id: string) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('deleteInvoice', { id, userId });
    }

    // ==================== PROJECTS ====================
    async getProjects(params?: any) {
        return this.runGasFunction('getProjects', params || {});
    }

    async createProject(data: any) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('createProject', { ...data, userId });
    }

    async updateProject(data: any) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('updateProject', { ...data, userId });
    }

    async deleteProject(params: { id: string }) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('deleteProject', { ...params, userId });
    }

    // ==================== PROJECT ITEMS ====================
    async getProjectItems(params: { projectId: string }) {
        return this.runGasFunction('getProjectItems', params);
    }

    async createProjectItem(data: { projectId: string; name: string; order?: number }) {
        return this.runGasFunction('createProjectItem', data);
    }

    async updateProjectItem(data: { id: string; name: string; order?: number }) {
        return this.runGasFunction('updateProjectItem', data);
    }

    async deleteProjectItem(params: { id: string }) {
        return this.runGasFunction('deleteProjectItem', params);
    }

    // ==================== PROJECT MEMBERS ====================
    async getProjectMembers(params: { projectId: string }) {
        return this.runGasFunction('getProjectMembers', params);
    }

    async addProjectMember(data: { projectId: string; userId: string; role: string }) {
        return this.runGasFunction('addProjectMember', data);
    }

    async removeProjectMember(params: { id: string }) {
        return this.runGasFunction('removeProjectMember', params);
    }

    // ==================== TASKS ====================
    async getTasks(params: { projectId: string; itemType?: string }) {
        return this.runGasFunction('getTasks', params);
    }

    async createTask(data: any) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('createTask', { ...data, userId });
    }

    async updateTask(data: any) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('updateTask', { ...data, userId });
    }

    async deleteTask(params: { id: string }) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('deleteTask', { ...params, userId });
    }

    // ==================== TARGETS ====================
    async getTargets(filters?: any) {
        return this.runGasFunction('getTargets', filters);
    }

    async createTarget(data: any) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('createTarget', { ...data, userId });
    }

    async updateTarget(id: string, data: any) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('updateTarget', { id, ...data, userId });
    }

    async deleteTarget(id: string) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('deleteTarget', { id, userId });
    }

    // ==================== BRANCHES (CRUD) ====================
    async createBranch(data: any) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('createBranch', { ...data, userId });
    }

    async updateBranch(data: any) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('updateBranch', { ...data, userId });
    }

    async deleteBranch(params: { id: string }) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('deleteBranch', { ...params, userId });
    }

    // ==================== POSITIONS (CRUD) ====================
    async createPosition(data: any) {
        return this.runGasFunction('createPosition', data);
    }

    async updatePosition(data: any) {
        return this.runGasFunction('updatePosition', data);
    }

    async deletePosition(params: { id: string }) {
        return this.runGasFunction('deletePosition', params);
    }

    // ==================== DASHBOARD ====================
    async getDashboardStats(forceRefresh: boolean = false, targetDate?: string, viewMode?: string) {
        if (!this.isGasEnvironment) {
            return this.runGasFunction('getDashboardStats', { forceRefresh, targetDate, viewMode });
        }
        return new Promise<ApiResponse>((resolve, reject) => {
            google.script.run
                .withSuccessHandler((response: any) => resolve(response))
                .withFailureHandler((error: any) => reject(error))
                .getDashboardStats(forceRefresh, targetDate, viewMode);
        });
    }

    async getBranchPerformance(year: string) {
        return this.runGasFunction('getBranchPerformance', { year });
    }

    async getGeneralPerformance(year: string) {
        return this.runGasFunction('getGeneralPerformance', { year });
    }

    // ==================== USERS (ADMIN) ====================
    async getUsers() {
        return this.runGasFunction('getUsers', {});
    }

    async createUser(data: any) {
        return this.runGasFunction('createUser', data);
    }

    async updateUser(data: any) {
        return this.runGasFunction('updateUser', data);
    }

    async deleteUser(params: { id: string }) {
        return this.runGasFunction('deleteUser', params);
    }

    // ==================== PERMISSIONS (ADMIN) ====================
    async getPermissions() {
        return this.runGasFunction('getPermissions', {});
    }

    async savePermissions(permissions: any[]) {
        const userId = localStorage.getItem('userId');
        return this.runGasFunction('savePermissions', { permissions, userId });
    }

    // ==================== STAFF ====================
    async getStaff() {
        return this.runGasFunction('getStaff', {});
    }

    async createStaff(data: any) {
        return this.runGasFunction('createStaff', data);
    }

    async updateStaff(data: any) {
        return this.runGasFunction('updateStaff', data);
    }

    async deleteStaff(params: { id: string }) {
        return this.runGasFunction('deleteStaff', params);
    }

    // ==================== COLLABORATORS ====================
    async getCollaborators(branchId?: string) {
        return this.runGasFunction('getCollaborators', branchId ? { branchId } : {});
    }

    async createCollaborator(data: any) {
        return this.runGasFunction('createCollaborator', data);
    }

    async updateCollaborator(data: any) {
        return this.runGasFunction('updateCollaborator', data);
    }

    async deleteCollaborator(params: { id: string }) {
        return this.runGasFunction('deleteCollaborator', params);
    }

    // ==================== ACTIVITIES (ADMIN) ====================
    async getActivities() {
        return this.runGasFunction('getActivities', {});
    }

    // ==================== PROSPECTS ====================
    async getProspects(type?: string) {
        return this.runGasFunction('getProspects', type ? { type } : {});
    }

    async createProspect(data: any) {
        return this.runGasFunction('createProspect', data);
    }

    async updateProspect(id: string, data: any) {
        return this.runGasFunction('updateProspect', { id, ...data });
    }

    async deleteProspect(id: string) {
        return this.runGasFunction('deleteProspect', { id });
    }

    // ==================== WEEKLY PLANS ====================
    async getWeeklyPlans(params?: any) {
        return this.runGasFunction('getWeeklyPlans', params || {});
    }

    async createWeeklyPlan(data: any) {
        return this.runGasFunction('createWeeklyPlan', data);
    }

    async deleteWeeklyPlan(id: string) {
        return this.runGasFunction('deleteWeeklyPlan', { id });
    }

    async getWeeklyPlanItems(planId: string) {
        return this.runGasFunction('getWeeklyPlanItems', { planId });
    }

    async createWeeklyPlanItem(planId: string, data: any) {
        return this.runGasFunction('createWeeklyPlanItem', { planId, ...data });
    }

    async updateWeeklyPlanItem(id: string, data: any) {
        return this.runGasFunction('updateWeeklyPlanItem', { id, ...data });
    }

    async deleteWeeklyPlanItem(id: string) {
        return this.runGasFunction('deleteWeeklyPlanItem', { id });
    }
}
