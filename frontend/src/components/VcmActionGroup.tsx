import React from 'react';
import { Button, Tooltip, Popconfirm, Space } from 'antd';
import { EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface VcmActionGroupProps {
    onView?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    canEdit?: boolean;
    canDelete?: boolean;
    deleteConfirmTitle?: string;
    viewTooltip?: string;
    editTooltip?: string;
    deleteTooltip?: string;
    children?: React.ReactNode;
}

/**
 * Standardized Action Group for table rows.
 * Features: View, Edit, and Delete (with Popconfirm).
 */
export const VcmActionGroup: React.FC<VcmActionGroupProps> = ({
    onView,
    onEdit,
    onDelete,
    canEdit = true,
    canDelete = true,
    deleteConfirmTitle,
    viewTooltip,
    editTooltip,
    deleteTooltip,
    children,
}) => {
    const { t } = useTranslation();

    return (
        <Space size="small">
            {onView && (
                <Tooltip title={viewTooltip || t('common.view')}>
                    <Button
                        type="text"
                        size="small"
                        className="vcm-table-action-btn vcm-table-action-view"
                        icon={<EyeOutlined />}
                        onClick={(e) => {
                            e.stopPropagation();
                            onView();
                        }}
                    />
                </Tooltip>
            )}

            {onEdit && canEdit && (
                <Tooltip title={editTooltip || t('common.edit')}>
                    <Button
                        type="text"
                        size="small"
                        className="vcm-table-action-btn vcm-table-action-edit"
                        icon={<EditOutlined />}
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit();
                        }}
                    />
                </Tooltip>
            )}

            {children}

            {onDelete && canDelete && (
                <Popconfirm
                    title={deleteConfirmTitle || t('common.deleteConfirm')}
                    onConfirm={(e) => {
                        e?.stopPropagation();
                        onDelete();
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                    okText={t('common.yes')}
                    cancelText={t('common.no')}
                    okButtonProps={{ danger: true }}
                >
                    <Tooltip title={deleteTooltip || t('common.delete')}>
                        <Button
                            type="text"
                            size="small"
                            className="vcm-table-action-btn vcm-table-action-delete"
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </Tooltip>
                </Popconfirm>
            )}
        </Space>
    );
};
