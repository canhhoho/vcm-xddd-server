import React from 'react';
import { Tag, Button, Space } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export interface FilterItem {
    key: string;      // Unique key (e.g. 'status')
    label: string;    // Display label (e.g. 'Trạng thái')
    value: any;       // Current value
    displayValue?: string; // Optional custom display value (e.g. 'Hoàn thành' instead of 'DONE')
    onRemove?: () => void;
}

interface FilterChipsProps {
    filters: FilterItem[];
    onClearAll?: () => void;
}

export const FilterChips: React.FC<FilterChipsProps> = ({ filters, onClearAll }) => {
    const { t } = useTranslation();
    // Only show active filters (value is truthy and not 'ALL')
    const activeFilters = filters.filter(f =>
        f.value !== undefined &&
        f.value !== null &&
        f.value !== '' &&
        f.value !== 'ALL'
    );

    if (activeFilters.length === 0) return null;

    return (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#666', marginRight: 4 }}>{t('common.filtering')}:</span>
            {activeFilters.map((filter) => (
                <Tag
                    key={filter.key}
                    closable
                    onClose={filter.onRemove}
                    color="blue"
                    style={{
                        marginRight: 0,
                        fontSize: 13,
                        padding: '4px 10px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center'
                    }}
                >
                    <span style={{ fontWeight: 500, marginRight: 4 }}>{filter.label}:</span>
                    {filter.displayValue || String(filter.value)}
                </Tag>
            ))}

            {activeFilters.length > 0 && onClearAll && (
                <Button
                    type="link"
                    size="small"
                    onClick={onClearAll}
                    danger
                    style={{ padding: 0, fontSize: 13 }}
                >
                    {t('common.clearAll')}
                </Button>
            )}
        </div>
    );
};
