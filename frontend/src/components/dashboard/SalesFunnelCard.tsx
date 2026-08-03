import React, { useMemo, useState } from 'react';
import { Card, Segmented, DatePicker, Select, Spin } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useProspects } from '../../hooks/useProspects';
import type { Prospect } from '../../types';
import { FUNNEL_STAGES } from './funnelStages';
import type { FunnelDatum } from './funnelStages';

type ViewMode = 'ALL' | 'YEAR' | 'MONTH';
type DateField = 'createdAt' | 'contactDate' | 'expectedDate';

interface Props {
    type: 'B2B' | 'B2C';
    title: string;
}

const DATE_FIELDS: DateField[] = ['createdAt', 'contactDate', 'expectedDate'];

/**
 * Thẻ phễu kinh doanh có bộ lọc thời gian riêng.
 *
 * Trước đây hai phễu B2B/B2C là hai khối JSX gần như y hệt trong Dashboard.tsx và
 * lấy số liệu đã gộp sẵn từ /dashboard/stats — nên luôn dùng chung kỳ với cả trang
 * và cố định lọc theo ngày tạo. Ở đây tự gộp từ danh sách prospect để mỗi thẻ chọn
 * được kỳ và mốc ngày riêng.
 */
const SalesFunnelCard: React.FC<Props> = ({ type, title }) => {
    const { t, i18n } = useTranslation();
    // Mặc định Tháng hiện tại cho khớp bộ lọc mặc định của trang — thêm bộ lọc
    // riêng không được làm đổi con số người dùng thấy lúc mở Dashboard
    const [viewMode, setViewMode] = useState<ViewMode>('MONTH');
    const [period, setPeriod] = useState<Dayjs>(dayjs());
    const [dateField, setDateField] = useState<DateField>('createdAt');

    const { data: prospects = [], isLoading } = useProspects();

    const funnelData: FunnelDatum[] = useMemo(() => {
        const unit = viewMode === 'YEAR' ? 'year' : 'month';
        const matched = (prospects as Prospect[]).filter(p => {
            if (p.prospectType !== type) return false;
            if (viewMode === 'ALL') return true;
            // contactDate/expectedDate cho phép rỗng — bản ghi thiếu mốc ngày đang
            // lọc thì không thuộc kỳ nào cả, không được tính vào
            const raw = p[dateField];
            if (!raw) return false;
            const d = dayjs(raw);
            return d.isValid() && d.isSame(period, unit);
        });

        // Backend gộp bằng UPPER(status); giữ nguyên để dữ liệu chữ thường không rơi mất
        const map = new Map<string, FunnelDatum>();
        matched.forEach(p => {
            const stage = String(p.status || '').toUpperCase();
            const entry = map.get(stage) || { stage, count: 0, value: 0 };
            entry.count += 1;
            entry.value += Number(p.estimatedValue) || 0;
            map.set(stage, entry);
        });

        return FUNNEL_STAGES.map(({ stage }) => map.get(stage) || { stage, count: 0, value: 0 });
    }, [prospects, type, viewMode, period, dateField]);

    const totalCount = funnelData.reduce((acc, d) => acc + d.count, 0);
    const totalValue = funnelData.reduce((acc, d) => acc + d.value, 0);
    const locale = i18n.language === 'en' ? 'en-US' : 'vi-VN';

    const filterBar = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Select
                size="small"
                value={dateField}
                onChange={setDateField}
                style={{ width: 130 }}
                options={DATE_FIELDS.map(f => ({ value: f, label: t(`dashboard.dateField.${f}`) }))}
            />
            <Segmented
                size="small"
                value={viewMode}
                onChange={val => setViewMode(val as ViewMode)}
                options={[
                    { label: t('dashboard.all'), value: 'ALL' },
                    { label: t('dashboard.year'), value: 'YEAR' },
                    { label: t('dashboard.month'), value: 'MONTH' },
                ]}
            />
            {viewMode !== 'ALL' && (
                <DatePicker
                    size="small"
                    value={period}
                    onChange={d => d && setPeriod(d)}
                    picker={viewMode === 'YEAR' ? 'year' : 'month'}
                    format={viewMode === 'YEAR' ? 'YYYY' : 'MM/YYYY'}
                    allowClear={false}
                    style={{ width: viewMode === 'YEAR' ? 84 : 104 }}
                />
            )}
        </div>
    );

    return (
        <Card className="dash-chart-card" title={title} extra={filterBar}>
            <Spin spinning={isLoading}>
                {/* Summary KPIs */}
                <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '20px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: 4 }}>{t('dashboard.totalProjects')}</div>
                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#111827' }}>{totalCount}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: 4 }}>{t('dashboard.totalExpectedValue')}</div>
                        <div style={{ fontSize: '22px', fontWeight: 800, color: '#10B981' }}>
                            {totalValue.toLocaleString(locale)}
                            <span style={{ fontSize: '13px', fontWeight: 500, marginLeft: 4 }}>{t('business.prospects.estValueUnit')}</span>
                        </div>
                    </div>
                </div>

                {/* Custom Funnel — mỗi bậc cộng dồn cả các bậc bên dưới */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 8px', gap: 3 }}>
                    {FUNNEL_STAGES.map(({ stage, color, labelKey }, idx, arr) => {
                        const cnt = funnelData.slice(idx).reduce((sum, d) => sum + d.count, 0);
                        const val = funnelData.slice(idx).reduce((sum, d) => sum + d.value, 0);
                        const maxW = 100, minW = 40;
                        const widthPct = maxW - (idx * (maxW - minW) / (arr.length - 1));
                        return (
                            <div
                                key={stage}
                                style={{
                                    width: `${widthPct}%`,
                                    background: color,
                                    borderRadius: idx === 0 ? '10px 10px 0 0' : idx === arr.length - 1 ? '0 0 8px 8px' : '0',
                                    padding: '10px 24px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    minHeight: 46,
                                    clipPath: idx === arr.length - 1
                                        ? 'polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)'
                                        : 'polygon(0% 0%, 100% 0%, 97% 100%, 3% 100%)'
                                }}
                            >
                                <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{t(labelKey)}</span>
                                <span style={{ color: '#fff', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    <strong>{cnt}</strong> {t('dashboard.projectUnit')}
                                    <br />
                                    <span style={{ opacity: 0.85, fontSize: 12 }}>
                                        {val.toLocaleString(locale)} {t('business.prospects.estValueUnit')}
                                    </span>
                                </span>
                            </div>
                        );
                    })}
                </div>
            </Spin>
        </Card>
    );
};

export default SalesFunnelCard;
