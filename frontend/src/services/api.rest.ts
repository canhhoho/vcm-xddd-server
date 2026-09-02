/**
 * VCM XDDD - REST API Implementation
 * 
 * Implementation dùng Axios gọi REST API (Node.js backend mới).
 * Dùng khi VITE_API_MODE='rest'.
 * 
 * Giai đoạn hiện tại: Stub - sẽ được implement đầy đủ ở Giai Đoạn 2-3.
 */

import type {
    IApiService, ApiResponse,
    ContractQuery, ContractInput, InvoiceInput, ProjectInput, TaskInput,
} from './api.interface';
import type { Contract, Invoice, Project, ProjectMember, ProjectItemType, Task } from '../types';
import axios, { type AxiosInstance, type AxiosError } from 'axios';

export class RestApiService implements IApiService {
    private http: AxiosInstance;

    constructor() {
        const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
        
        this.http = axios.create({
            baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Request interceptor: Tự động gắn JWT token
        this.http.interceptors.request.use((config) => {
            const token = localStorage.getItem('token');
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        });

        // Response interceptor: Xử lý lỗi chung
        this.http.interceptors.response.use(
            (response) => response,
            (error: AxiosError<{ error?: string; message?: string }>) => {
                if (error.response?.status === 401) {
                    console.warn('🔒 Token expired or invalid. Auto-logging out...');
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    localStorage.removeItem('userId');
                    window.location.reload();
                }
                return Promise.reject(error);
            }
        );
    }

    // Helper: Wrap axios response → ApiResponse format
    private async request<T = any>(method: string, url: string, data?: any, params?: any): Promise<ApiResponse<T>> {
        try {
            const response = await this.http.request<ApiResponse<T>>({
                method,
                url,
                data,
                params,
            });
            return response.data;
        } catch (error: any) {
            const message = error.response?.data?.error || error.response?.data?.message || error.message || 'Network Error';
            return { success: false, error: message };
        }
    }

    // ==================== AUTH ====================
    async login(email: string, password: string) {
        return this.request('POST', '/auth/login', { email, password });
    }

    async changePassword(oldPassword: string, newPassword: string) {
        return this.request('PUT', '/auth/change-password', { oldPassword, newPassword });
    }

    // ==================== METADATA ====================
    async getAppMetaData() {
        return this.request('GET', '/meta/app');
    }

    async getProvinces() {
        return this.request('GET', '/provinces');
    }

    async getPositions() {
        return this.request('GET', '/positions');
    }

    async getBranches() {
        const response = await this.request('GET', '/branches');
        // Giữ logic sắp xếp YGN lên đầu (tương thích GAS)
        if (response?.success && Array.isArray(response.data)) {
            const ygnItems = response.data.filter((item: any) => item.code === 'YGN');
            const otherItems = response.data.filter((item: any) => item.code !== 'YGN');
            response.data = [...ygnItems, ...otherItems];
        }
        return response;
    }

    // ==================== CONTRACTS ====================
    async getContracts(filters?: ContractQuery) {
        return this.request<Contract[]>('GET', '/contracts', undefined, filters);
    }

    async createContract(data: ContractInput) {
        return this.request<{ id: string }>('POST', '/contracts', data);
    }

    async updateContract(id: string, data: ContractInput) {
        return this.request('PUT', `/contracts/${id}`, data);
    }

    async deleteContract(id: string) {
        return this.request('DELETE', `/contracts/${id}`);
    }

    async uploadContractFiles(files: File[]): Promise<ApiResponse<{ urls: string[] }>> {
        const formData = new FormData();
        files.forEach((file) => {
            formData.append('files', file);
        });
        try {
            const response = await this.http.post('/contracts/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return response.data;
        } catch (error: any) {
            // Backend từ chối đuôi file không cho phép bằng 400 kèm message rõ ràng.
            const message = error.response?.data?.error || error.message || 'Upload failed';
            return { success: false, error: message };
        }
    }

    // ==================== INVOICES ====================
    async getAllInvoices() {
        return this.request<Invoice[]>('GET', '/invoices');
    }

    async getInvoices(contractId: string) {
        return this.request<Invoice[]>('GET', `/contracts/${contractId}/invoices`);
    }

    async createInvoice(data: InvoiceInput) {
        return this.request<{ id: string }>('POST', '/invoices', data);
    }

    async updateInvoice(data: InvoiceInput & { id: string }) {
        return this.request('PUT', `/invoices/${data.id}`, data);
    }

    async deleteInvoice(id: string) {
        return this.request('DELETE', `/invoices/${id}`);
    }

    // ==================== PROJECTS ====================
    async getProjects(params?: Record<string, string | undefined>) {
        return this.request<Project[]>('GET', '/projects', undefined, params);
    }

    async createProject(data: ProjectInput) {
        return this.request<{ id: string }>('POST', '/projects', data);
    }

    async updateProject(data: ProjectInput & { id: string }) {
        return this.request('PUT', `/projects/${data.id}`, data);
    }

    async deleteProject(params: { id: string }) {
        return this.request('DELETE', `/projects/${params.id}`);
    }

    /**
     * Upload đính kèm cho dự án. Phải là endpoint riêng của /projects: nếu mượn
     * /contracts/upload thì user `projects=EDIT, contracts=NO_ACCESS` bị
     * moduleAccess('contracts') trả 403.
     */
    async uploadProjectFiles(files: File[]): Promise<ApiResponse<{ urls: string[] }>> {
        const formData = new FormData();
        files.forEach((file) => {
            formData.append('files', file);
        });
        try {
            const response = await this.http.post('/projects/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return response.data;
        } catch (error: any) {
            // Backend từ chối đuôi file không cho phép bằng 400 kèm message rõ ràng.
            const message = error.response?.data?.error || error.message || 'Upload failed';
            return { success: false, error: message };
        }
    }

    // ==================== PROJECT ITEMS ====================
    async getProjectItems(params: { projectId: string }) {
        return this.request<ProjectItemType[]>('GET', `/projects/${params.projectId}/items`);
    }

    // ==================== PROJECT MEMBERS ====================
    async getProjectMembers(params: { projectId: string }) {
        return this.request<ProjectMember[]>('GET', `/projects/${params.projectId}/members`);
    }

    async addProjectMember(data: { projectId: string; userId: string; role: string }) {
        return this.request<{ id: string }>('POST', `/projects/${data.projectId}/members`, data);
    }

    async removeProjectMember(params: { projectId: string; id: string }) {
        return this.request('DELETE', `/projects/${params.projectId}/members/${params.id}`);
    }

    // ==================== TASKS ====================
    async getTasks(params: { projectId: string; itemType?: string }): Promise<ApiResponse<Task[]>> {
        return this.request('GET', '/tasks', undefined, params);
    }

    async createTask(data: any) {
        return this.request('POST', '/tasks', data);
    }

    async updateTask(data: any) {
        return this.request('PUT', `/tasks/${data.id}`, data);
    }

    async deleteTask(params: { id: string }) {
        return this.request('DELETE', `/tasks/${params.id}`);
    }

    // ==================== TARGETS ====================
    async getTargets(filters?: any) {
        return this.request('GET', '/targets', undefined, filters);
    }

    async createTarget(data: any) {
        return this.request('POST', '/targets', data);
    }

    async updateTarget(id: string, data: any) {
        return this.request('PUT', `/targets/${id}`, data);
    }

    async deleteTarget(id: string) {
        return this.request('DELETE', `/targets/${id}`);
    }

    // ==================== BRANCHES (CRUD) ====================
    async createBranch(data: any) {
        return this.request('POST', '/branches', data);
    }

    async updateBranch(data: any) {
        return this.request('PUT', `/branches/${data.id}`, data);
    }

    async deleteBranch(params: { id: string }) {
        return this.request('DELETE', `/branches/${params.id}`);
    }

    // ==================== POSITIONS (CRUD) ====================
    async createPosition(data: any) {
        return this.request('POST', '/positions', data);
    }

    async updatePosition(data: any) {
        return this.request('PUT', `/positions/${data.id}`, data);
    }

    async deletePosition(params: { id: string }) {
        return this.request('DELETE', `/positions/${params.id}`);
    }

    // ==================== DASHBOARD ====================
    async getDashboardStats(forceRefresh: boolean = false, targetDate?: string, viewMode?: string) {
        return this.request('GET', '/dashboard/stats', undefined, { forceRefresh, targetDate, viewMode });
    }

    async getBranchPerformance(year: string) {
        return this.request('GET', '/dashboard/branch-performance', undefined, { year });
    }

    async getGeneralPerformance(year: string) {
        return this.request('GET', '/dashboard/general-performance', undefined, { year });
    }

    // ==================== USERS (ADMIN) ====================
    async getUsers() {
        return this.request('GET', '/users');
    }

    async createUser(data: any) {
        return this.request('POST', '/users', data);
    }

    async updateUser(data: any) {
        return this.request('PUT', `/users/${data.id}`, data);
    }

    async deleteUser(params: { id: string }) {
        return this.request('DELETE', `/users/${params.id}`);
    }

    // ==================== PERMISSIONS (ADMIN) ====================
    async getPermissions() {
        return this.request('GET', '/permissions');
    }

    async savePermissions(permissions: any[]) {
        return this.request('PUT', '/permissions', { permissions });
    }

    // ==================== STAFF ====================
    async getStaff() {
        return this.request('GET', '/staff');
    }

    async createStaff(data: any) {
        return this.request('POST', '/staff', data);
    }

    async updateStaff(data: any) {
        return this.request('PUT', `/staff/${data.id}`, data);
    }

    async deleteStaff(params: { id: string }) {
        return this.request('DELETE', `/staff/${params.id}`);
    }

    // ==================== ACTIVITIES (ADMIN) ====================
    async getActivities() {
        return this.request('GET', '/activities');
    }

    // ==================== PRESENCE (mọi user đã đăng nhập) ====================
    async getPresence() {
        return this.request('GET', '/presence');
    }

    async sendHeartbeat() {
        return this.request('POST', '/presence/heartbeat');
    }

    // ==================== NOTIFICATIONS ====================
    async getNotifications() {
        return this.request('GET', '/notifications');
    }

    async markNotificationsRead() {
        return this.request('POST', '/notifications/read');
    }

    // ==================== PROSPECTS ====================
    async getProspects(type?: string) {
        return this.request('GET', '/prospects', undefined, type ? { type } : undefined);
    }

    async createProspect(data: any) {
        return this.request('POST', '/prospects', data);
    }

    async updateProspect(id: string, data: any) {
        return this.request('PUT', `/prospects/${id}`, data);
    }

    async deleteProspect(id: string) {
        return this.request('DELETE', `/prospects/${id}`);
    }

    // ==================== COLLABORATORS ====================
    async getCollaborators(branchId?: string) {
        return this.request('GET', '/collaborators', undefined, branchId ? { branchId } : undefined);
    }

    async createCollaborator(data: any) {
        return this.request('POST', '/collaborators', data);
    }

    async updateCollaborator(data: any) {
        return this.request('PUT', `/collaborators/${data.id}`, data);
    }

    async deleteCollaborator(params: { id: string }) {
        return this.request('DELETE', `/collaborators/${params.id}`);
    }

    // ==================== PARTNERS ====================
    async getPartners(params?: { type?: string; branchId?: string }) {
        return this.request('GET', '/partners', undefined, params);
    }

    async createPartner(data: any) {
        return this.request('POST', '/partners', data);
    }

    async updatePartner(data: any) {
        return this.request('PUT', `/partners/${data.id}`, data);
    }

    async deletePartner(params: { id: string }) {
        return this.request('DELETE', `/partners/${params.id}`);
    }


    // ==================== WEEKLY PLANS ====================
    async getWeeklyPlans(params?: any) {
        const query = params ? '?' + new URLSearchParams(params).toString() : '';
        return this.request('GET', `/weekly-plans${query}`);
    }

    async createWeeklyPlan(data: any) {
        return this.request('POST', '/weekly-plans', data);
    }

    async deleteWeeklyPlan(id: string) {
        return this.request('DELETE', `/weekly-plans/${id}`);
    }

    async getWeeklyPlanItems(planId: string) {
        return this.request('GET', `/weekly-plans/${planId}/items`);
    }

    async createWeeklyPlanItem(planId: string, data: any) {
        return this.request('POST', `/weekly-plans/${planId}/items`, data);
    }

    async updateWeeklyPlanItem(id: string, data: any) {
        return this.request('PUT', `/weekly-plans/items/${id}`, data);
    }

    async updateWeeklyPlanItemsStatus(ids: string[], status: string) {
        return this.request('PUT', '/weekly-plans/items/batch-status', { ids, status });
    }

    async deleteWeeklyPlanItem(id: string) {
        return this.request('DELETE', `/weekly-plans/items/${id}`);
    }

    // ==================== MONTHLY PLANS ====================
    async getMonthlyPlans(params?: any) {
        const q = params ? '?' + new URLSearchParams(params).toString() : '';
        return this.request('GET', `/monthly-plans${q}`);
    }

    async createMonthlyPlan(data: any) {
        return this.request('POST', '/monthly-plans', data);
    }

    async copyMonthlyPlanFromPrevious(data: any) {
        return this.request('POST', '/monthly-plans/copy-previous', data);
    }

    async deleteMonthlyPlan(id: string) {
        return this.request('DELETE', `/monthly-plans/${id}`);
    }

    async getMonthlyPlanItems(planId: string) {
        return this.request('GET', `/monthly-plans/${planId}/items`);
    }

    async createMonthlyPlanItem(planId: string, data: any) {
        return this.request('POST', `/monthly-plans/${planId}/items`, data);
    }

    async updateMonthlyPlanItem(id: string, data: any) {
        return this.request('PUT', `/monthly-plans/items/${id}`, data);
    }

    async deleteMonthlyPlanItem(id: string) {
        return this.request('DELETE', `/monthly-plans/items/${id}`);
    }

    // ==================== DAILY LOGS ====================
    async getDailyLogs(itemId: string) {
        return this.request('GET', `/daily-logs?itemId=${itemId}`);
    }

    async upsertDailyLog(data: any) {
        return this.request('POST', '/daily-logs', data);
    }

    // ==================== PROJECT LOGS (Nhat ky Thi cong) ====================
    async getProjectWorkItems(params: { projectId: string; date?: string }) {
        const query: Record<string, string> = { projectId: params.projectId };
        if (params.date) query.date = params.date;
        return this.request('GET', '/project-work-items', undefined, query);
    }

    async importProjectWorkItems(data: any) {
        return this.request('POST', '/project-work-items/import', data);
    }

    async updateWorkItemProgress(id: string, data: any) {
        return this.request('PUT', `/project-work-items/${id}/progress`, data);
    }

    async updateWorkItemDates(id: string, data: any) {
        return this.request('PUT', `/project-work-items/${id}/dates`, data);
    }

    async getWorkItemLogs(params: { id: string }) {
        return this.request('GET', `/project-work-items/${params.id}/logs`);
    }

    async deleteWorkItemLog(params: { id: string; logId: string }) {
        return this.request('DELETE', `/project-work-items/${params.id}/logs/${params.logId}`);
    }

    async getProjectLogs(params: { projectId: string; month?: string }) {
        const query: Record<string, string> = { projectId: params.projectId };
        if (params.month) query.month = params.month;
        return this.request('GET', '/project-logs', undefined, query);
    }

    async upsertProjectLog(data: any) {
        return this.request('POST', '/project-logs', data);
    }

    async deleteProjectLog(id: string) {
        return this.request('DELETE', `/project-logs/${id}`);
    }
}
