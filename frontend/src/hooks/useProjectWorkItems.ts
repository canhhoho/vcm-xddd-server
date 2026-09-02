/**
 * useProjectWorkItems.ts
 * React Query hooks cho tab Tiến độ hạng mục công việc.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { unwrap } from '../services/unwrap';
import { PROJECT_KEYS } from './useProjects';
import type { ProjectWorkItem, WorkItemLog, WorkItemSheetInput } from '../types';

// ==================== CACHE KEYS ====================
export const WORK_ITEM_KEYS = {
    all: ['project-work-items'] as const,
    /** Tiền tố chung cho mọi ngày của một project — dùng khi invalidate */
    project: (projectId: string) => [...WORK_ITEM_KEYS.all, projectId] as const,
    list: (projectId: string, date?: string) =>
        [...WORK_ITEM_KEYS.project(projectId), date ?? 'all'] as const,
    logs: (itemId: string) => [...WORK_ITEM_KEYS.all, 'logs', itemId] as const,
};

// ==================== QUERIES ====================

/**
 * Danh mục hạng mục của một dự án.
 * @param date - 'YYYY-MM-DD', có thì server trả kèm dayQty/dayNote đã ghi ngày đó.
 */
export const useProjectWorkItems = (projectId: string, date?: string) => {
    return useQuery<ProjectWorkItem[]>({
        queryKey: WORK_ITEM_KEYS.list(projectId, date),
        queryFn: async () => {
            const data = await unwrap(
                apiService.getProjectWorkItems({ projectId, date }),
                'Không thể tải danh mục hạng mục',
            );
            return (data ?? []) as ProjectWorkItem[];
        },
        enabled: !!projectId,
        staleTime: 30_000,
    });
};

/** Lịch sử cập nhật của một hạng mục. Chỉ chạy khi Drawer mở. */
export const useWorkItemLogs = (itemId: string, enabled = true) => {
    return useQuery<WorkItemLog[]>({
        queryKey: WORK_ITEM_KEYS.logs(itemId),
        queryFn: async () => {
            const data = await unwrap(
                apiService.getWorkItemLogs({ id: itemId }),
                'Không thể tải lịch sử cập nhật',
            );
            return (data ?? []) as WorkItemLog[];
        },
        enabled: enabled && !!itemId,
    });
};

// ==================== MUTATIONS ====================

export const useWorkItemMutations = (projectId: string) => {
    const queryClient = useQueryClient();

    // Invalidate theo TIỀN TỐ project(projectId), không phải list(projectId):
    // list() với date undefined sinh key [..., id, 'all'] nên không match
    // [..., id, '2026-09-02']. Cùng cái bẫy đã ghi trong useProjectLogs.ts.
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: WORK_ITEM_KEYS.project(projectId) });
        // % trên thẻ dự án ngoài danh sách được backend tính từ chính khối lượng
        // này. Không invalidate PROJECT_KEYS thì thẻ giữ số cũ tới khi F5 —
        // server đã trả đúng nhưng client vẫn đọc cache. Giống useProjectLogs.
        queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.all });
    };

    const importItems = useMutation({
        mutationFn: (sheets: WorkItemSheetInput[]) =>
            unwrap(
                apiService.importProjectWorkItems({ projectId, sheets }),
                'Không import được danh mục',
            ),
        onSuccess: invalidate,
    });

    const updateProgress = useMutation({
        mutationFn: ({ id, logDate, completedQty, note }: {
            id: string; logDate: string; completedQty: number; note?: string;
        }) =>
            unwrap(
                apiService.updateWorkItemProgress(id, { logDate, completedQty, note }),
                'Không lưu được khối lượng',
            ),
        onSuccess: (_data, variables) => {
            invalidate();
            queryClient.invalidateQueries({ queryKey: WORK_ITEM_KEYS.logs(variables.id) });
        },
    });

    const updateDates = useMutation({
        mutationFn: ({ id, ...dates }: { id: string; targetDate?: string | null; actualDate?: string | null }) =>
            unwrap(apiService.updateWorkItemDates(id, dates), 'Không lưu được ngày'),
        onSuccess: invalidate,
    });

    const deleteLog = useMutation({
        mutationFn: ({ id, logId }: { id: string; logId: string }) =>
            unwrap(apiService.deleteWorkItemLog({ id, logId }), 'Không xoá được lần ghi'),
        onSuccess: (_data, variables) => {
            invalidate();
            queryClient.invalidateQueries({ queryKey: WORK_ITEM_KEYS.logs(variables.id) });
        },
    });

    return { importItems, updateProgress, updateDates, deleteLog };
};
