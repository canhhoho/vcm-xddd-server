import type { PlanItemStatus } from '../../types';

/** Màu Tag antd theo trạng thái đầu việc */
export const STATUS_COLORS: Record<PlanItemStatus, string> = {
    TODO: 'default',
    IN_PROGRESS: 'processing',
    DONE: 'success',
    CARRIED_OVER: 'warning',
};

/**
 * Map trạng thái → key i18n.
 * Trước đây mỗi nơi tự sinh key bằng chuỗi (`status${...toLowerCase()}`) nên
 * export Excel sinh ra `statusInprogress` / `statusCarriedover` không tồn tại.
 * Mọi nơi hiển thị trạng thái phải dùng map này.
 */
export const STATUS_LABEL_KEY: Record<PlanItemStatus, string> = {
    TODO: 'plans.fields.statusTodo',
    IN_PROGRESS: 'plans.fields.statusInProgress',
    DONE: 'plans.fields.statusDone',
    CARRIED_OVER: 'plans.fields.statusCarriedOver',
};

/** Trạng thái chọn được trong form/filter (CARRIED_OVER do hệ thống tự đặt) */
export const SELECTABLE_STATUSES: PlanItemStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

/** Class CSS cho cột văn bản dài — xuống hàng đầy đủ (định nghĩa trong pages/Business.css) */
export const WRAP = 'vcm-cell-wrap';

/** Định dạng ngày dùng thống nhất trên toàn page Plan */
export const DATE_FORMAT = 'DD/MM/YYYY';
export const DATE_FORMAT_SHORT = 'DD/MM';

/** Số lượng option tối thiểu cho Select thứ tự (mở rộng động khi plan có nhiều item hơn) */
export const MIN_SORT_ORDER_OPTIONS = 15;

export const buildSortOrderOptions = (itemCount: number): number[] =>
    Array.from({ length: Math.max(MIN_SORT_ORDER_OPTIONS, itemCount + 1) }, (_, i) => i + 1);
