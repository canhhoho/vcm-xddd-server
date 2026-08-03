/**
 * 5 bậc của phễu kinh doanh, dùng chung cho cả thẻ B2B và B2C.
 * Màu ở đây là màu riêng của phễu (không nằm trong BRAND_COLORS) và giữ đúng
 * bảng màu đã dùng từ trước — đổi màu là thay đổi giao diện, không phải refactor.
 * LOST cố ý không có trong phễu.
 */
export interface FunnelStage {
    stage: string;
    color: string;
    labelKey: string;
}

export const FUNNEL_STAGES: FunnelStage[] = [
    { stage: 'NEW', color: '#E05C97', labelKey: 'business.prospects.statusOptions.NEW' },
    { stage: 'CONTACTED', color: '#F97316', labelKey: 'business.prospects.statusOptions.CONTACTED' },
    { stage: 'PROPOSAL', color: '#F59E0B', labelKey: 'business.prospects.statusOptions.PROPOSAL' },
    { stage: 'NEGOTIATION', color: '#3B9ED8', labelKey: 'business.prospects.statusOptions.NEGOTIATION' },
    { stage: 'WON', color: '#1D4ED8', labelKey: 'business.prospects.statusOptions.WON' },
];

/** Một dòng đã gộp của phễu — giữ nguyên shape mà backend từng trả về */
export interface FunnelDatum {
    stage: string;
    count: number;
    value: number;
}
