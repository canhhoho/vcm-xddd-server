import React, { useEffect, useState, useMemo } from 'react';
import {
    Card, Table, Button, Input, Select, Modal, Form, InputNumber, DatePicker, Tag, message, Col, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { usePermissions } from '../hooks/usePermissions';
import { useAppConfig } from '../hooks/useAppConfig';
import { apiService } from '../services/api';
import { VcmFilterBar } from '../components/VcmFilterBar';
import { VcmActionGroup } from '../components/VcmActionGroup';
import type { Prospect, Province } from '../types';

const { Option } = Select;

// Funnel stage colors — must match Dashboard funnel gradient
const STATUS_COLORS: Record<string, string> = {
    NEW: '#E05C97',       // Tầng 1: Pink
    CONTACTED: '#F97316', // Tầng 2: Orange
    PROPOSAL: '#F59E0B',  // Tầng 3: Yellow
    NEGOTIATION: '#3B9ED8', // Tầng 4: Teal-Blue
    WON: '#1D4ED8',       // Tầng 5: Deep Blue
    LOST: '#6B7280',      // Tầng phụ: Gray
};
const PRIORITY_COLORS: Record<string, string> = { HIGH: 'red', MEDIUM: 'gold', LOW: 'green' };

interface ProspectListProps {
    prospectType?: 'B2B' | 'B2C';
}

const ProspectList: React.FC<ProspectListProps> = ({ prospectType = 'B2B' }) => {
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
            const res = await apiService.getProspects(prospectType);
            if (res.success) setProspects(res.data || []);
        } catch { /* ignore */ }
        setLoading(false);
    };

    useEffect(() => { loadData(); }, [prospectType]);

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
            contactDate: record.contactDate ? dayjs(record.contactDate) : null,
        });
        setModalVisible(true);
    };

    const handleSubmit = async (values: any) => {
        try {
            const payload = {
                ...values,
                expectedDate: values.expectedDate?.format('YYYY-MM-DD') || null,
                contactDate: values.contactDate?.format('YYYY-MM-DD') || null,
                prospectType,
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

    const handleExportExcel = () => {
        const XLSX = (window as any).XLSX;
        if (!XLSX) {
            message.error('XLSX library not loaded');
            return;
        }

        const dataToExport = filteredData.map((p, index) => {
            const branch = branches.find(br => br.id === p.branchId);
            return {
                [t('business.prospects.no', '#')]: index + 1,
                [t('business.prospects.name')]: p.name,
                [t('business.prospects.client')]: p.client,
                [t('business.prospects.location')]: p.location,
                [t('business.prospects.branch')]: branch?.code || p.branchCode || '',
                [t('business.prospects.estimatedValue')]: p.estimatedValue || 0,
                [t('business.prospects.contactPerson')]: p.contactPerson,
                [t('business.prospects.contactPhone', 'Phone')]: p.contactPhone || '',
                [t('business.prospects.source')]: t(`business.prospects.sourceOptions.${p.source}`),
                [t('business.prospects.priority')]: t(`business.prospects.priorityOptions.${p.priority}`),
                [t('business.prospects.status')]: t(`business.prospects.statusOptions.${p.status}`),
                [t('business.prospects.contactDate')]: p.contactDate ? dayjs(p.contactDate).format('DD/MM/YYYY') : '',
                [t('business.prospects.expectedDate')]: p.expectedDate ? dayjs(p.expectedDate).format('DD/MM/YYYY') : '',
                [t('business.prospects.note', 'Note')]: p.note || '',
            };
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Prospects');

        const fileName = `Prospects_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        message.success(t('common.exportSuccess', 'Export successfully!'));
    };

    const columns: ColumnsType<Prospect> = useMemo(() => [
        {
            title: '#', key: 'index', width: 50, align: 'center' as const,
            render: (_: any, __: any, index: number) => index + 1,
        },
        {
            title: t('business.prospects.name'), dataIndex: 'name', key: 'name', width: 200,
            render: (val: string) => <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{val}</span>,
        },
        {
            title: t('business.prospects.contactDate'), dataIndex: 'contactDate', key: 'contactDate', width: 110,
            align: 'center' as const,
            render: (val: string) => val ? dayjs(val).format('DD/MM/YYYY') : '-',
        },
        {
            title: t('business.prospects.client'), dataIndex: 'client', key: 'client', width: 150, ellipsis: true,
        },
        {
            title: t('business.prospects.clientPhone'), dataIndex: 'contactPhone', key: 'contactPhone', width: 120,
            render: (val: string) => val || '-',
        },
        {
            title: t('business.prospects.location'), dataIndex: 'location', key: 'location', width: 160,
            render: (val: string) => <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{val || '-'}</span>,
        },
        {
            title: t('business.prospects.branch'), key: 'branch', width: 80, align: 'center' as const,
            render: (_: any, record: Prospect) => {
                const b = branches.find(br => br.id === record.branchId);
                return b?.code || record.branchCode || '';
            },
        },
        {
            title: (
                <div style={{ lineHeight: '1.2' }}>
                    {t('business.prospects.estimatedValue')}
                    <br />
                    <span style={{ fontWeight: 'normal', fontSize: '12px', color: '#6B7280' }}>
                        ({t('business.prospects.estValueUnit')})
                    </span>
                </div>
            ),
            dataIndex: 'estimatedValue', key: 'estimatedValue', width: 120,
            align: 'right' as const,
            render: (val: number) => val ? `${val.toLocaleString('vi-VN')} ${t('dashboard.millionUnit')}` : '-',
        },
        {
            title: t('business.prospects.contactPerson'), dataIndex: 'contactPerson', key: 'contactPerson', width: 130, ellipsis: true,
        },
        {
            title: t('business.prospects.source'), dataIndex: 'source', key: 'source', width: 100, align: 'center' as const,
            render: (val: string) => <Tag>{t(`business.prospects.sourceOptions.${val}`)}</Tag>,
        },
        {
            title: t('business.prospects.priority'), dataIndex: 'priority', key: 'priority', width: 90, align: 'center' as const,
            render: (val: string) => <Tag color={PRIORITY_COLORS[val]}>{t(`business.prospects.priorityOptions.${val}`)}</Tag>,
        },
        {
            title: t('business.prospects.status'), dataIndex: 'status', key: 'status', width: 120, align: 'center' as const,
            render: (val: string) => (
                <Tag
                    style={{ backgroundColor: STATUS_COLORS[val], borderColor: STATUS_COLORS[val], color: '#fff', fontWeight: 600 }}
                >
                    {t(`business.prospects.statusOptions.${val}`)}
                </Tag>
            ),
        },
        {
            title: t('business.prospects.expectedDate'), dataIndex: 'expectedDate', key: 'expectedDate', width: 110,
            align: 'center' as const,
            render: (val: string) => val ? dayjs(val).format('DD/MM/YYYY') : '-',
        },
        {
            title: t('common.actions'), key: 'action', width: 90, align: 'center' as const, fixed: 'right' as const,
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
                <Col xs={24} sm={12} md={6} style={{ textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button icon={<FileExcelOutlined />} onClick={handleExportExcel} style={{ color: '#52c41a', borderColor: '#52c41a' }}>
                        Excel
                    </Button>
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
                    scroll={{ x: 'max-content' }}
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
                    <Form.Item name="contactPhone" label={t('business.prospects.clientPhone')}>
                        <Input placeholder={t('business.prospects.clientPhonePlaceholder')} />
                    </Form.Item>
                    <Form.Item name="location" label={t('business.prospects.location')}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="branchId" label={t('business.prospects.branch')}>
                        <Select allowClear>
                            {branches.map(b => <Option key={b.id} value={b.id}>{b.code}</Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="estimatedValue"
                        label={
                            <span>
                                {t('business.prospects.estimatedValue')}
                                <span style={{ fontWeight: 400, color: '#6B7280', marginLeft: 6 }}>{t('business.prospects.estValueHint')}</span>
                            </span>
                        }
                    >
                        <InputNumber
                            style={{ width: '100%' }}
                            min={0}
                            placeholder={t('business.prospects.estValuePlaceholder')}
                            addonAfter={<span style={{ whiteSpace: 'nowrap' }}>{t('business.prospects.estValueUnit')}</span>}
                            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={(v: any) => v!.replace(/,/g, '')}
                        />
                    </Form.Item>
                    <Form.Item name="contactPerson" label={t('business.prospects.contactPerson')}>
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
                    <Form.Item name="contactDate" label={t('business.prospects.contactDate')}>
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
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
