import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button, Modal, Form, Select, message, Row, Col, Table, InputNumber, Progress, Card, Tabs, Input, Tooltip, Popconfirm, Space, DatePicker } from 'antd';
import dayjs from 'dayjs';
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
    // Server gắn cờ này cho dòng THUA trong một nhóm chỉ tiêu trùng (nhiều dòng thô
    // quy về cùng một kỳ sau chuẩn hoá). Dòng trùng vẫn được trả về để admin xoá
    // được qua UI, nhưng phải loại khỏi mọi phép tính. Xem routes/targets.js.
    isDuplicate?: boolean;
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
    const [generalYear, setGeneralYear] = useFilterSync('year', dayjs().year().toString());
    const [generalType, setGeneralType] = useState<'NGUON_VIEC' | 'DOANH_THU'>('NGUON_VIEC');

    // Filters for Branch Targets
    const [branchYear, setBranchYear] = useFilterSync('b_year', dayjs().year().toString());
    const [branchMonth, setBranchMonth] = useFilterSync('b_month', dayjs().format('MM'));
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
            if (generalYear && generalYear !== dayjs().year().toString()) {
                filters.push({ key: 'year', label: t('targets.filterYear'), value: generalYear, onRemove: () => setGeneralYear(dayjs().year().toString()) });
            }
        } else {
            if (branchMonth) {
                filters.push({ key: 'b_month', label: `${t('targets.filterMonth')}/${t('targets.filterYear')}`, value: `T${parseInt(branchMonth)}/${branchYear}`, onRemove: () => setBranchMonth('') });
            } else if (branchYear && branchYear !== dayjs().year().toString()) {
                filters.push({ key: 'b_year', label: t('targets.filterYear'), value: branchYear, onRemove: () => setBranchYear(dayjs().year().toString()) });
            }
            if (branchFilter) {
                const br = branches.find((b: any) => b.id === branchFilter);
                filters.push({ key: 'branch', label: t('targets.filterBranch'), value: branchFilter, displayValue: br?.code, onRemove: () => setBranchFilter(undefined) });
            }
        }
        return filters;
    }, [activeTab, generalYear, branchYear, branchMonth, branchFilter, branches, t, setGeneralYear, setBranchYear, setBranchMonth, setBranchFilter]);

    const clearAllFilters = () => {
        const currentYearStr = dayjs().year().toString();
        if (activeTab === 'general') {
            setGeneralYear(currentYearStr);
        } else {
            setBranchYear(currentYearStr);
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
            const defaultPeriod = branchMonth ? `${branchYear}-${branchMonth}` : undefined;
            form.setFieldsValue({
                unitType,
                type: type || 'NGUON_VIEC',
                periodType: 'MONTH',
                period: defaultPeriod,
                unitId: branchId,
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
        // Check if this DOANH_THU has a linked NGUON_VIEC to also delete (GENERAL or BRANCH)
        const isLinkedDT = record.type === 'DOANH_THU';
        const linkedNV = isLinkedDT
            ? targets.find((t: Target) =>
                t.type === 'NGUON_VIEC' &&
                t.periodType === record.periodType &&
                t.period === record.period &&
                // Match scope: GENERAL = same unitType, BRANCH = same branch
                (
                    (record.unitType === 'GENERAL' && (t.unitType === 'GENERAL' || !t.unitType)) ||
                    (record.unitType === 'BRANCH' && t.unitType === 'BRANCH' && t.unitId === record.unitId)
                )
              )
            : null;

        Modal.confirm({
            title: t('targets.confirmDeleteTitle'),
            content: linkedNV
                ? `${t('targets.confirmDeleteContent', { name: record.name })} Chỉ tiêu Nguồn việc liên kết (${new Intl.NumberFormat('vi-VN').format(linkedNV.targetValue)}) cũng sẽ bị xóa.`
                : t('targets.confirmDeleteContent', { name: record.name }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => {
                deleteTarget.mutate(record.id, {
                    onSuccess: (res) => {
                        if (res.success) {
                            // Auto-delete linked NGUON_VIEC
                            if (linkedNV) {
                                deleteTarget.mutate(linkedNV.id);
                            }
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

            // Save primary record
            const primaryRes = await (editingTarget
                ? updateTarget.mutateAsync(payload)
                : createTarget.mutateAsync(payload));

            if (!primaryRes.success) {
                message.error(t('targets.saveFailed') + (primaryRes.error || ''));
                setSubmitting(false);
                return;
            }

            // ===== AUTO-LINK: Khi lưu DOANH_THU → tự tạo/cập nhật NGUON_VIEC (cả GENERAL lẫn BRANCH) =====
            // POST /targets upsert theo khoá nghiệp vụ (type + periodType + period +
            // unitType + unitId) nên cứ gửi thẳng. Trước đây chỗ này tự dò bản NV hiện
            // có bằng .find() trên mảng `targets` phía client; mảng đó là ảnh chụp
            // TRƯỚC mutation nên lưu hai lần liên tiếp — hoặc hai người cùng lúc — sẽ
            // không thấy bản cũ và tạo ra dòng Nguồn việc thứ hai cho cùng một kỳ.
            if (values.type === 'DOANH_THU') {
                const branchForLink = values.unitType === 'BRANCH'
                    ? branches.find((b: any) => b.id === values.unitId)
                    : null;

                await createTarget.mutateAsync({
                    name: `Nguồn việc - ${values.period}`,
                    type: 'NGUON_VIEC',
                    unitType: values.unitType,
                    periodType: values.periodType,
                    period: values.period,
                    targetValue: Math.round(values.targetValue * 1.2),
                    unitId: values.unitType === 'BRANCH' ? values.unitId : undefined,
                    unitName: branchForLink?.name ?? t('targets.company')
                });
            }
            // ===== END AUTO-LINK =====


            message.success(editingTarget ? t('targets.updateSuccess') : t('targets.createSuccess'));
            setIsModalVisible(false);
            setSubmitting(false);
        } catch (error) {
            message.error(t('targets.saveFailed'));
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
        // Bỏ dòng trùng: dữ liệu di cư từ Google Sheets có nhiều dòng thô quy về
        // cùng một chỉ tiêu (period='' và period='2026' đều là YEAR/2026). Server
        // gắn cờ isDuplicate cho dòng thua theo đúng quy tắc mà Dashboard dùng
        // (_targetNormalize.js:pickWinner) — không lọc ở đây thì find() lấy dòng
        // đầu theo created_at DESC và hai màn hình ra hai số khác nhau.
        const filtered = targets.filter((t: Target) =>
            (t.unitType === 'GENERAL' || !t.unitType) &&
            t.type === targetType &&
            !t.isDuplicate
        );

        const rows: any[] = [];

        // Quarters with their months
        const quarterMonths: { [key: number]: number[] } = {
            1: [1, 2, 3],
            2: [4, 5, 6],
            3: [7, 8, 9],
            4: [10, 11, 12]
        };

        // ── Year row ─────────────────────────────────────────────────────────
        //
        // QUAN TRỌNG — thứ tự trong object literal: spread `...(xxxTarget || {})`
        // phải nằm TRƯỚC các field tính toán. Trước đây nó nằm cuối, mà spread sau
        // thì thắng, nên `targetValue` và `actualValue` vừa tính xong lập tức bị
        // ghi đè bằng giá trị thô của bản ghi target. Biểu hiện: cột "Thực hiện"
        // hiện số lấy từ /targets (SQL có JOIN contracts) thay vì từ
        // /dashboard/general-performance, và hai số chỉ bằng nhau chừng nào chưa
        // có hoá đơn nào thiếu contract_id.
        //
        // Vẫn phải giữ spread: handleEdit(record) cần name/createdAt/unitId… từ
        // bản ghi gốc.
        //
        // Chỉ tiêu NĂM/QUÝ lấy THẲNG từ bản ghi tương ứng trong DB, không cộng dồn
        // từ các tháng — cùng cách dashboard.js:getGeneralTarget đọc, nên card KPI
        // và bảng này luôn ra cùng một số. Hệ quả có chủ ý: dòng Năm KHÔNG bắt buộc
        // bằng tổng 4 dòng Quý; mỗi kỳ là một bản ghi độc lập.
        const yearTarget = filtered.find((t: Target) => t.periodType === 'YEAR' && t.period === generalYear);
        const yearActual = getGeneralActual(targetType, 'YEAR', generalYear, yearTarget?.actualValue || 0);
        rows.push({
            ...(yearTarget || {}),
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
        });

        // ── Quarter + Month rows ─────────────────────────────────────────────
        [1, 2, 3, 4].forEach(q => {
            const quarterPeriod = `${generalYear}-Q${q}`;
            const quarterTarget = filtered.find((t: Target) => t.periodType === 'QUARTER' && t.period === quarterPeriod);
            const quarterActual = getGeneralActual(targetType, 'QUARTER', quarterPeriod, quarterTarget?.actualValue || 0);
            rows.push({
                ...(quarterTarget || {}),
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
            });

            quarterMonths[q].forEach(m => {
                const monthPeriod = `${generalYear}-${String(m).padStart(2, '0')}`;
                const monthTarget = filtered.find((t: Target) => t.periodType === 'MONTH' && t.period === monthPeriod);
                const monthActual = getGeneralActual(targetType, 'MONTH', monthPeriod, monthTarget?.actualValue || 0);
                rows.push({
                    ...(monthTarget || {}),
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
                });
            });
        });

        return rows;
    };


    // ========== BRANCH TARGETS DATA ==========
    const getBranchMetric = useCallback((branchId: string, type: 'NGUON_VIEC' | 'DOANH_THU') => {
        const perf = branchActuals[branchId];
        if (!perf) return 0;
        const metric = type === 'NGUON_VIEC' ? perf.sourceWork : perf.revenue;

        if (branchMonth) {
            const m = parseInt(branchMonth);
            return metric.months[m] || 0;
        } else {
            return metric.total || 0;
        }
    }, [branchActuals, branchMonth]);

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
            render: (val: number, record: any) => {
                const rate = getRate(val, record.targetValueDT);
                return (
                    <span style={{ color: rate >= 100 ? '#52c41a' : rate >= 50 ? '#faad14' : '#f5222d' }}>
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

    // Memoized Branch Data to improve performance and support filtering
    const filteredBranches = useMemo(() => {
        return branches.filter((b: any) => !branchFilter || b.id === branchFilter);
    }, [branches, branchFilter]);

    // Merged dataset: 1 row per branch, contains both NV and DT data → ensures row height sync
    const branchCombinedData = useMemo(() => {
        return filteredBranches.map((branch: Branch) => {
            const targetPeriod = branchMonth ? `${branchYear}-${branchMonth}` : branchYear;

            // !isDuplicate: reduce() bên dưới cộng dồn, nên dòng trùng sẽ nhân đôi chỉ tiêu
            const nvTargets = targets.filter((t: Target) => t.unitType === 'BRANCH' && t.type === 'NGUON_VIEC' && t.period === targetPeriod && t.unitId === branch.id && !t.isDuplicate);
            const dtTargets = targets.filter((t: Target) => t.unitType === 'BRANCH' && t.type === 'DOANH_THU' && t.period === targetPeriod && t.unitId === branch.id && !t.isDuplicate);

            return {
                key: branch.id,
                branchId: branch.id,
                branchName: branch.name,
                branchCode: branch.code,
                // Nguồn việc
                targetValueNV: nvTargets.reduce((sum: number, t: Target) => sum + (t.targetValue || 0), 0),
                actualValueNV: getBranchMetric(branch.id, 'NGUON_VIEC'),
                targetNV: nvTargets[0],
                // Doanh thu
                targetValueDT: dtTargets.reduce((sum: number, t: Target) => sum + (t.targetValue || 0), 0),
                actualValueDT: getBranchMetric(branch.id, 'DOANH_THU'),
                targetDT: dtTargets[0],
            };
        });
    }, [filteredBranches, targets, branchMonth, branchYear, getBranchMetric]);

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
                {activeTab === 'general' ? (
                    <Col xs={24} sm={12} md={6}>
                        <Select
                            value={generalYear}
                            onChange={setGeneralYear}
                            style={{ width: '100%' }}
                            placeholder={t('targets.filterYear')}
                            suffixIcon={<FilterOutlined />}
                        >
                            {yearOptions.map((y: string) => <Option key={y} value={y}>{t('targets.year')} {y}</Option>)}
                        </Select>
                    </Col>
                ) : (
                    <>
                        <Col xs={24} sm={12} md={6}>
                            <DatePicker
                                picker="month"
                                format="MM/YYYY"
                                value={branchMonth ? dayjs(`${branchYear}-${branchMonth}`, 'YYYY-MM') : null}
                                onChange={(date) => {
                                    if (date) {
                                        setBranchYear(date.format('YYYY'));
                                        setBranchMonth(date.format('MM'));
                                    } else {
                                        setBranchMonth('');
                                    }
                                }}
                                style={{ width: '100%' }}
                                placeholder={`${t('targets.filterMonth')}/${t('targets.filterYear')}`}
                                allowClear
                            />
                        </Col>
                        <Col xs={24} sm={12} md={4}>
                            <Select
                                value={branchYear}
                                onChange={(v) => { setBranchYear(v); setBranchMonth(''); }}
                                style={{ width: '100%' }}
                                placeholder={t('targets.filterYear')}
                                suffixIcon={<FilterOutlined />}
                            >
                                {yearOptions.map((y: string) => <Option key={y} value={y}>{t('targets.year')} {y}</Option>)}
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
                                <Table
                                    columns={[
                                        {
                                            title: t('targets.colBranch'),
                                            dataIndex: 'branchCode',
                                            key: 'branchCode',
                                            fixed: 'left' as const,
                                            width: 130,
                                            render: (code: string) => (
                                                <span>
                                                    <BankOutlined style={{ marginRight: 6, color: '#1890ff' }} />
                                                    <strong>{code}</strong>
                                                </span>
                                            )
                                        },
                                        // ── NGUỒN VIỆC group ──
                                        {
                                            title: <span>📋 {t('targets.sourceWork')}</span>,
                                            children: [
                                                {
                                                    title: t('targets.colTarget'),
                                                    dataIndex: 'targetValueNV',
                                                    key: 'targetValueNV',
                                                    align: 'right' as const,
                                                    width: 110,
                                                    render: (val: number) => <strong>{formatNumber(val)}</strong>
                                                },
                                                {
                                                    title: t('targets.colActual'),
                                                    dataIndex: 'actualValueNV',
                                                    key: 'actualValueNV',
                                                    align: 'right' as const,
                                                    width: 110,
                                                    render: (val: number, record: any) => {
                                                        const rate = getRate(val, record.targetValueNV);
                                                        return <span style={{ color: rate >= 100 ? '#52c41a' : rate >= 50 ? '#faad14' : '#f5222d' }}>{formatNumber(val)}</span>;
                                                    }
                                                },
                                                {
                                                    title: t('targets.colRate'),
                                                    key: 'rateNV',
                                                    align: 'center' as const,
                                                    width: 120,
                                                    render: (_: any, record: any) => {
                                                        const rate = getRate(record.actualValueNV, record.targetValueNV);
                                                        return <Progress percent={Math.min(rate, 100)} size="small" status={rate >= 100 ? 'success' : rate >= 50 ? 'active' : 'exception'} format={() => `${rate}%`} />;
                                                    }
                                                },
                                                {
                                                    title: '',
                                                    key: 'actionsNV',
                                                    width: 80,
                                                    render: (_: any, record: any) => (
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                            {record.targetNV ? (
                                                                <VcmActionGroup
                                                                    onEdit={canEdit ? () => handleEdit(record.targetNV) : undefined}
                                                                    onDelete={canEdit ? () => handleDelete(record.targetNV) : undefined}
                                                                    canEdit={canEdit}
                                                                    canDelete={canEdit}
                                                                    deleteConfirmTitle={t('targets.deleteConfirm')}
                                                                />
                                                            ) : (
                                                                canEdit && (
                                                                    <Button type="link" size="small" onClick={() => handleCreate('BRANCH', record.branchId, record.branchName, 'NGUON_VIEC')}>
                                                                        {t('targets.addInline')}
                                                                    </Button>
                                                                )
                                                            )}
                                                        </div>
                                                    )
                                                }
                                            ]
                                        },
                                        // ── DOANH THU group ──
                                        {
                                            title: <span>💰 {t('targets.revenue')}</span>,
                                            children: [
                                                {
                                                    title: t('targets.colTarget'),
                                                    dataIndex: 'targetValueDT',
                                                    key: 'targetValueDT',
                                                    align: 'right' as const,
                                                    width: 110,
                                                    render: (val: number) => <strong>{formatNumber(val)}</strong>
                                                },
                                                {
                                                    title: t('targets.colActual'),
                                                    dataIndex: 'actualValueDT',
                                                    key: 'actualValueDT',
                                                    align: 'right' as const,
                                                    width: 110,
                                                    render: (val: number, record: any) => {
                                                        const rate = getRate(val, record.targetValueDT);
                                                        return <span style={{ color: rate >= 100 ? '#52c41a' : rate >= 50 ? '#faad14' : '#f5222d' }}>{formatNumber(val)}</span>;
                                                    }
                                                },
                                                {
                                                    title: t('targets.colRate'),
                                                    key: 'rateDT',
                                                    align: 'center' as const,
                                                    width: 120,
                                                    render: (_: any, record: any) => {
                                                        const rate = getRate(record.actualValueDT, record.targetValueDT);
                                                        return <Progress percent={Math.min(rate, 100)} size="small" status={rate >= 100 ? 'success' : rate >= 50 ? 'active' : 'exception'} format={() => `${rate}%`} />;
                                                    }
                                                },
                                                {
                                                    title: '',
                                                    key: 'actionsDT',
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
                                            ]
                                        }
                                    ]}
                                    dataSource={branchCombinedData}
                                    pagination={false}
                                    size="small"
                                    loading={loading}
                                    bordered
                                    scroll={{ x: 'max-content' }}
                                    summary={(pageData) => {
                                        const totalNVTarget = pageData.reduce((sum, r) => sum + (r.targetValueNV || 0), 0);
                                        const totalNVActual = pageData.reduce((sum, r) => sum + (r.actualValueNV || 0), 0);
                                        const totalDTTarget = pageData.reduce((sum, r) => sum + (r.targetValueDT || 0), 0);
                                        const totalDTActual = pageData.reduce((sum, r) => sum + (r.actualValueDT || 0), 0);
                                        const rateNV = getRate(totalNVActual, totalNVTarget);
                                        const rateDT = getRate(totalDTActual, totalDTTarget);
                                        return (
                                            <Table.Summary fixed>
                                                <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 600 }}>
                                                    <Table.Summary.Cell index={0}>📊 {t('targets.total')}</Table.Summary.Cell>
                                                    <Table.Summary.Cell index={1} align="right">{formatNumber(totalNVTarget)}</Table.Summary.Cell>
                                                    <Table.Summary.Cell index={2} align="right"><span style={{ color: rateNV >= 50 ? '#52c41a' : '#f5222d' }}>{formatNumber(totalNVActual)}</span></Table.Summary.Cell>
                                                    <Table.Summary.Cell index={3} align="center"><Progress percent={Math.min(rateNV, 100)} size="small" format={() => `${rateNV}%`} /></Table.Summary.Cell>
                                                    <Table.Summary.Cell index={4} />
                                                    <Table.Summary.Cell index={5} align="right">{formatNumber(totalDTTarget)}</Table.Summary.Cell>
                                                    <Table.Summary.Cell index={6} align="right"><span style={{ color: rateDT >= 50 ? '#52c41a' : '#f5222d' }}>{formatNumber(totalDTActual)}</span></Table.Summary.Cell>
                                                    <Table.Summary.Cell index={7} align="center"><Progress percent={Math.min(rateDT, 100)} size="small" format={() => `${rateDT}%`} /></Table.Summary.Cell>
                                                    <Table.Summary.Cell index={8} />
                                                </Table.Summary.Row>
                                            </Table.Summary>
                                        );
                                    }}
                                />
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
                            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.periodType !== curr.periodType}>
                                {({ getFieldValue }) => {
                                    const pt = getFieldValue('periodType');
                                    if (pt === 'YEAR') return (
                                        <Form.Item name="period" label={t('targets.filterYear')} rules={[{ required: true, message: t('targets.periodRequired') }]}>
                                            <Select placeholder={t('targets.filterYear')}>
                                                {yearOptions.map((y: string) => <Option key={y} value={y}>{y}</Option>)}
                                            </Select>
                                        </Form.Item>
                                    );
                                    if (pt === 'QUARTER') return (
                                        <Form.Item name="period" label={t('targets.quarter')} rules={[{ required: true, message: t('targets.periodRequired') }]}>
                                            <Select placeholder="Chọn quý" showSearch>
                                                {yearOptions.flatMap((y: string) => [1, 2, 3, 4].map(q => (
                                                    <Option key={`${y}-Q${q}`} value={`${y}-Q${q}`}>Q{q} / {y}</Option>
                                                )))}
                                            </Select>
                                        </Form.Item>
                                    );
                                    if (pt === 'MONTH') return (
                                        <Form.Item
                                            name="period"
                                            label={`${t('targets.filterMonth')} / ${t('targets.filterYear')}`}
                                            rules={[{ required: true, message: t('targets.periodRequired') }]}
                                            getValueFromEvent={(date: any) => date ? date.format('YYYY-MM') : undefined}
                                            getValueProps={(value: string) => ({ value: value ? dayjs(value, 'YYYY-MM') : undefined })}
                                        >
                                            <DatePicker picker="month" format="MM/YYYY" style={{ width: '100%' }} placeholder="Chọn tháng/năm" />
                                        </Form.Item>
                                    );
                                    return (
                                        <Form.Item name="period" label={t('targets.period')} rules={[{ required: true, message: t('targets.periodRequired') }]}>
                                            <Input placeholder={t('targets.periodPlaceholder')} />
                                        </Form.Item>
                                    );
                                }}
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

                    <Form.Item noStyle shouldUpdate={(prev, curr) => prev.targetValue !== curr.targetValue || prev.type !== curr.type || prev.unitType !== curr.unitType}>
                        {({ getFieldValue }) => {
                            const val = getFieldValue('targetValue');
                            const type = getFieldValue('type');
                            const unitType = getFieldValue('unitType');
                            if (!val) return null;

                            // Show auto-link banner when entering DOANH_THU (both GENERAL and BRANCH)
                            if (type === 'DOANH_THU') {
                                const nvValue = Math.round(val * 1.2);
                                return (
                                    <div style={{
                                        marginTop: -16,
                                        marginBottom: 16,
                                        padding: '8px 12px',
                                        background: 'linear-gradient(135deg, #e6f4ff 0%, #f0f9eb 100%)',
                                        border: '1px solid #91caff',
                                        borderRadius: 8,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8
                                    }}>
                                        <span style={{ fontSize: 16 }}>🔗</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '12px', color: '#1677ff', fontWeight: 600 }}>
                                                Tự động lưu Nguồn việc liên kết
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#333' }}>
                                                Nguồn việc = <strong style={{ color: '#1677ff' }}>{new Intl.NumberFormat('vi-VN').format(nvValue)}</strong>
                                                <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>(Doanh thu × 1.2)</span>
                                            </div>
                                        </div>
                                        <span style={{
                                            background: '#52c41a',
                                            color: '#fff',
                                            fontSize: 10,
                                            padding: '2px 6px',
                                            borderRadius: 10,
                                            fontWeight: 600,
                                            whiteSpace: 'nowrap'
                                        }}>AUTO</span>
                                    </div>
                                );
                            }

                            // NGUON_VIEC: simple hint only (no auto-link in reverse)
                            if (type === 'NGUON_VIEC') {
                                return (
                                    <div style={{ marginTop: -20, marginBottom: 16, fontSize: '12px', color: '#1890ff', fontStyle: 'italic', paddingLeft: 4 }}>
                                        💡 {t('targets.hintRevenue')}: <strong>{new Intl.NumberFormat('vi-VN').format(val / 1.2)}</strong>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default Targets;
