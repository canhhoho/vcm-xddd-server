/**
 * projectUtils.ts
 * Shared utility functions cho Project module.
 * Tập trung tại đây để tránh duplicate code giữa Projects, ProjectCard, ProjectDetail.
 */

import type { TFunction } from 'i18next';

// ---------------------------------------------------------------------------
// normalizeId
// ---------------------------------------------------------------------------
/**
 * Chuẩn hóa ID (xử lý ".0" suffix, trim whitespace, parse số nguyên).
 * Dùng để so sánh id giữa frontend và backend khi format không đồng nhất.
 */
export const normalizeId = (id: unknown): string => {
    if (id === null || id === undefined) return '';
    let str = String(id).trim();
    if (str.endsWith('.0')) str = str.slice(0, -2);
    if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        if (!isNaN(num)) return num.toString();
    }
    return str;
};

// ---------------------------------------------------------------------------
// getStatusInfo
// ---------------------------------------------------------------------------
export interface StatusInfo {
    label: string;
    className: 'status-doing' | 'status-done' | 'status-planning';
}

/**
 * Trả về label và CSS class name cho một project/task status.
 * @param status   - Giá trị status từ backend (e.g. 'TODO', 'INPROCESS', 'DONE')
 * @param statusMap - Bản đồ dịch nhãn từ appConfig.STATUS (optional)
 * @param t        - i18n translate function (optional, fallback sang key nếu không có)
 */
export const getStatusInfo = (
    status: string,
    statusMap?: Record<string, string>,
    t?: TFunction,
): StatusInfo => {
    const map = statusMap || {};
    // Ưu tiên i18n theo ngôn ngữ hiện tại; statusMap (appConfig.STATUS) chỉ là fallback khi thiếu t
    // 'INPROCESS' backend trả về map key 'IN_PROGRESS'
    const fallback = status === 'INPROCESS'
        ? map.IN_PROGRESS
        : (map[status] || status);

    if (status === 'INProcess' || status === 'INPROCESS' || status === 'IN_PROGRESS') {
        return {
            label: t ? t('projects.statusInProcess') : (fallback || 'Đang thi công'),
            className: 'status-doing',
        };
    }
    if (status === 'DONE') {
        return {
            label: t ? t('projects.statusDone') : (fallback || 'Hoàn thành'),
            className: 'status-done',
        };
    }
    if (status === 'TODO' || !status) {
        return {
            label: t ? t('projects.statusTodo') : (fallback || 'Kế hoạch'),
            className: 'status-planning',
        };
    }
    // Trạng thái lạ: giữ label từ statusMap / raw status
    return {
        label: fallback || (t ? t('projects.statusTodo') : 'Kế hoạch'),
        className: 'status-planning',
    };
};
