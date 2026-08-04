import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Card,
    Table,
    Tabs,
    Button,
    Input,
    Select,
    DatePicker,
    Tag,
    Space,
    Modal,
    Form,

    InputNumber,
    message,
    Row,
    Col,
    Upload,
    Tooltip,
    Progress,
    Dropdown,
    List,
    Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import {
    PlusOutlined,
    SearchOutlined,
    UploadOutlined,
    DownloadOutlined,
    DownOutlined,
    FilePdfOutlined,
    CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { apiService } from '../services/api';
import type { Contract, Province } from '../types';
import './Contracts.css';


import ContractDetailModal from './ContractDetailModal';
import AllInvoiceList from './AllInvoiceList';
import { useFilterSync, useFilterSyncDate } from '../hooks/useFilterSync';
import { usePermissions } from '../hooks/usePermissions';
import { useContracts, useContractMutations, CONTRACT_KEYS } from '../hooks/useContracts';
import { useAppConfig } from '../hooks/useAppConfig';

import { FilterChips } from '../components/FilterChips';
import { useTranslation } from 'react-i18next';
import { VcmFilterBar } from '../components/VcmFilterBar';
import { VcmActionGroup } from '../components/VcmActionGroup';
import { normalizeId, toCsvCell } from '../utils/common';
import { BRAND_COLORS } from '../styles/brandIdentity';

const { Option } = Select;
const { Text } = Typography;

const DATE_FORMAT = 'DD/MM/YYYY';

/** Ngày trong DB cho phép NULL -> tránh in ra "Invalid Date". */
const formatDate = (date?: string | null): string =>
    date && dayjs(date).isValid() ? dayjs(date).format(DATE_FORMAT) : '—';

const Contracts: React.FC = () => {
    const { t } = useTranslation();
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.contracts === 'EDIT';
    const canView = isAdmin || permissions.contracts === 'VIEW' || permissions.contracts === 'EDIT';

    const queryClient = useQueryClient();

    // Tab state synced with URL
    const [activeTab, setActiveTab] = useFilterSync('tab', 'contracts');

    // React Query Hooks
    const { data: contracts = [], isLoading: isLoadingContracts } = useContracts(canView);
    const { data: appConfig } = useAppConfig(canView);
    const { createContract, updateContract, deleteContract } = useContractMutations();

    // Derived State
    const [branches, setBranches] = useState<Province[]>([]);

    // Create/Edit Modal
    const [modalVisible, setModalVisible] = useState(false);
    const [editingContract, setEditingContract] = useState<Contract | null>(null);
    const [fileList, setFileList] = useState<any[]>([]);
    const [existingFiles, setExistingFiles] = useState<string[]>([]);

    // Detail Modal
    const [detailVisible, setDetailVisible] = useState(false);
    const [detailContract, setDetailContract] = useState<Contract | null>(null);

    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const loading = isLoadingContracts || submitting;

    // Giá trị chờ nạp vào Form. Modal dùng destroyOnHidden nên Form chưa mount
    // lúc bấm "Sửa" -> phải set trong afterOpenChange, không set trước khi mở.
    const [pendingValues, setPendingValues] = useState<Record<string, unknown> | null>(null);

    const isBlocked = permissions.contracts === 'NO_ACCESS' && !isAdmin;

    // LƯU Ý: không đặt early return ở đây. Mọi hook phải được gọi ở mọi lần render,
    // nếu không React ném "Rendered fewer hooks than expected". Nhánh chặn truy cập
    // nằm ngay trước phần return JSX ở cuối component.

    // Filters
    // Filters (Synced with URL)
    const [searchText, setSearchText] = useFilterSync('q', '');
    const [selectedProvince, setSelectedProvince] = useFilterSync<string | undefined>('branch', undefined);
    const [selectedField, setSelectedField] = useFilterSync<string | undefined>('field', undefined);
    const [selectedMonth, setSelectedMonth] = useFilterSyncDate('month', null);

    // Active Filters List for Chips
    const activeFilters = useMemo(() => [
        { key: 'q', label: t('contracts.filterSearch'), value: searchText, onRemove: () => setSearchText('') },
        {
            key: 'branch',
            label: t('contracts.filterBranch'),
            value: selectedProvince,
            // Phải qua normalizeId như mọi chỗ khác, nếu không chip hiện trống
            // khi chi nhánh lưu bằng code hoặc id có số 0 đứng đầu.
            displayValue: branches.find(b => normalizeId(b.id) === normalizeId(selectedProvince))?.code,
            onRemove: () => setSelectedProvince(undefined)
        },
        { key: 'field', label: t('contracts.filterField'), value: selectedField, onRemove: () => setSelectedField(undefined) },
        {
            key: 'month',
            label: t('contracts.filterMonth'),
            value: selectedMonth,
            displayValue: selectedMonth?.format('MM/YYYY'),
            onRemove: () => setSelectedMonth(null)
        }
    ], [searchText, selectedProvince, selectedField, selectedMonth, branches, t, setSearchText, setSelectedProvince, setSelectedField, setSelectedMonth]);

    const clearAllFilters = useCallback(() => {
        setSearchText('');
        setSelectedProvince(undefined);
        setSelectedField(undefined);
        setSelectedMonth(null);
    }, [setSearchText, setSelectedProvince, setSelectedField, setSelectedMonth]);

    useEffect(() => {
        if (appConfig?.BRANCHES) {
            setBranches(appConfig.BRANCHES);
        }
    }, [appConfig]);



    const handleCreate = useCallback(() => {
        setEditingContract(null);
        form.resetFields();
        setPendingValues(null);
        setFileList([]);
        setExistingFiles([]);
        setModalVisible(true);
    }, [form]);

    const handleEdit = useCallback((record: Contract) => {
        setEditingContract(record);
        // Không gọi form.setFieldsValue ở đây: Modal dùng destroyOnHidden nên Form
        // chưa mount, giá trị sẽ mất và antd cảnh báo "useForm is not connected".
        setPendingValues({
            ...record,
            // Ô nhập là số TRƯỚC thuế; số sau thuế là dẫn xuất, server tự tính lại.
            taxRate: record.taxRate ?? 5,
            startDate: record.startDate && dayjs(record.startDate).isValid() ? dayjs(record.startDate) : null,
            endDate: record.endDate && dayjs(record.endDate).isValid() ? dayjs(record.endDate) : null,
        });
        setFileList([]);
        // Parse existing files from the record
        const existing = record.fileUrl ? record.fileUrl.split('\n').filter((f: string) => f.trim()) : [];
        setExistingFiles(existing);
        setModalVisible(true);
    }, []);

    const handleDetail = useCallback((record: Contract) => {
        setDetailContract(record);
        setDetailVisible(true);
    }, []);

    const handleDelete = useCallback((id: string) => {
        deleteContract.mutate(id, {
            onSuccess: (res) => {
                if (res.success) {
                    message.success(t('contracts.deleteSuccess'));
                } else {
                    message.error(t('contracts.deleteError'));
                }
            },
            onError: () => {
                message.error(t('contracts.deleteError'));
            }
        });
    }, [deleteContract, t]);

    const handleSubmit = async (values: any) => {
        try {
            setSubmitting(true);
            let uploadedUrls = '';

            // Handle file upload - upload files mới
            const newFiles = fileList.filter(file => file.originFileObj || file instanceof File);
            if (newFiles.length > 0) {
                try {
                    const filesToUpload = newFiles.map(file => file.originFileObj || file);
                    const uploadRes = await apiService.uploadContractFiles(filesToUpload);
                    if (uploadRes.success) {
                        uploadedUrls = uploadRes.data?.urls?.join('\n') || '';
                    } else {
                        message.error(t('contracts.uploadError') + uploadRes.error);
                        setSubmitting(false);
                        return;
                    }
                } catch (uploadError) {
                    console.error(uploadError);
                    message.error(t('contracts.uploadProcessError'));
                    setSubmitting(false);
                    return;
                }
            }

            // Combine kept existing files + newly uploaded URLs
            const existingUrlsStr = existingFiles.join('\n');
            let finalFileUrls = '';
            if (uploadedUrls && existingUrlsStr) {
                finalFileUrls = existingUrlsStr + '\n' + uploadedUrls;
            } else {
                finalFileUrls = uploadedUrls || existingUrlsStr;
            }

            const data = {
                ...values,
                startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : null,
                endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : null,
                fileUrls: finalFileUrls,
            };

            const onSuccess = (res: any) => {
                if (res.success) {
                    message.success(editingContract ? t('contracts.updateSuccess') : t('contracts.createSuccess'));
                    setModalVisible(false);
                } else {
                    message.error(res.error || t('contracts.submitError'));
                }
                setSubmitting(false);
            };

            const onError = () => {
                message.error(t('contracts.submitError'));
                setSubmitting(false);
            };

            if (editingContract) {
                updateContract.mutate({ id: editingContract.id, data }, { onSuccess, onError });
            } else {
                createContract.mutate(data, { onSuccess, onError });
            }
        } catch (error) {
            message.error(t('contracts.submitError'));
            setSubmitting(false);
        }
    };

    const columns: ColumnsType<Contract> = useMemo(() => [
        {
            title: t('contracts.colCode'),
            dataIndex: 'code',
            key: 'code',
            width: 120,
            fixed: 'left',
            align: 'center' as const,
            render: (text: string, record: Contract) => (
                <a onClick={() => handleDetail(record)} className="font-semibold text-blue-600 hover:underline" style={{ fontWeight: 600 }}>
                    {text}
                </a>
            ),
        },
        {
            title: t('contracts.colName'),
            dataIndex: 'name',
            key: 'name',
            width: 300,
            onCell: () => ({ style: { whiteSpace: 'normal', wordBreak: 'break-word' } }),
            render: (text: string, record: Contract) => (
                <a onClick={() => handleDetail(record)} className="text-gray-900 hover:text-blue-600" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    {text}
                </a>
            ),
        },
        {
            title: t('contracts.colBranch'),
            dataIndex: 'provinceId',
            key: 'provinceId',
            width: 100,
            align: 'center' as const,
            render: (provinceId: string) => {
                const normalizedSearch = normalizeId(provinceId);
                const branch = branches.find(
                    (p) => normalizeId(p.id) === normalizedSearch ||
                        normalizeId(p.code) === normalizedSearch
                );
                return <Text strong style={{ color: BRAND_COLORS.primary }}>{branch?.code || provinceId}</Text>;
            },
        },
        {
            title: t('contracts.colField'),
            dataIndex: 'businessField',
            key: 'businessField',
            width: 90,
            align: 'center' as const,
            render: (field: string) => {
                const colors = { ALL: 'purple', B2B: 'blue', B2C: 'green' };
                return <Tag color={colors[field as keyof typeof colors]} style={{ margin: 0 }}>{field}</Tag>;
            },
        },
        {
            // Trước thuế = số đi vào chỉ tiêu Nguồn việc, nên để nổi bật hơn cột sau thuế
            title: t('contracts.colValueBeforeTax'),
            dataIndex: 'valueBeforeTax',
            key: 'valueBeforeTax',
            width: 150,
            align: 'right' as const,
            render: (value: number) => <Text strong>{(value || 0).toLocaleString('vi-VN')}</Text>,
        },
        {
            title: t('contracts.colValue'),
            dataIndex: 'value',
            key: 'value',
            width: 150,
            align: 'right' as const,
            render: (value: number, record: Contract) => (
                <Text type="secondary">
                    {(value || 0).toLocaleString('vi-VN')}
                    <div style={{ fontSize: 11 }}>VAT {record.taxRate ?? 5}%</div>
                </Text>
            ),
        },
        {
            title: t('contracts.colProgress'),
            dataIndex: 'progress',
            key: 'progress',
            width: 100,
            render: (progress: number) => (
                <Progress percent={progress} size="small" status="active" />
            ),
        },
        {
            title: t('contracts.colStartDate'),
            dataIndex: 'startDate',
            key: 'startDate',
            width: 110,
            align: 'center' as const,
            render: (date: string) => formatDate(date),
        },
        {
            title: t('contracts.colEndDate'),
            dataIndex: 'endDate',
            key: 'endDate',
            width: 110,
            align: 'center' as const,
            render: (date: string) => formatDate(date),
        },
        {
            title: t('contracts.colStatus'),
            dataIndex: 'status',
            key: 'status',
            width: 110,
            align: 'center' as const,
            render: (status: string) => {
                let color = 'default';
                let text = status;

                if (status === 'TODO') {
                    color = 'orange';
                    text = t('contracts.statusTodo');
                } else if (status === 'INPROCESS' || status === 'IN_PROGRESS') {
                    color = 'blue';
                    text = t('contracts.statusInProgress');
                } else if (status === 'DONE') {
                    color = 'green';
                    text = t('contracts.statusDone');
                } else if (appConfig?.STATUS && appConfig.STATUS[status]) {
                    text = appConfig.STATUS[status];
                }

                return <Tag color={color} style={{ margin: 0 }}>{text}</Tag>;
            },
        },
        {
            title: t('contracts.colActions'),
            key: 'action',
            width: 100,
            fixed: 'right',
            align: 'center' as const,
            render: (_: any, record: Contract) => (
                <VcmActionGroup
                    onView={() => handleDetail(record)}
                    onEdit={() => handleEdit(record)}
                    onDelete={() => handleDelete(record.id)}
                    canEdit={canEdit}
                    canDelete={canEdit}
                    deleteConfirmTitle={t('contracts.confirmDelete')}
                />
            ),
        },
    ], [t, branches, appConfig, canEdit, handleDetail, handleEdit, handleDelete]);

    const filteredContracts = useMemo(() => contracts.filter((contract: Contract) => {
        const matchSearch =
            !searchText ||
            contract.code.toLowerCase().includes(searchText.toLowerCase()) ||
            contract.name.toLowerCase().includes(searchText.toLowerCase());

        const contractProvinceId = normalizeId(contract.provinceId);
        const filterProvinceId = normalizeId(selectedProvince);

        // Resolve contract branch object to handle both ID and Code storage
        const contractBranch = branches.find((b: Province) =>
            normalizeId(b.id) === contractProvinceId ||
            normalizeId(b.code) === contractProvinceId
        );

        const matchProvince = !selectedProvince || selectedProvince === 'ALL' ||
            contractProvinceId === filterProvinceId ||
            (contractBranch && normalizeId(contractBranch.id) === filterProvinceId);

        const matchField = !selectedField || selectedField === 'ALL' || contract.businessField === selectedField;


        let matchMonth = true;
        if (selectedMonth) {
            const contractDate = dayjs(contract.startDate);
            matchMonth = contractDate.isSame(selectedMonth, 'month') && contractDate.isSame(selectedMonth, 'year');
        }

        return matchSearch && matchProvince && matchField && matchMonth;
    }).sort((a: Contract, b: Contract) => {
        // Default sort: most recent startDate first (closest to today)
        return dayjs(b.startDate).valueOf() - dayjs(a.startDate).valueOf();
    }), [contracts, searchText, selectedProvince, branches, selectedField, selectedMonth]);

    const handleExport = () => {
        const headers = [
            t('contracts.colCode'),
            t('contracts.colName'),
            t('contracts.colBranch'),
            t('contracts.colField'),
            t('contracts.colValueBeforeTax'),
            t('contracts.colValue'),
            t('contracts.colProgress'),
            t('contracts.colStartDate'),
            t('contracts.colEndDate'),
            t('contracts.colStatus')
        ];

        const csvContent = filteredContracts.map((c: Contract) => {
            const contractProvId = normalizeId(c.provinceId);
            const branch = branches.find((p: Province) =>
                normalizeId(p.id) === contractProvId ||
                normalizeId(p.code) === contractProvId
            );
            const branchCode = branch?.code || contractProvId;

            const statusText = (appConfig?.STATUS && appConfig.STATUS[c.status === 'INPROCESS' ? 'IN_PROGRESS' : c.status]) || c.status;

            return [
                toCsvCell(c.code),
                toCsvCell(c.name),
                toCsvCell(branchCode),
                toCsvCell(c.businessField),
                c.valueBeforeTax,
                c.value,
                c.progress || 0,
                toCsvCell(formatDate(c.startDate)),
                toCsvCell(formatDate(c.endDate)),
                toCsvCell(statusText)
            ].join(',');
        });

        const csvString = '\uFEFF' + [headers.join(','), ...csvContent].join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `DS_HopDong_${dayjs().format('DDMMYYYY')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportInvoices = async () => {
        try {
            setSubmitting(true);
            const response = await apiService.getAllInvoices();
            if (response.success) {
                const allInvoices = response.data ?? [];
                // Filter invoices based on currently filtered contracts
                const filteredContractIds = new Set(filteredContracts.map(c => String(c.id)));
                const filteredInvoices = allInvoices.filter(inv => filteredContractIds.has(String(inv.contractId)));

                const headers = [
                    t('invoices.exportInvoiceNumber'),
                    t('invoices.exportContractCode'),
                    t('invoices.exportContractName'),
                    t('invoices.exportInstallment'),
                    t('invoices.exportValueBeforeTax'),
                    t('invoices.exportInvoiceValue'),
                    t('invoices.exportPaymentValue'),
                    t('invoices.exportIssuedDate'),
                    t('invoices.exportCreatedDate')
                ];

                const contractMap = new Map(filteredContracts.map(c => [String(c.id), c]));

                const csvContent = filteredInvoices.map((inv: any) => {
                    const contract = contractMap.get(String(inv.contractId));
                    return [
                        toCsvCell(inv.invoiceNumber),
                        toCsvCell(contract?.code || ''),
                        toCsvCell(contract?.name || ''),
                        toCsvCell(inv.installment),
                        Number(inv.valueBeforeTax) || 0,
                        Number(inv.value) || 0,
                        Number(inv.paidAmount) || 0,
                        toCsvCell(formatDate(inv.issuedDate)),
                        toCsvCell(formatDate(inv.createdAt))
                    ].join(',');
                });

                const csvString = '\uFEFF' + [headers.join(','), ...csvContent].join('\n');
                const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', `DS_HoaDon_${dayjs().format('DDMMYYYY')}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                message.error(t('contracts.loadError'));
            }
        } catch (error) {
            console.error(error);
            message.error(t('contracts.loadError'));
        } finally {
            setSubmitting(false);
        }
    };

    const exportItems: MenuProps['items'] = [
        {
            key: 'contracts',
            label: t('contracts.exportContracts'),
            onClick: handleExport,
        },
        {
            key: 'invoices',
            label: t('contracts.exportInvoices'),
            onClick: handleExportInvoices,
        },
    ];

    // Chặn truy cập: đặt SAU toàn bộ hook để số hook không đổi giữa các lần render.
    if (isBlocked) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>{t('contracts.noAccess')}</h2>
                <p>{t('contracts.noAccessDesc')}</p>
            </div>
        );
    }

    return (
        <div className="vcm-page-container">
            {/* Premium Header - Standardized across the app */}
            <div className="vcm-premium-header">
                {/* Decorative circles */}
                <div className="vcm-header-decorative-circle vcm-circle-1" />
                <div className="vcm-header-decorative-circle vcm-circle-2" />

                <div className="vcm-header-content">
                    <h2 className="vcm-header-title">
                        {t('contracts.pageTitle')}
                    </h2>
                    <Space>
                        <Dropdown menu={{ items: exportItems }} trigger={['click']}>
                            <Button
                                icon={<DownloadOutlined />}
                                className="vcm-btn-secondary"
                            >
                                {t('contracts.exportExcel')} <DownOutlined />
                            </Button>
                        </Dropdown>
                        {canEdit && (
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={handleCreate}
                                className="vcm-btn-premium"
                            >
                                {t('contracts.createContract')}
                            </Button>
                        )}
                    </Space>
                </div>
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    {
                        key: 'contracts',
                        label: t('contracts.tabContracts'),
                        children: (
                            <>
            <Card className="contracts-card">
                <VcmFilterBar>
                    <Col xs={24} sm={12} md={6}>
                        <Input
                            placeholder={t('contracts.searchPlaceholder')}
                            prefix={<SearchOutlined />}
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                        />
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Select
                            placeholder={t('contracts.filterBranch')}
                            value={selectedProvince === 'ALL' ? undefined : selectedProvince}
                            onChange={setSelectedProvince}
                            allowClear
                            style={{ width: '100%' }}
                        >
                            <Option value="ALL">{t('common.all')}</Option>
                            {branches.map((p) => (
                                <Option key={p.id} value={p.id}>
                                    {p.code}
                                </Option>
                            ))}
                        </Select>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Select
                            placeholder={t('contracts.filterField')}
                            value={selectedField === 'ALL' ? undefined : selectedField}
                            onChange={setSelectedField}
                            allowClear
                            style={{ width: '100%' }}
                        >
                            <Option value="ALL">{t('common.all')}</Option>
                            <Option value="B2B">B2B</Option>
                            <Option value="B2C">B2C</Option>
                        </Select>
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <DatePicker
                            picker="month"
                            placeholder={t('contracts.filterMonth')}
                            value={selectedMonth}
                            onChange={setSelectedMonth}
                            style={{ width: '100%' }}
                            format="MM/YYYY"
                            allowClear={true}
                        />
                    </Col>
                </VcmFilterBar>

                <div style={{ padding: '0 16px' }}>
                    <FilterChips filters={activeFilters} onClearAll={clearAllFilters} />
                </div>

                <Table
                    columns={columns}
                    dataSource={filteredContracts}
                    rowKey="id"
                    loading={loading}
                    scroll={{ x: 1400 }}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        showTotal: (total) => t('contracts.totalContracts', { total }),
                    }}
                />
            </Card>
                            </>
                        ),
                    },
                    {
                        key: 'invoices',
                        label: t('contracts.tabInvoices'),
                        children: <AllInvoiceList />,
                    },
                ]}
            />

            <Modal
                title={editingContract ? t('contracts.modalTitleEdit') : t('contracts.modalTitleAdd')}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                onOk={() => form.submit()}
                width="min(800px, 94vw)"
                okText={editingContract ? t('contracts.update') : t('contracts.create')}
                cancelText={t('common.cancel')}
                confirmLoading={submitting}
                destroyOnHidden
                afterOpenChange={(open) => {
                    if (open && pendingValues) form.setFieldsValue(pendingValues);
                }}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="code"
                                label={t('contracts.formCode')}
                                rules={[{ required: true, message: t('contracts.formCodeRequired') }]}
                            >
                                <Input placeholder={t('contracts.formCodePlaceholder')} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="name"
                                label={t('contracts.formName')}
                                rules={[{ required: true, message: t('contracts.formNameRequired') }]}
                            >
                                <Input placeholder={t('contracts.formNamePlaceholder')} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="provinceId"
                                label={t('contracts.formBranch')}
                                rules={[{ required: true, message: t('contracts.formBranchRequired') }]}
                            >
                                <Select placeholder={t('contracts.formBranchPlaceholder')}>
                                    {branches.map((p) => (
                                        <Option key={p.id} value={p.id}>
                                            {p.code}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="businessField"
                                label={t('contracts.formField')}
                                rules={[{ required: true, message: t('contracts.formFieldRequired') }]}
                            >
                                <Select placeholder={t('contracts.formFieldPlaceholder')}>
                                    <Option value="ALL">ALL</Option>
                                    {(appConfig?.BUSINESS_TYPES || ['B2B', 'B2C']).map((type: string) => (
                                        <Option key={type} value={type}>{type}</Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Ô nhập là số TRƯỚC thuế — đây là số đi vào chỉ tiêu Nguồn việc.
                        Ô sau thuế chỉ hiển thị: nó KHÔNG có prop `name` nên không nằm
                        trong form values và không được gửi lên; server tự tính lại từ
                        valueBeforeTax × (1 + taxRate/100). Xem routes/_taxAmounts.js. */}
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="valueBeforeTax"
                                label={t('contracts.formValueBeforeTax')}
                                rules={[{ required: true, message: t('contracts.formValueBeforeTaxRequired') }]}
                            >
                                <InputNumber
                                    style={{ width: '100%' }}
                                    min={0}
                                    formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    placeholder="1,000,000"
                                />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item name="taxRate" label={t('contracts.formTaxRate')} initialValue={5}>
                                <InputNumber style={{ width: '100%' }} min={0} max={100} addonAfter="%" />
                            </Form.Item>
                        </Col>
                        <Col span={6}>
                            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.valueBeforeTax !== curr.valueBeforeTax || prev.taxRate !== curr.taxRate}>
                                {({ getFieldValue }) => {
                                    const before = Number(getFieldValue('valueBeforeTax')) || 0;
                                    const rate = Number(getFieldValue('taxRate') ?? 5);
                                    const after = Math.round(before * (1 + rate / 100) * 100) / 100;
                                    return (
                                        <Form.Item label={t('contracts.formValueAfterTax')} tooltip={t('contracts.formValueAfterTaxTooltip')}>
                                            <InputNumber
                                                style={{ width: '100%' }}
                                                disabled
                                                value={after}
                                                formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                            />
                                        </Form.Item>
                                    );
                                }}
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="status"
                                label={t('contracts.formStatus')}
                                rules={[{ required: true, message: t('contracts.formStatusRequired') }]}
                            >
                                <Select placeholder={t('contracts.formStatusPlaceholder')}>
                                    <Option value="TODO">{t('contracts.statusTodo')}</Option>
                                    <Option value="IN_PROGRESS">{t('contracts.statusInProgress')}</Option>
                                    <Option value="DONE">{t('contracts.statusDone')}</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="startDate"
                                label={t('contracts.formStartDate')}
                                rules={[{ required: true, message: t('contracts.formStartDateRequired') }]}
                            >
                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder={t('common.selectDate')} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="endDate"
                                label={t('contracts.formEndDate')}
                                rules={[
                                    { required: true, message: t('contracts.formEndDateRequired') },
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            if (!value || !getFieldValue('startDate') || value.isAfter(getFieldValue('startDate'))) {
                                                return Promise.resolve();
                                            }
                                            return Promise.reject(new Error(t('contracts.formEndDateAfterStart')));
                                        },
                                    }),
                                ]}
                            >
                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder={t('common.selectDate')} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item label={t('contracts.formAttachment')}>
                        {/* Show existing files when editing */}
                        {editingContract && existingFiles.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>
                                    {t('contracts.existingFiles')}
                                </div>
                                <List
                                    size="small"
                                    bordered
                                    dataSource={existingFiles}
                                    renderItem={(url: string, index: number) => {
                                        const fileName = url.split('/').pop()?.split('?')[0] || `file_${index + 1}`;
                                        return (
                                            <List.Item
                                                style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                            >
                                                <Space size="small" style={{ flex: 1, minWidth: 0 }}>
                                                    <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
                                                    <a
                                                        href={url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 350 }}
                                                        title={fileName}
                                                    >
                                                        {decodeURIComponent(fileName)}
                                                    </a>
                                                </Space>
                                                <Tooltip title={t('common.delete')}>
                                                    <Button
                                                        type="text"
                                                        danger
                                                        size="small"
                                                        icon={<CloseCircleOutlined />}
                                                        onClick={() => {
                                                            setExistingFiles(prev => prev.filter((_, i) => i !== index));
                                                        }}
                                                    />
                                                </Tooltip>
                                            </List.Item>
                                        );
                                    }}
                                />
                            </div>
                        )}
                        <Upload
                            beforeUpload={(file) => {
                                setFileList([...fileList, file]);
                                return false; // Prevent auto upload
                            }}
                            onRemove={(file) => {
                                const index = fileList.indexOf(file);
                                const newFileList = fileList.slice();
                                newFileList.splice(index, 1);
                                setFileList(newFileList);
                            }}
                            fileList={fileList}
                        >
                            <Button icon={<UploadOutlined />}>{t('contracts.formAttachmentButton')}</Button>
                        </Upload>
                        {/* Hidden input to store value if needed, but handled in handleSubmit */}
                    </Form.Item>

                    <Form.Item name="note" label={t('contracts.formNote')}>
                        <Input.TextArea rows={3} placeholder={t('contracts.formNotePlaceholder')} />
                    </Form.Item>
                </Form>
            </Modal>

            <ContractDetailModal
                contract={detailContract}
                visible={detailVisible}
                onCancel={() => setDetailVisible(false)}
                provinces={branches}
                appConfig={appConfig}
                onContractUpdate={() => queryClient.invalidateQueries({ queryKey: CONTRACT_KEYS.list() })}
            />
        </div>
    );
};

export default Contracts;
