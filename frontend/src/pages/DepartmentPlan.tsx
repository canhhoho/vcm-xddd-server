import React, { useEffect, useState, useMemo } from 'react';
import {
    Card, Table, Button, Select, Modal, Form, Input, Tag, message, DatePicker, Empty, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { usePermissions } from '../hooks/usePermissions';
import { apiService } from '../services/api';
import { VcmActionGroup } from '../components/VcmActionGroup';
import type { WeeklyPlan, WeeklyPlanItem, User } from '../types';

dayjs.extend(isoWeek);

const { Option } = Select;
const { TextArea } = Input;

const STATUS_COLORS: Record<string, string> = {
    TODO: 'default', IN_PROGRESS: 'processing', DONE: 'success', CARRIED_OVER: 'warning',
};

const getWeekStart = (date: dayjs.Dayjs) => date.isoWeekday(1).startOf('day');
const getWeekEnd = (date: dayjs.Dayjs) => date.isoWeekday(7).startOf('day');

interface DepartmentPlanProps {
    department: string;
}

const DepartmentPlan: React.FC<DepartmentPlanProps> = ({ department }) => {
    const { t } = useTranslation();
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.business === 'EDIT';

    const [selectedWeek, setSelectedWeek] = useState<dayjs.Dayjs>(getWeekStart(dayjs()));
    const [plans, setPlans] = useState<WeeklyPlan[]>([]);
    const [items, setItems] = useState<WeeklyPlanItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<WeeklyPlanItem | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [form] = Form.useForm();

    const currentPlan = useMemo(() => {
        const ws = selectedWeek.format('YYYY-MM-DD');
        return plans.find(p => dayjs(p.weekStart).format('YYYY-MM-DD') === ws && p.department === department);
    }, [plans, selectedWeek, department]);

    const prevPlan = useMemo(() => {
        const prevWeek = selectedWeek.subtract(7, 'day').format('YYYY-MM-DD');
        return plans.find(p => dayjs(p.weekStart).format('YYYY-MM-DD') === prevWeek && p.department === department);
    }, [plans, selectedWeek, department]);

    const loadPlans = async () => {
        try {
            const res = await apiService.getWeeklyPlans({ department });
            if (res.success) setPlans(res.data || []);
        } catch { /* ignore */ }
    };

    const loadItems = async () => {
        if (!currentPlan) { setItems([]); return; }
        setLoading(true);
        try {
            const res = await apiService.getWeeklyPlanItems(currentPlan.id);
            if (res.success) setItems(res.data || []);
        } catch { /* ignore */ }
        setLoading(false);
    };

    const loadUsers = async () => {
        try {
            const res = await apiService.getUsers();
            if (res.success) setUsers(res.data || []);
        } catch { /* ignore */ }
    };

    useEffect(() => { loadUsers(); }, []);
    useEffect(() => { loadPlans(); }, [department]);
    useEffect(() => { loadItems(); }, [currentPlan]);

    const handleCreatePlan = async (withCarryOver: boolean) => {
        try {
            const ws = selectedWeek;
            const we = getWeekEnd(ws);
            const payload: any = {
                weekStart: ws.format('YYYY-MM-DD'),
                weekEnd: we.format('YYYY-MM-DD'),
                department,
            };
            if (withCarryOver && prevPlan) {
                payload.carryOverFromPlanId = prevPlan.id;
            }
            const res = await apiService.createWeeklyPlan(payload);
            if (res.success) {
                message.success(t('common.saveSuccess'));
                await loadPlans();
            } else {
                message.error(res.error || t('common.saveError'));
            }
        } catch {
            message.error(t('common.saveError'));
        }
    };

    const handleAddItem = () => {
        if (items.length >= 5) {
            message.warning(t('business.weeklyPlan.maxItems'));
            return;
        }
        setEditingItem(null);
        form.resetFields();
        form.setFieldsValue({ sortOrder: items.length + 1, status: 'TODO' });
        setModalVisible(true);
    };

    const handleEditItem = (record: WeeklyPlanItem) => {
        setEditingItem(record);
        form.setFieldsValue({
            ...record,
            startDate: record.startDate ? dayjs(record.startDate) : null,
            endDate: record.endDate ? dayjs(record.endDate) : null,
        });
        setModalVisible(true);
    };

    const handleSubmitItem = async (values: any) => {
        try {
            const payload = {
                ...values,
                startDate: values.startDate?.format('YYYY-MM-DD') || null,
                endDate: values.endDate?.format('YYYY-MM-DD') || null,
            };
            if (editingItem) {
                const res = await apiService.updateWeeklyPlanItem(editingItem.id, payload);
                if (res.success) message.success(t('common.saveSuccess'));
            } else if (currentPlan) {
                const res = await apiService.createWeeklyPlanItem(currentPlan.id, payload);
                if (res.success) message.success(t('common.saveSuccess'));
            }
            setModalVisible(false);
            form.resetFields();
            loadItems();
        } catch {
            message.error(t('common.saveError'));
        }
    };

    const handleDeleteItem = async (id: string) => {
        try {
            await apiService.deleteWeeklyPlanItem(id);
            message.success(t('common.deleteSuccess'));
            loadItems();
        } catch {
            message.error(t('common.saveError'));
        }
    };

    const weekLabel = `${selectedWeek.format('DD/MM')} - ${getWeekEnd(selectedWeek).format('DD/MM/YYYY')}`;

    const columns: ColumnsType<WeeklyPlanItem> = [
        {
            title: '#', dataIndex: 'sortOrder', key: 'sortOrder', width: 45, align: 'center' as const,
        },
        {
            title: t('business.weeklyPlan.what'), dataIndex: 'title', key: 'title', width: 200,
            render: (val: string, record: WeeklyPlanItem) => (
                <span>
                    {val}
                    {record.carriedFrom && (
                        <Tag color="orange" style={{ marginLeft: 6, fontSize: 10 }}>
                            <SyncOutlined /> {t('business.weeklyPlan.carriedTag')}
                        </Tag>
                    )}
                </span>
            ),
        },
        {
            title: t('business.weeklyPlan.why'), dataIndex: 'why', key: 'why', width: 150, ellipsis: true,
        },
        {
            title: t('business.weeklyPlan.who'), key: 'assignee', width: 120,
            render: (_: any, record: WeeklyPlanItem) => record.assigneeName || users.find(u => u.id === record.assigneeId)?.name || '',
        },
        {
            title: t('business.weeklyPlan.when'), key: 'when', width: 140, align: 'center' as const,
            render: (_: any, record: WeeklyPlanItem) => {
                const s = record.startDate ? dayjs(record.startDate).format('DD/MM') : '';
                const e = record.endDate ? dayjs(record.endDate).format('DD/MM') : '';
                return s && e ? `${s} - ${e}` : s || e || '-';
            },
        },
        {
            title: t('business.weeklyPlan.where'), dataIndex: 'location', key: 'location', width: 120, ellipsis: true,
        },
        {
            title: t('business.weeklyPlan.how'), dataIndex: 'method', key: 'method', width: 130, ellipsis: true,
        },
        {
            title: t('business.weeklyPlan.status'), dataIndex: 'status', key: 'status', width: 130, align: 'center' as const,
            render: (val: string) => {
                const key = val === 'IN_PROGRESS' ? 'statusInProgress' : val === 'CARRIED_OVER' ? 'statusCarriedOver' : val === 'DONE' ? 'statusDone' : 'statusTodo';
                return <Tag color={STATUS_COLORS[val]}>{t(`business.weeklyPlan.${key}`)}</Tag>;
            },
        },
        {
            title: t('business.weeklyPlan.result'), dataIndex: 'result', key: 'result', width: 160, ellipsis: true,
        },
        {
            title: t('invoices.colActions'), key: 'action', width: 90, align: 'center' as const,
            render: (_: any, record: WeeklyPlanItem) => (
                <VcmActionGroup
                    onEdit={canEdit ? () => handleEditItem(record) : undefined}
                    onDelete={canEdit ? () => handleDeleteItem(record.id) : undefined}
                    canEdit={canEdit}
                    canDelete={canEdit}
                />
            ),
        },
    ];

    return (
        <Card className="contracts-card">
            <div style={{ padding: '16px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <DatePicker
                    picker="week"
                    value={selectedWeek}
                    onChange={(date) => date && setSelectedWeek(getWeekStart(date))}
                    format={`[${t('business.weeklyPlan.week')}] wo - YYYY`}
                    style={{ width: 200 }}
                />
                <span style={{ fontWeight: 600, color: '#1890ff' }}>{weekLabel}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {canEdit && !currentPlan && (
                        <>
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleCreatePlan(false)}>
                                {t('business.weeklyPlan.createPlan')}
                            </Button>
                            {prevPlan && (
                                <Tooltip title={t('business.weeklyPlan.carryOver')}>
                                    <Button icon={<SyncOutlined />} onClick={() => handleCreatePlan(true)}>
                                        {t('business.weeklyPlan.carryOver')}
                                    </Button>
                                </Tooltip>
                            )}
                        </>
                    )}
                    {canEdit && currentPlan && items.length < 5 && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddItem}>
                            {t('business.weeklyPlan.addItem')}
                        </Button>
                    )}
                </div>
            </div>

            <div style={{ padding: '0 16px' }}>
                {!currentPlan ? (
                    <Empty description={t('business.weeklyPlan.noPlan')} style={{ padding: 60 }} />
                ) : (
                    <Table
                        dataSource={items}
                        columns={columns}
                        rowKey="id"
                        loading={loading}
                        size="small"
                        pagination={false}
                        scroll={{ x: 1400 }}
                    />
                )}
            </div>

            <Modal
                title={editingItem ? t('business.weeklyPlan.editItem') : t('business.weeklyPlan.addItem')}
                open={modalVisible}
                onCancel={() => { setModalVisible(false); form.resetFields(); }}
                onOk={() => form.submit()}
                width={650}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSubmitItem}>
                    <Form.Item name="sortOrder" label="#" rules={[{ required: true }]}>
                        <Select>
                            {[1, 2, 3, 4, 5].map(n => <Option key={n} value={n}>{n}</Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="title" label={t('business.weeklyPlan.what')} rules={[{ required: true }]}>
                        <Input placeholder="What — Nội dung công việc" />
                    </Form.Item>
                    <Form.Item name="why" label={t('business.weeklyPlan.why')}>
                        <Input placeholder="Why — Mục đích" />
                    </Form.Item>
                    <Form.Item name="assigneeId" label={t('business.weeklyPlan.who')}>
                        <Select allowClear showSearch placeholder="Who — Người phụ trách" filterOption={(input, option) => {
                            const label = (option?.children as unknown as string) || '';
                            return label.toLowerCase().includes(input.toLowerCase());
                        }}>
                            {users.map(u => <Option key={u.id} value={u.id}>{u.name}</Option>)}
                        </Select>
                    </Form.Item>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <Form.Item name="startDate" label={t('business.weeklyPlan.whenStart')} style={{ flex: 1 }}>
                            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                        </Form.Item>
                        <Form.Item name="endDate" label={t('business.weeklyPlan.whenEnd')} style={{ flex: 1 }}>
                            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                        </Form.Item>
                    </div>
                    <Form.Item name="location" label={t('business.weeklyPlan.where')}>
                        <Input placeholder="Where — Địa điểm" />
                    </Form.Item>
                    <Form.Item name="method" label={t('business.weeklyPlan.how')}>
                        <Input placeholder="How — Phương pháp" />
                    </Form.Item>
                    <Form.Item name="status" label={t('business.weeklyPlan.status')} initialValue="TODO">
                        <Select>
                            <Option value="TODO">{t('business.weeklyPlan.statusTodo')}</Option>
                            <Option value="IN_PROGRESS">{t('business.weeklyPlan.statusInProgress')}</Option>
                            <Option value="DONE">{t('business.weeklyPlan.statusDone')}</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="result" label={t('business.weeklyPlan.result')}>
                        <TextArea rows={2} placeholder="Kết quả đánh giá" />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default DepartmentPlan;
