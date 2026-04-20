import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';

export const BRANCH_KEYS = {
    all: ['branches'] as const,
    list: () => [...BRANCH_KEYS.all, 'list'] as const,
};

export const STAFF_KEYS = {
    all: ['staff'] as const,
    list: () => [...STAFF_KEYS.all, 'list'] as const,
};

export const COLLABORATOR_KEYS = {
    all: ['collaborators'] as const,
    list: () => [...COLLABORATOR_KEYS.all, 'list'] as const,
};

export const useBranches = (enabled: boolean = true) => {
    return useQuery({
        queryKey: BRANCH_KEYS.list(),
        queryFn: async () => {
            const response = await apiService.getBranches();
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch branches');
            }
            return response.data;
        },
        enabled,
        staleTime: Infinity, // Never stale (until invalidation)
        gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
};

export const useStaff = (enabled: boolean = true) => {
    return useQuery({
        queryKey: STAFF_KEYS.list(),
        queryFn: async () => {
            const response = await apiService.getStaff();
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch staff');
            }
            return response.data;
        },
        enabled,
        staleTime: 60 * 60 * 1000, // 1 hour (increased from 15m)
        gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
};

export const useBranchMutations = () => {
    const queryClient = useQueryClient();

    const createBranch = useMutation({
        mutationFn: (data: any) => apiService.createBranch(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: BRANCH_KEYS.all });
        },
    });

    const updateBranch = useMutation({
        mutationFn: (data: any) => apiService.updateBranch(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: BRANCH_KEYS.all });
        },
    });

    const deleteBranch = useMutation({
        mutationFn: (data: { id: string }) => apiService.deleteBranch(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: BRANCH_KEYS.all });
        },
    });

    return { createBranch, updateBranch, deleteBranch };
};

export const useCollaborators = (enabled: boolean = true) => {
    return useQuery({
        queryKey: COLLABORATOR_KEYS.list(),
        queryFn: async () => {
            const response = await apiService.getCollaborators();
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch collaborators');
            }
            return response.data;
        },
        enabled,
        staleTime: 60 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
};

export const useCollaboratorMutations = () => {
    const queryClient = useQueryClient();

    const createCollaborator = useMutation({
        mutationFn: (data: any) => apiService.createCollaborator(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: COLLABORATOR_KEYS.all });
        },
    });

    const updateCollaborator = useMutation({
        mutationFn: (data: any) => apiService.updateCollaborator(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: COLLABORATOR_KEYS.all });
        },
    });

    const deleteCollaborator = useMutation({
        mutationFn: (data: { id: string }) => apiService.deleteCollaborator(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: COLLABORATOR_KEYS.all });
        },
    });

    return { createCollaborator, updateCollaborator, deleteCollaborator };
};

export const useStaffMutations = () => {
    const queryClient = useQueryClient();

    const createStaff = useMutation({
        mutationFn: (data: any) => apiService.createStaff(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: STAFF_KEYS.all });
        },
    });

    const updateStaff = useMutation({
        mutationFn: (data: any) => apiService.updateStaff(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: STAFF_KEYS.all });
        },
    });

    const deleteStaff = useMutation({
        mutationFn: (data: { id: string }) => apiService.deleteStaff(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: STAFF_KEYS.all });
        },
    });

    return { createStaff, updateStaff, deleteStaff };
};
