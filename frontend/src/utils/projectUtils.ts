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
    // 'INPROCESS' backend trả về map key 'IN_PROGRESS'
    const label = status === 'INPROCESS'
        ? map.IN_PROGRESS
        : (map[status] || status);

    if (status === 'INProcess' || status === 'INPROCESS' || status === 'IN_PROGRESS') {
        return {
            label: label || (t ? t('projects.statusInProcess') : 'Đang thi công'),
            className: 'status-doing',
        };
    }
    if (status === 'DONE') {
        return {
            label: label || (t ? t('projects.statusDone') : 'Hoàn thành'),
            className: 'status-done',
        };
    }
    // TODO và mọi trạng thái khác
    return {
        label: label || (t ? t('projects.statusTodo') : 'Kế hoạch'),
        className: 'status-planning',
    };
};
