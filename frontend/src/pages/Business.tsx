import React from 'react';
import { Tabs } from 'antd';
import {
    FundProjectionScreenOutlined,
    TeamOutlined,
    NotificationOutlined,
    ToolOutlined,
    HighlightOutlined,
    ProjectOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '../hooks/usePermissions';
import ProspectList from './ProspectList';
import DepartmentPlan from './DepartmentPlan';
import './Business.css';

const Business: React.FC = () => {
    const { t } = useTranslation();
    const { permissions, isAdmin } = usePermissions();

    const hasAccess = isAdmin || permissions.business !== 'NO_ACCESS';

    if (!hasAccess) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>{t('business.noAccess')}</h2>
                <p>{t('business.noAccessDesc')}</p>
            </div>
        );
    }

    const tabItems = [
        {
            key: 'prospects',
            label: <span><FundProjectionScreenOutlined /> {t('business.tabProspects')}</span>,
            children: <ProspectList />,
        },
        {
            key: 'plan-bd',
            label: <span><TeamOutlined /> {t('business.tabPlanBD')}</span>,
            children: <DepartmentPlan department="BD" />,
        },
        {
            key: 'plan-mkt',
            label: <span><NotificationOutlined /> {t('business.tabPlanMKT')}</span>,
            children: <DepartmentPlan department="MKT" />,
        },
        {
            key: 'plan-qs',
            label: <span><ToolOutlined /> {t('business.tabPlanQS')}</span>,
            children: <DepartmentPlan department="QS" />,
        },
        {
            key: 'plan-des',
            label: <span><HighlightOutlined /> {t('business.tabPlanDES')}</span>,
            children: <DepartmentPlan department="DES" />,
        },
        {
            key: 'plan-pm',
            label: <span><ProjectOutlined /> {t('business.tabPlanPM')}</span>,
            children: <DepartmentPlan department="PM" />,
        },
    ];

    return (
        <div className="vcm-page-container">
            <div className="vcm-premium-header">
                <div className="vcm-header-decorative-circle vcm-circle-1" />
                <div className="vcm-header-decorative-circle vcm-circle-2" />
                <div className="vcm-header-content">
                    <h2 className="vcm-header-title">{t('business.pageTitle')}</h2>
                </div>
            </div>

            <Tabs
                defaultActiveKey="prospects"
                items={tabItems}
                className="vcm-main-tabs"
                style={{ marginTop: 16 }}
            />
        </div>
    );
};

export default Business;
