import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import type { Department, MonthlyPlanItem, User, WeeklyPlanItem } from '../../types';
import type { ExportColumn } from './exportPlanExcel';
import { DATE_FORMAT } from './planConstants';
import { resolveAssigneeName, statusLabel } from './planColumns';

/**
 * Định nghĩa cột export dùng chung cho nút xuất từng bảng và nút xuất cả tháng.
 * Để hai chỗ tự dựng cột riêng là cách cũ đã sinh ra file Excel lệch nhau.
 */

const formatRange = (start?: string, end?: string): string => {
    const s = start ? dayjs(start).format(DATE_FORMAT) : '';
    const e = end ? dayjs(end).format(DATE_FORMAT) : '';
    if (s && e) return `${s} - ${e}`;
    return s || e || '';
};

export const weeklyExportColumns = (
    t: TFunction, users: User[]
): ExportColumn<WeeklyPlanItem>[] => [
    { header: t('common.index'), value: (_, i) => i + 1, width: 6 },
    { header: t('plans.fields.what'), value: item => item.title, width: 34 },
    { header: t('plans.fields.why'), value: item => item.why || '', width: 26 },
    { header: t('plans.fields.who'), value: item => resolveAssigneeName(item, users), width: 18 },
    { header: t('plans.fields.when'), value: item => formatRange(item.startDate, item.endDate), width: 24 },
    { header: t('plans.fields.where'), value: item => item.location || '', width: 18 },
    { header: t('plans.fields.how'), value: item => item.method || '', width: 26 },
    { header: t('plans.fields.status'), value: item => statusLabel(item.status, t), width: 16 },
    { header: t('plans.daily.progress'), value: item => `${item.progressPct || 0}%`, width: 12 },
    { header: t('plans.fields.result'), value: item => item.result || '', width: 26 },
];

export const monthlyExportColumns = (
    t: TFunction, users: User[]
): ExportColumn<MonthlyPlanItem>[] => [
    { header: t('common.index'), value: (_, i) => i + 1, width: 6 },
    { header: t('plans.fields.what'), value: item => item.title, width: 34 },
    { header: t('plans.monthly.target'), value: item => item.target || '', width: 28 },
    { header: t('plans.fields.why'), value: item => item.why || '', width: 26 },
    { header: t('plans.fields.who'), value: item => resolveAssigneeName(item, users), width: 18 },
    { header: t('plans.fields.how'), value: item => item.method || '', width: 26 },
    { header: t('plans.fields.status'), value: item => statusLabel(item.status, t), width: 16 },
    { header: t('plans.fields.result'), value: item => item.result || '', width: 26 },
];

interface HeaderRowsArgs {
    t: TFunction;
    department: Department;
    /** Kỳ báo cáo đã format sẵn — "07/2026" hoặc "06/07/2026 - 12/07/2026" */
    period: string;
    items: { status: string; progressPct?: number }[];
}

/** Khối tiêu đề đặt phía trên bảng trong file Excel */
export const buildPlanHeaderRows = ({
    t, department, period, items,
}: HeaderRowsArgs): (string | number)[][] => {
    const doneCount = items.filter(i => i.status === 'DONE').length;
    const hasProgress = items.some(i => i.progressPct !== undefined);
    const avgProgress = items.length
        ? Math.round(items.reduce((sum, i) => sum + (i.progressPct || 0), 0) / items.length)
        : 0;

    const rows: (string | number)[][] = [
        [t('plans.export.reportTitle')],
        [t('plans.export.department'), t(`plans.departments.${department}`)],
        [t('plans.export.period'), period],
        [t('plans.export.totalItems'), items.length],
        [t('plans.export.doneItems'), doneCount],
    ];
    if (hasProgress) rows.push([t('plans.export.avgProgress'), `${avgProgress}%`]);
    rows.push([t('plans.export.exportedAt'), dayjs().format(`${DATE_FORMAT} HH:mm`)]);
    return rows;
};
