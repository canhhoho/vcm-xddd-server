import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';

export const PRESENCE_KEYS = {
    all: ['presence'] as const,
    list: () => [...PRESENCE_KEYS.all, 'list'] as const,
};

export interface PresenceUser {
    id: string;
    email: string;
    name: string;
    positionName: string;
    /** ISO string, null nếu user chưa bao giờ đăng nhập */
    lastSeenAt: string | null;
    online: boolean;
}

/** Nhịp gửi heartbeat. Ngưỡng coi là online do server quyết (routes/presence.js). */
const HEARTBEAT_INTERVAL = 60_000;

/**
 * Danh sách user kèm trạng thái online.
 *
 * refetchOnWindowFocus bật riêng ở đây để ghi đè mặc định `false` đặt toàn cục
 * trong main.tsx — quay lại tab mà vẫn thấy số cũ thì tính năng vô nghĩa.
 */
export const usePresence = (enabled: boolean = true) => {
    return useQuery({
        queryKey: PRESENCE_KEYS.list(),
        queryFn: async () => {
            const response = await apiService.getPresence();
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch presence');
            }
            return (response.data || []) as PresenceUser[];
        },
        enabled,
        refetchInterval: HEARTBEAT_INTERVAL,
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    });
};

/**
 * Báo cho server biết user còn đang mở app. Gắn một lần duy nhất ở MainLayout.
 *
 * Lỗi được nuốt im lặng có chủ ý: mất mạng chốc lát chỉ nên làm chấm xanh tắt,
 * không được nổi toast hay chặn thao tác đang làm dở.
 */
export const useHeartbeat = (enabled: boolean = true) => {
    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        const beat = () => {
            if (cancelled) return;
            apiService.sendHeartbeat().catch(() => { /* im lặng - xem doc ở trên */ });
        };

        beat(); // đừng bắt user chờ hết một nhịp mới hiện online
        const timer = setInterval(beat, HEARTBEAT_INTERVAL);

        // Tab nền bị throttle timer; quay lại thì bắn ngay một nhịp cho chắc.
        const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            cancelled = true;
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [enabled]);
};
