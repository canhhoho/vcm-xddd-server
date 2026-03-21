import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';

export const USER_KEYS = {
    all: ['users'] as const,
    list: () => [...USER_KEYS.all, 'list'] as const,
};

export const POSITION_KEYS = {
    all: ['positions'] as const,
    list: () => [...POSITION_KEYS.all, 'list'] as const,
};

export const PERMISSION_KEYS = {
    all: ['permissions'] as const,
    list: () => [...PERMISSION_KEYS.all, 'list'] as const,
};

export const ACTIVITY_KEYS = {
    all: ['activities'] as const,
    list: () => [...ACTIVITY_KEYS.all, 'list'] as const,
};

export const useUsers = (enabled: boolean = true) => {
    return useQuery({
        queryKey: USER_KEYS.list(),
        queryFn: async () => {
            const response = await apiService.getUsers();
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch users');
            }
            return response.data;
        },
        enabled,
        staleTime: 15 * 60 * 1000, // 15 minutes
    });
};

export const usePositions = (enabled: boolean = true) => {
    return useQuery({
        queryKey: POSITION_KEYS.list(),
        queryFn: async () => {
            const response = await apiService.getPositions();
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch positions');
            }
            return response.data;
        },
        enabled,
        staleTime: 60 * 60 * 1000, // 1 hour (Positions rarely change)
    });
};

export const useModulePermissions = (enabled: boolean = true) => {
    return useQuery({
        queryKey: PERMISSION_KEYS.list(),
        queryFn: async () => {
            const response = await apiService.getPermissions();
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch permissions');
            }
            return response.data;
        },
        enabled,
        staleTime: 5 * 60 * 1000,
    });
};

export const useActivities = (enabled: boolean = true) => {
    return useQuery({
        queryKey: ACTIVITY_KEYS.list(),
        queryFn: async () => {
            const response = await apiService.getActivities();
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch activities');
            }
            return response.data;
        },
        enabled,
        staleTime: 1 * 60 * 1000, // 1 minute (Activities update often)
    });
};

export const useUserMutations = () => {
    const queryClient = useQueryClient();

    const createUser = useMutation({
        mutationFn: (data: any) => apiService.createUser(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: USER_KEYS.all });
            queryClient.invalidateQueries({ queryKey: PERMISSION_KEYS.all }); // New user needs permissions
        },
    });

    const updateUser = useMutation({
        mutationFn: (data: any) => apiService.updateUser(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: USER_KEYS.all });
            queryClient.invalidateQueries({ queryKey: PERMISSION_KEYS.all });
        },
    });

    const deleteUser = useMutation({
        mutationFn: (data: { id: string }) => apiService.deleteUser(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: USER_KEYS.all });
            queryClient.invalidateQueries({ queryKey: PERMISSION_KEYS.all });
        },
    });

    return { createUser, updateUser, deleteUser };
};

export const usePositionMutations = () => {
    const queryClient = useQueryClient();

    const createPosition = useMutation({
        mutationFn: (data: any) => apiService.createPosition(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: POSITION_KEYS.all });
        },
    });

    const updatePosition = useMutation({
        mutationFn: (data: any) => apiService.updatePosition(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: POSITION_KEYS.all });
        },
    });

    const deletePosition = useMutation({
        mutationFn: (data: { id: string }) => apiService.deletePosition(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: POSITION_KEYS.all });
        },
    });

    return { createPosition, updatePosition, deletePosition };
};

export const usePermissionMutations = () => {
    const queryClient = useQueryClient();

    const savePermissions = useMutation({
        mutationFn: (data: any[]) => apiService.savePermissions(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PERMISSION_KEYS.all });
        },
    });

    return { savePermissions };
};
