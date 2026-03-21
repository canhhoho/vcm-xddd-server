import React, { useState, useMemo, useCallback } from 'react';
import { Button, Input, Modal, Form, DatePicker, Select, message, Row, Col, List, Tag } from 'antd';
import {
    EnvironmentOutlined,
    SearchOutlined,
    PlusOutlined,
    CalendarOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { apiService } from '../services/api';
import ProjectDetail from './ProjectDetail';
import type { Project, Contract, Province } from '../types';
import './Projects.css';
import { useFilterSync } from '../hooks/useFilterSync';
import { usePermissions } from '../hooks/usePermissions';
import { FilterChips } from '../components/FilterChips';
import { useTranslation } from 'react-i18next';
import { VcmFilterBar } from '../components/VcmFilterBar';
import { VcmActionGroup } from '../components/VcmActionGroup';
import { ProjectCard } from '../components/ProjectCard';

// React Query Hooks
import { useProjects, useProjectMutations } from '../hooks/useProjects';
import { useContracts } from '../hooks/useContracts';
import { useAppConfig } from '../hooks/useAppConfig';

const { Option } = Select;

// --- HELPERS ---
const normalizeId = (id: any): string => {
    if (id === null || id === undefined) return '';
    let str = String(id).trim();
    if (str.endsWith('.0')) str = str.slice(0, -2);
    if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        if (!isNaN(num)) return num.toString();
    }
    return str;
};

const Projects: React.FC = () => {
    const { t } = useTranslation();

    // UI State
    const [view, setView] = useState<'dashboard' | 'detail'>('dashboard');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

    // Modal State
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    // Permissions
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.projects === 'EDIT';
    const canView = isAdmin || permissions.projects === 'VIEW' || permissions.projects === 'EDIT';

    // React Query Hooks
    const { data: projects = [], isLoading: loadingProjects } = useProjects(canView);
    const { data: contracts = [], isLoading: loadingContracts } = useContracts(canView);
    const { data: appConfig, isLoading: loadingConfig } = useAppConfig(canView);
    const { createProject, updateProject, deleteProject } = useProjectMutations();

    const branches: Province[] = appConfig?.BRANCHES || [];
    const loading = loadingProjects || loadingContracts || loadingConfig || submitting;

    if (permissions.projects === 'NO_ACCESS' && !isAdmin) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>{t('contracts.noAccess')}</h2>
                <p>{t('contracts.noAccessDesc')}</p>
            </div>
        );
    }


    // Filters (Synced with URL)
    const [searchText, setSearchText] = useFilterSync('q', '');
    const [statusFilter, setStatusFilter] = useFilterSync<string | undefined>('status', undefined);
    const [locationFilter, setLocationFilter] = useFilterSync<string | undefined>('branch', undefined);

    // Active Filters List for Chips
    const activeFilters = useMemo(() => [
        { key: 'q', label: t('common.search'), value: searchText, onRemove: () => setSearchText('') },
        {
            key: 'status',
            label: t('common.status'),
            value: statusFilter,
            displayValue: appConfig?.STATUS ? appConfig.STATUS[statusFilter || ''] : statusFilter,
            onRemove: () => setStatusFilter(undefined)
        },
        {
            key: 'branch',
            label: t('projects.branchPlaceholder'),
            value: locationFilter,
            displayValue: branches.find(b => normalizeId(b.id) === normalizeId(locationFilter))?.code,
            onRemove: () => setLocationFilter(undefined)
        }
    ], [searchText, statusFilter, locationFilter, branches, appConfig, t, setSearchText, setStatusFilter, setLocationFilter]);

    const clearAllFilters = useCallback(() => {
        setSearchText('');
        setStatusFilter(undefined);
        setLocationFilter(undefined);
    }, [setSearchText, setStatusFilter, setLocationFilter]);

    const handleCreate = useCallback(() => {
        setEditingProject(null);
        form.resetFields();
        setIsModalVisible(true);
    }, [form]);

    const handleEdit = useCallback((project: Project) => {
        setEditingProject(project);

        // Handle legacy data: location might be a Code (e.g. "YGN") instead of ID
        let locationValue = project.location;
        if (locationValue) {
            const normLoc = normalizeId(locationValue);
            // Check if locationValue matches any Branch ID (normalized)
            const matchId = branches.find(b => normalizeId(b.id) === normLoc);
            if (matchId) {
                locationValue = matchId.id; // Use the actual branch id
            } else {
                // Try to find by Code
                const matchCode = branches.find(b => b.code === locationValue);
                if (matchCode) {
                    locationValue = matchCode.id;
                }
            }
        }

        form.setFieldsValue({
            ...project,
            location: locationValue,
            startDate: project.startDate ? dayjs(project.startDate) : null,
            endDate: project.endDate ? dayjs(project.endDate) : null,
        });
        setIsModalVisible(true);
    }, [branches, form]);

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);
            const payload = {
                ...values,
                startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : '',
                endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : '',
                id: editingProject?.id,
            };

            const onSuccess = (res: any) => {
                if (res.success) {
                    message.success(editingProject ? t('projects.updateSuccess') : t('projects.createSuccess'));
                    setIsModalVisible(false);
                } else {
                    message.error(t('projects.saveFailed') + res.error);
                }
                setSubmitting(false);
            };

            const onError = () => {
                message.error(t('projects.saveFailed'));
                setSubmitting(false);
            }

            if (editingProject) {
                updateProject.mutate(payload, { onSuccess, onError });
            } else {
                createProject.mutate(payload, { onSuccess, onError });
            }
        } catch (error) {
            // Validation failed
            setSubmitting(false);
        }
    };

    const handleDelete = useCallback((project: Project) => {
        Modal.confirm({
            title: t('projects.deleteConfirmTitle'),
            content: t('projects.deleteConfirmContent', { name: project.name }),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => {
                deleteProject.mutate({ id: project.id }, {
                    onSuccess: (res) => {
                        if (res.success) {
                            message.success(t('projects.deleteSuccess'));
                        } else {
                            message.error(t('projects.deleteFailed') + res.error);
                        }
                    },
                    onError: () => {
                        message.error(t('projects.deleteError'));
                    }
                });
            },
        });
    }, [deleteProject, t]);

    // Derived Data
    const selectedProject = useMemo(() => projects.find((p: Project) => p.id === selectedProjectId), [projects, selectedProjectId]);
    const filteredProjects = useMemo(() => {
        return projects.filter((p: Project) => {
            const matchSearch = !searchText ||
                p.name.toLowerCase().includes(searchText.toLowerCase()) ||
                p.code.toLowerCase().includes(searchText.toLowerCase());
            const matchStatus = !statusFilter || p.status === statusFilter;
            const matchLocation = !locationFilter || normalizeId(p.location) === normalizeId(locationFilter);
            return matchSearch && matchStatus && matchLocation;
        });
    }, [projects, searchText, statusFilter, locationFilter]);

    const getStatusInfo = (status: string) => {
        const statusMap: Record<string, string> = appConfig?.STATUS || {};
        const label = status === 'INPROCESS' ? statusMap.IN_PROGRESS : (statusMap[status] || status);

        if (status === 'INProcess' || status === 'INPROCESS' || status === 'IN_PROGRESS') {
            return { label: label || t('projects.statusInProcess'), className: 'status-doing' };
        } else if (status === 'DONE') {
            return { label: label || t('projects.statusDone'), className: 'status-done' };
        } else if (status === 'TODO') {
            return { label: label || t('projects.statusTodo'), className: 'status-planning' };
        } else {
            return { label: label || status, className: 'status-planning' };
        }
    };

    // --- RENDER HELPERS ---
    const renderDashboard = () => (
        <div className="vcm-page-container">
            {/* Premium Header - Standardized across the app */}
            <div className="vcm-premium-header">
                {/* Decorative circles */}
                <div className="vcm-header-decorative-circle vcm-circle-1" />
                <div className="vcm-header-decorative-circle vcm-circle-2" />

                <div className="vcm-header-content">
                    <h2 className="vcm-header-title">
                        {t('projects.pageTitle')}
                    </h2>
                    {canEdit && (
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleCreate}
                            className="vcm-btn-premium"
                        >
                            {t('projects.createProject')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Filter Row - đồng bộ style với Branches, Contracts, User */}
            <VcmFilterBar>
                <Col xs={24} sm={12} md={8}>
                    <Input
                        placeholder={t('projects.searchPlaceholder')}
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        allowClear
                    />
                </Col>
                <Col xs={24} sm={12} md={8}>
                    <Select
                        placeholder={t('projects.statusPlaceholder')}
                        value={statusFilter}
                        onChange={setStatusFilter}
                        allowClear
                        style={{ width: '100%' }}
                    >
                        {appConfig?.STATUS && (
                            <>
                                <Option value="TODO">{appConfig.STATUS.TODO}</Option>
                                <Option value="INPROCESS">{appConfig.STATUS.IN_PROGRESS}</Option>
                                <Option value="DONE">{appConfig.STATUS.DONE}</Option>
                            </>
                        )}
                        {!appConfig?.STATUS && (
                            <>
                                <Option value="TODO">{t('projects.statusTodo')}</Option>
                                <Option value="INPROCESS">{t('projects.statusInProcess')}</Option>
                                <Option value="DONE">{t('projects.statusDone')}</Option>
                            </>
                        )}
                    </Select>
                </Col>
                <Col xs={24} sm={12} md={8}>
                    <Select
                        placeholder={t('projects.branchPlaceholder')}
                        value={locationFilter}
                        onChange={setLocationFilter}
                        allowClear
                        showSearch
                        optionFilterProp="children"
                        style={{ width: '100%' }}
                    >
                        {branches.map(b => (
                            <Option key={b.id} value={b.id}>{b.code}</Option>
                        ))}
                    </Select>
                </Col>
            </VcmFilterBar>

            <div style={{ padding: '0 16px', marginBottom: 16 }}>
                <FilterChips filters={activeFilters} onClearAll={clearAllFilters} />
            </div>

            <List
                grid={{ gutter: 24, xs: 1, sm: 1, md: 2, lg: 3, xl: 3, xxl: 4 }}
                dataSource={filteredProjects}
                loading={loading}
                renderItem={(item: Project) => (
                    <List.Item>
                        <ProjectCard
                            project={item}
                            branches={branches}
                            statusMap={appConfig?.STATUS}
                            canEdit={canEdit}
                            onView={() => { setSelectedProjectId(item.id); setView('detail'); }}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                        />
                    </List.Item>
                )}
            />
        </div>
    );

    const renderDetail = () => {
        if (!selectedProject) return null;
        return (
            <ProjectDetail
                project={selectedProject}
                onBack={() => setView('dashboard')}
            />
        );
    };


    return (
        <div style={{ height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
            {view === 'dashboard' ? renderDashboard() : renderDetail()}

            <Modal
                title={editingProject ? t('projects.updateProject') : t('projects.createProject')}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
                width={800}
                centered
                okText={editingProject ? t('common.update') : t('common.create')}
                cancelText={t('common.cancel')}
                destroyOnClose
            >
                <Form form={form} layout="vertical">
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="code" label={t('projects.formCode')} rules={[{ required: true, message: t('projects.formCodeReq') }]}>
                                <Input placeholder="VCM-2024-..." />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="name" label={t('projects.formName')} rules={[{ required: true, message: t('projects.formNameReq') }]}>
                                <Input placeholder={t('projects.taskNamePlaceholder')} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="investor" label={t('projects.formInvestor')}>
                                <Input placeholder="Tên chủ đầu tư..." />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="location" label={t('projects.formBranch')}>
                                <Select showSearch optionFilterProp="children" placeholder={t('projects.branchPlaceholder')}>
                                    {branches.map(b => (
                                        <Option key={b.id} value={b.id}>{b.code}</Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="contractId" label={t('projects.formContract')}>
                                <Select showSearch optionFilterProp="children" allowClear placeholder={t('projects.formContract')}>
                                    {contracts.map(c => (
                                        <Option key={c.id} value={c.id}>{c.code} - {c.name}</Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="status" label={t('projects.formStatus')}>
                                <Select placeholder={t('projects.statusPlaceholder')}>
                                    {appConfig?.STATUS && (
                                        <>
                                            <Option value="TODO">{appConfig.STATUS.TODO}</Option>
                                            <Option value="INPROCESS">{appConfig.STATUS.IN_PROGRESS}</Option>
                                            <Option value="DONE">{appConfig.STATUS.DONE}</Option>
                                        </>
                                    )}
                                    {!appConfig?.STATUS && (
                                        <>
                                            <Option value="TODO">{t('projects.statusTodo')}</Option>
                                            <Option value="INPROCESS">{t('projects.statusInProcess')}</Option>
                                            <Option value="DONE">{t('projects.statusDone')}</Option>
                                        </>
                                    )}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="startDate" label={t('projects.formStart')}>
                                <DatePicker className="w-full" format="DD/MM/YYYY" placeholder={t('common.selectDate')} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="endDate"
                                label={t('projects.formEnd')}
                                rules={[
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            if (!value || !getFieldValue('startDate') || value.isAfter(getFieldValue('startDate'))) {
                                                return Promise.resolve();
                                            }
                                            return Promise.reject(new Error(t('projects.formEndAfterStart')));
                                        },
                                    }),
                                ]}
                            >
                                <DatePicker className="w-full" format="DD/MM/YYYY" placeholder={t('common.selectDate')} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="description" label={t('projects.formDesc')}>
                        <Input.TextArea rows={3} placeholder={t('projects.taskDescPlaceholder')} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default Projects;
