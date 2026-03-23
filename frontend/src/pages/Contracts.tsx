import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Card,
    Table,
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
    Popconfirm,
    Dropdown,
    List,
} from 'antd';
import type { MenuProps } from 'antd';
import {
    PlusOutlined,
    SearchOutlined,
    EditOutlined,
    DeleteOutlined,
    UploadOutlined,
    EyeOutlined,
    DownloadOutlined,
    GlobalOutlined,
    DownOutlined,
    FilePdfOutlined,
    FileImageOutlined,
    CloseCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { apiService } from '../services/api';
import type { Contract, Province } from '../types';
import './Contracts.css';


import ContractDetailModal from './ContractDetailModal';
import { useFilterSync, useFilterSyncDate } from '../hooks/useFilterSync';
import { usePermissions } from '../hooks/usePermissions';
import { useContracts, useContractMutations, CONTRACT_KEYS } from '../hooks/useContracts';
import { useAppConfig } from '../hooks/useAppConfig';

import { FilterChips } from '../components/FilterChips';
import { useTranslation } from 'react-i18next';
import { VcmFilterBar } from '../components/VcmFilterBar';
import { VcmActionGroup } from '../components/VcmActionGroup';

const { Option } = Select;
const { RangePicker } = DatePicker;

// Icon mapping
const ICON_MAP: Record<string, React.ReactNode> = {
    'CrownOutlined': <span role="img" aria-label="director" className="anticon"><svg viewBox="64 64 896 896" focusable="false" data-icon="crown" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M899.6 276.5L705 396.4 518.4 147.5a8.06 8.06 0 00-12.9 0L319 396.4 124.3 276.5c-5.7-3.5-13 1.2-12.2 7.9l48.8 403.2c.7 5.5 5.3 9.6 10.8 9.6h680.5c5.5 0 10.1-4.1 10.8-9.6l48.8-403.2c.8-6.7-6.5-11.4-12.2-7.9zM738.2 624.7l-9.4 69.4H295.2l-9.4-69.4 225.8-138.7 226.6 138.7z"></path></svg></span>,
    'SafetyCertificateOutlined': <GlobalOutlined />, // Fallback
    'TeamOutlined': <PlusOutlined />, // Fallback
    'UsergroupAddOutlined': <PlusOutlined />, // Fallback
    'SolutionOutlined': <PlusOutlined />,
    'UserOutlined': <PlusOutlined />,
    'EyeOutlined': <EyeOutlined />,
    'EditOutlined': <EditOutlined />,
    'DeleteOutlined': <DeleteOutlined />,
};

// --- HELPERS ---
const normalizeId = (id: any): string => {
    if (id === null || id === undefined) return '';
    let str = String(id).trim();
    if (str.endsWith('.0')) str = str.slice(0, -2);
    // Handle numeric strings: remove leading zeros ('01' -> '1')
    if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        if (!isNaN(num)) return num.toString();
    }
    return str;
};

const getInvoicedAmount = (contract: Contract) => {
    // Placeholder for actual logic if needed
    return 0; // Or some default value
};

const Contracts: React.FC = () => {
    const { t } = useTranslation();
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.contracts === 'EDIT';
    const canView = isAdmin || permissions.contracts === 'VIEW' || permissions.contracts === 'EDIT';

    const queryClient = useQueryClient();

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

    if (permissions.contracts === 'NO_ACCESS' && !isAdmin) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>{t('contracts.noAccess')}</h2>
                <p>{t('contracts.noAccessDesc')}</p>
            </div>
        );
    }

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
            displayValue: branches.find(b => b.id === selectedProvince)?.code,
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
        setFileList([]);
        setModalVisible(true);
    }, [form]);

    const handleEdit = useCallback((record: Contract) => {
        setEditingContract(record);
        form.setFieldsValue({
            ...record,
            startDate: dayjs(record.startDate),
            endDate: dayjs(record.endDate),
        });
        setFileList([]);
        // Parse existing files from the record
        const existing = record.fileUrl ? record.fileUrl.split('\n').filter((f: string) => f.trim()) : [];
        setExistingFiles(existing);
        setModalVisible(true);
    }, [form]);

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
                startDate: values.startDate.format('YYYY-MM-DD'),
                endDate: values.endDate.format('YYYY-MM-DD'),
                fileUrls: finalFileUrls,
                fileUrl: finalFileUrls
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
            render: (text: string, record: Contract) => (
                <a onClick={() => handleDetail(record)} className="font-semibold text-blue-600 hover:underline">
                    {text}
                </a>
            ),
        },
        {
            title: t('contracts.colName'),
            dataIndex: 'name',
            key: 'name',
            width: 200,
            render: (text: string, record: Contract) => (
                <a onClick={() => handleDetail(record)} className="text-gray-900 hover:text-blue-600">
                    {text}
                </a>
            ),
        },
        {
            title: t('contracts.colBranch'),
            dataIndex: 'provinceId',
            key: 'provinceId',
            width: 100,
            render: (provinceId: string) => {
                const normalizedSearch = normalizeId(provinceId);
                const branch = branches.find(
                    (p) => normalizeId(p.id) === normalizedSearch ||
                        normalizeId(p.code) === normalizedSearch
                );
                return branch?.code || provinceId;
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
                return <Tag color={colors[field as keyof typeof colors]}>{field}</Tag>;
            },
        },
        {
            title: t('contracts.colValue'),
            dataIndex: 'value',
            key: 'value',
            width: 150,
            render: (value: number) => value.toLocaleString('vi-VN'),
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
            width: 120,
            render: (date: string) => dayjs(date).format('DD/MM/YYYY'),
        },
        {
            title: t('contracts.colEndDate'),
            dataIndex: 'endDate',
            key: 'endDate',
            width: 120,
            render: (date: string) => dayjs(date).format('DD/MM/YYYY'),
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

                return <Tag color={color}>{text}</Tag>;
            },
        },
        {
            title: t('contracts.colActions'),
            key: 'action',
            width: 120,
            fixed: 'right',
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
                `"${c.code}"`,
                `"${c.name}"`,
                `"${branchCode}"`,
                `"${c.businessField}"`,
                c.value,
                c.progress || 0,
                `"${dayjs(c.startDate).format('DD/MM/YYYY')}"`,
                `"${dayjs(c.endDate).format('DD/MM/YYYY')}"`,
                `"${statusText}"`
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
                const allInvoices = response.data;
                // Filter invoices based on currently filtered contracts
                const filteredContractIds = new Set(filteredContracts.map(c => String(c.id)));
                const filteredInvoices = allInvoices.filter((inv: any) => filteredContractIds.has(String(inv.contractId)));

                const headers = [
                    t('invoices.exportInvoiceNumber'),
                    t('invoices.exportContractCode'),
                    t('invoices.exportContractName'),
                    t('invoices.exportInstallment'),
                    t('invoices.exportInvoiceValue'),
                    t('invoices.exportPaymentValue'),
                    t('invoices.exportIssuedDate'),
                    t('invoices.exportCreatedDate')
                ];

                const contractMap = new Map(filteredContracts.map(c => [String(c.id), c]));

                const csvContent = filteredInvoices.map((inv: any) => {
                    const contract = contractMap.get(String(inv.contractId));
                    return [
                        `"${inv.invoiceNumber}"`,
                        `"${contract?.code || ''}"`,
                        `"${contract?.name || ''}"`,
                        `"${inv.installment}"`,
                        Number(inv.value) || 0,
                        Number(inv.paidAmount) || 0,
                        `"${dayjs(inv.issuedDate).format('DD/MM/YYYY')}"`,
                        `"${dayjs(inv.createdAt).format('DD/MM/YYYY')}"`
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
            label: 'Xuất Hợp đồng',
            onClick: handleExport,
        },
        {
            key: 'invoices',
            label: 'Xuất Hóa đơn',
            onClick: handleExportInvoices,
        },
    ];

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

            <Modal
                title={editingContract ? t('contracts.modalTitleEdit') : t('contracts.modalTitleAdd')}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                onOk={() => form.submit()}
                width={800}
                okText={editingContract ? t('contracts.update') : t('contracts.create')}
                cancelText={t('common.cancel')}
                destroyOnClose
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

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                name="value"
                                label={t('contracts.formValue')}
                                rules={[{ required: true, message: t('contracts.formValueRequired') }]}
                            >
                                <InputNumber
                                    style={{ width: '100%' }}
                                    min={0}
                                    formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    placeholder="1,000,000"
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="status"
                                label={t('contracts.formStatus')}
                                rules={[{ required: true, message: t('contracts.formStatusRequired') }]}
                            >
                                <Select placeholder={t('contracts.formStatusPlaceholder')}>
                                    {appConfig?.STATUS ? (
                                        Object.entries(appConfig.STATUS).map(([key, label]) => (
                                            <Option key={key} value={key === 'IN_PROGRESS' ? 'INPROCESS' : key}>
                                                {label as string}
                                            </Option>
                                        ))
                                    ) : (
                                        <>
                                            <Option value="TODO">{t('contracts.statusTodo')}</Option>
                                            <Option value="INPROCESS">{t('contracts.statusInProgress')}</Option>
                                            <Option value="DONE">{t('contracts.statusDone')}</Option>
                                        </>
                                    )}
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
