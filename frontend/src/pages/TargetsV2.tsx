import React, { useState, useEffect, useMemo } from 'react';
import { Button, Modal, Form, Select, message, Row, Col, Table, InputNumber, Progress, Card, Tabs, Input, Tooltip, Popconfirm, Space } from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    GlobalOutlined,
    BankOutlined,
    FileExcelOutlined,
    EyeOutlined,
    SearchOutlined,
    FilterOutlined
} from '@ant-design/icons';
import { apiService } from '../services/api'; // STILL NEEDED FOR NOW? Or remove?
import './Targets.css';
import { useFilterSync } from '../hooks/useFilterSync';
import { usePermissions } from '../hooks/usePermissions';
import { FilterChips } from '../components/FilterChips';
import { useTranslation } from 'react-i18next';
import { VcmFilterBar } from '../components/VcmFilterBar';
import { VcmActionGroup } from '../components/VcmActionGroup';

// React Query Hooks
import { useTargets, useBranchPerformance, useGeneralPerformance, useTargetMutations } from '../hooks/useTargets';
import { useAppConfig } from '../hooks/useAppConfig';

const { Option } = Select;

// --- TYPES ---
interface Target {
    id: string;
    name: string;
    type: 'NGUON_VIEC' | 'DOANH_THU';
    periodType: 'MONTH' | 'QUARTER' | 'YEAR';
    period: string;
    unitType: 'GENERAL' | 'BRANCH';
    unitId?: string;
    unitName?: string;
    targetValue: number;
    actualValue?: number;
    createdAt: string;
}

interface Branch {
    id: string;
    name: string;
    code: string;
}

// ... (ICON_MAP and Interfaces remain same) ...

// --- HELPER FUNCTIONS ---
const formatNumber = (val: number) => new Intl.NumberFormat('vi-VN').format(val || 0);

const getRate = (actual: number, target: number) =>
    target > 0 ? Math.round((actual / target) * 100) : 0;

// --- MAIN COMPONENT ---
const Targets: React.FC = () => {
    const { t } = useTranslation();
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingTarget, setEditingTarget] = useState<any>(null); // Use Any or Target
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    // Permissions
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.targets === 'EDIT';
    const canView = isAdmin || permissions.targets === 'VIEW' || permissions.targets === 'EDIT';

    if (permissions.targets === 'NO_ACCESS' && !isAdmin) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>{t('targets.noAccess')}</h2>
                <p>{t('targets.noAccessDesc')}</p>
            </div>
        );
    }

    // Filters for General Targets
    const [generalYear, setGeneralYear] = useFilterSync('year', '2026');
    const [generalType, setGeneralType] = useState<'NGUON_VIEC' | 'DOANH_THU'>('NGUON_VIEC');

    // Filters for Branch Targets
    const [branchYear, setBranchYear] = useFilterSync('b_year', '2026');
    const [branchMonth, setBranchMonth] = useFilterSync('b_month', '');
    const [branchFilter, setBranchFilter] = useFilterSync<string | undefined>('branch', undefined);

    // Active Tab
    const [activeTab, setActiveTab] = useFilterSync('tab', 'general');

    // --- REACT QUERY DATA ---
    const { data: targets = [], isLoading: loadingTargets } = useTargets(canView);
    const { data: appConfig } = useAppConfig();
    const branches = appConfig?.BRANCHES || [];

    // General Performance (actual values by year, independent of target records)
    const { data: generalPerformance } = useGeneralPerformance(generalYear, canView);

    // Branch Performance (Only fetch if tab is branch)
    const { data: branchActuals = {} } = useBranchPerformance(branchYear, activeTab === 'branch');

    const loading = loadingTargets;

    // Mutations
    const { createTarget, updateTarget, deleteTarget } = useTargetMutations();

    // Active Filters List for Chips
    const activeFilters = useMemo(() => {
        const filters: any[] = [];
        if (activeTab === 'general') {
            if (generalYear && generalYear !== '2026') {
                filters.push({ key: 'year', label: t('targets.filterYear'), value: generalYear, onRemove: () => setGeneralYear('2026') });
            }
        } else {
            if (branchYear && branchYear !== '2026') {
                filters.push({ key: 'b_year', label: t('targets.filterYear'), value: branchYear, onRemove: () => setBranchYear('2026') });
            }
            if (branchMonth) {
                filters.push({ key: 'b_month', label: t('targets.filterMonth'), value: `T${parseInt(branchMonth)}`, onRemove: () => setBranchMonth('') });
            }
            if (branchFilter) {
                const br = branches.find((b: any) => b.id === branchFilter);
                filters.push({ key: 'branch', label: t('targets.filterBranch'), value: branchFilter, displayValue: br?.code, onRemove: () => setBranchFilter(undefined) });
            }
        }
        return filters;
    }, [activeTab, generalYear, branchYear, branchMonth, branchFilter, branches]);

    const clearAllFilters = () => {
        if (activeTab === 'general') {
            setGeneralYear('2026');
        } else {
            setBranchYear('2026');
            setBranchMonth('');
            setBranchFilter(undefined);
        }
    };


    const handleCreate = (unitType: 'GENERAL' | 'BRANCH' = 'GENERAL', branchId?: string, branchName?: string, type?: 'NGUON_VIEC' | 'DOANH_THU') => {
        setEditingTarget(null);
        form.resetFields();
        if (unitType === 'GENERAL') {
            form.setFieldsValue({
                unitType,
                type: generalType,
                periodType: 'YEAR',
                period: generalYear
            });
        } else {
            form.setFieldsValue({
                unitType,
                type: type || 'NGUON_VIEC',
                periodType: 'MONTH',
                period: branchMonth ? `${branchYear}-${branchMonth}` : '',
                unitId: branchId,
                // We don't set unitName in form usually, it's looked up by ID
            });
        }
        setIsModalVisible(true);
    };

    const handleEdit = (record: any) => {
        setEditingTarget(record);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };

    const handleDelete = (record: any) => {
        Modal.confirm({
            title: t('targets.confirmDeleteTitle'),
            content: t('targets.confirmDeleteContent', { name: record.name }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => {
                deleteTarget.mutate(record.id, {
                    onSuccess: (res) => {
                        if (res.success) {
                            message.success(t('targets.deleteSuccess'));
                        } else {
                            message.error(t('targets.deleteFailed') + (res.error || ''));
                        }
                    },
                    onError: () => {
                        message.error(t('targets.deleteError'));
                    }
                });
            },
        });
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);
            const branch = branches.find((b: any) => b.id === values.unitId);
            const payload = {
                ...values,
                id: editingTarget?.id,
                unitName: branch?.name || (values.unitType === 'GENERAL' ? t('targets.company') : undefined)
            };

            const onSuccess = (res: any) => {
                if (res.success) {
                    message.success(editingTarget ? t('targets.updateSuccess') : t('targets.createSuccess'));
                    setIsModalVisible(false);
                } else {
                    message.error(t('targets.saveFailed') + (res.error || ''));
                }
                setSubmitting(false);
            };

            const onError = () => {
                message.error(t('targets.saveFailed'));
                setSubmitting(false);
            };

            if (editingTarget) {
                updateTarget.mutate(payload, { onSuccess, onError });
            } else {
                createTarget.mutate(payload, { onSuccess, onError });
            }
        } catch (error) {
            setSubmitting(false);
        }
    };

    // ========== GENERAL TARGETS DATA ==========
    // Helper: lấy actualValue từ generalPerformance (hoặc từ target record nếu không có)
    const getGeneralActual = (targetType: 'NGUON_VIEC' | 'DOANH_THU', periodType: 'YEAR' | 'QUARTER' | 'MONTH', period: string, fallbackFromTarget: number) => {
        const perf = generalPerformance;
        if (!perf) return fallbackFromTarget;
        const metric = targetType === 'NGUON_VIEC' ? perf.nguonViec : perf.doanhThu;
        if (periodType === 'YEAR') return metric.year ?? fallbackFromTarget;
        if (periodType === 'QUARTER') {
            // period format: '2025-Q1'
            const qMatch = period.match(/Q(\d)/);
            if (qMatch) return metric.quarters[parseInt(qMatch[1])] ?? fallbackFromTarget;
        }
        if (periodType === 'MONTH') {
            // period format: '2025-01'
            const mMatch = period.match(/-(\d{2})$/);
            if (mMatch) return metric.months[parseInt(mMatch[1])] ?? fallbackFromTarget;
        }
        return fallbackFromTarget;
    };

    const getGeneralTableData = (targetType: 'NGUON_VIEC' | 'DOANH_THU') => {
        const filtered = targets.filter((t: Target) =>
            (t.unitType === 'GENERAL' || !t.unitType) &&
            t.type === targetType
        );

        const rows: any[] = [];

        // Year row - always show
        const yearTarget = filtered.find((t: Target) => t.periodType === 'YEAR' && t.period === generalYear);
        const yearActual = getGeneralActual(targetType, 'YEAR', generalYear, yearTarget?.actualValue || 0);
        rows.push({
            key: `year-${generalYear}-${targetType}`,
            id: yearTarget?.id,
            rowType: 'year',
            label: `${t('targets.year')} ${generalYear}`,
            periodType: 'YEAR',
            period: generalYear,
            targetValue: yearTarget?.targetValue || 0,
            actualValue: yearActual,
            hasData: !!yearTarget,
            type: targetType,
            unitType: 'GENERAL',
            ...(yearTarget || {})
        });

        // Quarters with their months grouped
        const quarterMonths: { [key: number]: number[] } = {
            1: [1, 2, 3],
            2: [4, 5, 6],
            3: [7, 8, 9],
            4: [10, 11, 12]
        };

        [1, 2, 3, 4].forEach(q => {
            const quarterPeriod = `${generalYear}-Q${q}`;
            const quarterTarget = filtered.find((t: Target) => t.periodType === 'QUARTER' && t.period === quarterPeriod);
            const quarterActual = getGeneralActual(targetType, 'QUARTER', quarterPeriod, quarterTarget?.actualValue || 0);
            rows.push({
                key: `quarter-${q}-${targetType}`,
                id: quarterTarget?.id,
                rowType: 'quarter',
                label: `${t('targets.quarter')} ${q}`,
                periodType: 'QUARTER',
                period: quarterPeriod,
                targetValue: quarterTarget?.targetValue || 0,
                actualValue: quarterActual,
                hasData: !!quarterTarget,
                type: targetType,
                unitType: 'GENERAL',
                ...(quarterTarget || {})
            });

            quarterMonths[q].forEach(m => {
                const monthPeriod = `${generalYear}-${String(m).padStart(2, '0')}`;
                const monthTarget = filtered.find((t: Target) => t.periodType === 'MONTH' && t.period === monthPeriod);
                const monthActual = getGeneralActual(targetType, 'MONTH', monthPeriod, monthTarget?.actualValue || 0);
                rows.push({
                    key: `month-${m}-${targetType}`,
                    id: monthTarget?.id,
                    rowType: 'month',
                    label: `${t('targets.month')} ${m}`,
                    periodType: 'MONTH',
                    period: monthPeriod,
                    targetValue: monthTarget?.targetValue || 0,
                    actualValue: monthActual,
                    hasData: !!monthTarget,
                    type: targetType,
                    unitType: 'GENERAL',
                    ...(monthTarget || {})
                });
            });
        });

        return rows;
    };

    // ========== BRANCH TARGETS DATA (Legacy - not used in new layout) ==========
    const getBranchTableData = () => {
        const period = `${branchYear}-${branchMonth}`;
        const branchTargets = targets.filter((t: Target) =>
            t.unitType === 'BRANCH' &&
            t.period === period
        );

        return branches.map((branch: Branch) => {
            const target = branchTargets.find((t: Target) => t.unitId === branch.id);
            return {
                key: branch.id,
                branchId: branch.id,
                branchName: branch.name,
                branchCode: branch.code,
                targetId: target?.id,
                targetValue: target?.targetValue || 0,
                actualValue: target?.actualValue || 0,
                hasTarget: !!target,
                target
            };
        });
    };

    const getBranchMetric = (branchId: string, type: 'NGUON_VIEC' | 'DOANH_THU') => {
        const perf = branchActuals[branchId];
        if (!perf) return 0;
        const metric = type === 'NGUON_VIEC' ? perf.sourceWork : perf.revenue;

        if (branchMonth) {
            const m = parseInt(branchMonth);
            return metric.months[m] || 0;
        } else {
            return metric.total || 0;
        }
    };

    // Columns for General Targets
    const generalColumns = [
        {
            title: t('targets.colPeriod'),
            dataIndex: 'label',
            key: 'label',
            render: (text: string, record: any) => (
                <span style={{
                    fontWeight: record.rowType === 'year' ? 700 : record.rowType === 'quarter' ? 600 : 400,
                    paddingLeft: record.rowType === 'month' ? 16 : record.rowType === 'quarter' ? 8 : 0
                }}>
                    {record.rowType === 'year' && <span style={{ marginRight: 6 }}>📅</span>}
                    {text}
                </span>
            )
        },
        {
            title: t('targets.colTarget'),
            dataIndex: 'targetValue',
            key: 'targetValue',
            align: 'right' as const,
            render: (val: number) => <strong>{formatNumber(val)}</strong>
        },
        {
            title: t('targets.colActual'),
            dataIndex: 'actualValue',
            key: 'actualValue',
            align: 'right' as const,
            render: (val: number, record: any) => {
                const rate = getRate(val || 0, record.targetValue);
                return (
                    <span style={{ color: rate >= 100 ? '#52c41a' : rate >= 50 ? '#faad14' : '#f5222d' }}>
                        {formatNumber(val || 0)}
                    </span>
                );
            }
        },
        {
            title: t('targets.colRate'),
            key: 'rate',
            align: 'center' as const,
            width: 100,
            render: (_: any, record: any) => {
                const rate = getRate(record.actualValue || 0, record.targetValue);
                return (
                    <Progress
                        percent={Math.min(rate, 100)}
                        size="small"
                        status={rate >= 100 ? 'success' : rate >= 50 ? 'active' : 'exception'}
                        format={() => `${rate}%`}
                    />
                );
            }
        },
        {
            title: '',
            key: 'actions',
            width: 80,
            render: (_: any, record: Target) => (
                <VcmActionGroup
                    onEdit={canEdit ? () => handleEdit(record) : undefined}
                    onDelete={canEdit ? () => handleDelete(record) : undefined}
                    canEdit={canEdit}
                    canDelete={canEdit}
                    deleteConfirmTitle={t('targets.deleteConfirm')}
                />
            )
        }
    ];

    // Columns for Branch Targets
    const branchColumns = [
        {
            title: t('targets.colBranch'),
            dataIndex: 'branchCode',
            key: 'branchCode',
            render: (code: string) => (
                <span>
                    <BankOutlined style={{ marginRight: 6, color: '#1890ff' }} />
                    <strong>{code}</strong>
                </span>
            )
        },
        {
            title: t('targets.colTarget'),
            dataIndex: 'targetValue',
            key: 'targetValue',
            align: 'right' as const,
            render: (val: number) => <strong>{formatNumber(val)}</strong>
        },
        {
            title: t('targets.colActual'),
            dataIndex: 'actualValue',
            key: 'actualValue',
            align: 'right' as const,
            render: (val: number, record: any) => {
                const rate = getRate(val, record.targetValue);
                return (
                    <span style={{ color: rate >= 100 ? '#52c41a' : rate >= 50 ? '#faad14' : '#f5222d' }}>
                        {formatNumber(val)}
                    </span>
                );
            }
        },
        {
            title: t('targets.colRate'),
            key: 'rate',
            align: 'center' as const,
            width: 100,
            render: (_: any, record: any) => {
                const rate = getRate(record.actualValue, record.targetValue);
                return (
                    <Progress
                        percent={Math.min(rate, 100)}
                        size="small"
                        status={rate >= 100 ? 'success' : rate >= 50 ? 'active' : 'exception'}
                        format={() => `${rate}%`}
                    />
                );
            }
        },
        {
            title: '',
            key: 'actions',
            width: 80,
            render: (_: any, record: any) => (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {record.target ? (
                        <VcmActionGroup
                            onEdit={canEdit ? () => handleEdit(record.target) : undefined}
                            onDelete={canEdit ? () => handleDelete(record.target) : undefined}
                            canEdit={canEdit}
                            canDelete={canEdit}
                            deleteConfirmTitle={t('targets.deleteConfirm')}
                        />
                    ) : (
                        <Button type="link" size="small" onClick={() => handleCreate('BRANCH', record.branchId, record.branchName, 'NGUON_VIEC')}>
                            {t('targets.addInline')}
                        </Button>
                    )}
                </div>
            )
        }
    ];

    // Add Revenue Columns for Branch Tab
    const branchRevenueColumns = [
        ...branchColumns.slice(0, 1), // Branch Code
        {
            title: t('targets.colTarget'),
            dataIndex: 'targetValueDT',
            key: 'targetValueDT',
            align: 'right' as const,
            render: (val: number) => <strong>{formatNumber(val)}</strong>
        },
        {
            title: t('targets.colActual'),
            dataIndex: 'actualValueDT',
            key: 'actualValueDT',
            align: 'right' as const,
            render: (val: number) => {
                return (
                    <span style={{ color: '#f5222d', fontWeight: 600 }}>
                        {formatNumber(val)}
                    </span>
                );
            }
        },
        {
            title: t('targets.colRate'),
            key: 'rateDT',
            align: 'center' as const,
            width: 100,
            render: (_: any, record: any) => {
                const rate = getRate(record.actualValueDT, record.targetValueDT);
                return (
                    <Progress
                        percent={Math.min(rate, 100)}
                        size="small"
                        status={rate >= 100 ? 'success' : rate >= 50 ? 'active' : 'exception'}
                        format={() => `${rate}%`}
                    />
                );
            }
        },
        {
            title: '',
            key: 'actions',
            width: 80,
            render: (_: any, record: any) => (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {record.targetDT ? (
                        <VcmActionGroup
                            onEdit={canEdit ? () => handleEdit(record.targetDT) : undefined}
                            onDelete={canEdit ? () => handleDelete(record.targetDT) : undefined}
                            canEdit={canEdit}
                            canDelete={canEdit}
                            deleteConfirmTitle={t('targets.deleteConfirm')}
                        />
                    ) : (
                        canEdit && (
                            <Button type="link" size="small" onClick={() => handleCreate('BRANCH', record.branchId, record.branchName, 'DOANH_THU')}>
                                {t('targets.addInline')}
                            </Button>
                        )
                    )}
                </div>
            )
        }
    ];



    // const totalTarget = generalTotals.targetValue + branchTotals.targetValue;
    // const totalActual = generalTotals.actualValue + branchTotals.actualValue;
    // const achievementRate = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

    // Use appConfig for periods if available, otherwise fallback
    const yearOptions = appConfig?.PERIODS?.YEARS || ['2024', '2025', '2026', '2027'];
    const monthOptions = appConfig?.PERIODS?.MONTHS?.map((m: any) => String(m).padStart(2, '0')) || Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

    return (
        <div className="vcm-page-container">
            {/* Header - Standardized across the app */}
            <div className="vcm-premium-header">
                {/* Decorative circles */}
                <div className="vcm-header-decorative-circle vcm-circle-1" />
                <div className="vcm-header-decorative-circle vcm-circle-2" />

                <div className="vcm-header-content">
                    <h2 className="vcm-header-title">
                        {t('targets.pageTitle')}
                    </h2>
                    <Space>
                        <Button
                            type="default"
                            icon={<FileExcelOutlined />}
                            onClick={() => message.info(t('targets.exportExcelDev'))}
                            className="vcm-btn-secondary"
                        >
                            {t('targets.exportExcel')}
                        </Button>
                        {canEdit && (
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={() => handleCreate(activeTab === 'general' ? 'GENERAL' : 'BRANCH')}
                                className="vcm-btn-premium"
                            >
                                {t('targets.addTarget').toUpperCase()}
                            </Button>
                        )}
                    </Space>
                </div>
            </div>

            {/* Filter Row - đồng bộ style với Contracts/Projects */}
            <VcmFilterBar>
                <Col xs={24} sm={12} md={6}>
                    <Select
                        value={activeTab === 'general' ? generalYear : branchYear}
                        onChange={(v) => activeTab === 'general' ? setGeneralYear(v) : setBranchYear(v)}
                        style={{ width: '100%' }}
                        placeholder={t('targets.filterYear')}
                        suffixIcon={<FilterOutlined />}
                    >
                        {yearOptions.map((y: string) => <Option key={y} value={y}>{t('targets.year')} {y}</Option>)}
                    </Select>
                </Col>
                {activeTab === 'branch' && (
                    <>
                        <Col xs={24} sm={12} md={6}>
                            <Select
                                value={branchMonth || undefined}
                                onChange={setBranchMonth}
                                style={{ width: '100%' }}
                                placeholder={t('targets.filterMonth')}
                                allowClear
                                suffixIcon={<FilterOutlined />}
                            >
                                {monthOptions.map((m: string) => <Option key={m} value={m}>{t('targets.month')} {parseInt(m)}</Option>)}
                            </Select>
                        </Col>
                        <Col xs={24} sm={12} md={6}>
                            <Select
                                value={branchFilter}
                                onChange={setBranchFilter}
                                style={{ width: '100%' }}
                                placeholder={t('targets.filterBranch')}
                                allowClear
                                showSearch
                                optionFilterProp="children"
                                suffixIcon={<FilterOutlined />}
                            >
                                {branches.map((b: any) => <Option key={b.id} value={b.id}>{b.code}</Option>)}
                            </Select>
                        </Col>
                    </>
                )}
            </VcmFilterBar>
            <div style={{ marginBottom: 16 }}>
                <FilterChips filters={activeFilters} onClearAll={clearAllFilters} />
            </div>

            {/* Tabs Card - 2 columns layout */}
            <Card className="targets-card" bodyStyle={{ padding: '16px' }}>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={[
                        {
                            key: 'general',
                            label: <span><GlobalOutlined /> {t('targets.generalTab')}</span>,
                            children: (
                                <Row gutter={[24, 16]}>
                                    {/* Cột trái: Nguồn việc */}
                                    <Col xs={24} lg={12}>
                                        <div className="targets-column">
                                            <div className="targets-column-header">
                                                <span className="column-title">📋 {t('targets.sourceWork')}</span>
                                            </div>
                                            <Table
                                                columns={generalColumns}
                                                dataSource={getGeneralTableData('NGUON_VIEC')}
                                                pagination={false}
                                                size="small"
                                                loading={loading}
                                                bordered
                                                locale={{ emptyText: t('targets.noTarget') }}
                                                onRow={() => ({ onClick: () => setGeneralType('NGUON_VIEC') })}
                                            />
                                        </div>
                                    </Col>
                                    {/* Cột phải: Doanh thu */}
                                    <Col xs={24} lg={12}>
                                        <div className="targets-column">
                                            <div className="targets-column-header doanh-thu">
                                                <span className="column-title">💰 {t('targets.revenue')}</span>
                                            </div>
                                            <Table
                                                columns={generalColumns}
                                                dataSource={getGeneralTableData('DOANH_THU')}
                                                pagination={false}
                                                size="small"
                                                loading={loading}
                                                bordered
                                                locale={{ emptyText: t('targets.noTarget') }}
                                                onRow={() => ({ onClick: () => setGeneralType('DOANH_THU') })}
                                            />
                                        </div>
                                    </Col>
                                </Row>
                            )
                        },
                        {
                            key: 'branch',
                            label: <span><BankOutlined /> {t('targets.branchTab')}</span>,
                            children: (
                                <Row gutter={[24, 16]}>
                                    {/* Cột trái: Nguồn việc */}
                                    <Col xs={24} lg={12}>
                                        <div className="targets-column">
                                            <div className="targets-column-header">
                                                <span className="column-title">📋 {t('targets.sourceWork')}</span>
                                            </div>
                                            <Table
                                                columns={branchColumns}
                                                dataSource={branches.map((branch: Branch) => {
                                                    const targetPeriod = branchMonth ? `${branchYear}-${branchMonth}` : branchYear;
                                                    const branchTargets = targets.filter((t: Target) => t.unitType === 'BRANCH' && t.type === 'NGUON_VIEC' && t.period === targetPeriod && t.unitId === branch.id);
                                                    const targetValue = branchTargets.reduce((sum: number, t: Target) => sum + (t.targetValue || 0), 0);
                                                    const actual = getBranchMetric(branch.id, 'NGUON_VIEC');

                                                    return {
                                                        key: branch.id,
                                                        branchId: branch.id,
                                                        branchName: branch.name,
                                                        branchCode: branch.code,
                                                        targetId: branchTargets[0]?.id, // Use first ID for editing
                                                        targetValue: targetValue,
                                                        actualValue: actual,
                                                        hasTarget: branchTargets.length > 0,
                                                        target: branchTargets[0]
                                                    };
                                                })}
                                                pagination={false}
                                                size="small"
                                                loading={loading}
                                                bordered
                                                summary={(pageData) => {
                                                    const totalTarget = pageData.reduce((sum: number, t: any) => sum + (t.targetValue || 0), 0);
                                                    const totalActual = pageData.reduce((sum: number, t: any) => sum + (t.actualValue || 0), 0);
                                                    return (
                                                        <Table.Summary fixed>
                                                            <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                                                                <Table.Summary.Cell index={0}>📊 {t('targets.total')}</Table.Summary.Cell>
                                                                <Table.Summary.Cell index={1} align="right">{formatNumber(totalTarget)}</Table.Summary.Cell>
                                                                <Table.Summary.Cell index={2} align="right">
                                                                    <span style={{ color: getRate(totalActual, totalTarget) >= 50 ? '#52c41a' : '#f5222d' }}>
                                                                        {formatNumber(totalActual)}
                                                                    </span>
                                                                </Table.Summary.Cell>
                                                                <Table.Summary.Cell index={3} align="center">
                                                                    <Progress percent={Math.min(getRate(totalActual, totalTarget), 100)} size="small" format={() => `${getRate(totalActual, totalTarget)}%`} />
                                                                </Table.Summary.Cell>
                                                                <Table.Summary.Cell index={4} />
                                                            </Table.Summary.Row>
                                                        </Table.Summary>
                                                    );
                                                }}
                                            />
                                        </div>
                                    </Col>
                                    {/* Cột phải: Doanh thu */}
                                    <Col xs={24} lg={12}>
                                        <div className="targets-column">
                                            <div className="targets-column-header doanh-thu">
                                                <span className="column-title">💰 {t('targets.revenue')}</span>
                                            </div>
                                            <Table
                                                columns={branchRevenueColumns}
                                                dataSource={branches.map((branch: Branch) => {
                                                    const targetPeriod = branchMonth ? `${branchYear}-${branchMonth}` : branchYear;
                                                    const branchTargets = targets.filter((t: Target) => t.unitType === 'BRANCH' && t.type === 'DOANH_THU' && t.period === targetPeriod && t.unitId === branch.id);
                                                    const targetValue = branchTargets.reduce((sum: number, t: Target) => sum + (t.targetValue || 0), 0);
                                                    const actual = getBranchMetric(branch.id, 'DOANH_THU');
                                                    return {
                                                        key: branch.id,
                                                        branchId: branch.id,
                                                        branchName: branch.name,
                                                        branchCode: branch.code,
                                                        targetId: branchTargets[0]?.id,
                                                        targetValueDT: targetValue,
                                                        actualValueDT: actual,
                                                        hasTarget: branchTargets.length > 0,
                                                        targetDT: branchTargets[0]
                                                    };
                                                })}
                                                pagination={false}
                                                size="small"
                                                loading={loading}
                                                bordered
                                                summary={(pageData) => {
                                                    const totalTarget = pageData.reduce((sum, t) => sum + (t.targetValueDT || 0), 0);
                                                    const totalActual = pageData.reduce((sum, t) => sum + (t.actualValueDT || 0), 0);
                                                    return (
                                                        <Table.Summary fixed>
                                                            <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                                                                <Table.Summary.Cell index={0}>📊 {t('targets.total')}</Table.Summary.Cell>
                                                                <Table.Summary.Cell index={1} align="right">{formatNumber(totalTarget)}</Table.Summary.Cell>
                                                                <Table.Summary.Cell index={2} align="right">
                                                                    <span style={{ color: getRate(totalActual, totalTarget) >= 50 ? '#52c41a' : '#f5222d' }}>
                                                                        {formatNumber(totalActual)}
                                                                    </span>
                                                                </Table.Summary.Cell>
                                                                <Table.Summary.Cell index={3} align="center">
                                                                    <Progress percent={Math.min(getRate(totalActual, totalTarget), 100)} size="small" format={() => `${getRate(totalActual, totalTarget)}%`} />
                                                                </Table.Summary.Cell>
                                                                <Table.Summary.Cell index={4} />
                                                            </Table.Summary.Row>
                                                        </Table.Summary>
                                                    );
                                                }}
                                            />
                                        </div>
                                    </Col>
                                </Row>
                            )
                        }
                    ]}
                />
            </Card>

            {/* Modal */}
            <Modal
                title={editingTarget ? t('targets.modalTitleEdit') : t('targets.modalTitleAdd')}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
                width={700}
                centered
                okText={editingTarget ? t('targets.update') : t('targets.create')}
                cancelText={t('common.cancel')}
                destroyOnClose
            >
                <Form form={form} layout="vertical">

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="type" label={t('targets.targetType')} rules={[{ required: true, message: t('targets.selectTypeRequired') }]}>
                                <Select placeholder={t('targets.selectType')}>
                                    <Option value="NGUON_VIEC">{t('targets.sourceWorkOption')}</Option>
                                    <Option value="DOANH_THU">{t('targets.revenueOption')}</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="unitType" label={t('targets.scope')} rules={[{ required: true, message: t('targets.selectScopeRequired') }]}>
                                <Select placeholder={t('targets.selectScope')}>
                                    <Option value="GENERAL">{t('targets.scopeGeneral')}</Option>
                                    <Option value="BRANCH">{t('targets.scopeBranch')}</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="periodType" label={t('targets.periodType')} rules={[{ required: true, message: t('targets.selectPeriodTypeRequired') }]}>
                                <Select placeholder={t('targets.selectPeriodType')}>
                                    <Option value="MONTH">{t('targets.month')}</Option>
                                    <Option value="QUARTER">{t('targets.quarter')}</Option>
                                    <Option value="YEAR">{t('targets.year')}</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="period" label={t('targets.period')} rules={[{ required: true, message: t('targets.periodRequired') }]}>
                                <Input placeholder={t('targets.periodPlaceholder')} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.unitType !== curr.unitType}>
                        {({ getFieldValue }) =>
                            getFieldValue('unitType') === 'BRANCH' && (
                                <Form.Item name="unitId" label={t('targets.branch')} rules={[{ required: true, message: t('targets.selectBranchRequired') }]}>
                                    <Select placeholder={t('targets.selectBranch')} showSearch optionFilterProp="children">
                                        {(appConfig?.BRANCHES || branches).map((b: any) => (
                                            <Option key={b.id} value={b.id}>{b.code}</Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            )
                        }
                    </Form.Item>

                    <Form.Item name="targetValue" label={t('targets.targetValue')} rules={[{ required: true, message: t('targets.targetValueRequired') }]}>
                        <InputNumber<number>
                            style={{ width: '100%' }}
                            min={0}
                            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={(displayValue) => {
                                const val = displayValue?.replace(/\$\s?|(,*)/g, '');
                                return val ? parseFloat(val) : 0;
                            }}
                            placeholder="0"
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default Targets;
