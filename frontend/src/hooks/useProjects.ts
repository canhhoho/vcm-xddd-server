import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { unwrap } from '../services/unwrap';
import type { ProjectInput } from '../services/api.interface';
import type { Project, ProjectMember, ProjectItemType } from '../types';

export const PROJECT_KEYS = {
    all: ['projects'] as const,
    list: (filters?: Record<string, string | undefined>) => [...PROJECT_KEYS.all, 'list', filters] as const,
    detail: (id: string) => [...PROJECT_KEYS.all, 'detail', id] as const,
};

// Cache backend (CacheService.TTL.SHORT) đã đứng trước rồi; để staleTime 5 phút
// ở đây nữa thì sửa task xong tiến độ dự án trễ hai tầng.
const STALE_TIME = 30_000;

export const useProjects = (enabled: boolean = true, filters?: Record<string, string | undefined>) => {
    return useQuery<Project[]>({
        queryKey: PROJECT_KEYS.list(filters),
        queryFn: () => unwrap(apiService.getProjects(filters), 'Failed to fetch projects'),
        enabled,
        staleTime: STALE_TIME,
    });
};

export const useProjectItems = (projectId: string, enabled: boolean = true) => {
    return useQuery<ProjectItemType[]>({
        queryKey: [...PROJECT_KEYS.detail(projectId), 'items'] as const,
        queryFn: () => unwrap(apiService.getProjectItems({ projectId }), 'Failed to fetch project items'),
        enabled: enabled && !!projectId,
    });
};

export const useProjectMembers = (projectId: string, enabled: boolean = true) => {
    return useQuery<ProjectMember[]>({
        queryKey: [...PROJECT_KEYS.detail(projectId), 'members'] as const,
        queryFn: () => unwrap(apiService.getProjectMembers({ projectId }), 'Failed to fetch project members'),
        enabled: enabled && !!projectId,
    });
};

export const useProjectMutations = () => {
    const queryClient = useQueryClient();

    // Invalidate cả nhánh 'projects': list() có filters trong key nên
    // PROJECT_KEYS.list() (filters undefined) không phải tiền tố của list({...}).
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.all });
    };

    const createProject = useMutation({
        mutationFn: (data: ProjectInput) => unwrap(apiService.createProject(data), 'Không tạo được dự án'),
        onSuccess: invalidate,
    });

    const updateProject = useMutation({
        mutationFn: (data: ProjectInput & { id: string }) =>
            unwrap(apiService.updateProject(data), 'Không cập nhật được dự án'),
        onSuccess: invalidate,
    });

    const deleteProject = useMutation({
        mutationFn: (data: { id: string }) => unwrap(apiService.deleteProject(data), 'Không xoá được dự án'),
        onSuccess: invalidate,
    });

    return { createProject, updateProject, deleteProject };
};

export const useProjectMemberMutations = (projectId: string) => {
    const queryClient = useQueryClient();
    const membersKey = [...PROJECT_KEYS.detail(projectId), 'members'] as const;

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: membersKey });
        // members nằm trong payload của GET /projects, nên list cũng cũ theo.
        queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.all });
    };

    const addMember = useMutation({
        mutationFn: (data: { userId: string; role: string }) =>
            unwrap(apiService.addProjectMember({ projectId, ...data }), 'Không thêm được thành viên'),
        onSuccess: invalidate,
    });

    const removeMember = useMutation({
        // Cần projectId: members lưu trong cột JSONB của chính project đó.
        mutationFn: (data: { id: string }) =>
            unwrap(apiService.removeProjectMember({ projectId, id: data.id }), 'Không xoá được thành viên'),
        onSuccess: invalidate,
    });

    return { addMember, removeMember };
};
