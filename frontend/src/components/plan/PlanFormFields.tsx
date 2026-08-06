import React from 'react';
import { Input, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { SELECTABLE_STATUSES, STATUS_LABEL_KEY, buildSortOrderOptions } from './planConstants';

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

/**
 * Người phụ trách: ô nhập TỰ DO, không phải dropdown chọn từ bảng users.
 *
 * Trước đây là Select đổ từ danh sách nhân viên và lưu users.id vào assignee_id.
 * Nay lưu thẳng chuỗi tên vào assignee_name — người lập kế hoạch thường ghi tên
 * người ngoài hệ thống, tổ/nhóm, hoặc nhiều người cùng lúc.
 *
 * Đánh đổi đã được chấp nhận: hệ thống không còn biết đầu việc thuộc về user nào,
 * nên thông báo "đầu việc kế hoạch được giao cho tôi" đã bị bỏ khỏi chuông
 * (routes/notifications.js).
 */
export const AssigneeInput: React.FC<ControlProps<string>> = ({ value, onChange }) => {
    const { t } = useTranslation();
    return (
        <Input
            value={value}
            onChange={e => onChange?.(e.target.value)}
            allowClear
            maxLength={255}
            placeholder={t('plans.fields.whoPlaceholder')}
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
