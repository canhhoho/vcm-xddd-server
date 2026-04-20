import React, { useState } from 'react';
import { Tabs, Button, Typography } from 'antd';
import {
    TeamOutlined, NotificationOutlined, ToolOutlined,
    HighlightOutlined, ProjectOutlined,
    LeftOutlined, RightOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { usePermissions } from '../hooks/usePermissions';
import MonthlyPlanSection from '../components/MonthlyPlanSection';
import DepartmentPlan from './DepartmentPlan';
import './Business.css';

const { Title } = Typography;

const DEPARTMENTS = [
    { key: 'BD',  label: 'business.tabPlanBD',  icon: <TeamOutlined /> },
    { key: 'MKT', label: 'business.tabPlanMKT', icon: <NotificationOutlined /> },
    { key: 'QS',  label: 'business.tabPlanQS',  icon: <ToolOutlined /> },
    { key: 'DES', label: 'business.tabPlanDES', icon: <HighlightOutlined /> },
    { key: 'PM',  label: 'business.tabPlanPM',  icon: <ProjectOutlined /> },
];

const Plans: React.FC = () => {
    const { t } = useTranslation();
    const { permissions, isAdmin } = usePermissions();
    const [selectedMonth, setSelectedMonth] = useState(dayjs().startOf('month'));

    const hasAccess = isAdmin || permissions.plans !== 'NO_ACCESS';
    const canEdit = isAdmin || permissions.plans === 'EDIT';

    if (!hasAccess) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>{t('plans.noAccess')}</h2>
                <p>{t('plans.noAccessDesc')}</p>
            </div>
        );
    }

    const tabItems = DEPARTMENTS.map(({ key, label, icon }) => ({
        key,
        label: <span>{icon} {t(label)}</span>,
        children: (
            <div>
                <MonthlyPlanSection
                    department={key}
                    selectedMonth={selectedMonth}
                    canEdit={canEdit}
                />
                <div style={{ padding: '8px 16px 4px', borderTop: '1px solid #f1f5f9' }}>
                    <Title level={5} style={{ margin: 0, color: '#475569', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('plans.weekly.sectionTitle')}
                    </Title>
                </div>
                <DepartmentPlan
                    department={key}
                    selectedMonth={selectedMonth}
                    canEdit={canEdit}
                />
            </div>
        ),
    }));

    return (
        <div className="vcm-page-container">
            <div className="vcm-premium-header">
                <div className="vcm-header-decorative-circle vcm-circle-1" />
                <div className="vcm-header-decorative-circle vcm-circle-2" />
                <div className="vcm-header-content">
                    <h2 className="vcm-header-title">{t('plans.pageTitle')}</h2>

                    {/* Month Navigator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Button
                            icon={<LeftOutlined />}
                            size="small"
                            onClick={() => setSelectedMonth(m => m.subtract(1, 'month'))}
                            title={t('plans.prevMonth')}
                        />
                        <span style={{
                            minWidth: 120, textAlign: 'center', fontWeight: 700,
                            fontSize: 15, color: '#1e293b',
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
                            style={{ marginLeft: 4 }}
                        >
                            {t('plans.today')}
                        </Button>
                    </div>
                </div>
            </div>

            <Tabs
                defaultActiveKey="BD"
                items={tabItems}
                className="vcm-main-tabs"
                style={{ marginTop: 16 }}
            />
        </div>
    );
};

export default Plans;
