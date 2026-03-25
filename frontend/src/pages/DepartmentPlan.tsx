import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    Card, Table, Button, Select, Modal, Form, Input, Tag, message, DatePicker, Empty, Tooltip, Collapse,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SyncOutlined, CalendarOutlined } from '@ant-design/icons';
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

    const [plans, setPlans] = useState<WeeklyPlan[]>([]);
    const [planItemsMap, setPlanItemsMap] = useState<Record<string, WeeklyPlanItem[]>>({});
    const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<WeeklyPlanItem | null>(null);
    const [activePlanId, setActivePlanId] = useState<string | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [form] = Form.useForm();

    const thisWeekStart = getWeekStart(dayjs());

    // Sorted plans: newest first
    const sortedPlans = useMemo(() =>
        [...plans].sort((a, b) => dayjs(b.weekStart).diff(dayjs(a.weekStart)))
    , [plans]);

    // Check if current week already has a plan
    const currentWeekPlan = useMemo(() =>
        plans.find(p => dayjs(p.weekStart).format('YYYY-MM-DD') === thisWeekStart.format('YYYY-MM-DD')),
    [plans, thisWeekStart]);

    // Most recent plan (for carry-over)
    const latestPlan = sortedPlans[0] || null;

    const loadPlans = async () => {
        try {
            const res = await apiService.getWeeklyPlans({ department });
            if (res.success) setPlans(res.data || []);
        } catch { /* ignore */ }
    };

    const loadItemsForPlan = useCallback(async (planId: string) => {
        if (planItemsMap[planId]) return; // already loaded
        setLoadingPlanId(planId);
        try {
            const res = await apiService.getWeeklyPlanItems(planId);
            if (res.success) {
                setPlanItemsMap(prev => ({ ...prev, [planId]: res.data || [] }));
            }
        } catch { /* ignore */ }
        setLoadingPlanId(null);
    }, [planItemsMap]);

    const refreshPlanItems = async (planId: string) => {
        try {
            const res = await apiService.getWeeklyPlanItems(planId);
            if (res.success) {
                setPlanItemsMap(prev => ({ ...prev, [planId]: res.data || [] }));
            }
        } catch { /* ignore */ }
    };

    const loadUsers = async () => {
        try {
            const res = await apiService.getUsers();
            if (res.success) setUsers(res.data || []);
        } catch { /* ignore */ }
    };

    useEffect(() => { loadUsers(); }, []);
    useEffect(() => { loadPlans(); }, [department]);

    // Auto-load items for all plans
    useEffect(() => {
        sortedPlans.forEach(p => {
            if (!planItemsMap[p.id]) loadItemsForPlan(p.id);
        });
    }, [sortedPlans]);

    const handleCreatePlan = async (withCarryOver: boolean) => {
        try {
            const ws = thisWeekStart;
            const we = getWeekEnd(ws);
            const payload: any = {
                weekStart: ws.format('YYYY-MM-DD'),
                weekEnd: we.format('YYYY-MM-DD'),
                department,
            };
            if (withCarryOver && latestPlan) {
                payload.carryOverFromPlanId = latestPlan.id;
            }
            const res = await apiService.createWeeklyPlan(payload);
            if (res.success) {
                message.success(t('common.saveSuccess'));
                await loadPlans();
                // Refresh carry-over source plan items too
                if (withCarryOver && latestPlan) {
                    refreshPlanItems(latestPlan.id);
                }
            } else {
                message.error(res.error || t('common.saveError'));
            }
        } catch {
            message.error(t('common.saveError'));
        }
    };

    const handleAddItem = (planId: string) => {
        const items = planItemsMap[planId] || [];
        if (items.length >= 5) {
            message.warning(t('business.weeklyPlan.maxItems'));
            return;
        }
        setActivePlanId(planId);
        setEditingItem(null);
        form.resetFields();
        form.setFieldsValue({ sortOrder: items.length + 1, status: 'TODO' });
        setModalVisible(true);
    };

    const handleEditItem = (planId: string, record: WeeklyPlanItem) => {
        setActivePlanId(planId);
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
            } else if (activePlanId) {
                const res = await apiService.createWeeklyPlanItem(activePlanId, payload);
                if (res.success) message.success(t('common.saveSuccess'));
            }
            setModalVisible(false);
            form.resetFields();
            if (activePlanId) refreshPlanItems(activePlanId);
        } catch {
            message.error(t('common.saveError'));
        }
    };

    const handleDeleteItem = async (planId: string, id: string) => {
        try {
            await apiService.deleteWeeklyPlanItem(id);
            message.success(t('common.deleteSuccess'));
            refreshPlanItems(planId);
        } catch {
            message.error(t('common.saveError'));
        }
    };

    const getColumns = (planId: string): ColumnsType<WeeklyPlanItem> => [
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
                    onEdit={canEdit ? () => handleEditItem(planId, record) : undefined}
                    onDelete={canEdit ? () => handleDeleteItem(planId, record.id) : undefined}
                    canEdit={canEdit}
                    canDelete={canEdit}
                />
            ),
        },
    ];

    const isCurrentWeek = (plan: WeeklyPlan) =>
        dayjs(plan.weekStart).format('YYYY-MM-DD') === thisWeekStart.format('YYYY-MM-DD');

    return (
        <div>
            {/* Top action bar */}
            <div style={{ padding: '16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {canEdit && !currentWeekPlan && (
                    <>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => handleCreatePlan(false)}>
                            {t('business.weeklyPlan.createPlan')}
                        </Button>
                        {latestPlan && (
                            <Tooltip title={t('business.weeklyPlan.carryOver')}>
                                <Button icon={<SyncOutlined />} onClick={() => handleCreatePlan(true)}>
                                    {t('business.weeklyPlan.carryOver')}
                                </Button>
                            </Tooltip>
                        )}
                    </>
                )}
                <span style={{ marginLeft: 8, color: '#64748b', fontSize: 13 }}>
                    {t('business.weeklyPlan.week')}: {thisWeekStart.format('DD/MM')} - {getWeekEnd(thisWeekStart).format('DD/MM/YYYY')}
                </span>
            </div>

            {/* Plans list (newest first) */}
            {sortedPlans.length === 0 ? (
                <Card className="contracts-card" style={{ margin: '0 16px 16px' }}>
                    <Empty description={t('business.weeklyPlan.noPlan')} style={{ padding: 60 }} />
                </Card>
            ) : (
                sortedPlans.map((plan) => {
                    const planItems = planItemsMap[plan.id] || [];
                    const weekLabel = `${dayjs(plan.weekStart).format('DD/MM')} - ${dayjs(plan.weekEnd).format('DD/MM/YYYY')}`;
                    const isCurrent = isCurrentWeek(plan);

                    return (
                        <Card
                            key={plan.id}
                            className="contracts-card"
                            style={{
                                margin: '0 16px 16px',
                                border: isCurrent ? '2px solid #E11D2E' : '1px solid #f1f5f9',
                            }}
                        >
                            <div style={{
                                padding: '12px 16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                background: isCurrent ? 'rgba(225, 29, 46, 0.03)' : '#fafafa',
                                borderBottom: '1px solid #f1f5f9',
                                borderRadius: '11px 11px 0 0',
                            }}>
                                <CalendarOutlined style={{ color: isCurrent ? '#E11D2E' : '#64748b', fontSize: 16 }} />
                                <span style={{ fontWeight: 600, fontSize: 14, color: isCurrent ? '#E11D2E' : '#1e293b' }}>
                                    {weekLabel}
                                </span>
                                {isCurrent && (
                                    <Tag color="red" style={{ marginLeft: 4 }}>{t('business.weeklyPlan.currentWeek')}</Tag>
                                )}
                                <span style={{ color: '#94a3b8', fontSize: 12 }}>
                                    {planItems.length}/5 {t('business.weeklyPlan.items')}
                                </span>
                                <div style={{ marginLeft: 'auto' }}>
                                    {canEdit && planItems.length < 5 && (
                                        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => handleAddItem(plan.id)}>
                                            {t('business.weeklyPlan.addItem')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                            <Table
                                dataSource={planItems}
                                columns={getColumns(plan.id)}
                                rowKey="id"
                                loading={loadingPlanId === plan.id}
                                size="small"
                                pagination={false}
                                scroll={{ x: 1400 }}
                            />
                        </Card>
                    );
                })
            )}

            {/* Item Modal */}
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
        </div>
    );
};

export default DepartmentPlan;
