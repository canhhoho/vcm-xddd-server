import React from 'react';
import { Input, Select } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { BRAND_COLORS } from '../../styles/brandIdentity';
import { SELECTABLE_STATUSES, STATUS_LABEL_KEY } from './planConstants';
import type { PlanFiltersState } from './usePlanFilters';
import type { User } from '../../types';

interface Props {
    filters: PlanFiltersState;
    users: User[];
}

/** Thanh lọc dùng chung cho kế hoạch tháng và kế hoạch tuần */
const PlanFilterBar: React.FC<Props> = ({ filters, users }) => {
    const { t } = useTranslation();
    const {
        searchText, setSearchText,
        statusFilter, setStatusFilter,
        assigneeFilter, setAssigneeFilter,
    } = filters;

    return (
        <>
            <Input
                placeholder={t('common.search') + '...'}
                prefix={<SearchOutlined style={{ color: BRAND_COLORS.textMuted }} />}
                size="small"
                style={{ width: 140, minWidth: 100 }}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                allowClear
            />
            <Select
                size="small"
                style={{ width: 110, minWidth: 90 }}
                placeholder={t('plans.fields.status')}
                allowClear
                value={statusFilter}
                onChange={setStatusFilter}
                options={SELECTABLE_STATUSES.map(s => ({
                    value: s,
                    label: t(STATUS_LABEL_KEY[s]),
                }))}
            />
            <Select
                size="small"
                style={{ width: 130, minWidth: 100 }}
                placeholder={t('plans.fields.who')}
                allowClear
                showSearch
                optionFilterProp="label"
                value={assigneeFilter}
                onChange={setAssigneeFilter}
                options={users.map(u => ({ value: u.id, label: u.name }))}
            />
        </>
    );
};

export default PlanFilterBar;
