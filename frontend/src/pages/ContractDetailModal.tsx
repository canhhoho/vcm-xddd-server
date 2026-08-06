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
    DownloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Contract, Province } from '../types';
import InvoiceList from './InvoiceList';
import { useTranslation } from 'react-i18next';
import { normalizeId } from '../utils/common';
import { BRAND_COLORS } from '../styles/brandIdentity';

const DATE_FORMAT = 'DD/MM/YYYY';

const formatDate = (date?: string | null): string =>
    date && dayjs(date).isValid() ? dayjs(date).format(DATE_FORMAT) : '—';

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
    // Mọi hook phải chạy ở mọi lần render — `contract` bắt đầu bằng null rồi mới có
    // giá trị, nên đặt `if (!contract) return null` phía trên đây sẽ làm số hook thay
    // đổi giữa các lần render và React ném "Rendered fewer/more hooks than expected".
    const { t } = useTranslation();

    const [stats, setStats] = useState({ totalInvoiced: 0, totalPaid: 0 });

    const getBranchCode = (id: string) => {
        const normalizedSearch = normalizeId(id);
        const branch = provinces.find(p =>
            normalizeId(p.id) === normalizedSearch ||
            normalizeId(p.code) === normalizedSearch
        );
        return branch?.code || branch?.name || id;
    };

    // Chỉ cập nhật số liệu hiển thị. Việc invalidate cache danh sách hợp đồng
    // chuyển sang onInvoiceMutated để không refetch sau mỗi lần chỉ đọc.
    const handleStatsChange = (newStats: { totalInvoiced: number; totalPaid: number }) => {
        setStats(newStats);
    };

    const contractValue = contract?.value || 0;
    const percentInvoiced = contractValue > 0 ? Math.round((stats.totalInvoiced / contractValue) * 100) : 0;
    const percentPaid = contractValue > 0 ? Math.round((stats.totalPaid / contractValue) * 100) : 0;

    const getStatusTag = (status: string) => {
        switch (status) {
            case 'TODO': return <Tag icon={<ClockCircleOutlined />} color="orange">{t('contracts.statusTodo')}</Tag>;
            // Chấp nhận cả hai biến thể: DB cũ có IN_PROGRESS, form cũ ghi INPROCESS.
            case 'IN_PROGRESS':
            case 'INPROCESS': return <Tag icon={<SyncOutlined spin />} color="blue">{t('contracts.statusInProgress')}</Tag>;
            case 'DONE': return <Tag icon={<CheckCircleOutlined />} color="green">{t('contracts.statusDone')}</Tag>;
            default: return <Tag>{status}</Tag>;
        }
    };

    // Early return đặt sau toàn bộ hook (xem ghi chú ở đầu component).
    if (!contract) return null;

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <FileTextOutlined style={{ color: BRAND_COLORS.actionEdit, fontSize: 20 }} />
                    <span style={{ fontSize: 18, fontWeight: 600 }}>{t('contracts.detailTitle')}{contract.code}</span>
                    {getStatusTag(contract.status)}
                </div>
            }
            open={visible}
            onCancel={onCancel}
            width="min(1000px, 96vw)"
            footer={null}
            destroyOnHidden
            className="contract-detail-modal"
        >
            <Row gutter={[24, 16]} align="stretch">
                {/* Left Column: General Info */}
                <Col span={14}>
                    <Card title={t('contracts.detailGeneralInfo')} variant="borderless" size="small" styles={{ body: { padding: '12px 16px' } }}>
                        <Descriptions column={2} size="small" styles={{ label: { fontWeight: 600, color: BRAND_COLORS.textSecondary } }}>
                            <Descriptions.Item label={t('contracts.detailContractName')} span={2}>{contract.name}</Descriptions.Item>
                            <Descriptions.Item label={t('contracts.detailBranch')}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <EnvironmentOutlined style={{ color: BRAND_COLORS.dangerText }} />
                                    {getBranchCode(contract.provinceId)}
                                </span>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('contracts.detailField')}>
                                <Tag color={contract.businessField === 'B2B' ? 'blue' : 'green'}>
                                    {contract.businessField}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('contracts.detailInvestor')} span={2}>
                                {contract.investor || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label={t('contracts.detailDuration')} span={2}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <CalendarOutlined style={{ color: BRAND_COLORS.warning }} />
                                    {formatDate(contract.startDate)} - {formatDate(contract.endDate)}
                                </span>
                            </Descriptions.Item>
                            <Descriptions.Item label={t('contracts.detailNote')} span={2}>
                                <span style={{ color: BRAND_COLORS.textMuted, fontStyle: 'italic' }}>
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
                                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dashed ${BRAND_COLORS.border}` }}>
                                    <div style={{ fontWeight: 600, color: BRAND_COLORS.textSecondary, fontSize: 13, marginBottom: 8 }}>
                                        {t('contracts.formAttachment')}
                                    </div>
                                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                        {fileUrls.map((url, index) => {
                                            const fileName = url.split('/').pop()?.split('?')[0] || `file_${index + 1}`;
                                            return (
                                                <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 6, background: BRAND_COLORS.backgroundLight }}>
                                                    <Space size="small" style={{ flex: 1, minWidth: 0 }}>
                                                        <FilePdfOutlined style={{ color: BRAND_COLORS.dangerText, fontSize: 15 }} />
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
                                                            style={{ color: BRAND_COLORS.success }}
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
                        variant="borderless"
                        size="small"
                        styles={{ body: { padding: '12px 16px', background: BRAND_COLORS.backgroundLight } }}
                    >
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, color: BRAND_COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>{t('contracts.detailTotalValue')}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: BRAND_COLORS.actionEdit }}>
                                    {contractValue.toLocaleString('vi-VN')} <span style={{ fontSize: 12, color: BRAND_COLORS.textMuted }}>MMK</span>
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: BRAND_COLORS.actionEdit }}>
                                    {percentInvoiced}%
                                </div>
                            </div>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontSize: 13, color: BRAND_COLORS.textSecondary }}>{t('contracts.detailInvoiced')}</span>
                                <span style={{ fontWeight: 600 }}>{stats.totalInvoiced.toLocaleString('vi-VN')}</span>
                            </div>
                            <Progress percent={percentInvoiced} strokeColor={BRAND_COLORS.actionEdit} size="small" showInfo={false} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ fontSize: 13, color: BRAND_COLORS.textSecondary }}>{t('contracts.detailPaid')}</span>
                                <span style={{ fontWeight: 600, color: BRAND_COLORS.success }}>{stats.totalPaid.toLocaleString('vi-VN')}</span>
                            </div>
                            <Progress percent={percentPaid} strokeColor={BRAND_COLORS.success} size="small" showInfo={false} />
                        </div>
                    </Card>
                </Col>
            </Row>

            <Divider className="!my-6 text-blue-800 border-blue-800">{t('contracts.detailInvoiceList')}</Divider>

            <InvoiceList
                contractId={contract.id}
                onStatsChange={handleStatsChange}
                onInvoiceMutated={onContractUpdate}
                appConfig={appConfig}
            />

        </Modal>
    );
};

export default ContractDetailModal;
