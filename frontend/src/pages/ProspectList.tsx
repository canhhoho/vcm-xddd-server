import React, { useEffect, useState, useMemo } from 'react';
import {
    Card, Table, Button, Input, Select, Modal, Form, InputNumber, DatePicker, Tag, message, Col, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { usePermissions } from '../hooks/usePermissions';
import { useAppConfig } from '../hooks/useAppConfig';
import { apiService } from '../services/api';
import { VcmFilterBar } from '../components/VcmFilterBar';
import { VcmActionGroup } from '../components/VcmActionGroup';
import type { Prospect, Province } from '../types';

const { Option } = Select;

const STATUS_COLORS: Record<string, string> = {
    NEW: 'blue', CONTACTED: 'cyan', PROPOSAL: 'orange', NEGOTIATION: 'purple', WON: 'green', LOST: 'red',
};
const PRIORITY_COLORS: Record<string, string> = { HIGH: 'red', MEDIUM: 'gold', LOW: 'green' };

const ProspectList: React.FC = () => {
    const { t } = useTranslation();
    const { permissions, isAdmin } = usePermissions();
    const appConfigQuery = useAppConfig();
    const canEdit = isAdmin || permissions.business === 'EDIT';

    const [prospects, setProspects] = useState<Prospect[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState<Prospect | null>(null);
    const [searchText, setSearchText] = useState('');
    const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
    const [filterPriority, setFilterPriority] = useState<string | undefined>(undefined);
    const [form] = Form.useForm();

    const branches: Province[] = appConfigQuery.data?.BRANCHES || [];

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await apiService.getProspects();
            if (res.success) setProspects(res.data || []);
        } catch { /* ignore */ }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const filteredData = useMemo(() => {
        return prospects.filter(p => {
            const matchSearch = !searchText ||
                p.name.toLowerCase().includes(searchText.toLowerCase()) ||
                p.client.toLowerCase().includes(searchText.toLowerCase()) ||
                p.location.toLowerCase().includes(searchText.toLowerCase());
            const matchStatus = !filterStatus || filterStatus === 'ALL' || p.status === filterStatus;
            const matchPriority = !filterPriority || filterPriority === 'ALL' || p.priority === filterPriority;
            return matchSearch && matchStatus && matchPriority;
        });
    }, [prospects, searchText, filterStatus, filterPriority]);

    const handleAdd = () => {
        setEditingRecord(null);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (record: Prospect) => {
        setEditingRecord(record);
        form.setFieldsValue({
            ...record,
            expectedDate: record.expectedDate ? dayjs(record.expectedDate) : null,
        });
        setModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            const payload = {
                ...values,
                expectedDate: values.expectedDate?.format('YYYY-MM-DD') || null,
            };
            if (editingRecord) {
                const res = await apiService.updateProspect(editingRecord.id, payload);
                if (res.success) message.success(t('common.saveSuccess'));
            } else {
                const res = await apiService.createProspect(payload);
                if (res.success) message.success(t('common.saveSuccess'));
            }
            setModalVisible(false);
            form.resetFields();
            loadData();
        } catch {
            message.error(t('common.saveError'));
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await apiService.deleteProspect(id);
            message.success(t('common.deleteSuccess'));
            loadData();
        } catch {
            message.error(t('common.saveError'));
        }
    };

    const columns: ColumnsType<Prospect> = useMemo(() => [
        {
            title: '#', key: 'index', width: 50, align: 'center' as const,
            render: (_: any, __: any, index: number) => index + 1,
        },
        {
            title: t('business.prospects.name'), dataIndex: 'name', key: 'name', width: 200, ellipsis: true,
        },
        {
            title: t('business.prospects.client'), dataIndex: 'client', key: 'client', width: 160, ellipsis: true,
        },
        {
            title: t('business.prospects.location'), dataIndex: 'location', key: 'location', width: 140, ellipsis: true,
        },
        {
            title: t('business.prospects.branch'), key: 'branch', width: 90, align: 'center' as const,
            render: (_: any, record: Prospect) => {
                const b = branches.find(br => br.id === record.branchId);
                return b?.code || record.branchCode || '';
            },
        },
        {
            title: t('business.prospects.estimatedValue'), dataIndex: 'estimatedValue', key: 'estimatedValue', width: 140,
            align: 'right' as const,
            render: (val: number) => val ? val.toLocaleString('vi-VN') : '-',
        },
        {
            title: t('business.prospects.contactPerson'), dataIndex: 'contactPerson', key: 'contactPerson', width: 130, ellipsis: true,
        },
        {
            title: t('business.prospects.source'), dataIndex: 'source', key: 'source', width: 100, align: 'center' as const,
            render: (val: string) => <Tag>{t(`business.prospects.sourceOptions.${val}`)}</Tag>,
        },
        {
            title: t('business.prospects.priority'), dataIndex: 'priority', key: 'priority', width: 100, align: 'center' as const,
            render: (val: string) => <Tag color={PRIORITY_COLORS[val]}>{t(`business.prospects.priorityOptions.${val}`)}</Tag>,
        },
        {
            title: t('business.prospects.status'), dataIndex: 'status', key: 'status', width: 110, align: 'center' as const,
            render: (val: string) => <Tag color={STATUS_COLORS[val]}>{t(`business.prospects.statusOptions.${val}`)}</Tag>,
        },
        {
            title: t('business.prospects.expectedDate'), dataIndex: 'expectedDate', key: 'expectedDate', width: 120,
            align: 'center' as const,
            render: (val: string) => val ? dayjs(val).format('DD/MM/YYYY') : '-',
        },
        {
            title: t('invoices.colActions'), key: 'action', width: 100, align: 'center' as const, fixed: 'right' as const,
            render: (_: any, record: Prospect) => (
                <VcmActionGroup
                    onEdit={canEdit ? () => handleEdit(record) : undefined}
                    onDelete={canEdit ? () => handleDelete(record.id) : undefined}
                    canEdit={canEdit}
                    canDelete={canEdit}
                />
            ),
        },
    ], [t, canEdit, branches]);

    return (
        <Card className="contracts-card">
            <VcmFilterBar>
                <Col xs={24} sm={12} md={8}>
                    <Input
                        placeholder={t('business.prospects.searchPlaceholder')}
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        allowClear
                    />
                </Col>
                <Col xs={24} sm={12} md={5}>
                    <Select placeholder={t('business.prospects.status')} value={filterStatus} onChange={setFilterStatus} allowClear style={{ width: '100%' }}>
                        <Option value="ALL">{t('common.all')}</Option>
                        {['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'].map(s => (
                            <Option key={s} value={s}>{t(`business.prospects.statusOptions.${s}`)}</Option>
                        ))}
                    </Select>
                </Col>
                <Col xs={24} sm={12} md={5}>
                    <Select placeholder={t('business.prospects.priority')} value={filterPriority} onChange={setFilterPriority} allowClear style={{ width: '100%' }}>
                        <Option value="ALL">{t('common.all')}</Option>
                        {['HIGH', 'MEDIUM', 'LOW'].map(p => (
                            <Option key={p} value={p}>{t(`business.prospects.priorityOptions.${p}`)}</Option>
                        ))}
                    </Select>
                </Col>
                <Col xs={24} sm={12} md={6} style={{ textAlign: 'right' }}>
                    {canEdit && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                            {t('business.prospects.addNew')}
                        </Button>
                    )}
                </Col>
            </VcmFilterBar>

            <div style={{ padding: '0 16px' }}>
                <Table
                    dataSource={filteredData}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    scroll={{ x: 1500 }}
                    pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total}` }}
                />
            </div>

            <Modal
                title={editingRecord ? t('business.prospects.editTitle') : t('business.prospects.addTitle')}
                open={modalVisible}
                onCancel={() => { setModalVisible(false); form.resetFields(); }}
                onOk={() => form.submit()}
                width={700}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item name="name" label={t('business.prospects.name')} rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="client" label={t('business.prospects.client')}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="location" label={t('business.prospects.location')}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="branchId" label={t('business.prospects.branch')}>
                        <Select allowClear>
                            {branches.map(b => <Option key={b.id} value={b.id}>{b.code}</Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="estimatedValue" label={t('business.prospects.estimatedValue')}>
                        <InputNumber style={{ width: '100%' }} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
                    </Form.Item>
                    <Form.Item name="contactPerson" label={t('business.prospects.contactPerson')}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="contactPhone" label={t('business.prospects.contactPhone')}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="source" label={t('business.prospects.source')} initialValue="DIRECT">
                        <Select>
                            {['BIDDING', 'REFERRAL', 'DIRECT', 'OTHER'].map(s => (
                                <Option key={s} value={s}>{t(`business.prospects.sourceOptions.${s}`)}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="status" label={t('business.prospects.status')} initialValue="NEW">
                        <Select>
                            {['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'].map(s => (
                                <Option key={s} value={s}>{t(`business.prospects.statusOptions.${s}`)}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="priority" label={t('business.prospects.priority')} initialValue="MEDIUM">
                        <Select>
                            {['HIGH', 'MEDIUM', 'LOW'].map(p => (
                                <Option key={p} value={p}>{t(`business.prospects.priorityOptions.${p}`)}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="expectedDate" label={t('business.prospects.expectedDate')}>
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                    </Form.Item>
                    <Form.Item name="note" label={t('business.prospects.note')}>
                        <Input.TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default ProspectList;
