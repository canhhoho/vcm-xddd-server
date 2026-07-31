import React from 'react';
import { Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { SELECTABLE_STATUSES, STATUS_LABEL_KEY, buildSortOrderOptions } from './planConstants';
import type { User } from '../../types';

/**
 * Các control dùng chung trong form đầu việc.
 * Đều nhận value/onChange do antd Form.Item inject xuống child.
 */

interface ControlProps<V> {
    value?: V;
    onChange?: (value: V) => void;
}

export const StatusSelect: React.FC<ControlProps<string>> = ({ value, onChange }) => {
    const { t } = useTranslation();
    return (
        <Select
            value={value}
            onChange={onChange}
            options={SELECTABLE_STATUSES.map(s => ({ value: s, label: t(STATUS_LABEL_KEY[s]) }))}
        />
    );
};

/** Số thứ tự: sinh option động để plan có hơn 15 đầu việc vẫn chọn được */
export const SortOrderSelect: React.FC<ControlProps<number> & { itemCount: number }> = ({
    value, onChange, itemCount,
}) => (
    <Select
        value={value}
        onChange={onChange}
        options={buildSortOrderOptions(itemCount).map(n => ({ value: n, label: String(n) }))}
    />
);

export const AssigneeSelect: React.FC<ControlProps<string> & { users: User[] }> = ({
    value, onChange, users,
}) => {
    const { t } = useTranslation();
    return (
        <Select
            value={value}
            onChange={onChange}
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('plans.fields.whoPlaceholder')}
            options={users.map(u => ({ value: u.id, label: u.name }))}
        />
    );
};

export const ProgressSelect: React.FC<ControlProps<number>> = ({ value, onChange }) => (
    <Select
        value={value}
        onChange={onChange}
        options={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => ({
            value: v,
            label: `${v}%`,
        }))}
    />
);
