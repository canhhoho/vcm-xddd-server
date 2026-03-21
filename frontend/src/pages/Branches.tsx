import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, message, Typography, Tooltip, Tabs, Select, Tag, Row, Col } from 'antd';
import { useTranslation } from 'react-i18next';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined, BankOutlined,
    PhoneOutlined, MailOutlined, SearchOutlined, FilterOutlined,
    TeamOutlined, SafetyCertificateOutlined, SolutionOutlined, EyeOutlined
} from '@ant-design/icons';
import { apiService } from '../services/api';
import type { ColumnsType } from 'antd/es/table';

import './Branches.css';
import { usePermissions } from '../hooks/usePermissions';
import { VcmFilterBar } from '../components/VcmFilterBar';
import { VcmActionGroup } from '../components/VcmActionGroup';
import { useBranches, useStaff, useBranchMutations, useStaffMutations } from '../hooks/useBranches';
import { useAppConfig } from '../hooks/useAppConfig';

// Icon mapping
const ICON_MAP: Record<string, React.ReactNode> = {
    'CrownOutlined': <span role="img" aria-label="director" className="anticon"><svg viewBox="64 64 896 896" focusable="false" data-icon="crown" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M899.6 276.5L705 396.4 518.4 147.5a8.06 8.06 0 00-12.9 0L319 396.4 124.3 276.5c-5.7-3.5-13 1.2-12.2 7.9l48.8 403.2c.7 5.5 5.3 9.6 10.8 9.6h680.5c5.5 0 10.1-4.1 10.8-9.6l48.8-403.2c.8-6.7-6.5-11.4-12.2-7.9zM738.2 624.7l-9.4 69.4H295.2l-9.4-69.4 225.8-138.7 226.6 138.7z"></path></svg></span>,
    'SafetyCertificateOutlined': <SafetyCertificateOutlined />,
    'TeamOutlined': <TeamOutlined />,
    'UsergroupAddOutlined': <UserOutlined />,
    'SolutionOutlined': <SolutionOutlined />,
    'UserOutlined': <UserOutlined />,
    'EyeOutlined': <EyeOutlined />,
    'EditOutlined': <EditOutlined />,
    'DeleteOutlined': <DeleteOutlined />,
};

const { Text } = Typography;

interface Branch {
    id: string;
    name: string;
    code: string;
    address?: string;
}

interface BranchStaff {
    id: string;
    branchId: string;
    branchCode: string;
    name: string;
    position: string;
    phone: string;
    email: string;
}

const Branches: React.FC = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('branches');
    // React Query Hooks
    const { data: branches = [], isLoading: branchesLoading } = useBranches();
    // Only fetch staff when Staff tab is active to prevent blocking the UI
    const { data: staff = [], isLoading: staffLoading } = useStaff(activeTab === 'staff');
    const { data: appConfig } = useAppConfig();

    // Mutations
    const { createBranch, updateBranch, deleteBranch } = useBranchMutations();
    const { createStaff, updateStaff, deleteStaff } = useStaffMutations();

    // Show loading only for the active tab's data
    const loading = activeTab === 'branches' ? branchesLoading : (staffLoading && activeTab === 'staff');

    // UI State
    const [modalVisible, setModalVisible] = useState(false);
    const [staffModalVisible, setStaffModalVisible] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [editingStaff, setEditingStaff] = useState<BranchStaff | null>(null);
    const [form] = Form.useForm();
    const [staffForm] = Form.useForm();

    // Permissions
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.branches === 'EDIT';

    // Filters for Staff tab
    const [selectedBranchFilter, setSelectedBranchFilter] = useState<string | undefined>();
    const [selectedPositionFilter, setSelectedPositionFilter] = useState<string | undefined>();
    const [searchText, setSearchText] = useState('');

    if (permissions.branches === 'NO_ACCESS' && !isAdmin) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>{t('branches.noAccess')}</h2>
                <p>{t('branches.noAccessDesc')}</p>
            </div>
        );
    }

    const positionOptions = useMemo(() => {
        // Fallback if POSITIONS is missing
        let positions = appConfig?.POSITIONS;
        if (!positions || positions.length === 0) {
            positions = [
                { code: 'DIRECTOR', name: t('branches.posDirector'), color: '#E11D2E', icon: 'CrownOutlined' },
                { code: 'DEPUTY_DIRECTOR', name: t('branches.posDeputyDirector'), color: '#1890ff', icon: 'SafetyCertificateOutlined' },
                { code: 'MANAGER', name: t('branches.posManager'), color: '#52c41a', icon: 'TeamOutlined' },
                { code: 'DEPUTY_MANAGER', name: t('branches.posDeputyManager'), color: '#722ed1', icon: 'UsergroupAddOutlined' },
                { code: 'LEADER', name: t('branches.posLeader'), color: '#fa8c16', icon: 'SolutionOutlined' },
                { code: 'STAFF', name: t('branches.posStaff'), color: '#595959', icon: 'UserOutlined' }
            ];
        }

        // Check if POSITIONS is array of strings or objects to be safe (backward compat)
        if (typeof positions[0] === 'string') {
            // Fallback for string array
            const TAG_COLORS = ['#E11D2E', '#1890ff', '#52c41a', '#722ed1'];
            return positions.map((pos: string, index: number) => ({
                value: pos,
                label: pos,
                color: TAG_COLORS[index % TAG_COLORS.length],
                icon: <UserOutlined />
            }));
        }

        // Handle Rich Object Structure
        return positions.map((pos: any) => ({
            value: pos.code,          // Use CODE as value
            label: pos.name,          // Display Name
            color: pos.color,         // Visual Color
            icon: ICON_MAP[pos.icon] || <UserOutlined /> // Visual Icon
        }));
    }, [appConfig, t]);

    const getPositionInfo = (position: string) => {
        // Try exact match (CODE) or Name match (Legacy)
        return positionOptions.find((p: any) => p.value === position || p.label === position) || { label: position, color: '#666', icon: null };
    };

    // Filtered staff based on filters
    const filteredStaff = useMemo(() => {
        return staff.filter((s: BranchStaff) => {
            const matchBranch = !selectedBranchFilter || s.branchId === selectedBranchFilter || s.branchCode === selectedBranchFilter;
            const matchPosition = !selectedPositionFilter || s.position === selectedPositionFilter;
            const matchSearch = !searchText ||
                s.name.toLowerCase().includes(searchText.toLowerCase()) ||
                s.phone.includes(searchText) ||
                s.email.toLowerCase().includes(searchText.toLowerCase());
            return matchBranch && matchPosition && matchSearch;
        });
    }, [staff, selectedBranchFilter, selectedPositionFilter, searchText]);

    // Branch handlers
    const handleCreateBranch = () => {
        setEditingBranch(null);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEditBranch = (record: Branch) => {
        setEditingBranch(record);
        form.setFieldsValue(record);
        setModalVisible(true);
    };

    const handleDeleteBranch = (record: Branch) => {
        Modal.confirm({
            title: t('common.confirm'),
            content: t('branches.deleteBranchConfirm', { name: record.name }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => {
                deleteBranch.mutate({ id: record.id }, {
                    onSuccess: (res: any) => {
                        if (res.success) {
                            message.success(t('branches.deleteBranchSuccess'));
                        } else {
                            message.error(res.error);
                        }
                    },
                    onError: () => {
                        message.error(t('common.error'));
                    }
                });
            },
        });
    };

    const handleBranchSubmit = async (values: any) => {
        const onSuccess = (res: any) => {
            if (res.success) {
                message.success(editingBranch ? t('branches.updateBranchSuccess') : t('branches.createBranchSuccess'));
                setModalVisible(false);
                form.resetFields();
            } else {
                message.error(res.error);
            }
        };

        const onError = () => {
            message.error(t('branches.saveBranchError'));
        };

        if (editingBranch) {
            updateBranch.mutate({ id: editingBranch.id, ...values }, { onSuccess, onError });
        } else {
            createBranch.mutate(values, { onSuccess, onError });
        }
    };

    // Staff handlers
    const handleCreateStaff = () => {
        setEditingStaff(null);
        staffForm.resetFields();
        setStaffModalVisible(true);
    };

    const handleEditStaff = (record: BranchStaff) => {
        setEditingStaff(record);
        staffForm.setFieldsValue(record);
        setStaffModalVisible(true);
    };

    const handleDeleteStaff = (record: BranchStaff) => {
        Modal.confirm({
            title: t('common.confirm'),
            content: t('branches.deleteStaffConfirm', { name: record.name }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => {
                deleteStaff.mutate({ id: record.id }, {
                    onSuccess: (res: any) => {
                        if (res.success) {
                            message.success(t('branches.deleteStaffSuccess'));
                        } else {
                            message.error(res.error);
                        }
                    },
                    onError: () => {
                        message.error(t('common.error'));
                    }
                });
            },
        });
    };

    const handleStaffSubmit = async (values: any) => {
        const onSuccess = (res: any) => {
            if (res.success) {
                message.success(editingStaff ? t('branches.updateStaffSuccess') : t('branches.createStaffSuccess'));
                setStaffModalVisible(false);
                staffForm.resetFields();
            } else {
                message.error(res.error);
            }
        };

        const onError = () => {
            message.error(t('branches.saveStaffError'));
        };

        if (editingStaff) {
            updateStaff.mutate({ id: editingStaff.id, ...values }, { onSuccess, onError });
        } else {
            createStaff.mutate(values, { onSuccess, onError });
        }
    };

    // Branch columns
    const branchColumns: ColumnsType<Branch> = [
        { title: t('branches.colIndex') || 'STT', key: 'index', width: 50, align: 'center', render: (_, __, index) => index + 1 },
        { title: t('branches.colCode'), dataIndex: 'code', key: 'code', width: 100, render: (text: string) => <Text strong style={{ color: '#E11D2E', whiteSpace: 'nowrap' }}>{text}</Text> },
        { title: t('branches.colName'), dataIndex: 'name', key: 'name', width: 180 },
        { title: t('branches.colAddress'), dataIndex: 'address', key: 'address', render: (text: string) => <Text type="secondary">{text || '-'}</Text> },
        {
            title: t('common.actions'), key: 'action', width: 120, align: 'center',
            render: (_, record) => (
                <VcmActionGroup
                    onEdit={() => handleEditBranch(record)}
                    canEdit={canEdit}
                />
            ),
        },
    ];

    // Staff columns
    const staffColumns: ColumnsType<BranchStaff> = [
        { title: t('branches.colIndex') || 'STT', key: 'index', width: 50, align: 'center', render: (_, __, index) => index + 1 },
        { title: t('branches.colCode'), dataIndex: 'branchCode', key: 'branchCode', width: 100, render: (text: string) => <Text strong style={{ color: '#E11D2E', whiteSpace: 'nowrap' }}>{text}</Text> },
        { title: t('branches.colStaffName'), dataIndex: 'name', key: 'name', width: 160, render: (text: string) => <Text strong>{text}</Text> },
        {
            title: t('branches.colPosition'), dataIndex: 'position', key: 'position', width: 150,
            render: (position: string) => {
                const info = getPositionInfo(position);
                return <Tag color={info.color}>{info.label}</Tag>;
            }
        },
        { title: t('branches.colPhone'), dataIndex: 'phone', key: 'phone', width: 120, render: (text: string) => <Space><PhoneOutlined style={{ color: '#52c41a' }} />{text}</Space> },
        { title: t('branches.colEmail'), dataIndex: 'email', key: 'email', render: (text: string) => <Space><MailOutlined style={{ color: '#1890ff' }} />{text}</Space> },
        {
            title: t('common.actions'), key: 'action', width: 120, align: 'center',
            render: (_, record) => (
                <VcmActionGroup
                    onEdit={() => handleEditStaff(record)}
                    onDelete={() => handleDeleteStaff(record)}
                    canEdit={canEdit}
                    canDelete={canEdit}
                />
            ),
        },
    ];

    // Staff Filters Component
    const renderStaffFilters = () => (
        <VcmFilterBar>
            <Col xs={24} sm={12} md={8}>
                <Input
                    placeholder={t('branches.searchPlaceholder')}
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                />
            </Col>
            <Col xs={24} sm={12} md={8}>
                <Select
                    placeholder={t('branches.filterBranch')}
                    value={selectedBranchFilter}
                    onChange={setSelectedBranchFilter}
                    allowClear
                    style={{ width: '100%' }}
                    suffixIcon={<FilterOutlined />}
                >
                    {branches.map((b: Branch) => (
                        <Select.Option key={b.id} value={b.id}>
                            {b.code} - {b.name}
                        </Select.Option>
                    ))}
                </Select>
            </Col>
            <Col xs={24} sm={12} md={8}>
                <Select
                    placeholder={t('branches.filterPosition')}
                    value={selectedPositionFilter}
                    onChange={setSelectedPositionFilter}
                    allowClear
                    style={{ width: '100%' }}
                >
                    {positionOptions.map((p: any) => (
                        <Select.Option key={p.value} value={p.value}>
                            <Tag color={p.color} style={{ marginRight: 8 }}>{p.label}</Tag>
                        </Select.Option>
                    ))}
                </Select>
            </Col>
        </VcmFilterBar>
    );

    const tabItems = [
        {
            key: 'branches',
            label: <span><BankOutlined /> {t('branches.tabBranches')}</span>,
            children: (
                <Table columns={branchColumns} dataSource={branches} rowKey="id" loading={loading} pagination={false} size="small" bordered className="branches-table" />
            )
        },
        {
            key: 'staff',
            label: <span><UserOutlined /> {t('branches.tabStaff')}</span>,
            children: (
                <>
                    {renderStaffFilters()}
                    <Table
                        columns={staffColumns}
                        dataSource={filteredStaff}
                        rowKey="id"
                        loading={loading}
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: true,
                            showTotal: (total) => t('branches.totalStaff', { total }),
                        }}
                        size="small"
                        bordered
                        className="branches-table"
                    />
                </>
            )
        }
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
                        {t('branches.title')}
                    </h2>
                    {canEdit && (
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={activeTab === 'branches' ? handleCreateBranch : handleCreateStaff}
                            className="vcm-btn-premium"
                        >
                            {activeTab === 'branches' ? t('branches.addBranch') : t('branches.addStaff')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Tabs Card */}
            <Card className="branches-card" bodyStyle={{ padding: '0 16px 16px' }}>
                <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
            </Card>

            {/* Branch Modal */}
            <Modal
                title={editingBranch ? t('branches.modalEditBranch') : t('branches.modalAddBranch')}
                open={modalVisible}
                onCancel={() => { setModalVisible(false); form.resetFields(); }}
                onOk={() => form.submit()}
                okText={editingBranch ? t('common.update') : t('common.add')}
                cancelText={t('common.cancel')}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleBranchSubmit}>
                    <Form.Item name="code" label={t('branches.formBranchCode')} rules={[{ required: true, message: t('branches.formBranchCodeReq') }]}>
                        <Input placeholder="VD: YGN, MDY..." />
                    </Form.Item>
                    <Form.Item name="name" label={t('branches.formBranchName')} rules={[{ required: true, message: t('branches.formBranchNameReq') }]}>
                        <Input placeholder="VD: Yangon, Mandalay..." />
                    </Form.Item>
                    <Form.Item name="address" label={t('branches.formAddress')}>
                        <Input placeholder={t('branches.formAddress')} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Staff Modal */}
            <Modal
                title={editingStaff ? t('branches.modalEditStaff') : t('branches.modalAddStaff')}
                open={staffModalVisible}
                onCancel={() => { setStaffModalVisible(false); staffForm.resetFields(); }}
                onOk={() => staffForm.submit()}
                okText={editingStaff ? t('common.update') : t('common.add')}
                cancelText={t('common.cancel')}
                destroyOnClose
                width={600}
            >
                <Form form={staffForm} layout="vertical" onFinish={handleStaffSubmit}>
                    <Form.Item name="branchId" label={t('branches.filterBranch')} rules={[{ required: true, message: t('branches.formBranchReq') }]}>
                        <Select placeholder={t('branches.filterBranch')}>
                            {branches.map((b: Branch) => <Select.Option key={b.id} value={b.id}>{b.code} - {b.name}</Select.Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="name" label={t('branches.formStaffName')} rules={[{ required: true, message: t('branches.formStaffNameReq') }]}>
                        <Input placeholder={t('branches.formStaffName')} />
                    </Form.Item>
                    <Form.Item name="position" label={t('branches.formPosition')} rules={[{ required: true, message: t('branches.formPositionReq') }]}>
                        <Select placeholder={t('branches.formPosition')}>
                            {positionOptions.map((p: any) => <Select.Option key={p.value} value={p.value}>{p.label}</Select.Option>)}
                        </Select>
                    </Form.Item>
                    <Form.Item name="phone" label={t('branches.formPhone')} rules={[{ required: true, message: t('branches.formPhoneReq') }]}>
                        <Input placeholder="VD: 0901234567" />
                    </Form.Item>
                    <Form.Item name="email" label={t('branches.formEmail')} rules={[{ required: true, message: t('branches.formEmailReq') }, { type: 'email', message: t('branches.formEmailInvalid') }]}>
                        <Input placeholder="VD: ten@vcm.com" />
                    </Form.Item>
                </Form>
            </Modal>
        </div >
    );
};

export default Branches;
