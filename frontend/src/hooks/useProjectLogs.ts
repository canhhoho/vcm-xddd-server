/**
 * useProjectLogs.ts
 * React Query hooks cho tính năng Nhật ký Thi công theo Project.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import type { ProjectLogPayload } from '../types';

// ==================== CACHE KEYS ====================
export const PROJECT_LOG_KEYS = {
    all: ['project-logs'] as const,
    list: (projectId: string, month?: string) =>
        [...PROJECT_LOG_KEYS.all, projectId, month ?? 'all'] as const,
};

// ==================== QUERIES ====================

/**
 * Lấy danh sách nhật ký thi công của một project.
 * @param projectId - ID project
 * @param month     - Tháng lọc dạng 'YYYY-MM' (tuỳ chọn)
 */
export const useProjectLogs = (projectId: string, month?: string) => {
    return useQuery({
        queryKey: PROJECT_LOG_KEYS.list(projectId, month),
        queryFn: async () => {
            const res = await apiService.getProjectLogs({ projectId, month });
            if (!res.success) throw new Error(res.error || 'Không thể tải nhật ký');
            return res.data ?? [];
        },
        enabled: !!projectId,
        staleTime: 30_000, // 30s
    });
};

// ==================== MUTATIONS ====================

export const useProjectLogMutations = (projectId: string, month?: string) => {
    const queryClient = useQueryClient();

    // Invalidate cache sau mỗi mutation
    const invalidate = () => {
        // Xóa tất cả cache của project này (mọi tháng)
        queryClient.invalidateQueries({
            queryKey: PROJECT_LOG_KEYS.list(projectId),
            exact: false,
        });
    };

    const upsertLog = useMutation({
        mutationFn: (data: ProjectLogPayload) => apiService.upsertProjectLog(data),
        onSuccess: invalidate,
    });

    const deleteLog = useMutation({
        mutationFn: (id: string) => apiService.deleteProjectLog(id),
        onSuccess: invalidate,
    });

    return { upsertLog, deleteLog };
};
