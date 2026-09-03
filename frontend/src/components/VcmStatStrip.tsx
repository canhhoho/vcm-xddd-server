/**
 * VcmStatStrip.tsx
 * Dải thống kê gọn một dòng, thay cho hàng thẻ lớn `.log-stats-card` (~100px).
 *
 * Vì sao có component này: cùng một hàng 4 thẻ được vẽ ở hai tab của trang chi
 * tiết dự án (Tiến độ hạng mục và Nhật ký thi công). Để mỗi tab tự dựng lấy là
 * đúng cái bẫy đã hai lần sinh lỗi trong repo — nhãn trạng thái Kế hoạch, và cột
 * Vai trò ba nơi ba bề rộng. Gom về một chỗ.
 *
 * Cùng khuôn với VcmFilterBar: component mỏng, kiểu dáng khai trong App.css.
 */

import React from 'react';

export interface StatItem {
    key: string;
    /** Nhãn ngắn hiện trên chip — phải ngắn, chip nằm cùng hàng với thanh công cụ */
    label: string;
    /** Nhãn đầy đủ cho tooltip; bỏ trống thì tooltip lấy `label` */
    title?: string;
    value: number | string;
    suffix?: string;
    icon: string;
    color: string;
}

interface Props {
    items: StatItem[];
    /** Có `onSelect` thì chip bấm được; `activeKey` là chip đang bật */
    activeKey?: string;
    onSelect?: (key: string) => void;
    /** Tooltip cho cả dải, ví dụ để nói số liệu đang tính theo phạm vi nào */
    title?: string;
}

export const VcmStatStrip: React.FC<Props> = ({ items, activeKey, onSelect, title }) => {
    const clickable = typeof onSelect === 'function';

    return (
        <div className="vcm-stat-strip" title={title}>
            {items.map(item => {
                const active = clickable && activeKey === item.key;
                const handle = clickable ? () => onSelect!(item.key) : undefined;
                return (
                    <div
                        key={item.key}
                        className={`vcm-stat-chip${clickable ? ' is-clickable' : ''}${active ? ' is-active' : ''}`}
                        title={item.title || item.label}
                        role={clickable ? 'button' : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        aria-pressed={clickable ? active : undefined}
                        onClick={handle}
                        onKeyDown={clickable ? (e => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handle!(); }
                        }) : undefined}
                    >
                        <span className="vcm-stat-chip-icon" aria-hidden="true">{item.icon}</span>
                        <span className="vcm-stat-chip-value" style={{ color: item.color }}>
                            {item.value}
                            {item.suffix && <span className="vcm-stat-chip-suffix">{item.suffix}</span>}
                        </span>
                        <span className="vcm-stat-chip-label">{item.label}</span>
                    </div>
                );
            })}
        </div>
    );
};

export default VcmStatStrip;
