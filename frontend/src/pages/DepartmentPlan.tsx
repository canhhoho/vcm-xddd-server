import React, { useMemo, useState } from 'react';
import {
    Card, Table, Button, Select, Modal, Form, Input, Tag, message, DatePicker, Empty,
    Tooltip, Progress, Space, Typography, Row, Col, Popconfirm,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    PlusOutlined, SyncOutlined, CalendarOutlined, EditOutlined,
    QuestionCircleOutlined, FileExcelOutlined, CheckCircleOutlined, DeleteOutlined,
} from '@ant-design/icons';
import PlanGuideModal from '../components/PlanGuideModal';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { VcmActionGroup } from '../components/VcmActionGroup';
import DailyLogModal from '../components/DailyLogModal';
import type { Department, WeeklyPlan, WeeklyPlanItem, MonthlyPlanItem, User } from '../types';
import { useWeeklyPlans, useMonthlyPlans, usePlanMutations } from '../hooks/usePlans';
import type { WeeklyPlanItemInput } from '../services/api.interface';
import { useUsers } from '../hooks/useUsers';
import { BRAND_COLORS } from '../styles/brandIdentity';
import PlanFilterBar from '../components/plan/PlanFilterBar';
import { usePlanFilters } from '../components/plan/usePlanFilters';
import { exportPlanExcel } from '../components/plan/exportPlanExcel';
import { buildPlanHeaderRows, weeklyExportColumns } from '../components/plan/planExportColumns';
import { DATE_FORMAT, DATE_FORMAT_SHORT, WRAP } from '../components/plan/planConstants';
import {
    AssigneeSelect, ProgressSelect, SortOrderSelect, StatusSelect,
} from '../components/plan/PlanFormFields';
import {
    assigneeColumn, indexColumn, methodColumn,
    resultColumn, statusColumn, whyColumn,
} from '../components/plan/planColumns';

dayjs.extend(isoWeek);

const { TextArea } = Input;
const { Text } = Typography;

const getWeekStart = (date: Dayjs) => date.isoWeekday(1).startOf('day');
const getWeekEnd = (date: Dayjs) => date.isoWeekday(7).startOf('day');

interface DepartmentPlanProps {
    department: Department;
    selectedMonth: Dayjs;
    canEdit: boolean;
}

/** Giá trị form đầu việc — DatePicker trả Dayjs, API cần chuỗi YYYY-MM-DD */
type WeeklyItemFormValues = Omit<WeeklyPlanItemInput, 'startDate' | 'endDate'> & {
    startDate?: Dayjs | null;
    endDate?: Dayjs | null;
};

const DepartmentPlan: React.FC<DepartmentPlanProps> = ({ department, selectedMonth, canEdit }) => {
    const { t } = useTranslation();

    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<WeeklyPlanItem | null>(null);
    const [activePlanId, setActivePlanId] = useState<string | null>(null);
    const [dailyLogItem, setDailyLogItem] = useState<WeeklyPlanItem | null>(null);
    const [guideVisible, setGuideVisible] = useState(false);
    // Giá trị khởi tạo được set khi Modal đã mount (destroyOnHidden huỷ Form khi đóng)
    const [pendingValues, setPendingValues] = useState<Record<string, unknown> | null>(null);
    const [form] = Form.useForm();

    const filters = usePlanFilters();
    // Mỗi tuần một bảng riêng nên selection phải tách theo plan, nếu không chọn ở
    // tuần này sẽ ghi đè selection của tuần kia.
    const [selectionByPlan, setSelectionByPlan] = useState<Record<string, React.Key[]>>({});

    const thisWeekStart = getWeekStart(dayjs());
    const monthStart = selectedMonth.format('YYYY-MM-DD');

    // Chỉ tải các tuần thuộc tháng đang xem — trước đây tải toàn bộ lịch sử rồi lọc ở client
    const weekRange = useMemo(() => ({
        weekFrom: selectedMonth.startOf('month').format('YYYY-MM-DD'),
        weekTo: selectedMonth.endOf('month').format('YYYY-MM-DD'),
    }), [selectedMonth]);

    const {
        data: plansRaw = [],
        isLoading,
        refetch: refetchWeeklyPlans,
    } = useWeeklyPlans({ department, ...weekRange });

    // Plan gần nhất (cho chức năng chuyển việc) — query riêng, nhẹ, không kèm cả tháng
    const { data: recentPlans = [] } = useWeeklyPlans({ department, limit: 1 });

    const { data: monthlyPlans = [] } = useMonthlyPlans({ department, monthStart });
    const { data: users = [] } = useUsers();
    const {
        createWeeklyPlan,
        deleteWeeklyPlan,
        createWeeklyPlanItem,
        updateWeeklyPlanItem,
        deleteWeeklyPlanItem,
        updateWeeklyPlanItemsStatus,
    } = usePlanMutations();

    const userList = users as User[];
    const monthlyPlanItems: MonthlyPlanItem[] = monthlyPlans.length > 0 ? monthlyPlans[0].items || [] : [];

    const showError = (e: Error) => message.error(e.message || t('common.saveError'));

    const plans = useMemo(
        () => [...plansRaw].sort((a, b) => dayjs(b.weekStart).diff(dayjs(a.weekStart))),
        [plansRaw]
    );

    const currentWeekPlan = useMemo(
        () => plans.find(p => dayjs(p.weekStart).format('YYYY-MM-DD') === thisWeekStart.format('YYYY-MM-DD')),
        [plans, thisWeekStart]
    );

    const latestPlan: WeeklyPlan | null = recentPlans[0] || null;

    const selectedIds = useMemo(
        () => Object.values(selectionByPlan).flat() as string[],
        [selectionByPlan]
    );

    const handleCreatePlan = (withCarryOver: boolean) => {
        const ws = thisWeekStart;
        createWeeklyPlan.mutate({
            weekStart: ws.format('YYYY-MM-DD'),
            weekEnd: getWeekEnd(ws).format('YYYY-MM-DD'),
            department,
            ...(withCarryOver && latestPlan ? { carryOverFromPlanId: latestPlan.id } : {}),
        }, {
            onSuccess: () => message.success(t('common.saveSuccess')),
            onError: showError,
        });
    };

    const handleDeletePlan = (planId: string) => {
        deleteWeeklyPlan.mutate(planId, {
            onSuccess: () => {
                message.success(t('common.deleteSuccess'));
                setSelectionByPlan(prev => {
                    const next = { ...prev };
                    delete next[planId];
                    return next;
                });
            },
            onError: showError,
        });
    };

    const handleAddItem = (planId: string) => {
        const plan = plans.find(p => p.id === planId);
        const items = plan?.items || [];
        setActivePlanId(planId);
        setEditingItem(null);
        setPendingValues({ sortOrder: items.length + 1, status: 'TODO', progressPct: 0 });
        setModalVisible(true);
    };

    const handleEditItem = (planId: string, record: WeeklyPlanItem) => {
        setActivePlanId(planId);
        setEditingItem(record);
        setPendingValues({
            ...record,
            startDate: record.startDate ? dayjs(record.startDate) : null,
            endDate: record.endDate ? dayjs(record.endDate) : null,
        });
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
        setPendingValues(null);
    };

    const handleSubmitItem = (values: WeeklyItemFormValues) => {
        const payload: WeeklyPlanItemInput = {
            ...values,
            startDate: values.startDate?.format('YYYY-MM-DD') || null,
            endDate: values.endDate?.format('YYYY-MM-DD') || null,
        };
        const callbacks = {
            onSuccess: () => {
                message.success(t('common.saveSuccess'));
                closeModal();
            },
            onError: showError,
        };

        if (editingItem) {
            updateWeeklyPlanItem.mutate({ id: editingItem.id, data: payload }, callbacks);
        } else if (activePlanId) {
            createWeeklyPlanItem.mutate({ planId: activePlanId, data: payload }, callbacks);
        }
    };

    const handleDeleteItem = (id: string) => {
        deleteWeeklyPlanItem.mutate(id, {
            onSuccess: () => message.success(t('common.deleteSuccess')),
            onError: showError,
        });
    };

    const handleBatchStatusUpdate = (status: 'DONE' | 'IN_PROGRESS') => {
        if (selectedIds.length === 0) return;
        updateWeeklyPlanItemsStatus.mutate({ ids: selectedIds, status }, {
            onSuccess: () => {
                message.success(t('common.saveSuccess'));
                setSelectionByPlan({});
            },
            onError: showError,
        });
    };

    /** Xuất đúng những dòng đang hiển thị — không phải toàn bộ plan.items */
    const handleExportExcel = (plan: WeeklyPlan) => {
        const items = filters.applyFilters(plan.items || []);
        const period = `${dayjs(plan.weekStart).format(DATE_FORMAT)} - ${dayjs(plan.weekEnd).format(DATE_FORMAT)}`;
        const ok = exportPlanExcel(
            items,
            weeklyExportColumns(t, userList),
            t('plans.export.weekSheet', { range: dayjs(plan.weekStart).format('DD-MM') }),
            `WeeklyPlan_${department}_${dayjs(plan.weekStart).format('DD_MM_YYYY')}.xlsx`,
            buildPlanHeaderRows({ t, department, period, items })
        );
        message[ok ? 'success' : 'warning'](
            ok ? t('common.exportSuccess') : t('plans.export.noData')
        );
    };

    const isSaving = createWeeklyPlanItem.isPending || updateWeeklyPlanItem.isPending;

    const getColumns = (planId: string): ColumnsType<WeeklyPlanItem> => [
        indexColumn<WeeklyPlanItem>(40),
        {
            title: t('plans.fields.what'), dataIndex: 'title', key: 'title', width: 220, className: WRAP,
            render: (val: string, record: WeeklyPlanItem) => {
                const isOverdue = record.endDate && dayjs(record.endDate).isBefore(dayjs(), 'day') && record.status !== 'DONE';
                return (
                    <span>
                        <Text strong style={{ color: isOverdue ? BRAND_COLORS.dangerText : 'inherit' }}>{val}</Text>
                        {record.carriedFrom && (
                            <Tag color="orange" style={{ marginLeft: 6, fontSize: 10 }}>
                                <SyncOutlined /> {t('plans.weekly.carriedTag')}
                            </Tag>
                        )}
                        {isOverdue && <Tag color="error" style={{ marginLeft: 6, fontSize: 10 }}>{t('dashboard.delayed')}</Tag>}
                    </span>
                );
            },
        },
        whyColumn<WeeklyPlanItem>(t, 130),
        assigneeColumn<WeeklyPlanItem>(t, userList, 110),
        {
            title: t('plans.fields.when'), key: 'when', width: 120, align: 'center',
            render: (_: unknown, r: WeeklyPlanItem) => {
                const s = r.startDate ? dayjs(r.startDate).format(DATE_FORMAT_SHORT) : '';
                const e = r.endDate ? dayjs(r.endDate).format(DATE_FORMAT_SHORT) : '';
                return s && e ? `${s} - ${e}` : s || e || '-';
            },
        },
        {
            title: t('plans.fields.where'), dataIndex: 'location', key: 'location',
            width: 110, className: WRAP, render: (val: string) => val || '-',
        },
        methodColumn<WeeklyPlanItem>(t, 120),
        statusColumn<WeeklyPlanItem>(t, 120),
        {
            title: t('plans.daily.progress'), key: 'progress', width: 130, align: 'center',
            render: (_: unknown, r: WeeklyPlanItem) => {
                const pct = r.progressPct || 0;
                const isOverdue = r.endDate && dayjs(r.endDate).isBefore(dayjs(), 'day') && pct < 100;
                const status = pct >= 100 ? 'success' : isOverdue ? 'exception' : pct >= 60 ? 'active' : 'normal';
                return (
                    <Progress
                        percent={pct} size="small" status={status as never}
                        style={{ margin: 0 }}
                        strokeColor={isOverdue ? BRAND_COLORS.dangerText : undefined}
                    />
                );
            },
        },
        resultColumn<WeeklyPlanItem>(t),
        {
            title: t('common.actions'), key: 'action', width: 110, align: 'center', fixed: 'right',
            render: (_: unknown, record: WeeklyPlanItem) => (
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
                        onDelete={canEdit ? () => handleDeleteItem(record.id) : undefined}
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
            <div className="vcm-plan-toolbar" style={{
                padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', flexWrap: 'wrap', gap: 8,
                borderBottom: `1px solid ${BRAND_COLORS.slate100}`, background: BRAND_COLORS.white,
            }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {isCurrentMonth && canEdit && !currentWeekPlan && (
                        <>
                            <Button
                                type="primary" icon={<PlusOutlined />}
                                loading={createWeeklyPlan.isPending}
                                onClick={() => handleCreatePlan(false)}
                            >
                                {t('plans.weekly.createPlan')}
                            </Button>
                            {latestPlan && (
                                <Tooltip title={t('plans.weekly.carryOver')}>
                                    <Button
                                        icon={<SyncOutlined />}
                                        loading={createWeeklyPlan.isPending}
                                        onClick={() => handleCreatePlan(true)}
                                    >
                                        {t('plans.weekly.carryOver')}
                                    </Button>
                                </Tooltip>
                            )}
                        </>
                    )}
                    {selectedIds.length > 0 && canEdit && (
                        <Space wrap>
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                {selectedIds.length} {t('plans.selectedCount')}
                            </Text>
                            <Button
                                size="small" type="primary" icon={<CheckCircleOutlined />}
                                loading={updateWeeklyPlanItemsStatus.isPending}
                                onClick={() => handleBatchStatusUpdate('DONE')}
                            >
                                {t('plans.fields.statusDone')}
                            </Button>
                            <Button
                                size="small" icon={<SyncOutlined />}
                                loading={updateWeeklyPlanItemsStatus.isPending}
                                onClick={() => handleBatchStatusUpdate('IN_PROGRESS')}
                            >
                                {t('plans.fields.statusInProgress')}
                            </Button>
                        </Space>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <PlanFilterBar filters={filters} users={userList} />
                </div>
            </div>

            {plans.length === 0 ? (
                <Card style={{ margin: 16, border: `1px solid ${BRAND_COLORS.slate100}` }}>
                    <Empty description={t('plans.weekly.noPlan')} style={{ padding: 40 }} />
                </Card>
            ) : (
                plans.map((plan: WeeklyPlan) => {
                    const planItems = filters.applyFilters(plan.items || []);
                    if (planItems.length === 0 && filters.hasActiveFilter) return null;

                    const weekLabel = `${dayjs(plan.weekStart).format(DATE_FORMAT_SHORT)} – ${dayjs(plan.weekEnd).format(DATE_FORMAT)}`;
                    const isCurrent = isCurrentWeek(plan);
                    const doneCount = planItems.filter(i => i.status === 'DONE').length;
                    const avgProgress = planItems.length
                        ? Math.round(planItems.reduce((s, i) => s + (i.progressPct || 0), 0) / planItems.length)
                        : 0;

                    return (
                        <Card
                            key={plan.id}
                            className="vcm-plan-card"
                            style={{
                                margin: 16,
                                border: isCurrent
                                    ? `2px solid ${BRAND_COLORS.primary}`
                                    : `1px solid ${BRAND_COLORS.slate100}`,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                borderRadius: 12,
                            }}
                            styles={{ body: { padding: '0 0 8px' } }}
                        >
                            <div className="vcm-plan-card-header" style={{
                                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                                padding: '10px 12px',
                                borderBottom: `1px solid ${BRAND_COLORS.slate50}`,
                            }}>
                                <CalendarOutlined style={{
                                    color: isCurrent ? BRAND_COLORS.primary : BRAND_COLORS.slate500,
                                    fontSize: 16,
                                }} />
                                <span style={{
                                    fontWeight: 700, fontSize: 15,
                                    color: isCurrent ? BRAND_COLORS.primary : BRAND_COLORS.slate800,
                                }}>
                                    {weekLabel}
                                </span>
                                {isCurrent && <Tag color="red" style={{ borderRadius: 4 }}>{t('plans.weekly.currentWeek')}</Tag>}
                                <Tag color="default" style={{ border: 'none', background: BRAND_COLORS.slate100 }}>
                                    {planItems.length} {t('plans.weekly.items')}
                                </Tag>
                                <Tag color="success" style={{
                                    border: 'none',
                                    background: BRAND_COLORS.successBg,
                                    color: BRAND_COLORS.successText,
                                }}>
                                    {doneCount} {t('plans.fields.statusDone')}
                                </Tag>

                                <div style={{ flex: 1, minWidth: 120, maxWidth: 240, marginLeft: 8 }}>
                                    <Progress
                                        percent={avgProgress} size="small"
                                        strokeColor={isCurrent ? BRAND_COLORS.primary : undefined}
                                    />
                                </div>

                                <Space style={{ marginLeft: 'auto' }} wrap>
                                    <Button
                                        size="small" icon={<FileExcelOutlined />}
                                        disabled={planItems.length === 0}
                                        onClick={() => handleExportExcel(plan)}
                                    >
                                        {t('common.export')}
                                    </Button>
                                    {canEdit && (
                                        <>
                                            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => handleAddItem(plan.id)}>
                                                {t('plans.weekly.addItem')}
                                            </Button>
                                            <Popconfirm
                                                title={t('plans.weekly.deleteConfirm')}
                                                onConfirm={() => handleDeletePlan(plan.id)}
                                                okText={t('common.delete')}
                                                cancelText={t('common.cancel')}
                                                okButtonProps={{ loading: deleteWeeklyPlan.isPending }}
                                            >
                                                <Button size="small" danger icon={<DeleteOutlined />} />
                                            </Popconfirm>
                                        </>
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
                                scroll={{ x: 1400 }}
                                className="vcm-plan-table"
                                rowSelection={canEdit ? {
                                    selectedRowKeys: selectionByPlan[plan.id] || [],
                                    onChange: (keys: React.Key[]) =>
                                        setSelectionByPlan(prev => ({ ...prev, [plan.id]: keys })),
                                } : undefined}
                                expandable={{
                                    expandedRowRender: (record: WeeklyPlanItem) => (
                                        <div style={{ padding: '8px 48px', background: BRAND_COLORS.slate50 }}>
                                            <p><strong>{t('plans.fields.why')}:</strong> {record.why || '-'}</p>
                                            <p><strong>{t('plans.fields.where')}:</strong> {record.location || '-'}</p>
                                            <p><strong>{t('plans.fields.how')}:</strong> {record.method || '-'}</p>
                                            {record.result && <p><strong>{t('plans.fields.result')}:</strong> {record.result}</p>}
                                        </div>
                                    ),
                                    rowExpandable: (record: WeeklyPlanItem) =>
                                        !!(record.why || record.location || record.method || record.result),
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
                        <span>{editingItem ? t('plans.weekly.editItem') : t('plans.weekly.addItem')}</span>
                        <Button type="link" size="small" icon={<QuestionCircleOutlined />}
                            onClick={() => setGuideVisible(true)} style={{ padding: '0 4px', fontSize: 12 }}>
                            {t('plans.guideBtn')}
                        </Button>
                    </div>
                }
                open={modalVisible}
                onCancel={closeModal}
                onOk={() => form.submit()}
                confirmLoading={isSaving}
                okText={t('common.save')}
                cancelText={t('common.cancel')}
                width="min(650px, 94vw)"
                destroyOnHidden
                afterOpenChange={open => {
                    if (open && pendingValues) form.setFieldsValue(pendingValues);
                }}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmitItem}>
                    <Row gutter={16}>
                        <Col xs={24} sm={6}>
                            <Form.Item name="sortOrder" label="#" rules={[{ required: true }]}>
                                <SortOrderSelect
                                    itemCount={plans.find(p => p.id === activePlanId)?.items?.length || 0}
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={18}>
                            <Form.Item name="monthlyItemId" label={t('plans.monthly.sectionTitle')}>
                                <Select
                                    allowClear
                                    placeholder={t('plans.monthly.addItem')}
                                    options={monthlyPlanItems.map(mi => ({ value: mi.id, label: mi.title }))}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="title" label={t('plans.fields.what')} rules={[{ required: true }]}>
                        <Input placeholder={t('plans.fields.whatPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="why" label={t('plans.fields.why')}>
                        <TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder={t('plans.fields.whyPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="assigneeId" label={t('plans.fields.who')}>
                        <AssigneeSelect users={userList} />
                    </Form.Item>
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="startDate" label={t('plans.fields.whenStart')}>
                                <DatePicker style={{ width: '100%' }} format={DATE_FORMAT} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                name="endDate"
                                label={t('plans.fields.whenEnd')}
                                dependencies={['startDate']}
                                rules={[({ getFieldValue }) => ({
                                    validator(_, value) {
                                        const start = getFieldValue('startDate');
                                        if (!value || !start || !value.isBefore(start, 'day')) return Promise.resolve();
                                        return Promise.reject(new Error(t('plans.fields.dateRangeError')));
                                    },
                                })]}
                            >
                                <DatePicker style={{ width: '100%' }} format={DATE_FORMAT} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="location" label={t('plans.fields.where')}>
                                <TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder={t('plans.fields.wherePlaceholder')} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="method" label={t('plans.fields.how')}>
                                <TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder={t('plans.fields.howPlaceholder')} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="status" label={t('plans.fields.status')} initialValue="TODO">
                                <StatusSelect />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="progressPct" label={t('plans.daily.progress')} initialValue={0}>
                                <ProgressSelect />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="result" label={t('plans.fields.result')}>
                        <TextArea rows={2} placeholder={t('plans.fields.resultPlaceholder')} />
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
