import React, { useState, useMemo } from 'react';
import { Card, Table, Button, Select, Modal, Form, Input, Tag, message, DatePicker, Empty, Tooltip, Progress, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SyncOutlined, CalendarOutlined, EditOutlined, QuestionCircleOutlined, SearchOutlined, FileExcelOutlined, CheckCircleOutlined } from '@ant-design/icons';
import PlanGuideModal from '../components/PlanGuideModal';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { VcmActionGroup } from '../components/VcmActionGroup';
import DailyLogModal from '../components/DailyLogModal';
import type { WeeklyPlan, WeeklyPlanItem, MonthlyPlanItem } from '../types';
import { useWeeklyPlans, useMonthlyPlans, usePlanMutations } from '../hooks/usePlans';
import { useUsers } from '../hooks/useUsers';
import * as XLSX from 'xlsx';

dayjs.extend(isoWeek);

const { Option } = Select;
const { TextArea } = Input;
const { Text, Title } = Typography;

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

    // Filters state
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
    const [assigneeFilter, setAssigneeFilter] = useState<string | undefined>(undefined);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

    const thisWeekStart = getWeekStart(dayjs());
    const monthStart = selectedMonth.format('YYYY-MM-DD');

    // React Query Data
    const { data: allPlans = [], isLoading, refetch: refetchWeeklyPlans } = useWeeklyPlans({ department });
    const { data: monthlyPlans = [] } = useMonthlyPlans({ department, monthStart });
    const { data: users = [] } = useUsers();
    const { 
        createWeeklyPlan, 
        createWeeklyPlanItem, 
        updateWeeklyPlanItem, 
        deleteWeeklyPlanItem,
        updateWeeklyPlanItemsStatus
    } = usePlanMutations();

    const monthlyPlanItems = monthlyPlans.length > 0 ? monthlyPlans[0].items || [] : [];

    // Filter plans to selected month: include if weekStart is in selected month
    const plans = useMemo(() => {
        const monthStr = selectedMonth.format('YYYY-MM');
        return [...allPlans]
            .filter((p: WeeklyPlan) => dayjs(p.weekStart).format('YYYY-MM') === monthStr)
            .sort((a: WeeklyPlan, b: WeeklyPlan) => dayjs(b.weekStart).diff(dayjs(a.weekStart)));
    }, [allPlans, selectedMonth]);

    const currentWeekPlan = useMemo(() =>
        allPlans.find((p: WeeklyPlan) => dayjs(p.weekStart).format('YYYY-MM-DD') === thisWeekStart.format('YYYY-MM-DD')),
    [allPlans, thisWeekStart]);

    const latestPlan = useMemo(() =>
        [...allPlans].sort((a: WeeklyPlan, b: WeeklyPlan) => dayjs(b.weekStart).diff(dayjs(a.weekStart)))[0] || null,
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
            onSuccess: (res: any) => {
                if (res.success) message.success(t('common.saveSuccess'));
                else message.error(res.error || t('common.saveError'));
            },
            onError: () => message.error(t('common.saveError'))
        });
    };

    const handleAddItem = (planId: string) => {
        const plan = allPlans.find((p: WeeklyPlan) => p.id === planId);
        const items = plan?.items || [];
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
                onSuccess: (res: any) => {
                    if (res.success) {
                        message.success(t('common.saveSuccess'));
                        setModalVisible(false);
                    }
                },
                onError: () => message.error(t('common.saveError'))
            });
        } else if (activePlanId) {
            createWeeklyPlanItem.mutate({ planId: activePlanId, data: payload }, {
                onSuccess: (res: any) => {
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

    const handleBatchStatusUpdate = (status: string) => {
        if (selectedRowKeys.length === 0) return;
        updateWeeklyPlanItemsStatus.mutate({ ids: selectedRowKeys as string[], status }, {
            onSuccess: () => {
                message.success(t('common.saveSuccess'));
                setSelectedRowKeys([]);
            }
        });
    };

    const handleExportExcel = (planId: string) => {
        const plan = plans.find((p: WeeklyPlan) => p.id === planId);
        if (!plan) return;
        const items = plan.items || [];
        const exportData = items.map((item: WeeklyPlanItem, index: number) => ({
            [t('common.index') || '#']: index + 1,
            [t('business.weeklyPlan.what')]: item.title,
            [t('business.weeklyPlan.why')]: item.why || '',
            [t('business.weeklyPlan.who')]: item.assigneeName || users.find((u: any) => u.id === item.assigneeId)?.name || '',
            [t('business.weeklyPlan.when')]: `${item.startDate || ''} - ${item.endDate || ''}`,
            [t('business.weeklyPlan.where')]: item.location || '',
            [t('business.weeklyPlan.how')]: item.method || '',
            [t('business.weeklyPlan.status')]: t(`business.weeklyPlan.status${item.status.charAt(0) + item.status.slice(1).toLowerCase().replace('_', '')}`),
            [t('plans.daily.progress')]: `${item.progressPct || 0}%`,
            [t('business.weeklyPlan.result')]: item.result || '',
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "WeeklyPlan");
        XLSX.writeFile(wb, `WeeklyPlan_${department}_${dayjs(plan.weekStart).format('DD_MM_YYYY')}.xlsx`);
        message.success(t('common.exportSuccess'));
    };

    const getColumns = (planId: string): ColumnsType<WeeklyPlanItem> => [
        { title: '#', dataIndex: 'sortOrder', key: 'sortOrder', width: 40, align: 'center' },
        {
            title: t('business.weeklyPlan.what'), dataIndex: 'title', key: 'title', width: 220,
            render: (val: string, record: WeeklyPlanItem) => {
                const isOverdue = record.endDate && dayjs(record.endDate).isBefore(dayjs(), 'day') && record.status !== 'DONE';
                return (
                    <span>
                        <Text strong style={{ color: isOverdue ? '#ff4d4f' : 'inherit' }}>{val}</Text>
                        {record.carriedFrom && (
                            <Tag color="orange" style={{ marginLeft: 6, fontSize: 10 }}>
                                <SyncOutlined /> {t('business.weeklyPlan.carriedTag')}
                            </Tag>
                        )}
                        {isOverdue && <Tag color="error" style={{ marginLeft: 6, fontSize: 10 }}>{t('dashboard.delayed')}</Tag>}
                    </span>
                );
            },
        },
        { title: t('business.weeklyPlan.why'), dataIndex: 'why', key: 'why', width: 130, ellipsis: true, responsive: ['lg'] },
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
        { title: t('business.weeklyPlan.where'), dataIndex: 'location', key: 'location', width: 110, responsive: ['xl'], render: (val: string) => <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{val || '-'}</span> },
        { title: t('business.weeklyPlan.how'), dataIndex: 'method', key: 'method', width: 120, responsive: ['xxl'], render: (val: string) => <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{val || '-'}</span> },
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
                const isOverdue = r.endDate && dayjs(r.endDate).isBefore(dayjs(), 'day') && pct < 100;
                const status = pct >= 100 ? 'success' : isOverdue ? 'exception' : pct >= 60 ? 'active' : 'normal';
                return <Progress percent={pct} size="small" status={status as any} style={{ margin: 0 }} strokeColor={isOverdue ? '#ff4d4f' : undefined} />;
            },
        },
        { title: t('business.weeklyPlan.result'), dataIndex: 'result', key: 'result', width: 120, render: (val: string) => <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{val || '-'}</span> },
        {
            title: t('common.actions'), key: 'action', width: 110, align: 'center', fixed: 'right',
            render: (_: any, record: WeeklyPlanItem) => (
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    {canEdit && (
                        <Tooltip title={t('plans.daily.updateBtn')}>
                            <Button
                                size="small" type="primary" ghost
                                icon={<EditOutlined />}
                                onClick={() => setDailyLogItem(record)}
                            />
                        </Tooltip>
                    )}
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
            {/* Toolbar: Search, Filters, Create Buttons */}
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {isCurrentMonth && canEdit && !currentWeekPlan && (
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
                    {selectedRowKeys.length > 0 && canEdit && (
                        <Space>
                            <Text type="secondary" style={{ fontSize: 13 }}>{selectedRowKeys.length} {t('common.total').toLowerCase()}</Text>
                            <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => handleBatchStatusUpdate('DONE')}>
                                {t('business.weeklyPlan.statusDone')}
                            </Button>
                            <Button size="small" icon={<SyncOutlined />} onClick={() => handleBatchStatusUpdate('IN_PROGRESS')}>
                                {t('business.weeklyPlan.statusInProgress')}
                            </Button>
                        </Space>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input
                        placeholder={t('common.search') + '...'}
                        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        size="small"
                        style={{ width: 160 }}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        allowClear
                    />
                    <Select
                        size="small"
                        style={{ width: 120 }}
                        placeholder={t('business.weeklyPlan.status')}
                        allowClear
                        value={statusFilter}
                        onChange={(v: string) => setStatusFilter(v)}
                    >
                        <Option value="TODO">{t('business.weeklyPlan.statusTodo')}</Option>
                        <Option value="IN_PROGRESS">{t('business.weeklyPlan.statusInProgress')}</Option>
                        <Option value="DONE">{t('business.weeklyPlan.statusDone')}</Option>
                    </Select>
                    <Select
                        size="small"
                        style={{ width: 140 }}
                        placeholder={t('business.weeklyPlan.who')}
                        allowClear
                        showSearch
                        value={assigneeFilter}
                        onChange={(v: string) => setAssigneeFilter(v)}
                        filterOption={(input, option) => ((option?.children as any) || '').toLowerCase().includes(input.toLowerCase())}
                    >
                        {users.map((u: any) => <Option key={u.id} value={u.id}>{u.name}</Option>)}
                    </Select>
                </div>
            </div>

            {plans.length === 0 ? (
                <Card style={{ margin: '16px', border: '1px solid #f1f5f9' }}>
                    <Empty description={t('business.weeklyPlan.noPlan')} style={{ padding: 40 }} />
                </Card>
            ) : (
                plans.map((plan: WeeklyPlan) => {
                    const planItems = (plan.items || []).filter((item: WeeklyPlanItem) => {
                        const matchesSearch = !searchText || item.title.toLowerCase().includes(searchText.toLowerCase());
                        const matchesStatus = !statusFilter || item.status === statusFilter;
                        const matchesAssignee = !assigneeFilter || item.assigneeId === assigneeFilter;
                        return matchesSearch && matchesStatus && matchesAssignee;
                    });
                    
                    if (planItems.length === 0 && (searchText || statusFilter || assigneeFilter)) return null;

                    const weekLabel = `${dayjs(plan.weekStart).format('DD/MM')} – ${dayjs(plan.weekEnd).format('DD/MM/YYYY')}`;
                    const isCurrent = isCurrentWeek(plan);
                    const doneCount = planItems.filter((i: WeeklyPlanItem) => i.status === 'DONE').length;
                    const avgProgress = planItems.length
                        ? Math.round(planItems.reduce((s: number, i: WeeklyPlanItem) => s + (i.progressPct || 0), 0) / planItems.length)
                        : 0;

                    return (
                        <Card
                            key={plan.id}
                            className="vcm-plan-card"
                            style={{
                                margin: '16px',
                                border: isCurrent ? '2px solid #E11D2E' : '1px solid #f1f5f9',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                borderRadius: 12
                            }}
                            bodyStyle={{ padding: '0 0 8px' }}
                        >
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                                padding: '12px 16px',
                                borderBottom: '1px solid #f8fafc'
                            }}>
                                <CalendarOutlined style={{ color: isCurrent ? '#E11D2E' : '#64748b', fontSize: 16 }} />
                                <span style={{ fontWeight: 700, fontSize: 15, color: isCurrent ? '#E11D2E' : '#1e293b' }}>
                                    {weekLabel}
                                </span>
                                {isCurrent && <Tag color="red" style={{ borderRadius: 4 }}>{t('business.weeklyPlan.currentWeek')}</Tag>}
                                <Tag color="default" style={{ border: 'none', background: '#f1f5f9' }}>{planItems.length} {t('business.weeklyPlan.items')}</Tag>
                                <Tag color="success" style={{ border: 'none', background: '#f0fdf4', color: '#15803d' }}>{doneCount} {t('business.weeklyPlan.statusDone')}</Tag>
                                
                                <div style={{ flex: 1, minWidth: 120, maxWidth: 240, marginLeft: 8 }}>
                                    <Progress percent={avgProgress} size="small" strokeColor={isCurrent ? '#E11D2E' : undefined} />
                                </div>

                                <Space style={{ marginLeft: 'auto' }}>
                                    <Button size="small" icon={<FileExcelOutlined />} onClick={() => handleExportExcel(plan.id)}>
                                        {t('common.export')}
                                    </Button>
                                    {canEdit && (
                                        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => handleAddItem(plan.id)}>
                                            {t('business.weeklyPlan.addItem')}
                                        </Button>
                                    )}
                                </Space>
                            </div>
                            <Table
                                dataSource={planItems}
                                columns={getColumns(plan.id)}
                                rowKey="id"
                                loading={isLoading}
                                size="small"
                                pagination={false}
                                scroll={{ x: 1200 }}
                                rowSelection={canEdit ? {
                                    selectedRowKeys,
                                    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
                                } : undefined}
                                expandable={{
                                    expandedRowRender: (record: WeeklyPlanItem) => (
                                        <div style={{ padding: '8px 48px', background: '#f8fafc' }}>
                                            <p><strong>{t('business.weeklyPlan.why')}:</strong> {record.why || '-'}</p>
                                            <p><strong>{t('business.weeklyPlan.where')}:</strong> {record.location || '-'}</p>
                                            <p><strong>{t('business.weeklyPlan.how')}:</strong> {record.method || '-'}</p>
                                            {record.result && <p><strong>{t('business.weeklyPlan.result')}:</strong> {record.result}</p>}
                                        </div>
                                    ),
                                    rowExpandable: (record: WeeklyPlanItem) => !!(record.why || record.location || record.method || record.result),
                                }}
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
                            {t('plans.guideBtn')}
                        </Button>
                    </div>
                }
                open={modalVisible}
                onCancel={() => { setModalVisible(false); form.resetFields(); }}
                onOk={() => form.submit()}
                okText={t('common.save')}
                cancelText={t('common.cancel')}
                width={650}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSubmitItem}>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <Form.Item name="sortOrder" label="#" rules={[{ required: true }]} style={{ width: 80 }}>
                            <Select>{[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map(n => <Option key={n} value={n}>{n}</Option>)}</Select>
                        </Form.Item>
                        <Form.Item name="monthlyItemId" label={t('plans.monthly.sectionTitle')} style={{ flex: 1 }}>
                            <Select allowClear placeholder={t('plans.monthly.addItem')}>
                                {monthlyPlanItems.map((mi: MonthlyPlanItem) => (
                                    <Option key={mi.id} value={mi.id}>{mi.title}</Option>
                                ))}
                            </Select>
                        </Form.Item>
                    </div>
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
                    <div style={{ display: 'flex', gap: 16 }}>
                        <Form.Item name="location" label={t('business.weeklyPlan.where')} style={{ flex: 1 }}>
                            <Input placeholder={t('business.weeklyPlan.wherePlaceholder')} />
                        </Form.Item>
                        <Form.Item name="method" label={t('business.weeklyPlan.how')} style={{ flex: 1 }}>
                            <Input placeholder={t('business.weeklyPlan.howPlaceholder')} />
                        </Form.Item>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <Form.Item name="status" label={t('business.weeklyPlan.status')} initialValue="TODO" style={{ flex: 1 }}>
                            <Select>
                                <Option value="TODO">{t('business.weeklyPlan.statusTodo')}</Option>
                                <Option value="IN_PROGRESS">{t('business.weeklyPlan.statusInProgress')}</Option>
                                <Option value="DONE">{t('business.weeklyPlan.statusDone')}</Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="progressPct" label={t('plans.daily.progress')} initialValue={0} style={{ flex: 1 }}>
                            <Select>
                                {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => (
                                    <Option key={v} value={v}>{v}%</Option>
                                ))}
                            </Select>
                        </Form.Item>
                    </div>
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
                onClose={(refreshed) => {
                    setDailyLogItem(null);
                    if (refreshed) refetchWeeklyPlans();
                }}
            />
        </div>
    );
};

export default DepartmentPlan;