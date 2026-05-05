import React, { useState } from 'react';
import { Button, Table, Tag, Modal, Form, Input, Select, message, Empty, Popconfirm, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, DeleteOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import PlanGuideModal from './PlanGuideModal';
import { useTranslation } from 'react-i18next';
import type { Dayjs } from 'dayjs';
import { VcmActionGroup } from './VcmActionGroup';
import type { MonthlyPlanItem } from '../types';
import { useMonthlyPlans, usePlanMutations } from '../hooks/usePlans';
import { useUsers } from '../hooks/useUsers';

const { TextArea } = Input;
const { Option } = Select;
const { Title } = Typography;

const STATUS_COLORS: Record<string, string> = {
    TODO: 'default', IN_PROGRESS: 'processing', DONE: 'success',
};

interface Props {
    department: string;
    selectedMonth: Dayjs;
    canEdit: boolean;
}

const MonthlyPlanSection: React.FC<Props> = ({ department, selectedMonth, canEdit }) => {
    const { t } = useTranslation();
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<MonthlyPlanItem | null>(null);
    const [guideVisible, setGuideVisible] = useState(false);
    const [form] = Form.useForm();

    const monthStart = selectedMonth.format('YYYY-MM-DD');

    // React Query Data
    const { data: plans = [], isLoading: loading } = useMonthlyPlans({ department, monthStart });
    const { data: users = [] } = useUsers();
    const { 
        createMonthlyPlan, 
        deleteMonthlyPlan, 
        createMonthlyPlanItem, 
        updateMonthlyPlanItem, 
        deleteMonthlyPlanItem 
    } = usePlanMutations();

    const plan = plans.length > 0 ? plans[0] : null;
    const items = plan?.items || [];

    const handleCreatePlan = async () => {
        createMonthlyPlan.mutate({ monthStart, department }, {
            onSuccess: (res) => {
                if (res.success) message.success(t('common.saveSuccess'));
                else message.error(res.error || t('common.saveError'));
            },
            onError: () => message.error(t('common.saveError'))
        });
    };

    const handleDeletePlan = async () => {
        if (!plan) return;
        deleteMonthlyPlan.mutate(plan.id, {
            onSuccess: () => message.success(t('common.deleteSuccess')),
            onError: () => message.error(t('common.saveError'))
        });
    };

    const openAddModal = () => {
        setEditingItem(null);
        form.resetFields();
        form.setFieldsValue({ sortOrder: items.length + 1, status: 'TODO' });
        setModalVisible(true);
    };

    const openEditModal = (item: MonthlyPlanItem) => {
        setEditingItem(item);
        form.setFieldsValue(item);
        setModalVisible(true);
    };

    const handleDeleteItem = async (id: string) => {
        deleteMonthlyPlanItem.mutate(id, {
            onSuccess: () => message.success(t('common.deleteSuccess')),
            onError: () => message.error(t('common.saveError'))
        });
    };

    const handleSubmit = async (values: any) => {
        if (!plan) return;
        if (editingItem) {
            updateMonthlyPlanItem.mutate({ id: editingItem.id, data: values }, {
                onSuccess: (res) => {
                    if (res.success) {
                        message.success(t('common.saveSuccess'));
                        setModalVisible(false);
                    }
                },
                onError: () => message.error(t('common.saveError'))
            });
        } else {
            createMonthlyPlanItem.mutate({ planId: plan.id, data: values }, {
                onSuccess: (res) => {
                    if (res.success) {
                        message.success(t('common.saveSuccess'));
                        setModalVisible(false);
                    }
                },
                onError: () => message.error(t('common.saveError'))
            });
        }
    };

    const columns: ColumnsType<MonthlyPlanItem> = [
        { title: '#', dataIndex: 'sortOrder', key: 'sortOrder', width: 45, align: 'center' },
        {
            title: t('business.weeklyPlan.what'), dataIndex: 'title', key: 'title', width: 200,
            render: (val: string) => <span style={{ fontWeight: 500 }}>{val}</span>,
        },
        { title: t('plans.monthly.target'), dataIndex: 'target', key: 'target', width: 180, ellipsis: true },
        { title: t('business.weeklyPlan.why'), dataIndex: 'why', key: 'why', width: 150, ellipsis: true },
        {
            title: t('business.weeklyPlan.who'), key: 'who', width: 130,
            render: (_: any, r: MonthlyPlanItem) => r.assigneeName || users.find((u: any) => u.id === r.assigneeId)?.name || '-',
        },
        { title: t('business.weeklyPlan.how'), dataIndex: 'method', key: 'method', width: 130, render: (val: string) => <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{val || '-'}</span> },
        {
            title: t('business.weeklyPlan.status'), dataIndex: 'status', key: 'status', width: 130, align: 'center',
            render: (val: string) => {
                const labelKey = val === 'IN_PROGRESS' ? 'statusInProgress' : val === 'DONE' ? 'statusDone' : 'statusTodo';
                return <Tag color={STATUS_COLORS[val]}>{t(`business.weeklyPlan.${labelKey}`)}</Tag>;
            },
        },
        { title: t('business.weeklyPlan.result'), dataIndex: 'result', key: 'result', width: 120, render: (val: string) => <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{val || '-'}</span> },
        {
            title: t('common.actions'), key: 'action', width: 90, align: 'center',
            render: (_: any, record: MonthlyPlanItem) => (
                <VcmActionGroup
                    onEdit={canEdit ? () => openEditModal(record) : undefined}
                    onDelete={canEdit ? () => handleDeleteItem(record.id) : undefined}
                    canEdit={canEdit}
                    canDelete={canEdit}
                />
            ),
        },
    ];

    return (
        <div style={{ margin: '0 0 4px' }}>
            {/* Section header */}
            <div style={{
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'linear-gradient(135deg, #fff7f7 0%, #fff 100%)',
                borderBottom: '1px solid #f1f5f9',
            }}>
                <Title level={5} style={{ margin: 0, color: '#E11D2E', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('plans.monthly.sectionTitle')} — {selectedMonth.format('MM/YYYY')}
                </Title>
                {plan && canEdit && (
                    <>
                        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
                            {t('plans.monthly.addItem')}
                        </Button>
                        <Popconfirm
                            title={t('plans.monthly.deleteConfirm')}
                            onConfirm={handleDeletePlan}
                            okText={t('common.delete')}
                            cancelText={t('common.cancel')}
                        >
                            <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    </>
                )}
                {!plan && canEdit && (
                    <Button size="small" type="primary" icon={<PlusOutlined />} onClick={handleCreatePlan}>
                        {t('plans.monthly.createPlan')}
                    </Button>
                )}
            </div>

            {!plan ? (
                <div style={{ padding: '24px 16px', background: '#fafafa' }}>
                    <Empty description={t('plans.monthly.noplan')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
            ) : (
                <Table
                    dataSource={items}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    pagination={false}
                    scroll={{ x: 1200 }}
                    style={{ background: '#fffbfb' }}
                />
            )}

            {/* Item Modal */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{editingItem ? t('plans.monthly.editItem') : t('plans.monthly.addItem')}</span>
                        <Button type="link" size="small" icon={<QuestionCircleOutlined />}
                            onClick={() => setGuideVisible(true)} style={{ padding: '0 4px', fontSize: 12 }}>
                            Hướng dẫn
                        </Button>
                    </div>
                }
                open={modalVisible}
                onCancel={() => { setModalVisible(false); form.resetFields(); }}
                onOk={() => form.submit()}
                width={620}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item name="sortOrder" label="#" rules={[{ required: true }]}>
                        <Select>{[1,2,3,4,5,6,7,8,9,10].map(n => <Option key={n} value={n}>{n}</Option>)}</Select>
                    </Form.Item>
                    <Form.Item name="title" label={t('business.weeklyPlan.what')} rules={[{ required: true }]}>
                        <Input placeholder={t('business.weeklyPlan.whatPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="target" label={t('plans.monthly.target')}>
                        <Input placeholder={t('plans.monthly.targetPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="why" label={t('business.weeklyPlan.why')}>
                        <Input placeholder={t('business.weeklyPlan.whyPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="assigneeId" label={t('business.weeklyPlan.who')}>
                        <Select allowClear showSearch placeholder={t('business.weeklyPlan.whoPlaceholder')}
                            filterOption={(input, option) => {
                                const label = (option?.children as unknown as string) || '';
                                return label.toLowerCase().includes(input.toLowerCase());
                            }}>
                            {users.map((u: any) => <Option key={u.id} value={u.id}>{u.name}</Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="method" label={t('business.weeklyPlan.how')}>
                        <Input placeholder={t('business.weeklyPlan.howPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="status" label={t('business.weeklyPlan.status')} initialValue="TODO">
                        <Select>
                            <Option value="TODO">{t('business.weeklyPlan.statusTodo')}</Option>
                            <Option value="IN_PROGRESS">{t('business.weeklyPlan.statusInProgress')}</Option>
                            <Option value="DONE">{t('business.weeklyPlan.statusDone')}</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="result" label={t('business.weeklyPlan.result')}>
                        <TextArea rows={2} placeholder={t('business.weeklyPlan.resultPlaceholder')} />
                    </Form.Item>
                </Form>
            </Modal>
            <PlanGuideModal open={guideVisible} onClose={() => setGuideVisible(false)} />
        </div>
    );
};

export default MonthlyPlanSection;
