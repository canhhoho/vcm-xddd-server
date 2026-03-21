import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';

export const APP_CONFIG_KEYS = {
    all: ['appConfig'] as const,
    metaData: () => [...APP_CONFIG_KEYS.all, 'metaData'] as const,
};

export const useAppConfig = (enabled: boolean = true) => {
    return useQuery({
        queryKey: APP_CONFIG_KEYS.metaData(),
        queryFn: async () => {
            const response = await apiService.getAppMetaData();
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch app config');
            }
            return response.data;
        },
        enabled,
        staleTime: Infinity, // Config never changes
        gcTime: 24 * 60 * 60 * 1000, // Keep in cache for 24 hours
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
};
