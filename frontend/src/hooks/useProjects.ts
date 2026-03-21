import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import type { Project } from '../types';

export const PROJECT_KEYS = {
    all: ['projects'] as const,
    list: (filters?: any) => [...PROJECT_KEYS.all, 'list', filters] as const,
    detail: (id: string) => [...PROJECT_KEYS.all, 'detail', id] as const,
};

export const useProjects = (enabled: boolean = true, filters?: any) => {
    return useQuery<Project[]>({
        queryKey: PROJECT_KEYS.list(filters),
        queryFn: async () => {
            const response = await apiService.getProjects(filters);
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch projects');
            }
            return response.data;
        },
        enabled,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
};

export const useProjectItems = (projectId: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: [...PROJECT_KEYS.detail(projectId), 'items'] as const,
        queryFn: async () => {
            const response = await apiService.getProjectItems({ projectId });
            if (!response.success) throw new Error(response.error);
            return response.data;
        },
        enabled: enabled && !!projectId,
    });
};

export const useProjectMembers = (projectId: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: [...PROJECT_KEYS.detail(projectId), 'members'] as const,
        queryFn: async () => {
            const response = await apiService.getProjectMembers({ projectId });
            if (!response.success) throw new Error(response.error);
            return response.data;
        },
        enabled: enabled && !!projectId,
    });
};

export const useProjectMutations = () => {
    const queryClient = useQueryClient();

    const createProject = useMutation({
        mutationFn: (data: any) => apiService.createProject(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.list() });
        },
    });

    const updateProject = useMutation({
        mutationFn: (data: any) => apiService.updateProject(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.list() });
        },
    });

    const deleteProject = useMutation({
        mutationFn: (data: { id: string }) => apiService.deleteProject(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.list() });
        },
    });

    return { createProject, updateProject, deleteProject };
};
