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
import { useBranches, useStaff, useBranchMutations, useStaffMutations, useCollaborators, useCollaboratorMutations } from '../hooks/useBranches';
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

interface Collaborator {
    id: string;
    name: string;
    company: string;
    speciality: string;
    phone: string;
    email: string;
    address: string;
    note: string;
    branchId: string;
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
    const { data: collaborators = [], isLoading: collaboratorsLoading } = useCollaborators(activeTab === 'collaborators');
    const { data: appConfig } = useAppConfig();

    // Mutations
    const { createBranch, updateBranch, deleteBranch } = useBranchMutations();
    const { createStaff, updateStaff, deleteStaff } = useStaffMutations();
    const { createCollaborator, updateCollaborator, deleteCollaborator } = useCollaboratorMutations();

    // Show loading only for the active tab's data
    const loading = activeTab === 'branches' ? branchesLoading
        : activeTab === 'staff' ? staffLoading
        : collaboratorsLoading;

    // UI State
    const [modalVisible, setModalVisible] = useState(false);
    const [staffModalVisible, setStaffModalVisible] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [editingStaff, setEditingStaff] = useState<BranchStaff | null>(null);
    const [collaboratorModalVisible, setCollaboratorModalVisible] = useState(false);
    const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | null>(null);
    const [form] = Form.useForm();
    const [staffForm] = Form.useForm();
    const [collaboratorForm] = Form.useForm();

    // Permissions
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.branches === 'EDIT';

    // Filters for Staff tab
    const [selectedBranchFilter, setSelectedBranchFilter] = useState<string | undefined>();
    const [selectedPositionFilter, setSelectedPositionFilter] = useState<string | undefined>();
    const [searchText, setSearchText] = useState('');

    const [collabSearchText, setCollabSearchText] = useState('');
    const [collabBranchFilter, setCollabBranchFilter] = useState<string | undefined>();

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
        return positions.map((pos: any) => {
            const transKey = 'pos' + pos.code.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
            return {
                value: pos.code,
                label: t(`branches.${transKey}`, pos.name),
                color: pos.color,
                icon: ICON_MAP[pos.icon] || <UserOutlined />
            };
        });
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

    const filteredCollaborators = useMemo(() => {
        return collaborators.filter((c: Collaborator) => {
            const matchBranch = !collabBranchFilter || c.branchId === collabBranchFilter;
            const matchSearch = !collabSearchText ||
                c.name.toLowerCase().includes(collabSearchText.toLowerCase()) ||
                c.company.toLowerCase().includes(collabSearchText.toLowerCase()) ||
                c.speciality.toLowerCase().includes(collabSearchText.toLowerCase()) ||
                c.phone.includes(collabSearchText) ||
                c.email.toLowerCase().includes(collabSearchText.toLowerCase());
            return matchBranch && matchSearch;
        });
    }, [collaborators, collabBranchFilter, collabSearchText]);

    // Collaborator handlers
    const handleCreateCollaborator = () => {
        setEditingCollaborator(null);
        collaboratorForm.resetFields();
        setCollaboratorModalVisible(true);
    };

    const handleEditCollaborator = (record: Collaborator) => {
        setEditingCollaborator(record);
        collaboratorForm.setFieldsValue(record);
        setCollaboratorModalVisible(true);
    };

    const handleDeleteCollaborator = (record: Collaborator) => {
        Modal.confirm({
            title: t('common.confirm'),
            content: t('branches.deleteCollaboratorConfirm', { name: record.name }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => {
                deleteCollaborator.mutate({ id: record.id }, {
                    onSuccess: (res: any) => {
                        if (res.success) {
                            message.success(t('branches.deleteCollaboratorSuccess'));
                        } else {
                            message.error(res.error);
                        }
                    },
                    onError: () => { message.error(t('common.error')); }
                });
            },
        });
    };

    const handleCollaboratorSubmit = async (values: any) => {
        const onSuccess = (res: any) => {
            if (res.success) {
                message.success(editingCollaborator ? t('branches.updateCollaboratorSuccess') : t('branches.createCollaboratorSuccess'));
                setCollaboratorModalVisible(false);
                collaboratorForm.resetFields();
            } else {
                message.error(res.error);
            }
        };
        const onError = () => { message.error(t('branches.saveCollaboratorError')); };
        if (editingCollaborator) {
            updateCollaborator.mutate({ id: editingCollaborator.id, ...values }, { onSuccess, onError });
        } else {
            createCollaborator.mutate(values, { onSuccess, onError });
        }
    };

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
        {
            title: t('branches.filterBranch'), dataIndex: 'branchCode', key: 'branchCode', width: 90,
            render: (text: string, record: BranchStaff) => (
                <Tooltip title={(record as any).branchName || text}>
                    <Text strong style={{ color: '#E11D2E', whiteSpace: 'nowrap' }}>{text || '-'}</Text>
                </Tooltip>
            )
        },
        { title: t('branches.colStaffName'), dataIndex: 'name', key: 'name', render: (text: string) => <Text strong>{text}</Text> },
        {
            title: t('branches.colPosition'), dataIndex: 'position', key: 'position', width: 140,
            render: (position: string) => {
                const info = getPositionInfo(position);
                return <Tag color={info.color}>{info.label}</Tag>;
            }
        },
        { title: t('branches.colPhone'), dataIndex: 'phone', key: 'phone', width: 130, render: (text: string) => <Space><PhoneOutlined style={{ color: '#52c41a' }} />{text || '-'}</Space> },
        { title: t('branches.colEmail'), dataIndex: 'email', key: 'email', width: 220, render: (text: string) => text ? <Space><MailOutlined style={{ color: '#1890ff' }} />{text}</Space> : '-' },
        {
            title: t('common.actions'), key: 'action', width: 100, align: 'center', fixed: 'right' as const,
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

    // Collaborator columns
    const collaboratorColumns: ColumnsType<Collaborator> = [
        { title: t('branches.colIndex'), key: 'index', width: 50, align: 'center', render: (_, __, index) => index + 1 },
        {
            title: t('branches.filterBranch'), dataIndex: 'branchId', key: 'branchId', width: 90,
            render: (id: string) => { const b = branches.find((br: Branch) => br.id === id); return b ? <Text strong style={{ color: '#E11D2E' }}>{b.code}</Text> : '-'; }
        },
        { title: t('branches.colCollabName'), dataIndex: 'name', key: 'name', width: 160, render: (text: string) => <Text strong>{text}</Text> },
        { title: t('branches.colCollabCompany'), dataIndex: 'company', key: 'company', width: 170, render: (text: string) => <Text>{text || '-'}</Text> },
        { title: t('branches.colCollabSpeciality'), dataIndex: 'speciality', key: 'speciality', width: 130, render: (text: string) => text ? <Tag color="blue">{text}</Tag> : <Text type="secondary">-</Text> },
        { title: t('branches.colPhone'), dataIndex: 'phone', key: 'phone', width: 130, render: (text: string) => text ? <Space><PhoneOutlined style={{ color: '#52c41a' }} />{text}</Space> : '-' },
        { title: t('branches.colEmail'), dataIndex: 'email', key: 'email', render: (text: string) => text ? <Space><MailOutlined style={{ color: '#1890ff' }} />{text}</Space> : '-' },
        { title: t('branches.colCollabNote'), dataIndex: 'note', key: 'note', width: 160, ellipsis: true, render: (text: string) => <Text type="secondary">{text || '-'}</Text> },
        {
            title: t('common.actions'), key: 'action', width: 100, align: 'center', fixed: 'right' as const,
            render: (_, record) => (
                <VcmActionGroup
                    onEdit={() => handleEditCollaborator(record)}
                    onDelete={() => handleDeleteCollaborator(record)}
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

    const renderCollaboratorFilters = () => (
        <VcmFilterBar>
            <Col xs={24} sm={12} md={10}>
                <Input
                    placeholder={t('branches.collabSearchPlaceholder')}
                    prefix={<SearchOutlined />}
                    value={collabSearchText}
                    onChange={(e) => setCollabSearchText(e.target.value)}
                    allowClear
                />
            </Col>
            <Col xs={24} sm={12} md={8}>
                <Select
                    placeholder={t('branches.filterBranch')}
                    value={collabBranchFilter}
                    onChange={setCollabBranchFilter}
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
                        scroll={{ x: 750 }}
                        className="branches-table"
                    />
                </>
            )
        },
        {
            key: 'collaborators',
            label: <span><TeamOutlined /> {t('branches.tabCollaborators')}</span>,
            children: (
                <>
                    {renderCollaboratorFilters()}
                    <Table
                        columns={collaboratorColumns}
                        dataSource={filteredCollaborators}
                        rowKey="id"
                        loading={loading}
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: true,
                            showTotal: (total) => t('branches.totalCollaborators', { total }),
                        }}
                        size="small"
                        bordered
                        scroll={{ x: 1000 }}
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
                            onClick={activeTab === 'branches' ? handleCreateBranch : activeTab === 'staff' ? handleCreateStaff : handleCreateCollaborator}
                            className="vcm-btn-premium"
                        >
                            {activeTab === 'branches' ? t('branches.addBranch') : activeTab === 'staff' ? t('branches.addStaff') : t('branches.addCollaborator')}
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
                            {branches.map((b: Branch) => <Select.Option key={b.id} value={b.id}>{b.code}</Select.Option>)}
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
            {/* Collaborator Modal */}
            <Modal
                title={editingCollaborator ? t('branches.modalEditCollaborator') : t('branches.modalAddCollaborator')}
                open={collaboratorModalVisible}
                onCancel={() => { setCollaboratorModalVisible(false); collaboratorForm.resetFields(); }}
                onOk={() => collaboratorForm.submit()}
                okText={editingCollaborator ? t('common.update') : t('common.add')}
                cancelText={t('common.cancel')}
                destroyOnClose
                width={620}
            >
                <Form form={collaboratorForm} layout="vertical" onFinish={handleCollaboratorSubmit}>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="name" label={t('branches.formCollabName')} rules={[{ required: true, message: t('branches.formCollabNameReq') }]}>
                                <Input placeholder={t('branches.formCollabName')} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="company" label={t('branches.formCollabCompany')}>
                                <Input placeholder={t('branches.formCollabCompany')} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="speciality" label={t('branches.formCollabSpeciality')}>
                                <Input placeholder={t('branches.formCollabSpeciality')} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="branchId" label={t('branches.filterBranch')}>
                                <Select placeholder={t('branches.filterBranch')} allowClear>
                                    {branches.map((b: Branch) => <Select.Option key={b.id} value={b.id}>{b.code} - {b.name}</Select.Option>)}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="phone" label={t('branches.formPhone')}>
                                <Input placeholder="VD: 0901234567" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="email" label={t('branches.formEmail')} rules={[{ type: 'email', message: t('branches.formEmailInvalid') }]}>
                                <Input placeholder="VD: ten@email.com" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="address" label={t('branches.formAddress')}>
                        <Input placeholder={t('branches.formAddress')} />
                    </Form.Item>
                    <Form.Item name="note" label={t('branches.formCollabNote')}>
                        <Input.TextArea rows={2} placeholder={t('branches.formCollabNote')} />
                    </Form.Item>
                </Form>
            </Modal>
        </div >
    );
};

export default Branches;
