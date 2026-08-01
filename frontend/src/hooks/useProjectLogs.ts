/**
 * useProjectLogs.ts
 * React Query hooks cho tính năng Nhật ký Thi công theo Project.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { unwrap } from '../services/unwrap';
import { PROJECT_KEYS } from './useProjects';
import type { ProjectLog, ProjectLogPayload } from '../types';

// ==================== CACHE KEYS ====================
export const PROJECT_LOG_KEYS = {
    all: ['project-logs'] as const,
    /** Tiền tố chung cho mọi tháng của một project — dùng khi invalidate */
    project: (projectId: string) => [...PROJECT_LOG_KEYS.all, projectId] as const,
    list: (projectId: string, month?: string) =>
        [...PROJECT_LOG_KEYS.project(projectId), month ?? 'all'] as const,
};

// ==================== QUERIES ====================

/**
 * Lấy danh sách nhật ký thi công của một project.
 * @param projectId - ID project
 * @param month     - Tháng lọc dạng 'YYYY-MM' (tuỳ chọn)
 */
export const useProjectLogs = (projectId: string, month?: string) => {
    return useQuery<ProjectLog[]>({
        queryKey: PROJECT_LOG_KEYS.list(projectId, month),
        queryFn: async () => {
            const data = await unwrap(
                apiService.getProjectLogs({ projectId, month }),
                'Không thể tải nhật ký',
            );
            return (data ?? []) as ProjectLog[];
        },
        enabled: !!projectId,
        staleTime: 30_000, // 30s
    });
};

// ==================== MUTATIONS ====================

export const useProjectLogMutations = (projectId: string) => {
    const queryClient = useQueryClient();

    const invalidate = () => {
        // Phải dùng tiền tố `project(projectId)`, KHÔNG dùng `list(projectId)`:
        // list() với month undefined sinh key [..., id, 'all'], mà React Query
        // khớp theo tiền tố nên nó không match [..., id, '2026-08'] — trước đây
        // ghi nhật ký xong timeline đứng yên vì lý do này.
        queryClient.invalidateQueries({ queryKey: PROJECT_LOG_KEYS.project(projectId) });
        queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.all });
    };

    const upsertLog = useMutation({
        mutationFn: (data: ProjectLogPayload) =>
            unwrap(apiService.upsertProjectLog(data), 'Không lưu được nhật ký'),
        onSuccess: invalidate,
    });

    const deleteLog = useMutation({
        mutationFn: (id: string) => unwrap(apiService.deleteProjectLog(id), 'Không xoá được nhật ký'),
        onSuccess: invalidate,
    });

    return { upsertLog, deleteLog };
};
