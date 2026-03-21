import React from 'react';
import { Card, Typography, Button, Input, Row, Col, Select } from 'antd';
import {
    RocketOutlined,
    SearchOutlined,
    FilterOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '../hooks/usePermissions';
import './Business.css';

const { Title, Text } = Typography;
const { Option } = Select;

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

    return (
        <div className="vcm-page-container">
            {/* Premium Header - Standardized across the app */}
            <div className="vcm-premium-header">
                {/* Decorative circles */}
                <div className="vcm-header-decorative-circle vcm-circle-1" />
                <div className="vcm-header-decorative-circle vcm-circle-2" />

                <div className="vcm-header-content">
                    <h2 className="vcm-header-title">
                        {t('business.pageTitle')}
                    </h2>
                </div>
            </div>

            {/* Filter Section - Matching other pages */}
            <div className="business-filters">
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12} md={8}>
                        <Input
                            placeholder={t('business.searchPlaceholder')}
                            prefix={<SearchOutlined />}
                            allowClear
                        />
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                        <Select
                            placeholder={t('business.filterCategory')}
                            style={{ width: '100%' }}
                            allowClear
                        >
                            <Option value="B2B">B2B Core</Option>
                            <Option value="RETAIL">Retail</Option>
                        </Select>
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                        <Button
                            icon={<FilterOutlined />}
                            style={{ borderRadius: '8px' }}
                        >
                            {t('common.filter')}
                        </Button>
                    </Col>
                </Row>
            </div>

            <Card className="business-card mt-4">
                <div className="dev-placeholder">
                    <RocketOutlined className="rocket-icon" />
                    <Title level={3}>{t('business.underDevelopment')}</Title>
                    <Text type="secondary">
                        {t('business.devStatusDesc')}
                    </Text>
                    <div className="mt-6">
                        <Button type="primary" size="large" href="/dashboard" style={{ borderRadius: '8px' }}>
                            {t('common.back')}
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default Business;
