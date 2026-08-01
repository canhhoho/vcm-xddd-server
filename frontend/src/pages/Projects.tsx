import React, { useState, useMemo, useCallback } from 'react';
import { Button, Input, Modal, Form, DatePicker, Select, message, Row, Col, List, AutoComplete, Upload, Tooltip, Space } from 'antd';
import {
    SearchOutlined,
    PlusOutlined,
    PaperClipOutlined,
    FilePdfOutlined,
    CloseCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { apiService } from '../services/api';
import ProjectDetail from './ProjectDetail';
import type { Project, Province } from '../types';
import type { ProjectInput } from '../services/api.interface';
import './Projects.css';
import { useFilterSync } from '../hooks/useFilterSync';
import { normalizeId } from '../utils/projectUtils';
import { usePermissions } from '../hooks/usePermissions';
import { FilterChips } from '../components/FilterChips';
import { useTranslation } from 'react-i18next';
import { VcmFilterBar } from '../components/VcmFilterBar';
import { ProjectCard } from '../components/ProjectCard';
import { BRAND_COLORS } from '../styles/brandIdentity';

// React Query Hooks
import { useProjects, useProjectMutations } from '../hooks/useProjects';
import { useContracts } from '../hooks/useContracts';
import { useAppConfig } from '../hooks/useAppConfig';

const { Option } = Select;

const DATE_FORMAT = 'YYYY-MM-DD';

/** Tách chuỗi URL file (phân tách bằng xuống dòng hoặc dấu phẩy) thành mảng */
const parseFileUrls = (files: string | undefined | null): string[] => {
    if (!files) return [];
    return files.split(/[\r\n,]+/).map(f => f.trim()).filter(f => f.length > 0);
};

/** Giá trị prefill cho Form — set trong afterOpenChange, không set trước khi mở */
interface PendingFormValues {
    code?: string;
    name?: string;
    investor?: string;
    location?: string;
    status?: Project['status'];
    description?: string;
    startDate: dayjs.Dayjs | null;
    endDate: dayjs.Dayjs | null;
}

const Projects: React.FC = () => {
    const { t } = useTranslation();

    // ⚠️ Toàn bộ hook phải nằm trên early return NO_ACCESS ở cuối component.
    // Đặt `return` xen giữa danh sách hook làm số hook đổi giữa các lần render
    // và React ném "Rendered fewer hooks than expected" (trắng trang).

    // UI State
    const [view, setView] = useState<'dashboard' | 'detail'>('dashboard');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

    // Modal State
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [fileList, setFileList] = useState<any[]>([]);
    const [existingFiles, setExistingFiles] = useState<string[]>([]);
    const [pendingValues, setPendingValues] = useState<PendingFormValues | null>(null);

    // Permissions
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.projects === 'EDIT';
    const canView = isAdmin || permissions.projects === 'VIEW' || permissions.projects === 'EDIT';
    const isBlocked = permissions.projects === 'NO_ACCESS' && !isAdmin;

    // React Query Hooks
    const { data: projects = [], isLoading: loadingProjects } = useProjects(canView);
    const { data: contracts = [], isLoading: loadingContracts } = useContracts(canView);
    const { data: appConfig, isLoading: loadingConfig } = useAppConfig(canView);
    const { createProject, updateProject, deleteProject } = useProjectMutations();

    const branches: Province[] = useMemo(() => appConfig?.BRANCHES || [], [appConfig]);
    const loading = loadingProjects || loadingContracts || loadingConfig || submitting;

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
            displayValue: statusFilter
                ? t(statusFilter === 'INPROCESS' ? 'projects.statusInProcess' : statusFilter === 'DONE' ? 'projects.statusDone' : 'projects.statusTodo')
                : statusFilter,
            onRemove: () => setStatusFilter(undefined)
        },
        {
            key: 'branch',
            label: t('projects.branchPlaceholder'),
            value: locationFilter,
            displayValue: branches.find(b => normalizeId(b.id) === normalizeId(locationFilter))?.code,
            onRemove: () => setLocationFilter(undefined)
        }
    ], [searchText, statusFilter, locationFilter, branches, t, setSearchText, setStatusFilter, setLocationFilter]);

    const clearAllFilters = useCallback(() => {
        setSearchText('');
        setStatusFilter(undefined);
        setLocationFilter(undefined);
    }, [setSearchText, setStatusFilter, setLocationFilter]);

    const handleCreate = useCallback(() => {
        setEditingProject(null);
        setPendingValues(null);
        form.resetFields();
        setFileList([]);
        setExistingFiles([]);
        setIsModalVisible(true);
    }, [form]);

    const handleEdit = useCallback((project: Project) => {
        setEditingProject(project);

        // Dữ liệu cũ: location có thể là Code (ví dụ "YGN") thay vì ID
        let locationValue = project.location;
        if (locationValue) {
            const normLoc = normalizeId(locationValue);
            const matchId = branches.find(b => normalizeId(b.id) === normLoc);
            if (matchId) {
                locationValue = matchId.id;
            } else {
                const matchCode = branches.find(b => b.code === locationValue);
                if (matchCode) locationValue = matchCode.id;
            }
        }

        // Modal dùng destroyOnHidden -> Form chưa mount khi modal còn đóng.
        // Gọi form.setFieldsValue() ở đây sẽ mất sạch giá trị và antd cảnh báo
        // "Instance created by useForm is not connected to any Form element".
        // Lưu vào state, set trong afterOpenChange.
        setPendingValues({
            code: project.code,
            name: project.name,
            investor: project.investor,
            location: locationValue,
            status: project.status,
            description: project.description,
            startDate: project.startDate ? dayjs(project.startDate) : null,
            endDate: project.endDate ? dayjs(project.endDate) : null,
        });
        setFileList([]);
        setExistingFiles(parseFileUrls(project.fileUrls));
        setIsModalVisible(true);
    }, [branches]);

    const handleOk = useCallback(async () => {
        let values;
        try {
            values = await form.validateFields();
        } catch {
            return; // Validation failed — antd đã hiện lỗi dưới từng field
        }

        setSubmitting(true);
        try {
            // Upload file mới
            let uploadedUrls = '';
            const newFiles = fileList.filter((file: any) => file.originFileObj || file instanceof File);
            if (newFiles.length > 0) {
                const filesToUpload = newFiles.map((file: any) => file.originFileObj || file);
                // Endpoint riêng của /projects: mượn /contracts/upload sẽ bị
                // moduleAccess('contracts') trả 403 cho user chỉ có quyền projects.
                const uploadRes = await apiService.uploadProjectFiles(filesToUpload);
                if (!uploadRes.success) {
                    message.error(uploadRes.error || t('invoices.systemError'));
                    return;
                }
                uploadedUrls = uploadRes.data?.urls?.join('\n') || '';
            }

            // Gộp file cũ giữ lại + file mới
            const keptFilesStr = editingProject ? existingFiles.join('\n') : '';
            const finalFiles = [keptFilesStr, uploadedUrls].filter(Boolean).join('\n');

            const payload: ProjectInput = {
                code: values.code,
                name: values.name,
                investor: values.investor,
                location: values.location,
                status: values.status,
                description: values.description,
                startDate: values.startDate ? values.startDate.format(DATE_FORMAT) : null,
                endDate: values.endDate ? values.endDate.format(DATE_FORMAT) : null,
                fileUrls: finalFiles,
            };

            if (editingProject) {
                await updateProject.mutateAsync({ ...payload, id: editingProject.id });
                message.success(t('projects.updateSuccess'));
            } else {
                await createProject.mutateAsync(payload);
                message.success(t('projects.createSuccess'));
            }

            setIsModalVisible(false);
            setFileList([]);
            setExistingFiles([]);
            setPendingValues(null);
        } catch (err) {
            message.error(t('projects.saveFailed') + (err instanceof Error ? err.message : ''));
        } finally {
            setSubmitting(false);
        }
    }, [form, fileList, existingFiles, editingProject, createProject, updateProject, t]);

    // Xác nhận xoá do VcmActionGroup (Popconfirm) lo — không mở thêm Modal.confirm,
    // trước đây hai lớp xác nhận chồng lên nhau.
    const handleDelete = useCallback((project: Project) => {
        deleteProject.mutate({ id: project.id }, {
            onSuccess: () => message.success(t('projects.deleteSuccess')),
            onError: (err: Error) => message.error(t('projects.deleteFailed') + err.message),
        });
    }, [deleteProject, t]);

    // Derived Data
    const selectedProject = useMemo(
        () => projects.find((p: Project) => p.id === selectedProjectId),
        [projects, selectedProjectId],
    );

    const filteredProjects = useMemo(() => {
        const keyword = searchText.toLowerCase();
        return projects.filter((p: Project) => {
            // name/code không NOT NULL trong DB — không guard là TypeError khi gõ tìm kiếm.
            const matchSearch = !keyword ||
                (p.name || '').toLowerCase().includes(keyword) ||
                (p.code || '').toLowerCase().includes(keyword);
            const matchStatus = !statusFilter || p.status === statusFilter;
            const matchLocation = !locationFilter || normalizeId(p.location) === normalizeId(locationFilter);
            return matchSearch && matchStatus && matchLocation;
        });
    }, [projects, searchText, statusFilter, locationFilter]);

    const hasActiveFilter = Boolean(searchText || statusFilter || locationFilter);

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
                        <Option value="TODO">{t('projects.statusTodo')}</Option>
                        <Option value="INPROCESS">{t('projects.statusInProcess')}</Option>
                        <Option value="DONE">{t('projects.statusDone')}</Option>
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
                locale={{
                    emptyText: (
                        <div style={{ padding: '48px 0', textAlign: 'center' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>
                                {hasActiveFilter ? '🔍' : '📋'}
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: BRAND_COLORS.textPrimary, marginBottom: 6 }}>
                                {hasActiveFilter ? t('projects.emptyFiltered') : t('projects.emptyAll')}
                            </div>
                            <div style={{ fontSize: 13, color: BRAND_COLORS.textMuted }}>
                                {hasActiveFilter ? t('projects.emptyFilteredHint') : t('projects.emptyAllHint')}
                            </div>
                        </div>
                    )
                }}
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

    // Early return đặt sau toàn bộ hook (xem ghi chú ở đầu component).
    if (isBlocked) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>{t('contracts.noAccess')}</h2>
                <p>{t('contracts.noAccessDesc')}</p>
            </div>
        );
    }

    return (
        <div className="projects-page-root">
            {view === 'dashboard' ? renderDashboard() : renderDetail()}

            <Modal
                title={editingProject ? t('projects.updateProject') : t('projects.createProject')}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
                confirmLoading={submitting}
                width="min(800px, 94vw)"
                centered
                okText={editingProject ? t('common.update') : t('common.create')}
                cancelText={t('common.cancel')}
                destroyOnHidden
                afterOpenChange={open => {
                    if (open && pendingValues) form.setFieldsValue(pendingValues);
                }}
            >
                <Form form={form} layout="vertical">
                    {/* Row 1: Project Name (AutoComplete from contract names) + Project Code */}
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="name" label={t('projects.formName')} rules={[{ required: true, message: t('projects.formNameReq') }]}>
                                <AutoComplete
                                    placeholder={t('projects.taskNamePlaceholder')}
                                    options={contracts.map(c => ({ value: c.name, label: c.name, code: c.code }))}
                                    filterOption={(inputValue, option) =>
                                        (option?.value as string)?.toLowerCase().includes(inputValue.toLowerCase())
                                    }
                                    onSelect={(_value: string, option: any) => {
                                        form.setFieldsValue({ code: option.code || '' });
                                    }}
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            {/* Không readOnly: chọn hợp đồng thì tự điền, còn gõ tên dự án
                                tự do thì vẫn phải nhập được mã — nếu không, rule required
                                chặn mà không có cách nào qua. */}
                            <Form.Item name="code" label={t('projects.formCode')} rules={[{ required: true, message: t('projects.formCodeReq') }]}>
                                <Input placeholder="VCM-2024-..." />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Row 2: Investor + Branch */}
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="investor" label={t('projects.formInvestor')}>
                                <Input placeholder={t('projects.investorPlaceholder')} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="location" label={t('projects.formBranch')}>
                                <Select showSearch optionFilterProp="children" allowClear placeholder={t('projects.branchPlaceholder')}>
                                    {branches.map(b => (
                                        <Option key={b.id} value={b.id}>{b.code}</Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Row 3: Start Date + End Date */}
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="startDate" label={t('projects.formStart')}>
                                <DatePicker className="w-full" format="DD/MM/YYYY" placeholder={t('common.selectDate')} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                name="endDate"
                                label={t('projects.formEnd')}
                                dependencies={['startDate']}
                                rules={[
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            const start = getFieldValue('startDate');
                                            if (!value || !start || !value.isBefore(start, 'day')) {
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

                    {/* Row 4: Status + Description */}
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="status" label={t('projects.formStatus')} initialValue="TODO">
                                <Select placeholder={t('projects.statusPlaceholder')}>
                                    <Option value="TODO">{t('projects.statusTodo')}</Option>
                                    <Option value="INPROCESS">{t('projects.statusInProcess')}</Option>
                                    <Option value="DONE">{t('projects.statusDone')}</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="description" label={t('projects.formDesc')}>
                                <Input.TextArea rows={3} placeholder={t('projects.taskDescPlaceholder')} />
                            </Form.Item>
                        </Col>
                    </Row>

                    {/* Row 5: Attachment */}
                    <Form.Item label={t('projects.formProgressAttachment')}>
                        {/* Show existing files when editing */}
                        {editingProject && existingFiles.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 13, color: BRAND_COLORS.textSecondary, marginBottom: 6 }}>
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
                                                    <FilePdfOutlined style={{ color: BRAND_COLORS.dangerText, fontSize: 16 }} />
                                                    <a
                                                        href={url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}
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
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                        >
                            <Button icon={<PaperClipOutlined />}>{t('contracts.formAttachmentButton')}</Button>
                        </Upload>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default Projects;
