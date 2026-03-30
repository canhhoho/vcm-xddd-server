import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import type { DashboardStats } from '../types';
import dayjs from 'dayjs';

// Keys for caching
export const DASHBOARD_KEYS = {
    all: ['dashboard'] as const,
    stats: (date: string, mode: string) => [...DASHBOARD_KEYS.all, 'stats', date, mode] as const,
};

export const useDashboardStats = (targetDate: string, viewMode: string = 'MONTH', enabled: boolean = true) => {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: DASHBOARD_KEYS.stats(targetDate, viewMode),
        queryFn: async () => {
            const response = await apiService.getDashboardStats(false, targetDate, viewMode);
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch dashboard data');
            }
            return response.data as DashboardStats;
        },
        enabled: enabled,
        staleTime: 5 * 60 * 1000, // 5 minutes
        placeholderData: (previousData) => previousData, // Keep showing previous data while fetching new date
    });

    const refresh = async () => {
        // Invalidate current query to trigger refetch
        // We pass active: true to only refetch active queries if needed, 
        // but invalidateQueries is better for "Force Refresh" button
        return queryClient.invalidateQueries({ queryKey: DASHBOARD_KEYS.stats(targetDate, viewMode) });
    };

    const forceRefresh = async () => {
        // Call API with forceRefresh=true and update cache
        const response = await apiService.getDashboardStats(true, targetDate, viewMode);
        if (response.success && response.data) {
            queryClient.setQueryData(DASHBOARD_KEYS.stats(targetDate, viewMode), response.data);
        }
        return response;
    };

    return {
        ...query,
        refresh,
        forceRefresh,
    };
};
