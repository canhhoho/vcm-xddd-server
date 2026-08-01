import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import type { Contract } from '../types';
import { DASHBOARD_KEYS } from './useDashboardStats';

export const CONTRACT_KEYS = {
    all: ['contracts'] as const,
    list: () => [...CONTRACT_KEYS.all, 'list'] as const,
    detail: (id: string) => [...CONTRACT_KEYS.all, 'detail', id] as const,
};

export const useContracts = (enabled: boolean = true) => {
    return useQuery({
        queryKey: CONTRACT_KEYS.list(),
        queryFn: async () => {
            const response = await apiService.getContracts();
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch contracts');
            }
            return response.data as Contract[];
        },
        enabled,
        // Backend đã cache CONTRACTS_LIST (TTL.SHORT). Để thêm 5 phút ở client là
        // chồng hai tầng: thêm hoá đơn xong, tiến độ hợp đồng trễ tới 5 phút dù
        // cache server đã hết hạn. 30s đủ để gộp request mà không giữ dữ liệu cũ.
        staleTime: 30 * 1000,
    });
};

export const useContractMutations = () => {
    const queryClient = useQueryClient();

    const invalidateRelated = () => {
        queryClient.invalidateQueries({ queryKey: CONTRACT_KEYS.list() });
        queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.all });
    };

    const createContract = useMutation({
        mutationFn: (data: any) => apiService.createContract(data),
        onSuccess: invalidateRelated,
    });

    const updateContract = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => apiService.updateContract(id, data),
        onSuccess: invalidateRelated,
    });

    const deleteContract = useMutation({
        mutationFn: (id: string) => apiService.deleteContract(id),
        onSuccess: invalidateRelated,
    });

    return {
        createContract,
        updateContract,
        deleteContract,
    };
};
