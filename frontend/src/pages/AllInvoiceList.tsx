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
} from 'antd';
import { SearchOutlined, EyeOutlined, DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { apiService } from '../services/api';
import type { Invoice, Contract, Province } from '../types';
import { useTranslation } from 'react-i18next';
import { VcmFilterBar } from '../components/VcmFilterBar';
import { FilterChips } from '../components/FilterChips';
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

    // Filters (synced with URL)
    const [searchText, setSearchText] = useFilterSync('iq', '');
    const [selectedContract, setSelectedContract] = useFilterSync<string | undefined>('contract', undefined);
    const [selectedBranch, setSelectedBranch] = useFilterSync<string | undefined>('ibranch', undefined);
    const [selectedMonth, setSelectedMonth] = useFilterSyncDate('imonth', null);

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
        ];
    }, [searchText, selectedContract, selectedBranch, selectedMonth, contracts, branches, t, setSearchText, setSelectedContract, setSelectedBranch, setSelectedMonth]);

    const clearAllFilters = useCallback(() => {
        setSearchText('');
        setSelectedContract(undefined);
        setSelectedBranch(undefined);
        setSelectedMonth(null);
    }, [setSearchText, setSelectedContract, setSelectedBranch, setSelectedMonth]);

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

                return matchSearch && matchContract && matchBranch && matchMonth;
            })
            .sort((a: Invoice, b: Invoice) => {
                // Sort newest first by issuedDate
                return dayjs(b.issuedDate).valueOf() - dayjs(a.issuedDate).valueOf();
            });
    }, [invoices, searchText, selectedContract, selectedBranch, selectedMonth, branches]);

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
            width: 100,
            align: 'center' as const,
            fixed: 'right' as const,
            render: (_: any, record: Invoice) => {
                const fileUrls = parseFileUrls(record.files);
                if (fileUrls.length === 0) return <span style={{ color: '#d9d9d9' }}>—</span>;

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
                    <Space size={4}>
                        <Tooltip title={t('common.view')}>
                            <Button
                                type="text"
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={handleView}
                                style={{ color: '#1890ff' }}
                            />
                        </Tooltip>
                        <Tooltip title={t('common.download')}>
                            <Button
                                type="text"
                                size="small"
                                icon={<DownloadOutlined />}
                                onClick={handleDownload}
                                style={{ color: '#52c41a' }}
                            />
                        </Tooltip>
                    </Space>
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
        </Card>
    );
};

export default AllInvoiceList;
