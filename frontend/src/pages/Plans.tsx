import React, { useEffect, useMemo, useState } from 'react';
import { Tabs, Button, Typography } from 'antd';
import {
    TeamOutlined, NotificationOutlined, ToolOutlined,
    HighlightOutlined, ProjectOutlined,
    LeftOutlined, RightOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { usePermissions } from '../hooks/usePermissions';
import { useFilterSync } from '../hooks/useFilterSync';
import type { Department, ModuleAccess } from '../types';
import { BRAND_COLORS } from '../styles/brandIdentity';
import MonthlyPlanSection from '../components/MonthlyPlanSection';
import ExportMonthButton from '../components/plan/ExportMonthButton';
import DepartmentPlan from './DepartmentPlan';
import './Business.css';

const { Title } = Typography;

const DEPARTMENTS: { key: Department; icon: React.ReactNode }[] = [
    { key: 'BD', icon: <TeamOutlined /> },
    { key: 'MKT', icon: <NotificationOutlined /> },
    { key: 'QS', icon: <ToolOutlined /> },
    { key: 'DES', icon: <HighlightOutlined /> },
    { key: 'PM', icon: <ProjectOutlined /> },
];

/** Khoá quyền tương ứng phòng ban trong PermissionResult.permissions */
type PlanPermKey = 'plans_bd' | 'plans_mkt' | 'plans_qs' | 'plans_des' | 'plans_pm';
const permKeyOf = (dept: Department): PlanPermKey =>
    `plans_${dept.toLowerCase()}` as PlanPermKey;

const Plans: React.FC = () => {
    const { t } = useTranslation();
    const { permissions, isAdmin } = usePermissions();
    const [selectedMonth, setSelectedMonth] = useState(dayjs().startOf('month'));

    const visibleDepartments = useMemo(
        () => DEPARTMENTS.filter(({ key }) =>
            isAdmin || permissions[permKeyOf(key)] !== 'NO_ACCESS'
        ),
        [permissions, isAdmin]
    );

    // Giữ tab trong URL (?tab=BD) để thông báo "kế hoạch của tôi" deep-link được
    // vào đúng phòng ban. Mặc định là tab đầu tiên user được xem — hardcode 'BD'
    // khiến user chỉ có quyền phòng khác mở trang ra thấy vùng nội dung trống.
    const [activeTab, setActiveTab] = useFilterSync<string>('tab', visibleDepartments[0]?.key ?? '');

    useEffect(() => {
        if (visibleDepartments.length === 0) return;
        if (!visibleDepartments.some(d => d.key === activeTab)) {
            setActiveTab(visibleDepartments[0].key);
        }
    }, [visibleDepartments, activeTab]);

    if (visibleDepartments.length === 0) {
        return (
            <div style={{ padding: 20, textAlign: 'center' }}>
                <h2>{t('plans.noAccess')}</h2>
                <p>{t('plans.noAccessDesc')}</p>
            </div>
        );
    }

    const tabItems = visibleDepartments.map(({ key, icon }) => {
        const deptPermission = permissions[permKeyOf(key)] as ModuleAccess;
        const canEditTab = isAdmin || deptPermission === 'EDIT';

        return {
            key,
            label: <span>{icon} {t(`plans.departments.${key}`)}</span>,
            children: (
                <div>
                    <MonthlyPlanSection
                        department={key}
                        selectedMonth={selectedMonth}
                        canEdit={canEditTab}
                    />
                    <div style={{ padding: '8px 16px 4px', borderTop: `1px solid ${BRAND_COLORS.slate100}` }}>
                        <Title level={5} style={{
                            margin: 0, color: BRAND_COLORS.slate600, fontSize: 13,
                            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                        }}>
                            {t('plans.weekly.sectionTitle')}
                        </Title>
                    </div>
                    <DepartmentPlan
                        department={key}
                        selectedMonth={selectedMonth}
                        canEdit={canEditTab}
                    />
                </div>
            ),
        };
    });

    return (
        <div className="vcm-page-container">
            <div className="vcm-premium-header">
                <div className="vcm-header-decorative-circle vcm-circle-1" />
                <div className="vcm-header-decorative-circle vcm-circle-2" />
                <div className="vcm-header-content" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <h2 className="vcm-header-title" style={{ marginBottom: 0 }}>{t('plans.pageTitle')}</h2>

                    {/* Month Navigator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Button
                            icon={<LeftOutlined />}
                            size="small"
                            onClick={() => setSelectedMonth(m => m.subtract(1, 'month'))}
                            title={t('plans.prevMonth')}
                        />
                        <span style={{
                            minWidth: 90, textAlign: 'center', fontWeight: 700,
                            fontSize: 14, color: BRAND_COLORS.slate800,
                        }}>
                            {selectedMonth.format('MM/YYYY')}
                        </span>
                        <Button
                            icon={<RightOutlined />}
                            size="small"
                            onClick={() => setSelectedMonth(m => m.add(1, 'month'))}
                            title={t('plans.nextMonth')}
                        />
                        <Button
                            size="small"
                            onClick={() => setSelectedMonth(dayjs().startOf('month'))}
                            style={{ marginLeft: 2 }}
                        >
                            {t('plans.today')}
                        </Button>
                        {activeTab && (
                            <ExportMonthButton
                                department={activeTab as Department}
                                selectedMonth={selectedMonth}
                            />
                        )}
                    </div>
                </div>
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                className="vcm-main-tabs"
                style={{ marginTop: 16 }}
            />
        </div>
    );
};

export default Plans;
