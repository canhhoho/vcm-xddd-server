import React, { useState, useMemo } from 'react';
import {
    EditOutlined,
    ArrowLeftOutlined,
    UserAddOutlined,
    BankOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    RocketOutlined,
} from '@ant-design/icons';
import { Tabs, Button, Avatar, Empty, Row, Col, Modal, Form, Input, Select, DatePicker, message, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { usePermissions } from '../hooks/usePermissions';
import { useTranslation } from 'react-i18next';
import './ProjectDetail.css';
import { VcmActionGroup } from '../components/VcmActionGroup';
import { BRAND_COLORS } from '../styles/brandIdentity';

// React Query Hooks
import { useProjectMembers, useProjectMutations, useProjectMemberMutations } from '../hooks/useProjects';
import { useContracts } from '../hooks/useContracts';
import { useAppConfig } from '../hooks/useAppConfig';
import { useUsers } from '../hooks/useUsers';

// Shared utils
import { normalizeId } from '../utils/projectUtils';
import ProjectLogTab from './ProjectLogTab';
import ProjectWorkItemsTab from './ProjectWorkItemsTab';
import type { Project, ProjectMember, Province } from '../types';

const { TextArea } = Input;

const DATE_FORMAT = 'YYYY-MM-DD';
const DISPLAY_DATE = 'DD/MM/YYYY';

/** Ngày hợp lệ → chuỗi hiển thị, ngược lại '--' (start_date/end_date cho phép NULL) */
const formatDate = (date?: string | null, fmt: string = DISPLAY_DATE): string =>
    date && dayjs(date).isValid() ? dayjs(date).format(fmt) : '--';

const toApiDate = (value: dayjs.Dayjs | null | undefined): string | null =>
    value && value.isValid() ? value.format(DATE_FORMAT) : null;

const StatusBadge = ({ status }: { status: string }) => {
    const { t } = useTranslation();
    let color: string = BRAND_COLORS.textSecondary;
    let text = status;
    let icon = <ClockCircleOutlined />;

    if (status === 'DONE') { color = BRAND_COLORS.success; text = t('projects.statusDone'); icon = <CheckCircleOutlined />; }
    else if (status === 'INPROCESS') { color = BRAND_COLORS.info; text = t('projects.statusInProcess'); icon = <RocketOutlined />; }
    else if (status === 'TODO') { color = BRAND_COLORS.warning; text = t('projects.statusTodo'); icon = <ClockCircleOutlined />; }

    const background = status === 'DONE'
        ? BRAND_COLORS.successBg
        : status === 'INPROCESS' ? '#EFF6FF' : '#FFFBEB';

    return (
        <span className="status-badge" style={{ backgroundColor: background, color }}>
            {icon} {text}
        </span>
    );
};


/** Chấm màu theo trạng thái task, dùng chung cho list và kanban */
const statusDotColor = (status?: string) =>
    status === 'DONE' ? BRAND_COLORS.success
        : status === 'INPROCESS' ? BRAND_COLORS.info
            : '#D1D5DB';

// --- MAIN COMPONENT ---
interface ProjectDetailProps {
    project: Project;
    onBack: () => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onBack }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('workItems');

    // Permissions
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.projects === 'EDIT';

    // React Query Hooks
    const { data: projectMembers = [] } = useProjectMembers(project.id);
    const { data: users = [] } = useUsers();
    const { data: contracts = [] } = useContracts(true);
    const { data: appConfig } = useAppConfig();
    const branches: Province[] = useMemo(() => appConfig?.BRANCHES || [], [appConfig]);
    const { updateProject } = useProjectMutations();

    // Update Project Modal State
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false);
    const [pendingValues, setPendingValues] = useState<Record<string, unknown> | null>(null);
    const [updateForm] = Form.useForm();

    const openUpdateModal = () => {
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
        // destroyOnHidden -> Form chưa mount khi modal còn đóng; set giá trị ở
        // afterOpenChange thay vì ở đây (xem .claude/rules/antd-v6.md).
        setPendingValues({
            code: project.code,
            name: project.name,
            investor: project.investor,
            contractId: project.contractId,
            status: project.status,
            description: project.description,
            location: locationValue,
            startDate: project.startDate ? dayjs(project.startDate) : null,
            endDate: project.endDate ? dayjs(project.endDate) : null,
        });
        setIsUpdateModalOpen(true);
    };

    const handleUpdateProject = async () => {
        let values;
        try {
            values = await updateForm.validateFields();
        } catch {
            return;
        }

        setUpdateLoading(true);
        try {
            await updateProject.mutateAsync({
                id: project.id,
                code: values.code,
                name: values.name,
                investor: values.investor,
                contractId: values.contractId,
                location: values.location,
                status: values.status,
                description: values.description,
                startDate: toApiDate(values.startDate),
                endDate: toApiDate(values.endDate),
            });
            message.success(t('projects.updateSuccess'));
            setIsUpdateModalOpen(false);
            // `project` là prop từ Projects.tsx; useProjectMutations đã invalidate
            // PROJECT_KEYS.all nên danh sách refetch và prop tự cập nhật.
        } catch (err) {
            message.error(t('projects.saveFailed') + (err instanceof Error ? err.message : ''));
        } finally {
            setUpdateLoading(false);
        }
    };

    // Thông tin dự án gọn cho header (trước đây nằm trong tab Tổng quan đã bỏ).
    // Trường trống thì loại hẳn khỏi mảng, để header không đầy dấu gạch ngang.
    const headerInfo = useMemo(() => {
        const branchName = branches.find(b => normalizeId(b.id) === normalizeId(project.location || ''))?.name
            || project.location || '';
        const period = project.startDate || project.endDate
            // DISPLAY_DATE (DD/MM/YYYY) chứ không phải DATE_FORMAT (YYYY-MM-DD) —
            // DATE_FORMAT là định dạng gửi API, hiển thị phải khớp thẻ dự án ngoài danh sách.
            ? `${project.startDate ? dayjs(project.startDate).format(DISPLAY_DATE) : '--'} → ${project.endDate ? dayjs(project.endDate).format(DISPLAY_DATE) : '--'}`
            : '';
        return [
            { label: t('projects.formBranch'), value: branchName },
            { label: t('projects.formInvestor'), value: project.investor || '' },
            { label: t('projects.expectedTime'), value: period },
        ].filter(x => x.value);
    }, [branches, project.location, project.investor, project.startDate, project.endDate, t]);

    const items = [
        {
            key: 'workItems',
            label: t('projects.tabWorkItems'),
            children: <ProjectWorkItemsTab project={project} canEdit={canEdit} />
        },
        {
            key: 'team',
            label: t('projects.tabTeam'),
            children: <TeamTab projectId={project.id} members={projectMembers} users={users} canEdit={canEdit} />
        },
        {
            key: 'logs',
            label: t('projects.tabLogs'),
            children: <ProjectLogTab project={project} canEdit={canEdit} />
        }
    ];

    return (
        <div className="project-detail-container">
            {/* APPLE iOS STYLE HEADER */}
            <div className="project-header-ios">
                <div className="header-wrapper-ios">

                    <div className="header-top-row">
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: 1 }}>
                            <Tooltip title={t('projects.backToList')}>
                                <Button
                                    type="text"
                                    shape="circle"
                                    icon={<ArrowLeftOutlined />}
                                    onClick={onBack}
                                    className="back-button-circle"
                                />
                            </Tooltip>

                            <div className="header-title-container">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                    <h1 className="project-title-ios">{project.name}</h1>
                                    <StatusBadge status={project.status} />
                                </div>
                                <div className="project-subtitle-ios">
                                    {t('projects.contractCode')}: <span className="subtitle-code">{project.code || '--'}</span>
                                </div>
                                {headerInfo.length > 0 && (
                                    <div className="project-header-info">
                                        {headerInfo.map(info => (
                                            <span key={info.label}>
                                                <span className="header-info-label">{info.label}:</span> {info.value}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {canEdit && (
                            <Button
                                icon={<EditOutlined />}
                                onClick={openUpdateModal}
                                className="vcm-btn-ghost"
                            >
                                {t('common.update')}
                            </Button>
                        )}
                    </div>

                    <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        items={items.map(item => ({ key: item.key, label: item.label }))}
                        className="project-tabs-segmented"
                    />
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="project-content">
                <div className="content-wrapper">
                    {items.find(i => i.key === activeTab)?.children}
                </div>
            </div>

            {/* UPDATE PROJECT MODAL */}
            <Modal
                title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><EditOutlined /> {t('projects.updateProjectTitle')}</div>}
                open={isUpdateModalOpen}
                onCancel={() => setIsUpdateModalOpen(false)}
                onOk={handleUpdateProject}
                confirmLoading={updateLoading}
                okText={t('common.update')}
                cancelText={t('common.cancel')}
                width="min(700px, 94vw)"
                centered
                destroyOnHidden
                afterOpenChange={open => {
                    if (open && pendingValues) updateForm.setFieldsValue(pendingValues);
                }}
            >
                <Form form={updateForm} layout="vertical" size="small" style={{ marginTop: 16 }}>
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="code" label={t('projects.formCode')} rules={[{ required: true, message: t('projects.formCodeReq') }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="name" label={t('projects.formName')} rules={[{ required: true, message: t('projects.formNameReq') }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="investor" label={t('projects.formInvestor')}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="location" label={t('projects.formBranch')}>
                                <Select showSearch optionFilterProp="children" placeholder={t('projects.branchPlaceholder')} allowClear>
                                    {branches.map(b => (
                                        <Select.Option key={b.id} value={b.id}>{b.code}</Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="contractId" label={t('projects.formContract')}>
                                <Select showSearch optionFilterProp="children" allowClear placeholder={t('projects.formContract')}>
                                    {contracts.map(c => (
                                        <Select.Option key={c.id} value={c.id}>{c.code} - {c.name}</Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="status" label={t('projects.formStatus')}>
                                <Select placeholder={t('projects.statusPlaceholder')}>
                                    <Select.Option value="TODO">{t('projects.statusTodo')}</Select.Option>
                                    <Select.Option value="INPROCESS">{t('projects.statusInProcess')}</Select.Option>
                                    <Select.Option value="DONE">{t('projects.statusDone')}</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="startDate" label={t('projects.formStart')}>
                                <DatePicker style={{ width: '100%' }} format={DISPLAY_DATE} placeholder={t('common.selectDate')} />
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
                                            if (!value || !start || !value.isBefore(start, 'day')) return Promise.resolve();
                                            return Promise.reject(new Error(t('projects.formEndAfterStart')));
                                        },
                                    }),
                                ]}
                            >
                                <DatePicker style={{ width: '100%' }} format={DISPLAY_DATE} placeholder={t('common.selectDate')} />
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


interface TeamTabProps {
    projectId: string;
    members: ProjectMember[];
    users: { id: string; name?: string; email?: string }[];
    canEdit: boolean;
}

function TeamTab({ projectId, members, users, canEdit }: TeamTabProps) {
    const { t } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = Form.useForm();

    // React Query mutations — tự động invalidate cache sau khi add/remove
    const { addMember, removeMember } = useProjectMemberMutations(projectId);

    const handleAddMember = async () => {
        let values;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        addMember.mutate(
            { userId: values.userId, role: values.role },
            {
                onSuccess: () => {
                    message.success(t('projects.addMemberSuccess'));
                    setIsModalOpen(false);
                    form.resetFields();
                },
                onError: (err: Error) => message.error(err.message || t('projects.genericError')),
            }
        );
    };

    const handleRemoveMember = (id: string) => {
        removeMember.mutate(
            { id },
            {
                onSuccess: () => message.success(t('projects.deleteMemberSuccess')),
                onError: (err: Error) => message.error(err.message || t('projects.genericError')),
            }
        );
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BankOutlined style={{ color: BRAND_COLORS.info, fontSize: 16 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: BRAND_COLORS.textPrimary }}>{t('projects.teamList')}</span>
                </div>
                {canEdit && (
                    <Button type="primary" size="small" icon={<UserAddOutlined />} onClick={() => setIsModalOpen(true)} className="vcm-btn-premium" style={{ height: '32px' }}>{t('projects.addMember')}</Button>
                )}
            </div>

            <div className="team-panel">
                {members.map(m => (
                    <div className="team-list-item" key={m.id}>
                        <div className="team-member-info">
                            <Avatar className="member-avatar">
                                {(m.userName || 'U').substring(0, 1).toUpperCase()}
                            </Avatar>
                            <div className="member-info-col">
                                <div className="member-info-name">{m.userName || '--'}</div>
                                <div className="member-role-time">
                                    {m.role || 'Member'} • {t('projects.joinedAt')} {formatDate(m.addedAt, 'MM/YYYY')}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            {canEdit && (
                                <VcmActionGroup
                                    onDelete={() => handleRemoveMember(m.id)}
                                    canDelete={canEdit}
                                    deleteConfirmTitle={t('projects.deleteMemberConfirm')}
                                />
                            )}
                        </div>
                    </div>
                ))}
                {members.length === 0 && (
                    <div style={{ padding: '40px 0' }}>
                        <Empty description={t('projects.noMember')} />
                    </div>
                )}
            </div>

            <Modal
                title={t('projects.addMemberTitle')}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={handleAddMember}
                confirmLoading={addMember.isPending}
                okText={t('common.add')}
                cancelText={t('common.cancel')}
                width="min(400px, 92vw)"
                centered
            >
                <Form form={form} layout="vertical" size="small" style={{ marginTop: 16 }}>
                    <Form.Item name="userId" label={t('projects.memberLabel')} rules={[{ required: true, message: t('projects.memberReq') }]}>
                        <Select showSearch optionFilterProp="children" placeholder={t('projects.selectMemberPlaceholder')}>
                            {users.map(u => (
                                <Select.Option key={u.id} value={u.id}>{u.name} ({u.email})</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="role" label={t('projects.role')} rules={[{ required: true, message: t('projects.roleReq') }]}>
                        <Select placeholder={t('projects.selectRolePlaceholder')}>
                            <Select.Option value="Project Manager">{t('projects.rolePM')}</Select.Option>
                            <Select.Option value="Site Manager">{t('projects.roleSM')}</Select.Option>
                            <Select.Option value="QS">{t('projects.roleQS')}</Select.Option>
                            <Select.Option value="Engineer">{t('projects.roleEngineer')}</Select.Option>
                            <Select.Option value="Accountant">{t('projects.roleAccountant')}</Select.Option>
                            <Select.Option value="Purchaser">{t('projects.rolePurchaser')}</Select.Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

export default ProjectDetail;
