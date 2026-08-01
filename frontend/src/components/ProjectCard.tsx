import React, { memo } from 'react';
import { Tag, Tooltip } from 'antd';
import {
    EnvironmentOutlined,
    CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { VcmActionGroup } from './VcmActionGroup';
import type { Project, Province } from '../types';
import { normalizeId, getStatusInfo } from '../utils/projectUtils';
import { BRAND_COLORS } from '../styles/brandIdentity';

const formatDate = (date?: string | null): string =>
    date && dayjs(date).isValid() ? dayjs(date).format('DD/MM/YYYY') : '--';

interface ProjectCardProps {
    project: Project;
    branches: Province[];
    statusMap?: Record<string, string>;
    canEdit: boolean;
    onView: (project: Project) => void;
    onEdit: (project: Project) => void;
    onDelete: (project: Project) => void;
}

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

    const status = getStatusInfo(project.status, statusMap, t);
    const progress = project.progress || 0;

    return (
        <div
            className="vcm-card group"
            onClick={() => onView(project)}
            style={{
                cursor: 'pointer',
                borderRadius: '16px',
                border: `1px solid ${BRAND_COLORS.border}`,
                transition: 'all 0.3s ease',
                background: BRAND_COLORS.white,
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
                    background: BRAND_COLORS.primaryTint,
                    color: BRAND_COLORS.primary,
                    border: `1px solid ${BRAND_COLORS.border}`,
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
                    color: BRAND_COLORS.textPrimary,
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, color: BRAND_COLORS.textSecondary, fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <EnvironmentOutlined style={{ marginRight: 6, color: BRAND_COLORS.textMuted }} />
                    <span style={{ fontWeight: 500 }}>
                        {(() => {
                            const loc = normalizeId(project.location);
                            const branch = branches.find(b => normalizeId(b.id) === loc || normalizeId(b.code) === loc);
                            return branch ? branch.code : (project.location || t('projects.noLocation'));
                        })()}
                    </span>
                </div>
                {project.investor && (
                    <Tooltip title={project.investor} placement="top">
                        <div style={{ display: 'flex', alignItems: 'center', maxWidth: '50%' }}>
                            <span style={{
                                fontWeight: 500,
                                color: BRAND_COLORS.textSecondary,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>🏢 {project.investor}</span>
                        </div>
                    </Tooltip>
                )}
            </div>

            {/* DATES GRID */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                background: BRAND_COLORS.backgroundLight,
                padding: '8px',
                borderRadius: '8px',
                marginBottom: 12
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '10px', color: BRAND_COLORS.textMuted, marginBottom: 2 }}>{t('projects.cardStart')}</span>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 600, color: BRAND_COLORS.secondaryLight }}>
                        <CalendarOutlined style={{ marginRight: 6, color: BRAND_COLORS.success }} />
                        {formatDate(project.startDate)}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '10px', color: BRAND_COLORS.textMuted, marginBottom: 2 }}>{t('projects.cardEnd')}</span>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '12px', fontWeight: 600, color: BRAND_COLORS.secondaryLight }}>
                        <CalendarOutlined style={{ marginRight: 6, color: BRAND_COLORS.error }} />
                        {formatDate(project.endDate)}
                    </div>
                </div>
            </div>

            {/* PROGRESS */}
            <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: 4 }}>
                    <span style={{ color: BRAND_COLORS.textSecondary, fontWeight: 600 }}>{t('projects.cardProgress')}</span>
                    <span style={{ color: BRAND_COLORS.primary, fontWeight: 700 }}>{progress}%</span>
                </div>
                <div style={{ height: 6, width: '100%', background: BRAND_COLORS.borderLight, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%',
                        width: `${progress}%`,
                        background: BRAND_COLORS.primaryGradient,
                        borderRadius: 4,
                        transition: 'width 0.5s ease'
                    }} />
                </div>
            </div>

            {/* FOOTER ACTIONS */}
            <div style={{
                borderTop: `1px solid ${BRAND_COLORS.borderLight}`,
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
