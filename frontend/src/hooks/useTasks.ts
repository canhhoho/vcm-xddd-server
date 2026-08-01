import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { unwrap } from '../services/unwrap';
import { PROJECT_KEYS } from './useProjects';
import type { TaskInput } from '../services/api.interface';
import type { Task } from '../types';

export const TASK_KEYS = {
    all: ['tasks'] as const,
    list: (filters?: { projectId: string; itemType?: string }) => [...TASK_KEYS.all, 'list', filters] as const,
    detail: (id: string) => [...TASK_KEYS.all, 'detail', id] as const,
};

const STALE_TIME = 30_000;

export const useTasks = (enabled: boolean = true, filters?: { projectId: string; itemType?: string }) => {
    return useQuery<Task[]>({
        queryKey: TASK_KEYS.list(filters),
        queryFn: () => unwrap(
            apiService.getTasks(filters ?? { projectId: '' }),
            'Failed to fetch tasks',
        ),
        enabled,
        staleTime: STALE_TIME,
    });
};

export const useTaskMutations = (projectId?: string) => {
    const queryClient = useQueryClient();

    // Tiến độ dự án = AVG(tasks.progress), nên mọi thay đổi task cũng làm cũ
    // danh sách project.
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: TASK_KEYS.all });
        queryClient.invalidateQueries({ queryKey: PROJECT_KEYS.all });
    };

    const createTask = useMutation({
        mutationFn: (data: TaskInput & { name: string }) =>
            unwrap(
                apiService.createTask({ ...data, projectId: data.projectId ?? projectId ?? '' }),
                'Không tạo được công việc',
            ),
        onSuccess: invalidate,
    });

    const updateTask = useMutation({
        mutationFn: (data: TaskInput & { id: string }) =>
            unwrap(apiService.updateTask(data), 'Không cập nhật được công việc'),
        onSuccess: invalidate,
    });

    const deleteTask = useMutation({
        mutationFn: (data: { id: string }) => unwrap(apiService.deleteTask(data), 'Không xoá được công việc'),
        onSuccess: invalidate,
    });

    return { createTask, updateTask, deleteTask };
};
