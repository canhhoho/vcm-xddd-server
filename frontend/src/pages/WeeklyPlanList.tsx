import React, { useEffect, useState, useMemo } from 'react';
import {
    Card, Table, Button, Select, Modal, Form, Input, Tag, message, Col, Row, Empty, DatePicker, Checkbox, Tooltip,
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

const DEPARTMENTS = ['BD', 'MKT', 'QS', 'PM', 'DES'] as const;

const STATUS_COLORS: Record<string, string> = {
    TODO: 'default', IN_PROGRESS: 'processing', DONE: 'success', CARRIED_OVER: 'warning',
};

// Get Monday of a given week
const getWeekStart = (date: dayjs.Dayjs) => date.isoWeekday(1).startOf('day');
const getWeekEnd = (date: dayjs.Dayjs) => date.isoWeekday(7).startOf('day');

const WeeklyPlanList: React.FC = () => {
    const { t } = useTranslation();
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.business === 'EDIT';

    const [selectedDept, setSelectedDept] = useState<string>('BD');
    const [selectedWeek, setSelectedWeek] = useState<dayjs.Dayjs>(getWeekStart(dayjs()));
    const [plans, setPlans] = useState<WeeklyPlan[]>([]);
    const [items, setItems] = useState<WeeklyPlanItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<WeeklyPlanItem | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [form] = Form.useForm();

    // Current plan for selected week + department
    const currentPlan = useMemo(() => {
        const ws = selectedWeek.format('YYYY-MM-DD');
        return plans.find(p => dayjs(p.weekStart).format('YYYY-MM-DD') === ws && p.department === selectedDept);
    }, [plans, selectedWeek, selectedDept]);

    // Previous week plan (for carry-over)
    const prevPlan = useMemo(() => {
        const prevWeek = selectedWeek.subtract(7, 'day').format('YYYY-MM-DD');
        return plans.find(p => dayjs(p.weekStart).format('YYYY-MM-DD') === prevWeek && p.department === selectedDept);
    }, [plans, selectedWeek, selectedDept]);

    const loadPlans = async () => {
        try {
            const res = await apiService.getWeeklyPlans({ department: selectedDept });
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
    useEffect(() => { loadPlans(); }, [selectedDept]);
    useEffect(() => { loadItems(); }, [currentPlan]);

    const handleCreatePlan = async (withCarryOver: boolean) => {
        try {
            const ws = selectedWeek;
            const we = getWeekEnd(ws);
            const payload: any = {
                weekStart: ws.format('YYYY-MM-DD'),
                weekEnd: we.format('YYYY-MM-DD'),
                department: selectedDept,
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
        form.setFieldsValue(record);
        setModalVisible(true);
    };

    const handleSubmitItem = async (values: any) => {
        try {
            if (editingItem) {
                const res = await apiService.updateWeeklyPlanItem(editingItem.id, values);
                if (res.success) message.success(t('common.saveSuccess'));
            } else if (currentPlan) {
                const res = await apiService.createWeeklyPlanItem(currentPlan.id, values);
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
            title: '#', dataIndex: 'sortOrder', key: 'sortOrder', width: 50, align: 'center' as const,
        },
        {
            title: t('business.weeklyPlan.itemTitle'), dataIndex: 'title', key: 'title', width: 250,
            render: (val: string, record: WeeklyPlanItem) => (
                <span>
                    {val}
                    {record.carriedFrom && (
                        <Tag color="orange" style={{ marginLeft: 8, fontSize: 10 }}>
                            <SyncOutlined spin={false} /> {t('business.weeklyPlan.carriedTag')}
                        </Tag>
                    )}
                </span>
            ),
        },
        {
            title: t('business.weeklyPlan.description'), dataIndex: 'description', key: 'description', width: 200, ellipsis: true,
        },
        {
            title: t('business.weeklyPlan.assignee'), key: 'assignee', width: 130,
            render: (_: any, record: WeeklyPlanItem) => record.assigneeName || users.find(u => u.id === record.assigneeId)?.name || '',
        },
        {
            title: t('business.weeklyPlan.status'), dataIndex: 'status', key: 'status', width: 140, align: 'center' as const,
            render: (val: string) => {
                const key = val === 'IN_PROGRESS' ? 'statusInProgress' : val === 'CARRIED_OVER' ? 'statusCarriedOver' : val === 'DONE' ? 'statusDone' : 'statusTodo';
                return <Tag color={STATUS_COLORS[val]}>{t(`business.weeklyPlan.${key}`)}</Tag>;
            },
        },
        {
            title: t('business.weeklyPlan.result'), dataIndex: 'result', key: 'result', width: 200, ellipsis: true,
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
                <Select value={selectedDept} onChange={setSelectedDept} style={{ width: 160 }}>
                    {DEPARTMENTS.map(d => (
                        <Option key={d} value={d}>{t(`business.weeklyPlan.dept${d}`)}</Option>
                    ))}
                </Select>
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
                        scroll={{ x: 1100 }}
                    />
                )}
            </div>

            <Modal
                title={editingItem ? t('business.weeklyPlan.editItem') : t('business.weeklyPlan.addItem')}
                open={modalVisible}
                onCancel={() => { setModalVisible(false); form.resetFields(); }}
                onOk={() => form.submit()}
                width={600}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSubmitItem}>
                    <Form.Item name="sortOrder" label="#" rules={[{ required: true }]}>
                        <Select>
                            {[1, 2, 3, 4, 5].map(n => <Option key={n} value={n}>{n}</Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="title" label={t('business.weeklyPlan.itemTitle')} rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="description" label={t('business.weeklyPlan.description')}>
                        <TextArea rows={3} />
                    </Form.Item>
                    <Form.Item name="assigneeId" label={t('business.weeklyPlan.assignee')}>
                        <Select allowClear showSearch filterOption={(input, option) => {
                            const label = (option?.children as unknown as string) || '';
                            return label.toLowerCase().includes(input.toLowerCase());
                        }}>
                            {users.map(u => <Option key={u.id} value={u.id}>{u.name}</Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="status" label={t('business.weeklyPlan.status')} initialValue="TODO">
                        <Select>
                            <Option value="TODO">{t('business.weeklyPlan.statusTodo')}</Option>
                            <Option value="IN_PROGRESS">{t('business.weeklyPlan.statusInProgress')}</Option>
                            <Option value="DONE">{t('business.weeklyPlan.statusDone')}</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="result" label={t('business.weeklyPlan.result')}>
                        <TextArea rows={2} />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default WeeklyPlanList;
