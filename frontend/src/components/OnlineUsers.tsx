import React from 'react';
import { Badge, Popover, Avatar, Tooltip } from 'antd';
import { UserOutlined, TeamOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { BRAND_COLORS } from '../styles/brandIdentity';
import { usePresence, type PresenceUser } from '../hooks/usePresence';

/**
 * Hiển thị trạng thái online — dùng chung cho badge trên header và cột trạng
 * thái trong trang Quản lý người dùng. Để chung một file để hai nơi không trôi
 * lệch nhau về cách định dạng thời gian hay màu chấm.
 */

type TFunc = (key: string, options?: any) => string;

/**
 * "Vừa xong" / "N phút trước" / "N giờ trước" / "DD/MM HH:mm".
 *
 * Tự viết thay vì kéo dayjs/plugin/relativeTime: repo chưa nạp locale dayjs nào,
 * thêm plugin đó sẽ phải xử lý luôn chuyện đồng bộ locale vi/en với i18next.
 */
export function formatLastSeen(iso: string | null, t: TFunc): string {
    if (!iso) return t('presence.never');

    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return t('presence.never');

    const diffMin = Math.floor((Date.now() - then) / 60_000);
    if (diffMin < 1) return t('presence.justNow');
    if (diffMin < 60) return t('presence.minutesAgo', { count: diffMin });

    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return t('presence.hoursAgo', { count: diffHour });

    const d = new Date(then);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const Dot: React.FC<{ online: boolean }> = ({ online }) => (
    <span
        style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: online ? BRAND_COLORS.success : BRAND_COLORS.textMuted,
            flexShrink: 0,
        }}
    />
);

/** Chấm + chữ trạng thái. Offline thì chữ là thời điểm hoạt động cuối. */
export const OnlineStatus: React.FC<{ online: boolean; lastSeenAt: string | null }> = ({ online, lastSeenAt }) => {
    const { t } = useTranslation();
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Dot online={online} />
            <span style={{ fontSize: 12, color: online ? BRAND_COLORS.success : BRAND_COLORS.textSecondary }}>
                {online ? t('presence.online') : formatLastSeen(lastSeenAt, t)}
            </span>
        </span>
    );
};

const UserRow: React.FC<{ user: PresenceUser }> = ({ user }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
        <Badge dot color={BRAND_COLORS.success} offset={[-2, 28]}>
            <Avatar size={30} icon={<UserOutlined />} />
        </Badge>
        <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
            </div>
            <div style={{ fontSize: 11, color: BRAND_COLORS.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.positionName || user.email}
            </div>
        </div>
    </div>
);

/** Badge trên header: số người đang online, bấm vào ra danh sách tên. */
export const OnlineUsersBadge: React.FC = () => {
    const { t } = useTranslation();
    const { data = [] } = usePresence();

    const onlineUsers = data.filter(u => u.online);

    const content = (
        <div style={{ minWidth: 200, maxWidth: 260, maxHeight: 320, overflowY: 'auto' }}>
            {onlineUsers.length === 0 ? (
                <div style={{ fontSize: 12, color: BRAND_COLORS.textMuted, padding: '4px 0' }}>
                    {t('presence.none')}
                </div>
            ) : (
                onlineUsers.map(u => <UserRow key={u.id} user={u} />)
            )}
        </div>
    );

    return (
        <Popover
            content={content}
            title={t('presence.title')}
            placement="bottomRight"
            trigger="click"
        >
            <Tooltip title={t('presence.count', { count: onlineUsers.length })}>
                <Badge count={onlineUsers.length} color={BRAND_COLORS.success} offset={[-2, 2]}>
                    <TeamOutlined className="header-icon" />
                </Badge>
            </Tooltip>
        </Popover>
    );
};
