import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { unwrap } from '../services/unwrap';
import type {
    WeeklyPlanQuery, MonthlyPlanQuery,
    CreateWeeklyPlanInput, CreateMonthlyPlanInput, CopyMonthlyPlanInput,
    WeeklyPlanItemInput, MonthlyPlanItemInput,
} from '../services/api.interface';
import type { WeeklyPlan, MonthlyPlan, PlanItemStatus } from '../types';

export const PLAN_KEYS = {
    all: ['plans'] as const,
    monthly: (filters: MonthlyPlanQuery) => [...PLAN_KEYS.all, 'monthly', filters] as const,
    weekly: (filters: WeeklyPlanQuery) => [...PLAN_KEYS.all, 'weekly', filters] as const,
};

export const useMonthlyPlans = (filters: MonthlyPlanQuery, enabled = true) => {
    return useQuery({
        queryKey: PLAN_KEYS.monthly(filters),
        queryFn: async (): Promise<MonthlyPlan[]> => {
            const data = await unwrap(
                apiService.getMonthlyPlans({ ...filters, includeItems: 'true' }),
                'Failed to fetch monthly plans'
            );
            return data || [];
        },
        enabled,
    });
};

export const useWeeklyPlans = (filters: WeeklyPlanQuery, enabled = true) => {
    return useQuery({
        queryKey: PLAN_KEYS.weekly(filters),
        queryFn: async (): Promise<WeeklyPlan[]> => {
            const data = await unwrap(
                apiService.getWeeklyPlans({ ...filters, includeItems: 'true' }),
                'Failed to fetch weekly plans'
            );
            return data || [];
        },
        enabled,
    });
};

export const usePlanMutations = () => {
    const queryClient = useQueryClient();

    const invalidateMonthly = () =>
        queryClient.invalidateQueries({ queryKey: [...PLAN_KEYS.all, 'monthly'] });
    const invalidateWeekly = () =>
        queryClient.invalidateQueries({ queryKey: [...PLAN_KEYS.all, 'weekly'] });

    // ==================== MONTHLY ====================

    const createMonthlyPlan = useMutation({
        mutationFn: (data: CreateMonthlyPlanInput) =>
            unwrap(apiService.createMonthlyPlan(data), 'Failed to create monthly plan'),
        onSuccess: invalidateMonthly,
    });

    // Copy mục tiêu chưa xong từ kế hoạch tháng gần nhất trước đó sang tháng đang xem.
    // invalidateMonthly quét cả prefix nên query tháng đích lẫn query tháng nguồn đều refetch.
    const copyMonthlyPlanFromPrevious = useMutation({
        mutationFn: (data: CopyMonthlyPlanInput) =>
            unwrap(apiService.copyMonthlyPlanFromPrevious(data), 'Failed to copy monthly plan'),
        onSuccess: invalidateMonthly,
    });

    const updateMonthlyPlanItem = useMutation({
        mutationFn: ({ id, data }: { id: string; data: MonthlyPlanItemInput }) =>
            unwrap(apiService.updateMonthlyPlanItem(id, data), 'Failed to update goal'),
        onSuccess: invalidateMonthly,
    });

    const createMonthlyPlanItem = useMutation({
        mutationFn: ({ planId, data }: { planId: string; data: MonthlyPlanItemInput }) =>
            unwrap(apiService.createMonthlyPlanItem(planId, data), 'Failed to create goal'),
        onSuccess: invalidateMonthly,
    });

    const deleteMonthlyPlanItem = useMutation({
        mutationFn: (id: string) =>
            unwrap(apiService.deleteMonthlyPlanItem(id), 'Failed to delete goal'),
        onSuccess: invalidateMonthly,
    });

    const deleteMonthlyPlan = useMutation({
        mutationFn: (id: string) =>
            unwrap(apiService.deleteMonthlyPlan(id), 'Failed to delete monthly plan'),
        onSuccess: invalidateMonthly,
    });

    // ==================== WEEKLY ====================

    const createWeeklyPlan = useMutation({
        mutationFn: (data: CreateWeeklyPlanInput) =>
            unwrap(apiService.createWeeklyPlan(data), 'Failed to create weekly plan'),
        onSuccess: invalidateWeekly,
    });

    const deleteWeeklyPlan = useMutation({
        mutationFn: (id: string) =>
            unwrap(apiService.deleteWeeklyPlan(id), 'Failed to delete weekly plan'),
        onSuccess: invalidateWeekly,
    });

    const updateWeeklyPlanItem = useMutation({
        mutationFn: ({ id, data }: { id: string; data: WeeklyPlanItemInput }) =>
            unwrap(apiService.updateWeeklyPlanItem(id, data), 'Failed to update task'),
        onSuccess: invalidateWeekly,
    });

    const createWeeklyPlanItem = useMutation({
        mutationFn: ({ planId, data }: { planId: string; data: WeeklyPlanItemInput }) =>
            unwrap(apiService.createWeeklyPlanItem(planId, data), 'Failed to create task'),
        onSuccess: invalidateWeekly,
    });

    const deleteWeeklyPlanItem = useMutation({
        mutationFn: (id: string) =>
            unwrap(apiService.deleteWeeklyPlanItem(id), 'Failed to delete task'),
        onSuccess: invalidateWeekly,
    });

    const updateWeeklyPlanItemsStatus = useMutation({
        mutationFn: ({ ids, status }: { ids: string[]; status: PlanItemStatus }) =>
            unwrap(apiService.updateWeeklyPlanItemsStatus(ids, status), 'Failed to update status'),
        onSuccess: invalidateWeekly,
    });

    return {
        createMonthlyPlan,
        copyMonthlyPlanFromPrevious,
        updateMonthlyPlanItem,
        createMonthlyPlanItem,
        deleteMonthlyPlanItem,
        deleteMonthlyPlan,
        createWeeklyPlan,
        deleteWeeklyPlan,
        updateWeeklyPlanItem,
        createWeeklyPlanItem,
        deleteWeeklyPlanItem,
        updateWeeklyPlanItemsStatus,
    };
};
