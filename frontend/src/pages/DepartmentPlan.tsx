import React, { useState, useMemo } from 'react';
import { Card, Table, Button, Select, Modal, Form, Input, Tag, message, DatePicker, Empty, Tooltip, Progress } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SyncOutlined, CalendarOutlined, EditOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import PlanGuideModal from '../components/PlanGuideModal';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { VcmActionGroup } from '../components/VcmActionGroup';
import DailyLogModal from '../components/DailyLogModal';
import type { WeeklyPlan, WeeklyPlanItem } from '../types';
import { useWeeklyPlans, usePlanMutations } from '../hooks/usePlans';
import { useUsers } from '../hooks/useUsers';

dayjs.extend(isoWeek);

const { Option } = Select;
const { TextArea } = Input;

const STATUS_COLORS: Record<string, string> = {
    TODO: 'default', IN_PROGRESS: 'processing', DONE: 'success', CARRIED_OVER: 'warning',
};

const getWeekStart = (date: Dayjs) => date.isoWeekday(1).startOf('day');
const getWeekEnd = (date: Dayjs) => date.isoWeekday(7).startOf('day');

interface DepartmentPlanProps {
    department: string;
    selectedMonth: Dayjs;
    canEdit: boolean;
}

const DepartmentPlan: React.FC<DepartmentPlanProps> = ({ department, selectedMonth, canEdit }) => {
    const { t } = useTranslation();

    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<WeeklyPlanItem | null>(null);
    const [activePlanId, setActivePlanId] = useState<string | null>(null);
    const [dailyLogItem, setDailyLogItem] = useState<WeeklyPlanItem | null>(null);
    const [guideVisible, setGuideVisible] = useState(false);
    const [form] = Form.useForm();

    const thisWeekStart = getWeekStart(dayjs());

    // React Query Data
    const { data: allPlans = [], isLoading } = useWeeklyPlans({ department });
    const { data: users = [] } = useUsers();
    const { 
        createWeeklyPlan, 
        createWeeklyPlanItem, 
        updateWeeklyPlanItem, 
        deleteWeeklyPlanItem 
    } = usePlanMutations();

    // Filter plans to selected month: include if weekStart is in selected month
    const plans = useMemo(() => {
        const monthStr = selectedMonth.format('YYYY-MM');
        return [...allPlans]
            .filter(p => dayjs(p.weekStart).format('YYYY-MM') === monthStr)
            .sort((a, b) => dayjs(b.weekStart).diff(dayjs(a.weekStart)));
    }, [allPlans, selectedMonth]);

    const currentWeekPlan = useMemo(() =>
        allPlans.find((p: any) => dayjs(p.weekStart).format('YYYY-MM-DD') === thisWeekStart.format('YYYY-MM-DD')),
    [allPlans, thisWeekStart]);

    const latestPlan = useMemo(() =>
        [...allPlans].sort((a, b) => dayjs(b.weekStart).diff(dayjs(a.weekStart)))[0] || null,
    [allPlans]);

    const handleCreatePlan = async (withCarryOver: boolean) => {
        const ws = thisWeekStart;
        const payload: any = {
            weekStart: ws.format('YYYY-MM-DD'),
            weekEnd: getWeekEnd(ws).format('YYYY-MM-DD'),
            department,
        };
        if (withCarryOver && latestPlan) payload.carryOverFromPlanId = latestPlan.id;
        
        createWeeklyPlan.mutate(payload, {
            onSuccess: (res) => {
                if (res.success) message.success(t('common.saveSuccess'));
                else message.error(res.error || t('common.saveError'));
            },
            onError: () => message.error(t('common.saveError'))
        });
    };

    const handleAddItem = (planId: string) => {
        const plan = allPlans.find((p: any) => p.id === planId);
        const items = plan?.items || [];
        if (items.length >= 5) { message.warning(t('business.weeklyPlan.maxItems')); return; }
        setActivePlanId(planId);
        setEditingItem(null);
        form.resetFields();
        form.setFieldsValue({ sortOrder: items.length + 1, status: 'TODO', progressPct: 0 });
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
        const payload = {
            ...values,
            startDate: values.startDate?.format('YYYY-MM-DD') || null,
            endDate: values.endDate?.format('YYYY-MM-DD') || null,
        };
        
        if (editingItem) {
            updateWeeklyPlanItem.mutate({ ...payload, id: editingItem.id }, {
                onSuccess: (res) => {
                    if (res.success) {
                        message.success(t('common.saveSuccess'));
                        setModalVisible(false);
                    }
                },
                onError: () => message.error(t('common.saveError'))
            });
        } else if (activePlanId) {
            createWeeklyPlanItem.mutate({ planId: activePlanId, data: payload }, {
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

    const handleDeleteItem = async (planId: string, id: string) => {
        deleteWeeklyPlanItem.mutate(id, {
            onSuccess: () => message.success(t('common.deleteSuccess')),
            onError: () => message.error(t('common.saveError'))
        });
    };

    const getColumns = (planId: string): ColumnsType<WeeklyPlanItem> => [
        { title: '#', dataIndex: 'sortOrder', key: 'sortOrder', width: 40, align: 'center' },
        {
            title: t('business.weeklyPlan.what'), dataIndex: 'title', key: 'title', width: 180,
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
        { title: t('business.weeklyPlan.why'), dataIndex: 'why', key: 'why', width: 130, ellipsis: true },
        {
            title: t('business.weeklyPlan.who'), key: 'assignee', width: 110,
            render: (_: any, r: WeeklyPlanItem) => r.assigneeName || users.find((u: any) => u.id === r.assigneeId)?.name || '',
        },
        {
            title: t('business.weeklyPlan.when'), key: 'when', width: 120, align: 'center',
            render: (_: any, r: WeeklyPlanItem) => {
                const s = r.startDate ? dayjs(r.startDate).format('DD/MM') : '';
                const e = r.endDate ? dayjs(r.endDate).format('DD/MM') : '';
                return s && e ? `${s} - ${e}` : s || e || '-';
            },
        },
        { title: t('business.weeklyPlan.where'), dataIndex: 'location', key: 'location', width: 110, render: (val: string) => <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{val || '-'}</span> },
        { title: t('business.weeklyPlan.how'), dataIndex: 'method', key: 'method', width: 120, render: (val: string) => <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{val || '-'}</span> },
        {
            title: t('business.weeklyPlan.status'), dataIndex: 'status', key: 'status', width: 120, align: 'center',
            render: (val: string) => {
                const key = val === 'IN_PROGRESS' ? 'statusInProgress' : val === 'CARRIED_OVER' ? 'statusCarriedOver' : val === 'DONE' ? 'statusDone' : 'statusTodo';
                return <Tag color={STATUS_COLORS[val]}>{t(`business.weeklyPlan.${key}`)}</Tag>;
            },
        },
        {
            title: t('plans.daily.progress'), key: 'progress', width: 130, align: 'center',
            render: (_: any, r: WeeklyPlanItem) => {
                const pct = r.progressPct || 0;
                const status = pct >= 100 ? 'success' : pct >= 60 ? 'active' : 'normal';
                return <Progress percent={pct} size="small" status={status as any} style={{ margin: 0 }} />;
            },
        },
        { title: t('business.weeklyPlan.result'), dataIndex: 'result', key: 'result', width: 110, render: (val: string) => <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{val || '-'}</span> },
        {
            title: t('common.actions'), key: 'action', width: 120, align: 'center',
            render: (_: any, record: WeeklyPlanItem) => (
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <Tooltip title={t('plans.daily.updateBtn')}>
                        <Button
                            size="small" type="primary" ghost
                            icon={<EditOutlined />}
                            onClick={() => setDailyLogItem(record)}
                        />
                    </Tooltip>
                    <VcmActionGroup
                        onEdit={canEdit ? () => handleEditItem(planId, record) : undefined}
                        onDelete={canEdit ? () => handleDeleteItem(planId, record.id) : undefined}
                        canEdit={canEdit}
                        canDelete={canEdit}
                    />
                </div>
            ),
        },
    ];

    const isCurrentWeek = (plan: WeeklyPlan) =>
        dayjs(plan.weekStart).format('YYYY-MM-DD') === thisWeekStart.format('YYYY-MM-DD');

    const isCurrentMonth = selectedMonth.format('YYYY-MM') === dayjs().format('YYYY-MM');

    return (
        <div>
            {/* Action bar: only show create buttons if viewing current month */}
            {isCurrentMonth && canEdit && !currentWeekPlan && (
                <div style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
                    <span style={{ color: '#64748b', fontSize: 13 }}>
                        {t('business.weeklyPlan.week')}: {thisWeekStart.format('DD/MM')} – {getWeekEnd(thisWeekStart).format('DD/MM/YYYY')}
                    </span>
                </div>
            )}

            {plans.length === 0 ? (
                <Card style={{ margin: '0 16px 16px', border: '1px solid #f1f5f9' }}>
                    <Empty description={t('business.weeklyPlan.noPlan')} style={{ padding: 40 }} />
                </Card>
            ) : (
                plans.map(plan => {
                    const planItems = plan.items || [];
                    const weekLabel = `${dayjs(plan.weekStart).format('DD/MM')} – ${dayjs(plan.weekEnd).format('DD/MM/YYYY')}`;
                    const isCurrent = isCurrentWeek(plan);
                    const doneCount = planItems.filter((i: any) => i.status === 'DONE').length;
                    const avgProgress = planItems.length
                        ? Math.round(planItems.reduce((s: number, i: any) => s + (i.progressPct || 0), 0) / planItems.length)
                        : 0;

                    return (
                        <Card
                            key={plan.id}
                            style={{
                                margin: '0 16px 12px',
                                border: isCurrent ? '2px solid #E11D2E' : '1px solid #f1f5f9',
                            }}
                        >
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                                padding: '8px 4px 12px',
                            }}>
                                <CalendarOutlined style={{ color: isCurrent ? '#E11D2E' : '#64748b', fontSize: 15 }} />
                                <span style={{ fontWeight: 600, fontSize: 14, color: isCurrent ? '#E11D2E' : '#1e293b' }}>
                                    {weekLabel}
                                </span>
                                {isCurrent && <Tag color="red">{t('business.weeklyPlan.currentWeek')}</Tag>}
                                <Tag color="default">{planItems.length}/5 {t('business.weeklyPlan.items')}</Tag>
                                <Tag color="success">{doneCount} {t('business.weeklyPlan.statusDone')}</Tag>
                                <div style={{ flex: 1, minWidth: 120, maxWidth: 200 }}>
                                    <Progress percent={avgProgress} size="small" />
                                </div>
                                {canEdit && planItems.length < 5 && (
                                    <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => handleAddItem(plan.id)}
                                        style={{ marginLeft: 'auto' }}>
                                        {t('business.weeklyPlan.addItem')}
                                    </Button>
                                )}
                            </div>
                            <Table
                                dataSource={planItems}
                                columns={getColumns(plan.id)}
                                rowKey="id"
                                loading={isLoading}
                                size="small"
                                pagination={false}
                                scroll={{ x: 1400 }}
                            />
                        </Card>
                    );
                })
            )}

            {/* Item Form Modal */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{editingItem ? t('business.weeklyPlan.editItem') : t('business.weeklyPlan.addItem')}</span>
                        <Button type="link" size="small" icon={<QuestionCircleOutlined />}
                            onClick={() => setGuideVisible(true)} style={{ padding: '0 4px', fontSize: 12 }}>
                            Hướng dẫn
                        </Button>
                    </div>
                }
                open={modalVisible}
                onCancel={() => { setModalVisible(false); form.resetFields(); }}
                onOk={() => form.submit()}
                width={650}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSubmitItem}>
                    <Form.Item name="sortOrder" label="#" rules={[{ required: true }]}>
                        <Select>{[1,2,3,4,5].map(n => <Option key={n} value={n}>{n}</Option>)}</Select>
                    </Form.Item>
                    <Form.Item name="title" label={t('business.weeklyPlan.what')} rules={[{ required: true }]}>
                        <Input placeholder={t('business.weeklyPlan.whatPlaceholder')} />
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
                    <div style={{ display: 'flex', gap: 16 }}>
                        <Form.Item name="startDate" label={t('business.weeklyPlan.whenStart')} style={{ flex: 1 }}>
                            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                        </Form.Item>
                        <Form.Item name="endDate" label={t('business.weeklyPlan.whenEnd')} style={{ flex: 1 }}>
                            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                        </Form.Item>
                    </div>
                    <Form.Item name="location" label={t('business.weeklyPlan.where')}>
                        <Input placeholder={t('business.weeklyPlan.wherePlaceholder')} />
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

            {/* Daily Log Modal */}
            <DailyLogModal
                item={dailyLogItem}
                open={!!dailyLogItem}
                onClose={() => {
                    setDailyLogItem(null);
                }}
            />
        </div>
    );
};

export default DepartmentPlan;
