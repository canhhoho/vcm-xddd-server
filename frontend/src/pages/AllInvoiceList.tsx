import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    Card,
    Table,
    Select,
    DatePicker,
    Col,
    Input,
    Tooltip,
    Button,
    Space,
    Progress,
    Modal,
    Form,
    InputNumber,
    AutoComplete,
    message,
} from 'antd';
import { SearchOutlined, EyeOutlined, DownloadOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { apiService } from '../services/api';
import type { Invoice, Contract, Province } from '../types';
import { useTranslation } from 'react-i18next';
import { VcmFilterBar } from '../components/VcmFilterBar';
import { FilterChips } from '../components/FilterChips';
import { VcmActionGroup } from '../components/VcmActionGroup';
import { useFilterSync, useFilterSyncDate } from '../hooks/useFilterSync';
import { useContracts } from '../hooks/useContracts';
import { useAppConfig } from '../hooks/useAppConfig';
import { usePermissions } from '../hooks/usePermissions';

const { Option } = Select;

// Helper: parse file URLs from string
const parseFileUrls = (files: string | undefined | null): string[] => {
    if (!files) return [];
    return files.split(/[\r\n,]+/).map(f => f.trim()).filter(f => f.length > 0);
};

const AllInvoiceList: React.FC = () => {
    const { t } = useTranslation();
    const { permissions, isAdmin } = usePermissions();
    const canView = isAdmin || permissions.contracts === 'VIEW' || permissions.contracts === 'EDIT';

    const { data: contracts = [] } = useContracts(canView);
    const { data: appConfig } = useAppConfig(canView);

    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [branches, setBranches] = useState<Province[]>([]);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
    const [form] = Form.useForm();
    const canEdit = isAdmin || permissions.contracts === 'EDIT';

    // Filters (synced with URL)
    const [searchText, setSearchText] = useFilterSync('iq', '');
    const [selectedContract, setSelectedContract] = useFilterSync<string | undefined>('contract', undefined);
    const [selectedBranch, setSelectedBranch] = useFilterSync<string | undefined>('ibranch', undefined);
    const [selectedMonth, setSelectedMonth] = useFilterSyncDate('imonth', null);
    const [selectedInstallment, setSelectedInstallment] = useFilterSync<string | undefined>('installment', undefined);
    const [selectedProgress, setSelectedProgress] = useFilterSync<string | undefined>('progress', undefined);

    useEffect(() => {
        if (appConfig?.BRANCHES) {
            setBranches(appConfig.BRANCHES);
        }
    }, [appConfig]);

    useEffect(() => {
        loadInvoices();
    }, []);

    const loadInvoices = async () => {
        setLoading(true);
        try {
            const response = await apiService.getAllInvoices();
            if (response.success) {
                setInvoices(response.data);
            }
        } catch (error) {
            console.error('Failed to load invoices:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (record: Invoice) => {
        setEditingInvoice(record);
        form.setFieldsValue({
            invoiceNumber: record.invoiceNumber,
            installment: record.installment,
            value: record.value,
            paidAmount: record.paidAmount ?? 0,
            issuedDate: record.issuedDate ? dayjs(record.issuedDate) : null,
        });
        setEditModalVisible(true);
    };

    const handleEditSubmit = async (values: any) => {
        if (!editingInvoice) return;
        try {
            const payload = {
                id: editingInvoice.id,
                ...values,
                issuedDate: values.issuedDate?.format('YYYY-MM-DD'),
            };
            const res = await apiService.updateInvoice(payload);
            if (res.success) {
                message.success(t('invoices.updateSuccess'));
                setEditModalVisible(false);
                setEditingInvoice(null);
                form.resetFields();
                loadInvoices();
            }
        } catch {
            message.error(t('invoices.submitError'));
        }
    };

    // Active filters for chips
    const activeFilters = useMemo(() => {
        const contractObj = contracts.find((c: Contract) => c.id === selectedContract);
        return [
            { key: 'iq', label: t('common.search'), value: searchText, onRemove: () => setSearchText('') },
            {
                key: 'contract',
                label: t('invoices.filterContract'),
                value: selectedContract,
                displayValue: contractObj ? contractObj.code : undefined,
                onRemove: () => setSelectedContract(undefined),
            },
            {
                key: 'ibranch',
                label: t('invoices.filterBranch'),
                value: selectedBranch,
                displayValue: branches.find(b => b.id === selectedBranch)?.code,
                onRemove: () => setSelectedBranch(undefined),
            },
            {
                key: 'imonth',
                label: t('invoices.filterTime'),
                value: selectedMonth,
                displayValue: selectedMonth?.format('MM/YYYY'),
                onRemove: () => setSelectedMonth(null),
            },
            {
                key: 'installment',
                label: t('invoices.colInstallment'),
                value: selectedInstallment,
                onRemove: () => setSelectedInstallment(undefined),
            },
            {
                key: 'progress',
                label: t('contracts.colProgress'),
                value: selectedProgress,
                displayValue: selectedProgress === 'unpaid' ? '0%' : selectedProgress === 'partial' ? '1-99%' : selectedProgress === 'paid' ? '100%' : undefined,
                onRemove: () => setSelectedProgress(undefined),
            },
        ];
    }, [searchText, selectedContract, selectedBranch, selectedMonth, selectedInstallment, selectedProgress, contracts, branches, t, setSearchText, setSelectedContract, setSelectedBranch, setSelectedMonth, setSelectedInstallment, setSelectedProgress]);

    const clearAllFilters = useCallback(() => {
        setSearchText('');
        setSelectedContract(undefined);
        setSelectedBranch(undefined);
        setSelectedMonth(null);
        setSelectedInstallment(undefined);
        setSelectedProgress(undefined);
    }, [setSearchText, setSelectedContract, setSelectedBranch, setSelectedMonth, setSelectedInstallment, setSelectedProgress]);

    // Filtered & sorted invoices
    const filteredInvoices = useMemo(() => {
        return invoices
            .filter((inv: Invoice) => {
                // Text search on contract code, contract name, invoice number
                const matchSearch =
                    !searchText ||
                    (inv.contractCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
                    (inv.contractName || '').toLowerCase().includes(searchText.toLowerCase()) ||
                    (inv.invoiceNumber || '').toLowerCase().includes(searchText.toLowerCase());

                // Contract filter
                const matchContract = !selectedContract || selectedContract === 'ALL' || inv.contractId === selectedContract;

                // Branch filter
                let matchBranch = true;
                if (selectedBranch && selectedBranch !== 'ALL') {
                    // Find the branch code for the selected branch id
                    const branchObj = branches.find(b => b.id === selectedBranch);
                    matchBranch = inv.branchCode === branchObj?.code || inv.branchCode === selectedBranch;
                }

                // Time filter (month/year of issuedDate)
                let matchMonth = true;
                if (selectedMonth) {
                    const invoiceDate = dayjs(inv.issuedDate);
                    matchMonth = invoiceDate.isSame(selectedMonth, 'month') && invoiceDate.isSame(selectedMonth, 'year');
                }

                // Installment filter
                const matchInstallment = !selectedInstallment || selectedInstallment === 'ALL' ||
                    (inv.installment || '').toLowerCase() === selectedInstallment.toLowerCase();

                // Progress filter
                let matchProgress = true;
                if (selectedProgress && selectedProgress !== 'ALL') {
                    const paid = inv.paidAmount ?? 0;
                    const value = inv.value || 0;
                    const pct = value > 0 ? Math.round((paid / value) * 100) : 0;
                    if (selectedProgress === 'unpaid') matchProgress = pct === 0;
                    else if (selectedProgress === 'partial') matchProgress = pct > 0 && pct < 100;
                    else if (selectedProgress === 'paid') matchProgress = pct >= 100;
                }

                return matchSearch && matchContract && matchBranch && matchMonth && matchInstallment && matchProgress;
            })
            .sort((a: Invoice, b: Invoice) => {
                // Sort newest first by issuedDate
                return dayjs(b.issuedDate).valueOf() - dayjs(a.issuedDate).valueOf();
            });
    }, [invoices, searchText, selectedContract, selectedBranch, selectedMonth, selectedInstallment, selectedProgress, branches]);

    const columns: ColumnsType<Invoice> = useMemo(() => [
        {
            title: '#',
            key: 'index',
            width: 50,
            align: 'center' as const,
            fixed: 'left' as const,
            render: (_: any, __: any, index: number) => (
                <span style={{ color: '#8c8c8c', fontSize: 13 }}>{index + 1}</span>
            ),
        },
        {
            title: t('invoices.colContractCode'),
            dataIndex: 'contractCode',
            key: 'contractCode',
            width: 180,
            fixed: 'left' as const,
            ellipsis: true,
            render: (text: string) => (
                <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{text}</span>
            ),
        },
        {
            title: t('invoices.colContractName'),
            dataIndex: 'contractName',
            key: 'contractName',
            width: 280,
            ellipsis: true,
            render: (text: string) => (
                <span style={{ color: '#374151' }}>{text}</span>
            ),
        },
        {
            title: t('invoices.colBranch'),
            dataIndex: 'branchCode',
            key: 'branchCode',
            width: 90,
            align: 'center' as const,
            render: (text: string) => (
                <span style={{ fontWeight: 500 }}>{text}</span>
            ),
        },
        {
            title: t('invoices.colInvoiceNumber'),
            dataIndex: 'invoiceNumber',
            key: 'invoiceNumber',
            width: 180,
            ellipsis: true,
            render: (text: string) => (
                <span style={{ color: '#1890ff', fontWeight: 500 }}>{text}</span>
            ),
        },
        {
            title: t('invoices.colInstallment'),
            dataIndex: 'installment',
            key: 'installment',
            width: 120,
            align: 'center' as const,
        },
        {
            title: t('invoices.colValue'),
            dataIndex: 'value',
            key: 'value',
            width: 150,
            align: 'right' as const,
            render: (val: number) => (
                <span style={{ fontWeight: 600, color: '#1a1a2e' }}>
                    {val ? val.toLocaleString('vi-VN') : '0'}
                </span>
            ),
        },
        {
            title: t('invoices.colIssuedDate'),
            dataIndex: 'issuedDate',
            key: 'issuedDate',
            width: 120,
            align: 'center' as const,
            render: (date: string) => (
                <span style={{ color: '#6b7280' }}>
                    {date ? dayjs(date).format('DD/MM/YYYY') : ''}
                </span>
            ),
        },
        {
            title: t('invoices.colPaidAmount'),
            dataIndex: 'paidAmount',
            key: 'paidAmount',
            width: 160,
            align: 'right' as const,
            render: (val: number | null, record: Invoice) => {
                const paid = val ?? 0;
                if (paid <= 0) {
                    return (
                        <span style={{ color: '#ff4d4f', fontStyle: 'italic', fontSize: 13 }}>
                            {t('invoices.statusUnpaid')}
                        </span>
                    );
                }
                const diff = (record.value || 0) - paid;
                return (
                    <span>
                        <span style={{ color: '#52c41a', fontWeight: 600 }}>
                            {paid.toLocaleString('vi-VN')}
                        </span>
                        {diff > 0 && (
                            <div style={{ fontSize: 11, color: '#fa8c16', marginTop: 2, fontWeight: 'normal' }}>
                                ({t('invoices.retention')}: {diff.toLocaleString('vi-VN')})
                            </div>
                        )}
                    </span>
                );
            },
        },
        {
            title: t('contracts.colProgress'),
            key: 'progress',
            width: 110,
            align: 'center' as const,
            render: (_: any, record: Invoice) => {
                const paid = record.paidAmount ?? 0;
                const value = record.value || 0;
                const pct = value > 0 ? Math.round((paid / value) * 100) : 0;
                return <Progress percent={pct} size="small" status={pct >= 100 ? 'success' : 'active'} />;
            },
        },
        {
            title: t('invoices.colActions'),
            key: 'action',
            width: 130,
            align: 'center' as const,
            fixed: 'right' as const,
            render: (_: any, record: Invoice) => {
                const fileUrls = parseFileUrls(record.files);

                const handleView = () => {
                    fileUrls.forEach((url: string) => window.open(url, '_blank'));
                };

                const handleDownload = () => {
                    fileUrls.forEach((url: string, index: number) => {
                        const fileName = url.split('/').pop()?.split('?')[0] || `file_${index + 1}`;
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = fileName;
                        link.target = '_blank';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    });
                };

                return (
                    <VcmActionGroup
                        onEdit={canEdit ? () => handleEdit(record) : undefined}
                        canEdit={canEdit}
                    >
                        {fileUrls.length > 0 && (
                            <>
                                <Tooltip title={t('common.view')}>
                                    <Button
                                        type="text"
                                        size="small"
                                        className="vcm-table-action-btn vcm-table-action-view"
                                        icon={<EyeOutlined />}
                                        onClick={(e) => { e.stopPropagation(); handleView(); }}
                                    />
                                </Tooltip>
                                <Tooltip title={t('common.download')}>
                                    <Button
                                        type="text"
                                        size="small"
                                        className="vcm-table-action-btn vcm-table-action-view"
                                        icon={<DownloadOutlined />}
                                        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                                    />
                                </Tooltip>
                            </>
                        )}
                    </VcmActionGroup>
                );
            },
        },
    ], [t]);

    return (
        <Card className="contracts-card">
            <VcmFilterBar>
                <Col xs={24} sm={12} md={6}>
                    <Input
                        placeholder={t('invoices.searchPlaceholder')}
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                    />
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Select
                        placeholder={t('invoices.filterContract')}
                        value={selectedContract === 'ALL' ? undefined : selectedContract}
                        onChange={setSelectedContract}
                        allowClear
                        showSearch
                        filterOption={(input, option) => {
                            const label = (option?.children as unknown as string) || '';
                            return label.toLowerCase().includes(input.toLowerCase());
                        }}
                        style={{ width: '100%' }}
                    >
                        <Option value="ALL">{t('common.all')}</Option>
                        {contracts.map((c: Contract) => (
                            <Option key={c.id} value={c.id}>
                                {c.code} - {c.name}
                            </Option>
                        ))}
                    </Select>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Select
                        placeholder={t('invoices.filterBranch')}
                        value={selectedBranch === 'ALL' ? undefined : selectedBranch}
                        onChange={setSelectedBranch}
                        allowClear
                        style={{ width: '100%' }}
                    >
                        <Option value="ALL">{t('common.all')}</Option>
                        {branches.map((b) => (
                            <Option key={b.id} value={b.id}>
                                {b.code}
                            </Option>
                        ))}
                    </Select>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <DatePicker
                        picker="month"
                        placeholder={t('invoices.filterTime')}
                        value={selectedMonth}
                        onChange={setSelectedMonth}
                        style={{ width: '100%' }}
                        format="MM/YYYY"
                        allowClear={true}
                    />
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Select
                        placeholder={t('invoices.colInstallment')}
                        value={selectedInstallment === 'ALL' ? undefined : selectedInstallment}
                        onChange={setSelectedInstallment}
                        allowClear
                        style={{ width: '100%' }}
                    >
                        <Option value="ALL">{t('common.all')}</Option>
                        <Option value="Adv">Adv</Option>
                        <Option value="1st">1st</Option>
                        <Option value="2nd">2nd</Option>
                        <Option value="3rd">3rd</Option>
                        <Option value="4th">4th</Option>
                        <Option value="5th">5th</Option>
                        <Option value="Final">Final</Option>
                    </Select>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Select
                        placeholder={t('contracts.colProgress')}
                        value={selectedProgress === 'ALL' ? undefined : selectedProgress}
                        onChange={setSelectedProgress}
                        allowClear
                        style={{ width: '100%' }}
                    >
                        <Option value="ALL">{t('common.all')}</Option>
                        <Option value="unpaid">{t('invoices.statusUnpaid')} (0%)</Option>
                        <Option value="partial">1% - 99%</Option>
                        <Option value="paid">{t('invoices.statusPaid')} (100%)</Option>
                    </Select>
                </Col>
            </VcmFilterBar>

            <div style={{ padding: '0 16px' }}>
                <FilterChips filters={activeFilters} onClearAll={clearAllFilters} />
            </div>

            <Table
                columns={columns}
                dataSource={filteredInvoices}
                rowKey="id"
                loading={loading}
                scroll={{ x: 1400 }}
                pagination={{
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total) => t('invoices.totalInvoices', { total }),
                }}
            />

            <Modal
                title={t('invoices.modalTitleEdit')}
                open={editModalVisible}
                onCancel={() => { setEditModalVisible(false); setEditingInvoice(null); form.resetFields(); }}
                onOk={() => form.submit()}
                okText={t('common.save')}
                cancelText={t('common.cancel')}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleEditSubmit}>
                    <Form.Item name="invoiceNumber" label={t('invoices.formInvoiceNumber')} rules={[{ required: true, message: t('invoices.formInvoiceNumberRequired') }]}>
                        <Input placeholder={t('invoices.formInvoiceNumberPlaceholder')} />
                    </Form.Item>
                    <Form.Item name="installment" label={t('invoices.formInstallment')} rules={[{ required: true, message: t('invoices.formInstallmentRequired') }]}>
                        <AutoComplete
                            placeholder={t('invoices.formInstallmentPlaceholder')}
                            options={[
                                { value: 'Adv', label: 'Adv' },
                                { value: '1st', label: '1st' },
                                { value: '2nd', label: '2nd' },
                                { value: '3rd', label: '3rd' },
                                { value: '4th', label: '4th' },
                                { value: '5th', label: '5th' },
                                { value: 'Final', label: 'Final' },
                            ]}
                            filterOption={(inputValue, option) =>
                                (option?.value as string).toLowerCase().includes(inputValue.toLowerCase()) ||
                                (option?.label as string).toLowerCase().includes(inputValue.toLowerCase())
                            }
                        />
                    </Form.Item>
                    <Form.Item name="value" label={t('invoices.formValue')} rules={[{ required: true, message: t('invoices.formValueRequired') }]}>
                        <InputNumber style={{ width: '100%' }} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v?.replace(/\$\s?|(,*)/g, '') as unknown as number} />
                    </Form.Item>
                    <Form.Item name="paidAmount" label={t('invoices.formPaidAmount')} tooltip={t('invoices.formPaidAmountTooltip')} initialValue={0}>
                        <InputNumber style={{ width: '100%' }} min={0} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(v: any) => Number(v?.replace(/\$\s?|(,*)/g, '')) || 0} />
                    </Form.Item>
                    <Form.Item name="issuedDate" label={t('invoices.formIssuedDate')} rules={[{ required: true, message: t('invoices.formIssuedDateRequired') }]}>
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder={t('common.selectDate')} />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default AllInvoiceList;
