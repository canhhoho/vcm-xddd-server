import React from 'react';
import { Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TFunction } from 'i18next';
import { STATUS_COLORS, STATUS_LABEL_KEY, WRAP } from './planConstants';
import type { PlanItemStatus, User } from '../../types';

const { Text } = Typography;

/** Item tối thiểu mà các cột dùng chung cần */
export interface BasePlanItem {
    status: PlanItemStatus | 'TODO' | 'IN_PROGRESS' | 'DONE';
    assigneeId?: string;
    assigneeName?: string;
    method?: string;
    result?: string;
}

/** Tên người phụ trách: ưu tiên tên backend JOIN sẵn, fallback tra trong danh sách users */
export const resolveAssigneeName = (
    item: { assigneeId?: string; assigneeName?: string },
    users: User[]
): string => item.assigneeName || users.find(u => u.id === item.assigneeId)?.name || '';

/** Nhãn trạng thái đã dịch — dùng chung cho cả bảng lẫn export Excel */
export const statusLabel = (status: string, t: TFunction): string => {
    const key = STATUS_LABEL_KEY[status as PlanItemStatus];
    return key ? t(key) : status;
};

export const assigneeColumn = <T extends BasePlanItem>(
    t: TFunction, users: User[], width = 120
): ColumnsType<T>[number] => ({
    title: t('plans.fields.who'),
    key: 'assignee',
    width,
    render: (_: unknown, r: T) => resolveAssigneeName(r, users) || '-',
});

export const methodColumn = <T extends BasePlanItem>(
    t: TFunction, width = 130
): ColumnsType<T>[number] => ({
    title: t('plans.fields.how'),
    dataIndex: 'method',
    key: 'method',
    width,
    className: WRAP,
    render: (val: string) => val || '-',
});

export const statusColumn = <T extends BasePlanItem>(
    t: TFunction, width = 125
): ColumnsType<T>[number] => ({
    title: t('plans.fields.status'),
    dataIndex: 'status',
    key: 'status',
    width,
    align: 'center',
    render: (val: string) => (
        <Tag color={STATUS_COLORS[val as PlanItemStatus]}>{statusLabel(val, t)}</Tag>
    ),
});

export const resultColumn = <T extends BasePlanItem>(
    t: TFunction, width = 120
): ColumnsType<T>[number] => ({
    title: t('plans.fields.result'),
    dataIndex: 'result',
    key: 'result',
    width,
    className: WRAP,
    render: (val: string) => val || '-',
});

export const whyColumn = <T,>(t: TFunction, width = 140): ColumnsType<T>[number] => ({
    title: t('plans.fields.why'),
    dataIndex: 'why',
    key: 'why',
    width,
    className: WRAP,
    render: (val: string) => val || '-',
});

export const indexColumn = <T,>(width = 45): ColumnsType<T>[number] => ({
    title: '#',
    dataIndex: 'sortOrder',
    key: 'sortOrder',
    width,
    align: 'center',
});

/** Cột "What" đơn giản (kế hoạch tháng). Bản tuần có thêm badge quá hạn nên tự dựng riêng. */
export const titleColumn = <T,>(t: TFunction, width = 220): ColumnsType<T>[number] => ({
    title: t('plans.fields.what'),
    dataIndex: 'title',
    key: 'title',
    width,
    className: WRAP,
    render: (val: string) => <Text strong>{val}</Text>,
});
