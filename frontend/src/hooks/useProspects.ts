import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { unwrap } from '../services/unwrap';
import type { Prospect } from '../types';

export const PROSPECT_KEYS = {
    all: ['prospects'] as const,
};

/**
 * Tải toàn bộ prospect (cả B2B lẫn B2C) trong một request.
 * Truyền `type` vào getProspects sẽ tách thành hai query key và hai request;
 * hai thẻ funnel ở Dashboard tự lọc theo prospectType ở client nên không cần.
 */
export const useProspects = () => {
    return useQuery({
        queryKey: PROSPECT_KEYS.all,
        queryFn: async (): Promise<Prospect[]> => {
            const data = await unwrap(
                apiService.getProspects(),
                'Failed to fetch prospects'
            );
            return (data as Prospect[]) || [];
        },
        staleTime: 5 * 60 * 1000,
    });
};
