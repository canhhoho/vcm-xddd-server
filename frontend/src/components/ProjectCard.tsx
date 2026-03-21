import React, { memo } from 'react';
import { Tag } from 'antd';
import {
    EnvironmentOutlined,
    CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { VcmActionGroup } from './VcmActionGroup';
import type { Project, Province } from '../types';

interface ProjectCardProps {
    project: Project;
    branches: Province[];
    statusMap?: Record<string, string>;
    canEdit: boolean;
    onView: (project: Project) => void;
    onEdit: (project: Project) => void;
    onDelete: (project: Project) => void;
}

const normalizeId = (id: any): string => {
    if (id === null || id === undefined) return '';
    let str = String(id).trim();
    if (str.endsWith('.0')) str = str.slice(0, -2);
    if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        if (!isNaN(num)) return num.toString();
    }
    return str;
};

export const ProjectCard: React.FC<ProjectCardProps> = memo(({
    project,
    branches,
    statusMap,
    canEdit,
    onView,
    onEdit,
    onDelete,
}) => {
    const { t } = useTranslation();

    const getStatusInfo = (status: string) => {
        const map = statusMap || {};
        const label = status === 'INPROCESS' ? map.IN_PROGRESS : (map[status] || status);

        if (status === 'INProcess' || status === 'INPROCESS' || status === 'IN_PROGRESS') {
            return { label: label || t('projects.statusInProcess'), className: 'status-doing' };
        } else if (status === 'DONE') {
            return { label: label || t('projects.statusDone'), className: 'status-done' };
        } else if (status === 'TODO') {
            return { label: label || t('projects.statusTodo'), className: 'status-planning' };
        } else {
            return { label: label || status, className: 'status-planning' };
        }
    };

    const status = getStatusInfo(project.status);
    const progress = project.progress || 0;

    return (
        <div
            className="vcm-card group"
            onClick={() => onView(project)}
            style={{
                cursor: 'pointer',
                borderRadius: '16px',
                border: '1px solid #F0F0F0',
                transition: 'all 0.3s ease',
                background: '#FFFFFF',
                position: 'relative',
                overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-5px)';
                e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            {/* HEADER: Code & Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <Tag style={{
                    margin: 0,
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    background: '#FFF1F2',
                    color: '#E11D2E',
                    border: '1px solid #FECDD3',
                    fontSize: '11px'
                }}>
                    {project.code}
                </Tag>
                <Tag className={`status-badge ${status.className}`} style={{ margin: 0, borderRadius: '6px' }}>
                    {status.label}
                </Tag>
            </div>

            {/* TITLE */}
            <div style={{ marginBottom: 8, minHeight: 42 }}>
                <h3 style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#1F2937',
                    margin: 0,
                    lineHeight: '1.4',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                }}>
                    {project.name}
                </h3>
            </div>

            {/* INFO: Location & Investor */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, color: '#6B7280', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <EnvironmentOutlined style={{ marginRight: 6, color: '#9CA3AF' }} />
                    <span style={{ fontWeight: 500 }}>
                        {(() => {
                            const loc = normalizeId(project.location);
                            const branch = branches.find(b => normalizeId(b.id) === loc || normalizeId(b.code) === loc);
                            return branch ? branch.code : (project.location || t('projects.noLocation'));
                        })()}
                    </span>
                </div>
                {project.investor && (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontWeight: 500, color: '#6B7280' }}>🏢 {project.investor}</span>
                    </div>
                )}
            </div>

            {/* DATES GRID */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                background: '#F9FAFB',
                padding: '8px',
                borderRadius: '8px',
                marginBottom: 12
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '10px', color: '#9CA3AF', marginBottom: 2 }}>{t('projects.cardStart')}</span>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 600, color: '#4B5563' }}>
                        <CalendarOutlined style={{ marginRight: 6, color: '#10B981' }} />
                        {project.startDate ? dayjs(project.startDate).format('DD/MM/YYYY') : '--'}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '10px', color: '#9CA3AF', marginBottom: 2 }}>{t('projects.cardEnd')}</span>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 600, color: '#4B5563' }}>
                        <CalendarOutlined style={{ marginRight: 6, color: '#EF4444' }} />
                        {project.endDate ? dayjs(project.endDate).format('DD/MM/YYYY') : '--'}
                    </div>
                </div>
            </div>

            {/* PROGRESS */}
            <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: 4 }}>
                    <span style={{ color: '#6B7280', fontWeight: 600 }}>{t('projects.cardProgress')}</span>
                    <span style={{ color: '#E11D2E', fontWeight: 700 }}>{progress}%</span>
                </div>
                <div style={{ height: 6, width: '100%', background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%',
                        width: `${progress}%`,
                        background: 'linear-gradient(90deg, #E11D2E 0%, #FF4D5A 100%)',
                        borderRadius: 4,
                        transition: 'width 0.5s ease'
                    }} />
                </div>
            </div>

            {/* FOOTER ACTIONS */}
            <div style={{
                borderTop: '1px solid #F3F4F6',
                paddingTop: 8,
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8
            }} onClick={e => e.stopPropagation()}>
                <VcmActionGroup
                    onView={() => onView(project)}
                    onEdit={() => onEdit(project)}
                    onDelete={() => onDelete(project)}
                    canEdit={canEdit}
                    canDelete={canEdit}
                    deleteConfirmTitle={t('projects.deleteConfirmTitle')}
                    viewTooltip={t('projects.viewDetail')}
                    editTooltip={t('projects.edit')}
                    deleteTooltip={t('projects.delete')}
                />
            </div>
        </div>
    );
});
