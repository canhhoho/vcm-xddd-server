import React, { useEffect, useState } from 'react';
import { Table, Button, Tag, Space, Modal, Form, Input, InputNumber, DatePicker, Select, message, Popconfirm, Tooltip, Upload, List } from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    GlobalOutlined,
    BankOutlined,
    FileExcelOutlined,
    CrownOutlined,
    SafetyCertificateOutlined,
    TeamOutlined,
    UsergroupAddOutlined,
    SolutionOutlined,
    UserOutlined,
    PaperClipOutlined,
    FilePdfOutlined,
    FileImageOutlined,
    DownloadOutlined,
    CloseCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { apiService } from '../services/api';
import type { Invoice } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import { useTranslation } from 'react-i18next';
import { VcmActionGroup } from '../components/VcmActionGroup';

interface InvoiceListProps {
    contractId: string;
    onStatsChange?: (stats: { totalInvoiced: number; totalPaid: number }) => void;
    appConfig?: any;
}

const InvoiceList: React.FC<InvoiceListProps> = ({ contractId, onStatsChange, appConfig }) => {
    const { t } = useTranslation();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
    const [fileList, setFileList] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);
    const [existingFiles, setExistingFiles] = useState<string[]>([]);

    const [form] = Form.useForm();

    // Permissions
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.contracts === 'EDIT';

    // Icon mapping
    const ICON_MAP: Record<string, React.ReactNode> = {
        'CrownOutlined': <CrownOutlined />,
        'SafetyCertificateOutlined': <SafetyCertificateOutlined />,
        'TeamOutlined': <TeamOutlined />,
        'UsergroupAddOutlined': <UsergroupAddOutlined />,
        'SolutionOutlined': <SolutionOutlined />,
        'UserOutlined': <UserOutlined />,
        'EyeOutlined': <EyeOutlined />,
        'EditOutlined': <EditOutlined />,
        'DeleteOutlined': <DeleteOutlined />,
    };

    useEffect(() => {
        if (contractId) {
            loadInvoices();
        }
    }, [contractId]);

    const loadInvoices = async () => {
        setLoading(true);
        try {
            const response = await apiService.getInvoices(contractId);
            if (response.success) {
                const loadedInvoices = response.data;
                setInvoices(loadedInvoices);

                // Calculate stats
                const totalInvoiced = loadedInvoices.reduce((sum: number, inv: Invoice) => sum + (inv.value || 0), 0);
                const totalPaid = loadedInvoices.reduce((sum: number, inv: Invoice) => sum + (inv.paidAmount ?? 0), 0);

                if (onStatsChange) {
                    onStatsChange({ totalInvoiced, totalPaid });
                }
            }
        } catch (error) {
            message.error(t('invoices.loadError'));
        } finally {
            setLoading(false);
        }
    };

    // Helper: parse file URLs from string (handles \n, \r\n, comma separators)
    const parseFileUrls = (files: string | undefined | null): string[] => {
        if (!files) return [];
        return files.split(/[\r\n,]+/).map(f => f.trim()).filter(f => f.length > 0);
    };

    const handleCreate = () => {
        setEditingInvoice(null);
        setFileList([]);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (record: Invoice) => {
        setEditingInvoice(record);
        setFileList([]);
        // Parse existing files from the record
        const existing = parseFileUrls(record.files);
        setExistingFiles(existing);
        form.setFieldsValue({
            ...record,
            paidAmount: record.paidAmount ?? 0,
            issuedDate: dayjs(record.issuedDate),
        });
        setModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            const response = await apiService.deleteInvoice(id);
            if (response.success) {
                message.success(t('invoices.deleteSuccess'));
                loadInvoices();
            } else {
                message.error(response.error || t('invoices.deleteFailed'));
            }
        } catch (error) {
            message.error(t('invoices.deleteError'));
        }
    };

    const getFileBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                // Remove prefix: data:application/pdf;base64,
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    };

    const handleSubmit = async (values: any) => {
        setUploading(true);
        try {
            // Process files
            const uploadedFiles = [];
            for (const file of fileList) {
                if (file.originFileObj) {
                    const base64 = await getFileBase64(file.originFileObj);
                    uploadedFiles.push({
                        name: file.name,
                        mimeType: file.type,
                        data: base64
                    });
                }
            }

            // Auto-set status: nếu có giá trị thanh toán > 0 thì PAID, ngược lại UNPAID
            const paidVal = Number(values.paidAmount) || 0;

            // Merge existing files (kept after deletions) into 'files' string
            const keptFilesStr = editingInvoice ? existingFiles.join('\n') : '';

            const data = {
                ...values,
                contractId,
                issuedDate: values.issuedDate.format('YYYY-MM-DD'),
                status: paidVal > 0 ? 'PAID' : 'UNPAID',
                fileList: uploadedFiles,
                files: keptFilesStr || undefined
            };

            let response;
            if (editingInvoice) {
                response = await apiService.updateInvoice({ id: editingInvoice.id, ...data });
            } else {
                response = await apiService.createInvoice(data);
            }

            if (response.success) {
                message.success(editingInvoice ? t('invoices.updateSuccess') : t('invoices.createSuccess'));
                setModalVisible(false);
                setFileList([]);
                setExistingFiles([]);
                loadInvoices();
            } else {
                message.error(response.error || t('invoices.submitError'));
            }
        } catch (error) {
            console.error('Submit Error:', error);
            message.error(t('invoices.systemError'));
        } finally {
            setUploading(false);
        }
    };

    const columns: ColumnsType<Invoice> = [
        {
            title: t('invoices.colInvoiceNumber'),
            dataIndex: 'invoiceNumber',
            key: 'invoiceNumber',
        },
        {
            title: t('invoices.colInstallment'),
            dataIndex: 'installment',
            key: 'installment',
        },
        {
            title: t('invoices.colValue'),
            dataIndex: 'value',
            key: 'value',
            render: (val) => val ? val.toLocaleString('vi-VN') : '0',
            className: 'font-bold',
        },
        {
            title: t('invoices.colPaidAmount'),
            dataIndex: 'paidAmount',
            key: 'paidAmount',
            className: 'font-bold',
            render: (val: number | null, record: Invoice) => {
                const paid = val ?? 0;
                if (paid <= 0) {
                    return <span style={{ color: '#ff4d4f' }}>{t('invoices.statusUnpaid')}</span>;
                }
                const diff = (record.value || 0) - paid;
                return (
                    <span>
                        <span style={{ color: '#52c41a' }}>{paid.toLocaleString('vi-VN')}</span>
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
            title: t('invoices.colIssuedDate'),
            dataIndex: 'issuedDate',
            key: 'issuedDate',
            render: (date) => dayjs(date).format('DD/MM/YYYY'),
        },
        {
            title: t('contracts.formAttachment'),
            dataIndex: 'files',
            key: 'files',
            render: (files) => {
                const fileUrls = parseFileUrls(files);
                if (fileUrls.length === 0) return null;
                return (
                    <Space size="small" wrap>
                        {fileUrls.map((url: string, index: number) => {
                            return (
                                <Tooltip title={t('common.view')} key={index}>
                                    <Button
                                        type="link"
                                        icon={<FilePdfOutlined style={{ color: '#ff4d4f' }} />}
                                        onClick={() => window.open(url, '_blank')}
                                        size="small"
                                    />
                                </Tooltip>
                            );
                        })}
                    </Space>
                );
            }
        },
        {
            title: t('invoices.colActions'),
            key: 'action',
            render: (_, record) => {
                const handleDownload = () => {
                    const fileUrls = parseFileUrls(record.files);
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
                        onDelete={canEdit ? () => handleDelete(record.id) : undefined}
                        canEdit={canEdit}
                        canDelete={canEdit}
                        deleteConfirmTitle={t('invoices.confirmDelete')}
                    >
                        {record.files && (
                            <Tooltip title={t('common.download')}>
                                <Button
                                    type="text"
                                    size="small"
                                    className="vcm-table-action-btn"
                                    icon={<DownloadOutlined />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownload();
                                    }}
                                    style={{ color: '#52c41a' }}
                                />
                            </Tooltip>
                        )}
                    </VcmActionGroup>
                );
            },
        },
    ];

    return (
        <div className="mt-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{t('invoices.listTitle')}</h3>
                {canEdit && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} className="vcm-btn-premium">
                        {t('invoices.createInvoice')}
                    </Button>
                )}
            </div>

            <Table
                columns={columns}
                dataSource={invoices}
                rowKey="id"
                loading={loading}
                pagination={false}
                size="middle"
            />

            <Modal
                title={editingInvoice ? t('invoices.modalTitleEdit') : t('invoices.modalTitleAdd')}
                open={modalVisible}
                onCancel={() => !uploading && setModalVisible(false)}
                onOk={() => form.submit()}
                confirmLoading={uploading}
                okText={editingInvoice ? t('common.save') : t('common.add')}
                cancelText={t('common.cancel')}
                cancelButtonProps={{ disabled: uploading }}
                closable={!uploading}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                >
                    <Form.Item
                        name="invoiceNumber"
                        label={t('invoices.formInvoiceNumber')}
                        rules={[{ required: true, message: t('invoices.formInvoiceNumberRequired') }]}
                    >
                        <Input placeholder={t('invoices.formInvoiceNumberPlaceholder')} />
                    </Form.Item>
                    <Form.Item
                        name="installment"
                        label={t('invoices.formInstallment')}
                        rules={[{ required: true, message: t('invoices.formInstallmentRequired') }]}
                    >
                        <Input placeholder={t('invoices.formInstallmentPlaceholder')} />
                    </Form.Item>
                    <Form.Item
                        name="value"
                        label={t('invoices.formValue')}
                        rules={[{ required: true, message: t('invoices.formValueRequired') }]}
                    >
                        <InputNumber
                            style={{ width: '100%' }}
                            formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={value => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
                        />
                    </Form.Item>
                    <Form.Item
                        name="paidAmount"
                        label={t('invoices.formPaidAmount')}
                        tooltip={t('invoices.formPaidAmountTooltip')}
                        initialValue={0}
                    >
                        <InputNumber
                            style={{ width: '100%' }}
                            min={0}
                            formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={(value: any) => Number(value?.replace(/\$\s?|(,*)/g, '')) || 0}
                            placeholder={t('invoices.formPaidAmountPlaceholder')}
                        />
                    </Form.Item>
                    <Form.Item
                        name="issuedDate"
                        label={t('invoices.formIssuedDate')}
                        rules={[{ required: true, message: t('invoices.formIssuedDateRequired') }]}
                    >
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder={t('common.selectDate')} />
                    </Form.Item>

                    <Form.Item label={t('contracts.formAttachment')}>
                        {/* Show existing files when editing */}
                        {editingInvoice && existingFiles.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>
                                    {t('invoices.existingFiles')}
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
                                                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}
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
                            fileList={fileList}
                            onChange={({ fileList }) => setFileList(fileList)}
                            beforeUpload={() => false}
                            multiple
                        >
                            <Button icon={<PaperClipOutlined />}>{t('contracts.formAttachmentButton')}</Button>
                        </Upload>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default InvoiceList;
