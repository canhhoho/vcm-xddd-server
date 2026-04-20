import React from 'react';
import { Tabs } from 'antd';
import { ShopOutlined, HomeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '../hooks/usePermissions';
import ProspectList from './ProspectList';
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
            key: 'b2b',
            label: <span><ShopOutlined /> {t('business.tabB2B')}</span>,
            children: <ProspectList prospectType="B2B" />,
        },
        {
            key: 'b2c',
            label: <span><HomeOutlined /> {t('business.tabB2C')}</span>,
            children: <ProspectList prospectType="B2C" />,
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
                defaultActiveKey="b2b"
                items={tabItems}
                className="vcm-main-tabs"
                style={{ marginTop: 16 }}
            />
        </div>
    );
};

export default Business;
