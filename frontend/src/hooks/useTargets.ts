import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';

export const TARGET_KEYS = {
    all: ['targets'] as const,
    list: (filters?: any) => [...TARGET_KEYS.all, 'list', filters] as const,
    branchPerformance: (year: string) => [...TARGET_KEYS.all, 'branchPerformance', year] as const,
};

export const useTargets = (enabled: boolean = true, filters?: any) => {
    return useQuery({
        queryKey: TARGET_KEYS.list(filters),
        queryFn: async () => {
            const response = await apiService.getTargets(filters);
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch targets');
            }
            return response.data;
        },
        enabled,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
};

export const useBranchPerformance = (year: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: TARGET_KEYS.branchPerformance(year),
        queryFn: async () => {
            const response = await apiService.getBranchPerformance(year);
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch branch performance');
            }
            return response.data;
        },
        enabled: enabled && !!year,
        staleTime: 5 * 60 * 1000,
    });
};

export const useGeneralPerformance = (year: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: [...TARGET_KEYS.all, 'generalPerformance', year] as const,
        queryFn: async () => {
            const response = await apiService.getGeneralPerformance(year);
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch general performance');
            }
            return response.data as {
                nguonViec: { year: number; quarters: Record<number, number>; months: Record<number, number> };
                doanhThu:  { year: number; quarters: Record<number, number>; months: Record<number, number> };
            };
        },
        enabled: enabled && !!year,
        staleTime: 5 * 60 * 1000,
    });
};

export const useTargetMutations = () => {
    const queryClient = useQueryClient();

    // Query key cho targets list (không có filter)
    const targetListKey = TARGET_KEYS.list(undefined);

    const createTarget = useMutation({
        mutationFn: (data: any) => apiService.createTarget(data),
        onMutate: async (newData) => {
            await queryClient.cancelQueries({ queryKey: TARGET_KEYS.all });
            const previous = queryClient.getQueryData<any[]>(targetListKey);
            // Thêm record tạm vào đầu list ngay lập tức
            queryClient.setQueryData<any[]>(targetListKey, (old = []) => [
                { ...newData, id: `temp_${Date.now()}`, actualValue: 0, createdAt: new Date().toISOString() },
                ...old,
            ]);
            return { previous };
        },
        onError: (_err, _data, context) => {
            if (context?.previous !== undefined)
                queryClient.setQueryData(targetListKey, context.previous);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: TARGET_KEYS.all });
        },
    });

    const updateTarget = useMutation({
        mutationFn: (data: { id: string;[key: string]: any }) => apiService.updateTarget(data.id, data),
        onMutate: async (updatedData) => {
            await queryClient.cancelQueries({ queryKey: TARGET_KEYS.all });
            const previous = queryClient.getQueryData<any[]>(targetListKey);
            // Cập nhật record trong cache ngay lập tức
            queryClient.setQueryData<any[]>(targetListKey, (old = []) =>
                old.map(t => t.id === updatedData.id ? { ...t, ...updatedData } : t)
            );
            return { previous };
        },
        onError: (_err, _data, context) => {
            if (context?.previous !== undefined)
                queryClient.setQueryData(targetListKey, context.previous);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: TARGET_KEYS.all });
        },
    });

    const deleteTarget = useMutation({
        mutationFn: (id: string) => apiService.deleteTarget(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: TARGET_KEYS.all });
            const previous = queryClient.getQueryData<any[]>(targetListKey);
            queryClient.setQueryData<any[]>(targetListKey, (old = []) =>
                old.filter(t => t.id !== id)
            );
            return { previous };
        },
        onError: (_err, _id, context) => {
            if (context?.previous !== undefined)
                queryClient.setQueryData(targetListKey, context.previous);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: TARGET_KEYS.all });
        },
    });

    return { createTarget, updateTarget, deleteTarget };
};
