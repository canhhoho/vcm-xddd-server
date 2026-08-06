import React, { useMemo, useState } from 'react';
import { Button, Table, Modal, Form, Input, message, Empty, Popconfirm, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, DeleteOutlined, QuestionCircleOutlined, FileExcelOutlined } from '@ant-design/icons';
import PlanGuideModal from './PlanGuideModal';
import { useTranslation } from 'react-i18next';
import type { Dayjs } from 'dayjs';
import { VcmActionGroup } from './VcmActionGroup';
import type { Department, MonthlyPlanItem, User } from '../types';
import { useMonthlyPlans, usePlanMutations } from '../hooks/usePlans';
import { useUsers } from '../hooks/useUsers';
import { BRAND_COLORS } from '../styles/brandIdentity';
import PlanFilterBar from './plan/PlanFilterBar';
import { usePlanFilters } from './plan/usePlanFilters';
import { exportExcelSheet } from '../utils/excelExport';
import { buildPlanHeaderRows, monthlyExportColumns } from './plan/planExportColumns';
import { WRAP } from './plan/planConstants';
import { AssigneeInput, SortOrderSelect, StatusSelect } from './plan/PlanFormFields';
import {
    assigneeColumn, indexColumn, methodColumn,
    resultColumn, statusColumn, titleColumn, whyColumn,
} from './plan/planColumns';

const { TextArea } = Input;
const { Title } = Typography;

interface Props {
    department: Department;
    selectedMonth: Dayjs;
    canEdit: boolean;
}

const MonthlyPlanSection: React.FC<Props> = ({ department, selectedMonth, canEdit }) => {
    const { t } = useTranslation();
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<MonthlyPlanItem | null>(null);
    const [guideVisible, setGuideVisible] = useState(false);
    // Giá trị khởi tạo được set khi Modal đã mount (destroyOnHidden huỷ Form khi đóng)
    const [pendingValues, setPendingValues] = useState<Partial<MonthlyPlanItem> | null>(null);
    const [form] = Form.useForm();

    const filters = usePlanFilters();
    const monthStart = selectedMonth.format('YYYY-MM-DD');

    const { data: plans = [], isLoading: loading } = useMonthlyPlans({ department, monthStart });
    const { data: users = [] } = useUsers();
    const {
        createMonthlyPlan,
        deleteMonthlyPlan,
        createMonthlyPlanItem,
        updateMonthlyPlanItem,
        deleteMonthlyPlanItem,
    } = usePlanMutations();

    const plan = plans.length > 0 ? plans[0] : null;
    const rawItems: MonthlyPlanItem[] = plan?.items || [];
    const userList = users as User[];

    const showError = (e: Error) => message.error(e.message || t('common.saveError'));

    const filteredItems = useMemo(
        () => filters.applyFilters(rawItems),
        [rawItems, filters]
    );

    const handleExportExcel = () => {
        const period = selectedMonth.format('MM/YYYY');
        const ok = exportExcelSheet(
            filteredItems,
            monthlyExportColumns(t),
            t('plans.export.monthSheet'),
            `MonthlyPlan_${department}_${selectedMonth.format('MM_YYYY')}.xlsx`,
            buildPlanHeaderRows({ t, department, period, items: filteredItems })
        );
        message[ok ? 'success' : 'warning'](
            ok ? t('common.exportSuccess') : t('plans.export.noData')
        );
    };

    const handleCreatePlan = () => {
        createMonthlyPlan.mutate({ monthStart, department }, {
            onSuccess: () => message.success(t('common.saveSuccess')),
            onError: showError,
        });
    };

    const handleDeletePlan = () => {
        if (!plan) return;
        deleteMonthlyPlan.mutate(plan.id, {
            onSuccess: () => message.success(t('common.deleteSuccess')),
            onError: showError,
        });
    };

    const openAddModal = () => {
        setEditingItem(null);
        setPendingValues({ sortOrder: rawItems.length + 1, status: 'TODO' });
        setModalVisible(true);
    };

    const openEditModal = (item: MonthlyPlanItem) => {
        setEditingItem(item);
        setPendingValues(item);
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
        setPendingValues(null);
    };

    const handleDeleteItem = (id: string) => {
        deleteMonthlyPlanItem.mutate(id, {
            onSuccess: () => message.success(t('common.deleteSuccess')),
            onError: showError,
        });
    };

    const handleSubmit = (values: MonthlyPlanItem) => {
        if (!plan) return;
        const callbacks = {
            onSuccess: () => {
                message.success(t('common.saveSuccess'));
                closeModal();
            },
            onError: showError,
        };
        if (editingItem) {
            updateMonthlyPlanItem.mutate({ id: editingItem.id, data: values }, callbacks);
        } else {
            createMonthlyPlanItem.mutate({ planId: plan.id, data: values }, callbacks);
        }
    };

    const isSaving = createMonthlyPlanItem.isPending || updateMonthlyPlanItem.isPending;

    const columns: ColumnsType<MonthlyPlanItem> = [
        indexColumn<MonthlyPlanItem>(),
        titleColumn<MonthlyPlanItem>(t),
        { title: t('plans.monthly.target'), dataIndex: 'target', key: 'target', width: 180, className: WRAP },
        whyColumn<MonthlyPlanItem>(t, 150),
        assigneeColumn<MonthlyPlanItem>(t, 130),
        methodColumn<MonthlyPlanItem>(t, 150),
        statusColumn<MonthlyPlanItem>(t, 130),
        resultColumn<MonthlyPlanItem>(t),
        {
            title: t('common.actions'), key: 'action', width: 90, align: 'center', fixed: 'right',
            render: (_: unknown, record: MonthlyPlanItem) => (
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
            <div className="vcm-plan-toolbar" style={{
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: BRAND_COLORS.primarySoftBg,
                borderBottom: `1px solid ${BRAND_COLORS.slate100}`,
                flexWrap: 'wrap', gap: 8,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Title level={5} style={{
                        margin: 0, color: BRAND_COLORS.primary, fontSize: 13,
                        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                        {t('plans.monthly.sectionTitle')} — {selectedMonth.format('MM/YYYY')}
                    </Title>
                    {plan && (
                        <Button
                            size="small" icon={<FileExcelOutlined />}
                            disabled={filteredItems.length === 0}
                            onClick={handleExportExcel}
                        >
                            {t('common.export')}
                        </Button>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {plan && <PlanFilterBar filters={filters} />}

                    {plan && canEdit && (
                        <>
                            <Button
                                size="small" type="primary" icon={<PlusOutlined />}
                                onClick={openAddModal}
                            >
                                {t('plans.monthly.addItem')}
                            </Button>
                            <Popconfirm
                                title={t('plans.monthly.deleteConfirm')}
                                onConfirm={handleDeletePlan}
                                okText={t('common.delete')}
                                cancelText={t('common.cancel')}
                                okButtonProps={{ loading: deleteMonthlyPlan.isPending }}
                            >
                                <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                        </>
                    )}
                    {!plan && canEdit && (
                        <Button
                            size="small" type="primary" icon={<PlusOutlined />}
                            loading={createMonthlyPlan.isPending}
                            onClick={handleCreatePlan}
                        >
                            {t('plans.monthly.createPlan')}
                        </Button>
                    )}
                </div>
            </div>

            {!plan ? (
                <div style={{ padding: '24px 16px', background: BRAND_COLORS.backgroundLight }}>
                    <Empty description={t('plans.monthly.noplan')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
            ) : (
                <Table
                    dataSource={filteredItems}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    size="small"
                    pagination={false}
                    scroll={{ x: 1215 }}
                    className="vcm-plan-table"
                    style={{ background: BRAND_COLORS.primaryTint }}
                />
            )}

            {/* Item Modal */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{editingItem ? t('plans.monthly.editItem') : t('plans.monthly.addItem')}</span>
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
                width="min(620px, 94vw)"
                destroyOnHidden
                // Form bị huỷ khi Modal đóng nên chỉ set giá trị sau khi nó mount lại
                afterOpenChange={open => {
                    if (open && pendingValues) form.setFieldsValue(pendingValues);
                }}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item name="sortOrder" label="#" rules={[{ required: true }]}>
                        <SortOrderSelect itemCount={rawItems.length} />
                    </Form.Item>
                    <Form.Item name="title" label={t('plans.fields.what')} rules={[{ required: true }]}>
                        <Input placeholder={t('plans.fields.whatPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="target" label={t('plans.monthly.target')}>
                        <TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder={t('plans.monthly.targetPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="why" label={t('plans.fields.why')}>
                        <TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder={t('plans.fields.whyPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="assigneeName" label={t('plans.fields.who')}>
                        <AssigneeInput />
                    </Form.Item>
                    <Form.Item name="method" label={t('plans.fields.how')}>
                        <TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder={t('plans.fields.howPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="status" label={t('plans.fields.status')} initialValue="TODO">
                        <StatusSelect />
                    </Form.Item>
                    <Form.Item name="result" label={t('plans.fields.result')}>
                        <TextArea rows={2} placeholder={t('plans.fields.resultPlaceholder')} />
                    </Form.Item>
                </Form>
            </Modal>
            <PlanGuideModal open={guideVisible} onClose={() => setGuideVisible(false)} />
        </div>
    );
};

export default MonthlyPlanSection;
