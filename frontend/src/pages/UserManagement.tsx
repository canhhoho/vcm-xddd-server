import React, { useEffect, useState, useMemo } from 'react';
import {
    Tabs,
    Table,
    Button,
    Modal,
    Form,
    Input,
    Select,
    Tag,
    Space,
    message,
    Popconfirm,
    Card,
    Typography,
    Tooltip,
    Row,
    Col,
    Dropdown
} from 'antd';
import type { MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    TeamOutlined,
    SafetyCertificateOutlined,
    SaveOutlined,
    KeyOutlined,
    SearchOutlined,
    FilterOutlined,
    FileExcelOutlined,
    IdcardOutlined,
    EyeOutlined,
    HistoryOutlined
} from '@ant-design/icons';
import { apiService } from '../services/api';
import { usePermissions } from '../hooks/usePermissions';
import type { Position, User, UserRole, ModulePermission, ModuleAccess, Activity } from '../types';
import './UserManagement.css';
import { useFilterSync } from '../hooks/useFilterSync';
import { VcmFilterBar } from '../components/VcmFilterBar';
import { FilterChips } from '../components/FilterChips';
import { VcmActionGroup } from '../components/VcmActionGroup';

// React Query Hooks
import {
    useUsers,
    usePositions,
    useModulePermissions,
    useActivities,
    useUserMutations,
    usePositionMutations,
    usePermissionMutations
} from '../hooks/useUsers';
import { useAppConfig } from '../hooks/useAppConfig';

const { Title, Text } = Typography;

const { Option } = Select;

// Icon mapping
const ICON_MAP: Record<string, React.ReactNode> = {
    'CrownOutlined': <span role="img" aria-label="director" className="anticon"><svg viewBox="64 64 896 896" focusable="false" data-icon="crown" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M899.6 276.5L705 396.4 518.4 147.5a8.06 8.06 0 00-12.9 0L319 396.4 124.3 276.5c-5.7-3.5-13 1.2-12.2 7.9l48.8 403.2c.7 5.5 5.3 9.6 10.8 9.6h680.5c5.5 0 10.1-4.1 10.8-9.6l48.8-403.2c.8-6.7-6.5-11.4-12.2-7.9zM738.2 624.7l-9.4 69.4H295.2l-9.4-69.4 225.8-138.7 226.6 138.7z"></path></svg></span>,
    'SafetyCertificateOutlined': <SafetyCertificateOutlined />,
    'TeamOutlined': <TeamOutlined />,
    'UsergroupAddOutlined': <TeamOutlined />, // Fallback to TeamOutlined if UsergroupAddOutlined is not imported
    'SolutionOutlined': <FileExcelOutlined />, // Fallback or import
    'UserOutlined': <TeamOutlined />, // Fallback
    'EyeOutlined': <EyeOutlined />,
    'EditOutlined': <EditOutlined />,
    'DeleteOutlined': <DeleteOutlined />,
};

// Module definitions for permission matrix - moved labels to translation files
const MODULE_KEYS = ['targets', 'business', 'plans', 'contracts', 'projects', 'branches'];

// Position categories defaults (keys for translation or absolute values)
const DEFAULT_CATEGORY_KEYS = ['leader', 'construction', 'business', 'qs', 'project', 'other'];

const UserManagement: React.FC = () => {
    const { t } = useTranslation();
    const { isAdmin } = usePermissions();
    const canEdit = isAdmin; // Only admins can manage users
    const [activeTab, setActiveTab] = useState<'users' | 'permissions' | 'positions' | 'activities'>('users');

    // --- REACT QUERY DATA ---
    const { data: positions = [] } = usePositions();
    const { data: users = [], isLoading: usersLoading } = useUsers();
    const { data: modulePermissions = [], isLoading: permissionsLoading } = useModulePermissions();
    const { data: activities = [], isLoading: activitiesLoading } = useActivities(activeTab === 'activities');
    const { data: appConfig } = useAppConfig();

    // Mutations
    const { createUser, updateUser, deleteUser } = useUserMutations();
    const { createPosition, updatePosition, deletePosition } = usePositionMutations();
    const { savePermissions } = usePermissionMutations();

    const [userModalOpen, setUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userForm] = Form.useForm();

    // Password Reset Modal State
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);
    const [passwordForm] = Form.useForm();
    const [changePasswordUser, setChangePasswordUser] = useState<User | null>(null);

    // Position Modal State
    const [positionModalOpen, setPositionModalOpen] = useState(false);
    const [editingPosition, setEditingPosition] = useState<Position | null>(null);
    const [positionForm] = Form.useForm();

    // Module Permissions State
    const [permissionsDirty, setPermissionsDirty] = useState(false);
    // Local state for permissions to handle "Dirty" state before saving
    // We sync with server data initially, then let user edit locally
    const [localPermissions, setLocalPermissions] = useState<ModulePermission[]>([]);

    useEffect(() => {
        if (modulePermissions.length > 0) {
            setLocalPermissions(modulePermissions);
        }
    }, [modulePermissions]);

    // Activities State
    const [activityFilterUser, setActivityFilterUser] = useState<string | null>(null);

    // Filters State
    const [searchText, setSearchText] = useFilterSync('q', '');
    const [selectedPosition, setSelectedPosition] = useFilterSync<string | undefined>('position', undefined);
    const [selectedCategory, setSelectedCategory] = useFilterSync<string | undefined>('category', undefined);

    console.log('UserManagement Permission Debug:', { isAdmin, role: usePermissions().role });

    // Active Filters List for Chips
    const activeFilters = [
        { key: 'q', label: t('common.search'), value: searchText, onRemove: () => setSearchText('') },
        {
            key: 'position',
            label: t('users.colPosition'),
            value: selectedPosition,
            displayValue: positions.find((p: Position) => p.code === selectedPosition)?.name,
            onRemove: () => setSelectedPosition(undefined)
        },
        { key: 'category', label: t('users.colGroup'), value: selectedCategory, onRemove: () => setSelectedCategory(undefined) }
    ];

    // --- ACCESS CONTROL ---
    if (!isAdmin) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '80vh',
                flexDirection: 'column'
            }}>
                <SafetyCertificateOutlined style={{ fontSize: 64, color: '#ff4d4f', marginBottom: 16 }} />
                <Title level={3}>{t('branches.noAccess')}</Title>
                <Text>{t('users.noAccessDescShort')}</Text>
                <Button type="primary" style={{ marginTop: 24 }} href="/dashboard">
                    {t('common.back')}
                </Button>
            </div>
        );
    }

    const clearAllFilters = () => {
        setSearchText('');
        setSelectedPosition(undefined);
        setSelectedCategory(undefined);
    };

    const categories = useMemo(() => {
        const configGroups = appConfig?.GROUPS;
        if (configGroups && configGroups.length > 0) return configGroups;
        return DEFAULT_CATEGORY_KEYS.map(key => t(`users.categories.${key}`, key));
    }, [appConfig, t]);

    // Filtered users based on filters
    const filteredUsers = useMemo(() => {
        return users.filter((u: User) => {
            const position = positions.find((p: Position) => p.id === u.positionId);
            const name = String(u?.name || '').toLowerCase();
            const email = String(u?.email || '').toLowerCase();
            const searchTerm = searchText.toLowerCase();

            const matchSearch = !searchText ||
                name.includes(searchTerm) ||
                email.includes(searchTerm) ||
                (u.positionName && String(u.positionName).toLowerCase().includes(searchTerm));
            const matchPosition = !selectedPosition || u.positionId === selectedPosition;
            const matchCategory = !selectedCategory || position?.category === selectedCategory;
            return matchSearch && matchPosition && matchCategory;
        });
    }, [users, positions, searchText, selectedPosition, selectedCategory]);

    const filteredActivities = useMemo(() => {
        if (!activityFilterUser) return activities;
        return activities.filter((a: Activity) => a.email === activityFilterUser);
    }, [activities, activityFilterUser]);

    // Filtered permissions based on filters
    const filteredPermissions = useMemo(() => {
        return localPermissions.filter((p: ModulePermission) => {
            const user = users.find((u: User) => u.id === p.userId);
            const name = String(p.userName || '').toLowerCase();
            const searchTerm = searchText.toLowerCase();

            const matchSearch = !searchText || name.includes(searchTerm);
            const matchPosition = !selectedPosition || user?.positionId === selectedPosition;
            const matchCategory = !selectedCategory || (p as any).category === selectedCategory;

            return matchSearch && matchPosition && matchCategory;
        });
    }, [localPermissions, users, searchText, selectedPosition, selectedCategory]);

    const exportActivities = async () => {
        const dataToExport = filteredActivities.map((a: Activity) => ({
            [t('users.activities.colTime')]: new Date(a.createdAt).toLocaleString('vi-VN'),
            [t('users.activities.colUser')]: a.email,
            [t('users.activities.colAction')]: a.action,
            [t('users.activities.colDetail')]: a.description
        }));

        // Use global XLSX from CDN
        const XLSX = (window as any).XLSX;
        if (!XLSX) {
            message.error('Thư viện Excel chưa được tải. Vui lòng thử lại sau.');
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, t('users.activities.exportSheetName'));
        XLSX.writeFile(workbook, `${t('users.activities.exportFileName')}.xlsx`);
    };

    // Export Excel Handler
    const handleExportExcel = async () => {
        // Prepare data for export (exclude sensitive fields)
        const exportData = filteredUsers.map((u: User) => ({
            [t('users.colPosition')]: u.positionName || '',
            [t('users.colName')]: u.name || '',
            [t('users.colEmail')]: u.email || '',
            [t('users.colGroup')]: u.category || '',
            [t('users.colDescription')]: u.description || '',
        }));

        // Use global XLSX from CDN
        const XLSX = (window as any).XLSX;
        if (!XLSX) {
            message.error('Thư viện Excel chưa được tải. Vui lòng thử lại sau.');
            return;
        }

        // Create workbook and worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Người dùng');

        // Set column widths
        ws['!cols'] = [
            { wch: 20 }, // Chức danh
            { wch: 25 }, // Họ tên
            { wch: 25 }, // Email
            { wch: 15 }, // Nhóm
            { wch: 40 }, // Mô tả chi tiết
        ];

        // Generate filename with date
        const fileName = `${t('users.export.usersFileName')}_${new Date().toISOString().slice(0, 10)}.xlsx`;

        // Download file
        XLSX.writeFile(wb, fileName);
        message.success(t('users.exportSuccess', { total: filteredUsers.length }));
    };

    // User Handlers
    const handleCreateUser = () => {
        setEditingUser(null);
        userForm.resetFields();
        setUserModalOpen(true);
    };

    const handleEditUser = (record: User) => {
        setEditingUser(record);
        userForm.setFieldsValue(record);
        setUserModalOpen(true);
    };

    const handleDeleteUser = (id: string) => {
        Modal.confirm({
            title: t('users.deleteUserConfirm'),
            content: t('users.deleteUserConfirmDesc'),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => {
                deleteUser.mutate({ id }, {
                    onSuccess: (res: any) => {
                        if (res.success) {
                            message.success(t('common.success'));
                        } else {
                            message.error(res.error);
                        }
                    },
                    onError: () => {
                        message.error(t('common.error'));
                    }
                });
            }
        });
    };

    const handleUserSubmit = async () => {
        try {
            const values = await userForm.validateFields();

            // Lookup positionCode and positionName from selected position
            const selectedPosition = positions.find((p: Position) => p.id === values.positionId);
            const payload = {
                ...values,
                id: editingUser?.id,
                positionCode: selectedPosition?.code || '',
                positionName: selectedPosition?.name || values.positionId || '', // Use name or fallback to ID
            };

            const onSuccess = (res: any) => {
                if (res.success) {
                    message.success(editingUser ? t('common.success') : t('common.success'));
                    setUserModalOpen(false);
                } else {
                    message.error(res.error);
                }
            };

            const onError = () => {
                message.error(t('common.error'));
            };

            if (editingUser) {
                updateUser.mutate(payload, { onSuccess, onError });
            } else {
                createUser.mutate(payload, { onSuccess, onError });
            }
        } catch (error) {
            // Validation error
        }
    };

    const handlePasswordReset = (record: User) => {
        setChangePasswordUser(record);
        passwordForm.resetFields();
        setPasswordModalOpen(true);
    };

    const handlePasswordSubmit = async () => {
        try {
            const values = await passwordForm.validateFields();
            if (!changePasswordUser) return;

            const payload = {
                id: changePasswordUser.id,
                password: values.newPassword
            };

            updateUser.mutate(payload, {
                onSuccess: (res: any) => {
                    if (res.success) {
                        message.success(t('users.resetPasswordSuccess'));
                        setPasswordModalOpen(false);
                    } else {
                        message.error(res.error);
                    }
                },
                onError: () => {
                    message.error(t('common.error'));
                }
            });
        } catch (error) {
            // Validation error
        }
    };

    // Position Handlers
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleCreatePosition = () => {
        setEditingPosition(null);
        positionForm.resetFields();
        setPositionModalOpen(true);
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleEditPosition = (position: Position) => {
        setEditingPosition(position);
        positionForm.setFieldsValue(position);
        setPositionModalOpen(true);
    };

    const handleDeletePosition = (id: string) => {
        Modal.confirm({
            title: t('users.deletePositionConfirm'),
            content: t('users.deletePositionConfirmDesc'),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => {
                deletePosition.mutate({ id }, {
                    onSuccess: (res: any) => {
                        if (res.success) {
                            message.success(t('common.success'));
                        } else {
                            message.error(res.error);
                        }
                    },
                    onError: () => {
                        message.error(t('common.error'));
                    }
                });
            }
        });
    };

    const handlePositionSubmit = async () => {
        try {
            const values = await positionForm.validateFields();
            const payload = { ...values, id: editingPosition?.id };

            const onSuccess = (res: any) => {
                if (res.success) {
                    message.success(t('common.success'));
                    setPositionModalOpen(false);
                } else {
                    message.error(res.error);
                }
            };

            const onError = () => {
                message.error(t('common.error'));
            };

            if (editingPosition) {
                updatePosition.mutate(payload, { onSuccess, onError });
            } else {
                createPosition.mutate(payload, { onSuccess, onError });
            }
        } catch (error) {
            // Validation error
        }
    };

    // Module Permission Handlers
    const handlePermissionChange = (userId: string, moduleKey: string, value: ModuleAccess) => {
        setLocalPermissions(prev =>
            prev.map(p =>
                p.userId === userId
                    ? { ...p, [moduleKey]: value }
                    : p
            )
        );
        setPermissionsDirty(true);
    };

    const handleSavePermissions = () => {
        savePermissions.mutate(localPermissions, {
            onSuccess: (res: any) => {
                if (res.success) {
                    message.success(t('common.success'));
                    setPermissionsDirty(false);
                } else {
                    message.error(res.error);
                }
            },
            onError: () => {
                message.error(t('common.error'));
            }
        });
    };

    // Role tag colors
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const getRoleColor = (role?: UserRole | ModuleAccess) => {
        switch (role) {
            case 'ADMIN': return 'red';
            case 'EDIT': return 'blue';
            case 'VIEW': return 'green';
            case 'NO_ACCESS': return 'default';
            default: return 'default';
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const getRoleLabel = (role?: UserRole | ModuleAccess) => {
        switch (role) {
            case 'ADMIN': return t('users.formDefaultRoleAdmin');
            case 'EDIT': return t('users.formDefaultRoleEdit');
            case 'VIEW': return t('users.formDefaultRoleView');
            case 'NO_ACCESS': return t('users.formDefaultRoleNo');
            default: return role || '-';
        }
    };

    const renderFilters = () => (
        <VcmFilterBar>
            <Col xs={24} sm={12} md={8}>
                <Input
                    placeholder={t('users.searchPlaceholder')}
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                />
            </Col>
            <Col xs={24} sm={12} md={8}>
                <Select
                    placeholder={t('users.filterPosition')}
                    value={selectedPosition}
                    onChange={setSelectedPosition}
                    allowClear
                    style={{ width: '100%' }}
                    suffixIcon={<FilterOutlined />}
                >
                    <Select.Option value="ALL">{t('common.all')}</Select.Option>
                    {positions.map((p: Position) => (
                        <Select.Option key={p.id} value={p.id}>
                            {t(`users.positions.${p.code}`, p.name)}
                        </Select.Option>
                    ))}
                </Select>
            </Col>
            <Col xs={24} sm={12} md={8}>
                <Select
                    placeholder={t('users.filterGroup')}
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                    allowClear
                    style={{ width: '100%' }}
                >
                    {categories.map((cat: string) => (
                        <Option key={cat} value={cat}>
                            {t(`users.groups.${cat}`, cat)}
                        </Option>
                    ))}
                </Select>
            </Col>
        </VcmFilterBar>
    );

    // Combined Users Table Columns (with Position info)
    const userColumns = [
        {
            title: t('users.colPosition'),
            dataIndex: 'positionName',
            key: 'positionName',
            width: 150,
            render: (text: string, record: User) => {
                const pos = positions.find((p: Position) => p.id === record.positionId);
                const label = pos ? t(`users.positions.${pos.code}`, pos.name) : text;
                return label || <Text type="secondary">-</Text>;
            }
        },
        {
            title: t('users.colName'),
            dataIndex: 'name',
            key: 'name',
            width: 180,
            render: (text: string) => <Text strong>{text}</Text>
        },
        {
            title: t('users.colEmail'),
            dataIndex: 'email',
            key: 'email',
            width: 200,
        },
        {
            title: t('users.colGroup'),
            dataIndex: 'category',
            key: 'category',
            width: 120,
            render: (text: string) => <Text>{text ? t(`users.groups.${text}`, text) : '-'}</Text>
        },
        {
            title: t('users.colDescription'),
            dataIndex: 'description',
            key: 'description',
            width: 250,
            ellipsis: true,
            render: (text: string) => {
                const desc = text || '-';
                return (
                    <Tooltip title={desc} placement="topLeft">
                        <Text
                            style={{ cursor: 'pointer' }}
                            ellipsis
                        >
                            {desc}
                        </Text>
                    </Tooltip>
                );
            }
        },
        {
            title: t('users.colPassword'),
            key: 'password',
            width: 100,
            render: () => (
                <Text type="secondary">••••••</Text>
            )
        },
        {
            title: t('common.actions'),
            key: 'actions',
            width: 110, // Narrowed from 150 to be "vừa đủ"
            fixed: 'right' as const,
            render: (_: any, record: User) => (
                <VcmActionGroup
                    onEdit={() => handleEditUser(record)}
                    onDelete={() => handleDeleteUser(record.id)}
                    canEdit={canEdit}
                    canDelete={canEdit}
                    deleteConfirmTitle={t('users.deleteUserConfirm')}
                >
                    <Tooltip title={t('users.modalResetPassword')}>
                        <Button
                            type="text"
                            size="small"
                            className="vcm-table-action-btn"
                            icon={<KeyOutlined />}
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePasswordReset(record);
                            }}
                            style={{ color: '#fa8c16', backgroundColor: '#FFF7E6' }}
                        />
                    </Tooltip>
                </VcmActionGroup>
            )
        }
    ];

    // Module Permissions Table Columns
    const permissionColumns = useMemo(() => [
        {
            title: t('users.tabUsers'),
            dataIndex: 'userName',
            key: 'userName',
            fixed: 'left' as const,
            width: 180,
            render: (text: string) => <Text strong>{text}</Text>
        },
        {
            title: t('users.colPosition'),
            key: 'position',
            width: 200,
            render: (_: any, record: ModulePermission) => {
                // Use positionName and category directly from permission record
                const posName = (record as any).positionName || '';
                const cat = (record as any).category || '';
                return (
                    <Text type="secondary">
                        {posName || '-'} {cat ? `(${cat})` : ''}
                    </Text>
                );
            }
        },
        ...MODULE_KEYS.map(key => ({
            title: t(`users.modules.${key}`),
            dataIndex: key,
            key: key,
            width: 140, // Consistent width for all permission columns
            render: (access: ModuleAccess, record: ModulePermission) => (
                <Select
                    value={access || 'NO_ACCESS'}
                    onChange={(val) => handlePermissionChange(record.userId, key, val)}
                    style={{ width: '100%' }}
                    size="small"
                    popupMatchSelectWidth={false}
                >
                    <Option value="EDIT">
                        <Tag color="blue">✓ {t('users.formDefaultRoleEdit')}</Tag>
                    </Option>
                    <Option value="VIEW">
                        <Tag color="green">• {t('users.formDefaultRoleView')}</Tag>
                    </Option>
                    <Option value="NO_ACCESS">
                        <Tag color="default">✕ {t('users.formDefaultRoleNo')}</Tag>
                    </Option>
                </Select>
            )
        }))
    ], [users, positions, handlePermissionChange, t]);

    // Position Table Columns
    const positionColumns = [
        {
            title: t('common.code'),
            dataIndex: 'code',
            key: 'code',
            width: 120,
            render: (text: string) => <Tag color="blue">{text}</Tag>
        },
        {
            title: t('users.formPositionName'),
            dataIndex: 'name',
            key: 'name',
            width: 200,
            render: (text: string, record: Position) => <Text strong>{t(`users.positions.${record.code}`, text)}</Text>
        },
        {
            title: t('users.colGroup'),
            dataIndex: 'category',
            key: 'category',
            width: 150,
            filters: (categories as string[]).map(c => ({ text: t(`users.groups.${c}`, c), value: c })),
            onFilter: (value: any, record: Position) => record.category === value,
        },
        {
            title: t('users.formDefaultRole'),
            dataIndex: 'defaultRole',
            key: 'defaultRole',
            width: 150,
            render: (role: UserRole) => (
                <Tag color={getRoleColor(role)}>{getRoleLabel(role)}</Tag>
            )
        },
        {
            title: t('common.description'),
            dataIndex: 'description',
            key: 'description',
            ellipsis: true
        },
        {
            title: t('common.actions'),
            key: 'actions',
            width: 100,
            render: (_: any, record: Position) => (
                <VcmActionGroup
                    onEdit={() => handleEditPosition(record)}
                    onDelete={() => handleDeletePosition(record.id)}
                    canEdit={canEdit}
                    canDelete={canEdit}
                    deleteConfirmTitle={t('users.deletePositionConfirm')}
                />
            )
        }
    ];



    if (!isAdmin) {
        return (
            <div className="user-management-blocked">
                <Card>
                    <Title level={4}>⛔ {t('branches.noAccess')}</Title>
                    <Text type="secondary">
                        {t('users.noAccessDescShort')}
                    </Text>
                </Card>
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
                        {t('users.title')}
                    </h2>
                    <Space>
                        <Dropdown
                            menu={{
                                items: [
                                    {
                                        key: 'users',
                                        label: t('users.export.users'),
                                        icon: <TeamOutlined />,
                                        onClick: handleExportExcel
                                    },
                                    {
                                        key: 'activities',
                                        label: t('users.export.activities'),
                                        icon: <HistoryOutlined />,
                                        onClick: exportActivities
                                    }
                                ]
                            }}
                            placement="bottomRight"
                        >
                            <Button
                                type="primary"
                                icon={<FileExcelOutlined />}
                                className="vcm-btn-secondary"
                            >
                                {t('users.exportExcel')}
                            </Button>
                        </Dropdown>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleCreateUser}
                            className="vcm-btn-premium"
                        >
                            {t('users.modalAddUser').toUpperCase()}
                        </Button>
                    </Space>
                </div>
            </div>

            {/* Tabs Content */}
            <div className="user-management-content">
                <Tabs
                    activeKey={activeTab}
                    onChange={(key) => setActiveTab(key as 'users' | 'permissions' | 'positions' | 'activities')}
                    tabBarExtraContent={activeTab === 'permissions' ? (
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            onClick={handleSavePermissions}
                            disabled={!permissionsDirty}
                            className={permissionsDirty ? "vcm-btn-premium" : ""}
                        >
                            {permissionsDirty ? t('users.savePermissions') : t('users.saved')}
                        </Button>
                    ) : null}
                    items={[
                        {
                            key: 'users',
                            label: (
                                <span>
                                    <TeamOutlined /> {t('users.tabUsers')} ({filteredUsers.length})
                                </span>
                            ),
                            children: (
                                <>
                                    {renderFilters()}
                                    <div style={{ marginBottom: 16 }}>
                                        <FilterChips filters={activeFilters} onClearAll={clearAllFilters} />
                                    </div>
                                    <Table
                                        columns={userColumns}
                                        dataSource={filteredUsers}
                                        rowKey="id"
                                        loading={usersLoading}
                                        pagination={{
                                            pageSize: 10,
                                            showSizeChanger: true,
                                            showTotal: (total) => t('users.totalUsers', { total }),
                                        }}
                                        scroll={{ x: 1110 }} // Total width: 150+180+200+120+250+100+110 = 1110
                                        className="user-table"
                                        size="small"
                                    />
                                </>
                            )
                        },

                        {
                            key: 'permissions',
                            label: (
                                <span>
                                    <SafetyCertificateOutlined /> {t('users.tabPermissions')}
                                </span>
                            ),
                            children: (
                                <div className="permissions-matrix">
                                    <div className="permissions-legend">
                                        <Text type="secondary">{t('users.legendTitle')}</Text>
                                        <Tag color="blue">{t('users.legendEdit')}</Tag>
                                        <Tag color="green">{t('users.legendView')}</Tag>
                                        <Tag color="default">{t('users.legendNoAccess')}</Tag>
                                    </div>
                                    <Table
                                        columns={permissionColumns}
                                        dataSource={filteredPermissions}
                                        rowKey="userId"
                                        loading={permissionsLoading}
                                        pagination={{
                                            pageSize: 20,
                                            showSizeChanger: true,
                                            showTotal: (total) => t('users.totalUsers', { total }),
                                        }}
                                        scroll={{ x: 700 }}
                                        bordered
                                        size="small"
                                    />
                                </div>
                            )
                        },
                        {
                            key: 'activities',
                            label: (
                                <span>
                                    <HistoryOutlined /> {t('users.activities.tabTitle')}
                                </span>
                            ),
                            children: (
                                <>
                                    <div style={{ marginBottom: 16 }}>
                                        <Space>
                                            <span style={{ fontStyle: 'italic', color: '#666' }}>{t('users.activities.filterLabel')}</span>
                                            <Select
                                                style={{ width: 250 }}
                                                placeholder={t('users.activities.filterPlaceholder')}
                                                allowClear
                                                onChange={setActivityFilterUser}
                                                showSearch
                                                optionFilterProp="children"
                                            >
                                                {(users || []).map((u: User) => (
                                                    <Option key={u.email} value={u.email}>{u.name} ({u.email})</Option>
                                                ))}
                                            </Select>
                                        </Space>
                                    </div>
                                    <Table
                                        columns={[
                                            {
                                                title: t('users.activities.colTime'),
                                                dataIndex: 'createdAt',
                                                key: 'createdAt',
                                                width: 180,
                                                render: (text) => {
                                                    if (!text) return '-';
                                                    const d = new Date(text);
                                                    return isNaN(d.getTime()) ? '-' : d.toLocaleString('vi-VN');
                                                }
                                            },
                                            {
                                                title: t('users.activities.colUser'),
                                                dataIndex: 'email',
                                                key: 'email',
                                                width: 250,
                                            },
                                            {
                                                title: t('users.activities.colAction'),
                                                dataIndex: 'action',
                                                key: 'action',
                                                width: 150,
                                                render: (action) => {
                                                    let color = 'default';
                                                    if (action === 'LOGIN') color = 'green';
                                                    else if (action === 'LOGOUT') color = 'default';
                                                    else if (action.includes('CREATE')) color = 'blue';
                                                    else if (action.includes('UPDATE')) color = 'orange';
                                                    else if (action.includes('DELETE')) color = 'red';
                                                    return <Tag color={color}>{action}</Tag>;
                                                }
                                            },
                                            {
                                                title: t('users.activities.colDetail'),
                                                dataIndex: 'description',
                                                key: 'description',
                                            }
                                        ]}
                                        dataSource={filteredActivities}
                                        rowKey="id"
                                        loading={activitiesLoading}
                                        pagination={{ pageSize: 20, showSizeChanger: true }}
                                        scroll={{ x: 900 }}
                                        size="small"
                                    />
                                </>
                            )
                        }
                    ]}
                />
            </div>

            {/* User Modal */}
            <Modal
                title={editingUser ? t('users.modalEditUser') : t('users.modalAddUser')}
                open={userModalOpen}
                onOk={handleUserSubmit}
                onCancel={() => setUserModalOpen(false)}
                okText={editingUser ? t('common.save') : t('common.add')}
                cancelText={t('common.cancel')}
                width={500}
            >
                <Form form={userForm} layout="vertical">
                    <Form.Item
                        name="name"
                        label={t('users.formName')}
                        rules={[{ required: true, message: t('users.formNameReq') }]}
                    >
                        <Input placeholder={t('users.placeholders.fullName')} />
                    </Form.Item>
                    <Form.Item
                        name="email"
                        label={t('users.formEmail')}
                        rules={[
                            { required: true, message: t('users.formEmailReq') },
                            { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t('users.formEmailInvalid') }
                        ]}
                        normalize={(value) => value.trim()}
                    >
                        <Input placeholder="user@vcm.com" />
                    </Form.Item>
                    {!editingUser && (
                        <Form.Item
                            name="password"
                            label={t('users.formPassword')}
                            rules={[{ required: true, message: t('users.formPasswordReq') }]}
                        >
                            <Input.Password placeholder={t('users.formPassword')} />
                        </Form.Item>
                    )}
                    <Form.Item name="positionId" label={t('users.formPosition')}>
                        <Select
                            placeholder={t('users.formPositionPlaceholder')}
                            allowClear
                            onChange={(value) => {
                                const selectedPos = positions.find((p: Position) => p.id === value);
                                if (selectedPos) {
                                    userForm.setFieldsValue({
                                        category: selectedPos.category,
                                        description: selectedPos.description
                                    });
                                }
                            }}
                        >
                            {(positions || []).map((p: Position) => (
                                <Option key={p.id} value={p.id}>
                                    {t(`users.positions.${p.code}`, p.name)}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="category" label={t('users.formGroup')}>
                        <Select placeholder={t('users.formGroupPlaceholder')}>
                            {categories.map((cat: string) => (
                                <Option key={cat} value={cat}>{t(`users.groups.${cat}`, cat)}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="description" label={t('users.formDescription')}>
                        <Input.TextArea
                            rows={3}
                            placeholder={t('users.formDescriptionPlaceholder')}
                        />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Password Modal */}
            <Modal
                title={`${t('users.modalResetPassword')}: ${changePasswordUser?.name || ''} `}
                open={passwordModalOpen}
                onOk={handlePasswordSubmit}
                onCancel={() => setPasswordModalOpen(false)}
                okText={t('common.save')}
                cancelText={t('common.cancel')}
                width={400}
            >
                <Form form={passwordForm} layout="vertical">
                    <Form.Item
                        name="newPassword"
                        label={t('users.formNewPassword')}
                        rules={[
                            { required: true, message: t('users.formNewPasswordReq') },
                            { min: 6, message: t('users.formNewPasswordMin') }
                        ]}
                    >
                        <Input.Password placeholder={t('users.formNewPassword')} />
                    </Form.Item>
                    <Form.Item
                        name="confirmPassword"
                        label={t('users.formConfirmPassword')}
                        dependencies={['newPassword']}
                        rules={[
                            { required: true, message: t('users.formConfirmPasswordReq') },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (!value || getFieldValue('newPassword') === value) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error(t('users.formConfirmPasswordMismatch')));
                                },
                            }),
                        ]}
                    >
                        <Input.Password placeholder={t('users.formConfirmPassword')} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Position Modal */}
            <Modal
                title={editingPosition ? t('users.modalEditPosition') : t('users.modalAddPosition')}
                open={positionModalOpen}
                onOk={handlePositionSubmit}
                onCancel={() => setPositionModalOpen(false)}
                okText={editingPosition ? t('common.save') : t('common.add')}
                cancelText={t('common.cancel')}
                width={500}
                footer={[
                    editingPosition && (
                        <Popconfirm
                            key="delete"
                            title={t('users.deletePositionConfirm')}
                            onConfirm={() => {
                                handleDeletePosition(editingPosition.id);
                                setPositionModalOpen(false);
                            }}
                            okText={t('common.delete')}
                            cancelText={t('common.cancel')}
                        >
                            <Button danger>{t('users.deletePositionBtn')}</Button>
                        </Popconfirm>
                    ),
                    <Button key="cancel" onClick={() => setPositionModalOpen(false)}>{t('common.cancel')}</Button>,
                    <Button key="submit" type="primary" onClick={handlePositionSubmit}>
                        {editingPosition ? t('common.save') : t('common.add')}
                    </Button>
                ]}
            >
                <Form form={positionForm} layout="vertical">
                    <Form.Item
                        name="name"
                        label={t('users.formPositionName')}
                        rules={[{ required: true, message: t('users.formPositionNameReq') }]}
                    >
                        <Input placeholder={t('users.placeholders.posName')} />
                    </Form.Item>
                    <Form.Item
                        name="code"
                        label={t('users.formPositionCode')}
                        rules={[{ required: true, message: t('users.formPositionCodeReq') }]}
                    >
                        <Input placeholder={t('users.placeholders.posCode')} />
                    </Form.Item>
                    <Form.Item
                        name="category"
                        label={t('users.formPositionGroup')}
                        rules={[{ required: true, message: t('users.formPositionGroupReq') }]}
                    >
                        <Select placeholder={t('users.formGroupPlaceholder')}>
                            {categories.map((cat: string) => (
                                <Option key={cat} value={cat}>{t(`users.groups.${cat}`, cat)}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="defaultRole"
                        label={t('users.formDefaultRole')}
                        rules={[{ required: true, message: t('users.formDefaultRoleReq') }]}
                    >
                        <Select placeholder={t('users.formDefaultRoleReq')}>
                            <Option value="ADMIN">{t('users.formDefaultRoleAdmin')}</Option>
                            <Option value="EDIT">{t('users.formDefaultRoleEdit')}</Option>
                            <Option value="VIEW">{t('users.formDefaultRoleView')}</Option>
                            <Option value="NO_ACCESS">{t('users.formDefaultRoleNo')}</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="description" label={t('common.description')}>
                        <Input.TextArea rows={2} placeholder={`${t('common.description')}...`} />
                    </Form.Item>
                </Form>
            </Modal>
        </div >
    );
};

export default UserManagement;
