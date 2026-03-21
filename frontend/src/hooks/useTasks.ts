import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';

export const TASK_KEYS = {
    all: ['tasks'] as const,
    list: (filters?: any) => [...TASK_KEYS.all, 'list', filters] as const,
    detail: (id: string) => [...TASK_KEYS.all, 'detail', id] as const,
};

export const useTasks = (enabled: boolean = true, filters?: any) => {
    return useQuery({
        queryKey: TASK_KEYS.list(filters),
        queryFn: async () => {
            const response = await apiService.getTasks(filters);
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch tasks');
            }
            return response.data;
        },
        enabled,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
};

export const useTaskMutations = (projectId?: string) => {
    const queryClient = useQueryClient();

    const createTask = useMutation({
        mutationFn: (data: any) => apiService.createTask(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: TASK_KEYS.list({ projectId }) });
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: TASK_KEYS.list({ projectId }) });
            } else {
                queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
            }
        },
    });

    const updateTask = useMutation({
        mutationFn: (data: any) => apiService.updateTask(data),
        onSuccess: () => {
            // Invalidate list
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: TASK_KEYS.list({ projectId }) });
            } else {
                queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
            }
        },
    });

    const deleteTask = useMutation({
        mutationFn: (data: { id: string }) => apiService.deleteTask(data),
        onSuccess: () => {
            if (projectId) {
                queryClient.invalidateQueries({ queryKey: TASK_KEYS.list({ projectId }) });
            } else {
                queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
            }
        },
    });

    return { createTask, updateTask, deleteTask };
};
