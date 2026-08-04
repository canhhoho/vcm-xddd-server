import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';

export const NOTIFICATION_KEYS = {
    all: ['notifications'] as const,
    list: () => [...NOTIFICATION_KEYS.all, 'list'] as const,
};

export type NotificationType =
    | 'MY_TASK'
    | 'MY_PLAN_ITEM'
    | 'INVOICE_UNPAID'
    | 'CONTRACT_ENDING'
    | 'PROJECT_ENDING'
    | 'PROSPECT_OVERDUE'
    | 'ACTIVITY';

export interface NotificationItem {
    id: string;
    type: NotificationType;
    title: string;
    detail: string;
    /** Thời điểm mục bắt đầu đáng báo — KHÔNG phải hạn. Xem routes/notifications.js */
    occurredAt: string;
    dueDate: string | null;
    severity: 'overdue' | 'soon';
    /** Hash route, vd '#/projects' */
    link: string;
}

export interface NotificationPayload {
    unreadCount: number;
    items: NotificationItem[];
}

const EMPTY: NotificationPayload = { unreadCount: 0, items: [] };

const POLL_INTERVAL = 60_000;

/**
 * Thông báo + số chưa đọc.
 *
 * refetchOnWindowFocus bật riêng để ghi đè mặc định `false` toàn cục ở main.tsx —
 * quay lại tab mà badge vẫn là số cũ thì thông báo mất tác dụng.
 */
export const useNotifications = (enabled: boolean = true) => {
    return useQuery({
        queryKey: NOTIFICATION_KEYS.list(),
        queryFn: async () => {
            const response = await apiService.getNotifications();
            if (!response.success) {
                throw new Error(response.error || 'Failed to fetch notifications');
            }
            return (response.data || EMPTY) as NotificationPayload;
        },
        enabled,
        refetchInterval: POLL_INTERVAL,
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    });
};

/**
 * Đánh dấu đã xem. Gọi khi mở popover.
 *
 * Ghi thẳng unreadCount = 0 vào cache thay vì invalidate: invalidate sẽ fetch lại
 * và badge nháy số cũ một nhịp trước khi về 0. Danh sách items giữ nguyên — "đã
 * đọc" chỉ tắt số đếm, không ẩn nội dung.
 *
 * Ghi thẳng unreadCount = 0 vào cache rồi invalidate để lấy lại bản chính xác từ
 * server. Cách này cố ý ĐƠN GIẢN: bản trước dùng `await cancelQueries()` trước
 * setQueryData và hỏng — khi tab ẩn, React Query tạm dừng query nền nên promise
 * đó không resolve và setQueryData không bao giờ chạy.
 */
export const useMarkNotificationsRead = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const response = await apiService.markNotificationsRead();
            if (!response.success) {
                throw new Error(response.error || 'Failed to mark notifications read');
            }
            return response;
        },
        onSuccess: () => {
            queryClient.setQueryData<NotificationPayload>(
                NOTIFICATION_KEYS.list(),
                (prev) => (prev ? { ...prev, unreadCount: 0 } : prev)
            );
            void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.list() });
        },
    });
};
