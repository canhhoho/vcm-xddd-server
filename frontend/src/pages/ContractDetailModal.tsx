import React, { useState } from 'react';
import { Modal, Tag, Row, Col, Divider, Progress, Tooltip, Descriptions, Card, Space, Button } from 'antd';
import {
    FileTextOutlined,
    EnvironmentOutlined,
    CalendarOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    SyncOutlined,
    FilePdfOutlined,
    FileImageOutlined,
    DownloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Contract, Province } from '../types';
import InvoiceList from './InvoiceList';
import { useTranslation } from 'react-i18next';

interface ContractDetailModalProps {
    contract: Contract | null;
    visible: boolean;
    onCancel: () => void;
    provinces: Province[];
    appConfig?: any;
    onContractUpdate?: () => void;
}

const ContractDetailModal: React.FC<ContractDetailModalProps> = ({
    contract,
    visible,
    onCancel,
    provinces,
    appConfig,
    onContractUpdate
}) => {
    if (!contract) return null;

    const { t } = useTranslation();

    const [stats, setStats] = useState({ totalInvoiced: 0, totalPaid: 0 });

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

    const getBranchCode = (id: string) => {
        const normalizedSearch = normalizeId(id);
        const branch = provinces.find(p =>
            normalizeId(p.id) === normalizedSearch ||
            normalizeId(p.code) === normalizedSearch
        );
        return branch?.code || branch?.name || id;
    };

    const handleStatsChange = (newStats: { totalInvoiced: number; totalPaid: number }) => {
        setStats(newStats);
        if (onContractUpdate) {
            onContractUpdate();
        }
    };

    const contractValue = contract.value || 0;
    const percentInvoiced = contractValue > 0 ? Math.round((stats.totalInvoiced / contractValue) * 100) : 0;
    const percentPaid = contractValue > 0 ? Math.round((stats.totalPaid / contractValue) * 100) : 0;

    const getStatusTag = (status: string) => {
        switch (status) {
            case 'TODO': return <Tag icon={<ClockCircleOutlined />} color="orange">{t('contracts.statusTodo')}</Tag>;
            case 'INPROCESS': return <Tag icon={<SyncOutlined spin />} color="blue">{t('contracts.statusInProgress')}</Tag>;
            case 'DONE': return <Tag icon={<CheckCircleOutlined />} color="green">{t('contracts.statusDone')}</Tag>;
            default: return <Tag>{status}</Tag>;
        }
    };

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <FileTextOutlined style={{ color: '#1890ff', fontSize: 20 }} />
                    <span style={{ fontSize: 18, fontWeight: 600 }}>{t('contracts.detailTitle')}{contract.code}</span>
                    {getStatusTag(contract.status)}
                </div>
            }
            open={visible}
            onCancel={onCancel}
            width={1000}
            footer={null}
            destroyOnClose
            className="contract-detail-modal"
        >
            <Row gutter={[24, 16]} align="stretch">
                {/* Left Column: General Info */}
                <Col span={14}>
                    <Card title={t('contracts.detailGeneralInfo')} bordered={false} size="small" styles={{ body: { padding: '12px 16px' } }}>
                        <Descriptions column={2} size="small" labelStyle={{ fontWeight: 600, color: '#666' }}>
                            <Descriptions.Item label={t('contracts.detailContractName')} span={2}>{contract.name}</Descriptions.Item>
                            <Descriptions.Item label={t('contracts.detailBranch')}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <EnvironmentOutlined style={{ color: '#ff4d4f' }} />
                                    {getBranchCode(contract.provinceId)}
                                </span>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('contracts.detailField')}>
                                <Tag color={contract.businessField === 'B2B' ? 'blue' : 'green'}>
                                    {contract.businessField}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('contracts.detailDuration')} span={2}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CalendarOutlined style={{ color: '#fa8c16' }} />
                                    {dayjs(contract.startDate).format('DD/MM/YYYY')} - {dayjs(contract.endDate).format('DD/MM/YYYY')}
                                </span>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('contracts.detailNote')} span={2}>
                                <span style={{ color: '#888', fontStyle: 'italic' }}>
                                    {contract.note || t('contracts.detailNoNote')}
                                </span>
                            </Descriptions.Item>
                        </Descriptions>

                        {/* File Attachments */}
                        {(() => {
                            const fileUrls = contract.fileUrl
                                ? contract.fileUrl.split(/[\r\n,]+/).map(f => f.trim()).filter(f => f.length > 0)
                                : [];
                            if (fileUrls.length === 0) return null;
                            return (
                                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e8e8e8' }}>
                                    <div style={{ fontWeight: 600, color: '#666', fontSize: 13, marginBottom: 8 }}>
                                        {t('contracts.formAttachment')}
                                    </div>
                                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                        {fileUrls.map((url, index) => {
                                            const fileName = url.split('/').pop()?.split('?')[0] || `file_${index + 1}`;
                                            return (
                                                <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 6, background: '#fafafa' }}>
                                                    <Space size="small" style={{ flex: 1, minWidth: 0 }}>
                                                        <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 15 }} />
                                                        <a
                                                            href={url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 250, fontSize: 13 }}
                                                            title={fileName}
                                                        >
                                                            {decodeURIComponent(fileName)}
                                                        </a>
                                                    </Space>
                                                    <Tooltip title={t('common.download')}>
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<DownloadOutlined />}
                                                            style={{ color: '#52c41a' }}
                                                            onClick={() => {
                                                                const link = document.createElement('a');
                                                                link.href = url;
                                                                link.download = fileName;
                                                                link.target = '_blank';
                                                                document.body.appendChild(link);
                                                                link.click();
                                                                document.body.removeChild(link);
                                                            }}
                                                        />
                                                    </Tooltip>
                                                </div>
                                            );
                                        })}
                                    </Space>
                                </div>
                            );
                        })()}
                    </Card>
                </Col>

                {/* Right Column: Financial Overview */}
                <Col span={10}>
                    <Card
                        title={t('contracts.detailFinance')}
                        bordered={false}
                        size="small"
                        styles={{ body: { padding: '12px 16px', background: '#f0f5ff' } }}
                    >
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, color: '#8c8c8c', textTransform: 'uppercase', fontWeight: 600 }}>{t('contracts.detailTotalValue')}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: '#1890ff' }}>
                                    {contractValue.toLocaleString('vi-VN')} <span style={{ fontSize: 12, color: '#8c8c8c' }}>MMK</span>
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: '#1890ff' }}>
                                    {percentInvoiced}%
                                </div>
                            </div>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontSize: 13, color: '#595959' }}>{t('contracts.detailInvoiced')}</span>
                                <span style={{ fontWeight: 600 }}>{stats.totalInvoiced.toLocaleString('vi-VN')}</span>
                            </div>
                            <Progress percent={percentInvoiced} strokeColor="#1890ff" size="small" showInfo={false} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontSize: 13, color: '#595959' }}>{t('contracts.detailPaid')}</span>
                                <span style={{ fontWeight: 600, color: '#52c41a' }}>{stats.totalPaid.toLocaleString('vi-VN')}</span>
                            </div>
                            <Progress percent={percentPaid} strokeColor="#52c41a" size="small" showInfo={false} />
                        </div>
                    </Card>
                </Col>
            </Row>

            <Divider className="!my-6 text-blue-800 border-blue-800">{t('contracts.detailInvoiceList')}</Divider>

            <InvoiceList contractId={contract.id} onStatsChange={handleStatsChange} appConfig={appConfig} />

        </Modal>
    );
};

export default ContractDetailModal;
