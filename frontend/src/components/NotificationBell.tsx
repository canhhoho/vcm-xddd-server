import React, { useState } from 'react';
import { Badge, Popover, Empty } from 'antd';
import {
    BellOutlined,
    CheckSquareOutlined,
    ScheduleOutlined,
    DollarOutlined,
    FileTextOutlined,
    ProjectOutlined,
    ShopOutlined,
    HistoryOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BRAND_COLORS } from '../styles/brandIdentity';
import {
    useNotifications,
    useMarkNotificationsRead,
    type NotificationItem,
    type NotificationType,
} from '../hooks/useNotifications';

const TYPE_ICONS: Record<NotificationType, React.ReactNode> = {
    MY_TASK: <CheckSquareOutlined />,
    MY_PLAN_ITEM: <ScheduleOutlined />,
    INVOICE_UNPAID: <DollarOutlined />,
    CONTRACT_ENDING: <FileTextOutlined />,
    PROJECT_ENDING: <ProjectOutlined />,
    PROSPECT_OVERDUE: <ShopOutlined />,
    ACTIVITY: <HistoryOutlined />,
};

const formatDue = (iso: string | null): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const Row: React.FC<{ item: NotificationItem; onClick: () => void }> = ({ item, onClick }) => {
    const { t } = useTranslation();
    const color = item.severity === 'overdue' ? BRAND_COLORS.error : BRAND_COLORS.warning;

    return (
        <div
            onClick={onClick}
            style={{
                display: 'flex',
                gap: 10,
                padding: '8px 4px',
                cursor: 'pointer',
                borderBottom: `1px solid ${BRAND_COLORS.borderLight}`,
            }}
        >
            <span style={{ color, fontSize: 15, lineHeight: '20px', flexShrink: 0 }}>
                {TYPE_ICONS[item.type]}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title}
                </div>
                <div style={{ fontSize: 11, color: BRAND_COLORS.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t(`notifications.types.${item.type}`)}
                    {item.detail ? ` · ${item.detail}` : ''}
                </div>
                {item.dueDate && (
                    <div style={{ fontSize: 11, color, fontWeight: 600 }}>
                        {t(`notifications.severity.${item.severity}`)} · {formatDue(item.dueDate)}
                    </div>
                )}
            </div>
        </div>
    );
};

/** Chuông thông báo trên header. Thay cho Badge count={5} hardcode trước đây. */
export const NotificationBell: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const { data } = useNotifications();
    const markRead = useMarkNotificationsRead();

    const items = data?.items ?? [];
    const unreadCount = data?.unreadCount ?? 0;

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        // Mở chuông là coi như đã xem. Không chặn UI nếu request hỏng.
        if (next && unreadCount > 0) markRead.mutate();
    };

    const go = (item: NotificationItem) => {
        setOpen(false);
        // link dạng '#/projects' — react-router HashRouter cần đường dẫn không có '#'
        navigate(item.link.replace(/^#/, ''));
    };

    const content = (
        <div style={{ width: 300, maxHeight: 380, overflowY: 'auto' }}>
            {items.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('notifications.none')} />
            ) : (
                items.map(item => <Row key={item.id} item={item} onClick={() => go(item)} />)
            )}
        </div>
    );

    return (
        <Popover
            content={content}
            title={t('notifications.title')}
            placement="bottomRight"
            trigger="click"
            open={open}
            onOpenChange={handleOpenChange}
        >
            <Badge count={unreadCount} className="notification-badge">
                <BellOutlined className="header-icon" />
            </Badge>
        </Popover>
    );
};
