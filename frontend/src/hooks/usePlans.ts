import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';

export const PLAN_KEYS = {
    all: ['plans'] as const,
    monthly: (filters: any) => [...PLAN_KEYS.all, 'monthly', filters] as const,
    weekly: (filters: any) => [...PLAN_KEYS.all, 'weekly', filters] as const,
};

export const useMonthlyPlans = (filters: any, enabled = true) => {
    return useQuery({
        queryKey: PLAN_KEYS.monthly(filters),
        queryFn: async () => {
            const res = await apiService.getMonthlyPlans(filters);
            if (!res.success) throw new Error(res.error || 'Failed to fetch monthly plans');
            
            // If plans exist, fetch their items
            const plans = res.data || [];
            if (plans.length > 0) {
                const planId = plans[0].id;
                const itemsRes = await apiService.getMonthlyPlanItems(planId);
                if (itemsRes.success) {
                    plans[0].items = itemsRes.data || [];
                }
            }
            return plans;
        },
        enabled,
    });
};

export const useWeeklyPlans = (filters: any, enabled = true) => {
    return useQuery({
        queryKey: PLAN_KEYS.weekly(filters),
        queryFn: async () => {
            // Using the optimized backend endpoint with includeItems=true
            const res = await apiService.getWeeklyPlans({ ...filters, includeItems: 'true' });
            if (!res.success) throw new Error(res.error || 'Failed to fetch weekly plans');
            return res.data || [];
        },
        enabled,
    });
};

export const usePlanMutations = () => {
    const queryClient = useQueryClient();

    const createMonthlyPlan = useMutation({
        mutationFn: (data: any) => apiService.createMonthlyPlan(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...PLAN_KEYS.all, 'monthly'] }),
    });

    const updateMonthlyPlanItem = useMutation({
        mutationFn: ({ id, data }: { id: string, data: any }) => apiService.updateMonthlyPlanItem(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...PLAN_KEYS.all, 'monthly'] }),
    });

    const createMonthlyPlanItem = useMutation({
        mutationFn: ({ planId, data }: { planId: string, data: any }) => apiService.createMonthlyPlanItem(planId, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...PLAN_KEYS.all, 'monthly'] }),
    });

    const deleteMonthlyPlanItem = useMutation({
        mutationFn: (id: string) => apiService.deleteMonthlyPlanItem(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...PLAN_KEYS.all, 'monthly'] }),
    });

    const deleteMonthlyPlan = useMutation({
        mutationFn: (id: string) => apiService.deleteMonthlyPlan(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...PLAN_KEYS.all, 'monthly'] }),
    });

    const createWeeklyPlan = useMutation({
        mutationFn: (data: any) => apiService.createWeeklyPlan(data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...PLAN_KEYS.all, 'weekly'] }),
    });

    const updateWeeklyPlanItem = useMutation({
        mutationFn: (data: any) => apiService.updateWeeklyPlanItem(data.id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...PLAN_KEYS.all, 'weekly'] }),
    });

    const createWeeklyPlanItem = useMutation({
        mutationFn: ({ planId, data }: { planId: string, data: any }) => apiService.createWeeklyPlanItem(planId, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...PLAN_KEYS.all, 'weekly'] }),
    });

    const deleteWeeklyPlanItem = useMutation({
        mutationFn: (id: string) => apiService.deleteWeeklyPlanItem(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...PLAN_KEYS.all, 'weekly'] }),
    });

    return {
        createMonthlyPlan,
        updateMonthlyPlanItem,
        createMonthlyPlanItem,
        deleteMonthlyPlanItem,
        deleteMonthlyPlan,
        createWeeklyPlan,
        updateWeeklyPlanItem,
        createWeeklyPlanItem,
        deleteWeeklyPlanItem
    };
};
