import React, { useState, useMemo } from 'react';
import {
    AppstoreOutlined,
    CalendarOutlined,
    EditOutlined,
    PlusOutlined,
    BarsOutlined,
    UserOutlined,
    ArrowLeftOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    RocketOutlined,
    ExclamationCircleOutlined,
    UserAddOutlined,
    BankOutlined
} from '@ant-design/icons';
import { Tabs, Button, Progress, Tag, Avatar, Empty, Row, Col, Typography, Space, Modal, Form, Input, Select, DatePicker, message, Tooltip, Slider, InputNumber } from 'antd';
import dayjs from 'dayjs';
import { usePermissions } from '../hooks/usePermissions';
import { useTranslation } from 'react-i18next';
import './ProjectDetail.css';
import { VcmActionGroup } from '../components/VcmActionGroup';
import { BRAND_COLORS } from '../styles/brandIdentity';

// React Query Hooks
import { useProjectItems, useProjectMembers, useProjectMutations, useProjectMemberMutations } from '../hooks/useProjects';
import { useContracts } from '../hooks/useContracts';
import { useAppConfig } from '../hooks/useAppConfig';
import { useUsers } from '../hooks/useUsers';
import { useTasks, useTaskMutations } from '../hooks/useTasks';

// Shared utils
import { normalizeId } from '../utils/projectUtils';
import ProjectLogTab from './ProjectLogTab';
import type { Project, ProjectMember, Province, Task } from '../types';
import type { TaskInput } from '../services/api.interface';

const { Text } = Typography;
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

const PriorityTag = ({ priority }: { priority?: string }) => {
    const { t } = useTranslation();
    const config: Record<string, { color: string; text: string }> = {
        'HIGH': { color: BRAND_COLORS.error, text: t('projects.priorityHigh') },
        'MEDIUM': { color: BRAND_COLORS.warning, text: t('projects.priorityMedium') },
        'LOW': { color: BRAND_COLORS.textSecondary, text: t('projects.priorityLow') },
    };
    const { color, text } = config[priority || ''] || { color: BRAND_COLORS.textSecondary, text: priority || '' };
    return <Tag color={color} style={{ margin: 0, fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', lineHeight: '14px' }}>{text}</Tag>;
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

interface SummaryStats {
    total: number;
    completed: number;
    incomplete: number;
    delayed: number;
    contractCode: string;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onBack }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('summary');

    // Permissions
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.projects === 'EDIT';

    // React Query Hooks
    const { data: projectItems = [] } = useProjectItems(project.id);
    const { data: projectMembers = [] } = useProjectMembers(project.id);
    const { data: users = [] } = useUsers();
    const { data: contracts = [] } = useContracts(true);
    const { data: appConfig } = useAppConfig();
    const branches: Province[] = useMemo(() => appConfig?.BRANCHES || [], [appConfig]);
    const { data: tasks = [] } = useTasks(true, { projectId: project.id });
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

    // --- DERIVED DATA FOR SUMMARY ---
    const summaryStats: SummaryStats = useMemo(() => {
        const total = tasks.length;
        const completed = tasks.filter(task => task.status === 'DONE').length;
        const incomplete = total - completed;
        const delayed = tasks.filter(
            task => task.status !== 'DONE' && task.endDate && dayjs(task.endDate).isBefore(dayjs(), 'day'),
        ).length;

        const contract = contracts.find(c => c.id === project.contractId || c.code === project.code);
        const contractCode = contract ? contract.code : (project.contractId || project.code || 'N/A');

        return { total, completed, incomplete, delayed, contractCode };
    }, [tasks, project.contractId, project.code, contracts]);

    const items = [
        { key: 'summary', label: t('projects.tabSummary'), children: <SummaryTab project={project} stats={summaryStats} branches={branches} /> },
        { key: 'tasks', label: t('projects.tabTasks'), children: <TasksTab projectId={project.id} tasks={tasks} users={users} members={projectMembers} canEdit={canEdit} /> },
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

    // projectItems hiện chỉ dùng để đối chiếu hạng mục; giữ tham chiếu để hook
    // không bị coi là thừa khi TasksTab dùng danh sách cứng.
    void projectItems;

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

// --- SUBSIDIARY TABS ---

function SummaryTab({ project, stats, branches }: { project: Project; stats: SummaryStats; branches: Province[] }) {
    const { t } = useTranslation();

    // Tiến độ thi công lấy thẳng từ API (ROUND(AVG(tasks.progress)) tính ở SQL)
    // thay vì tính lại ở client — trước đây hai công thức cho hai con số lệch nhau.
    const avgProgress = project.progress || 0;

    const start = project.startDate && dayjs(project.startDate).isValid() ? dayjs(project.startDate) : null;
    const end = project.endDate && dayjs(project.endDate).isValid() ? dayjs(project.endDate) : null;

    // Thiếu ngày thì mọi phép diff ra NaN — trả 0 và hiển thị '--' thay vì "NaN".
    const hasRange = Boolean(start && end);
    const totalDays = hasRange ? end!.diff(start!, 'day') + 1 : 0;
    const daysToCurrent = start ? dayjs().diff(start, 'day') + 1 : 0;
    const elapsedDays = hasRange ? Math.max(0, Math.min(daysToCurrent, totalDays)) : 0;
    const remainingDays = end ? Math.max(0, end.diff(dayjs(), 'day')) : 0;
    const timeProgress = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;

    const statCards = [
        { title: t('projects.totalTasks'), value: stats.total, color: BRAND_COLORS.info, icon: <BarsOutlined />, bg: '#EFF6FF' },
        { title: t('projects.completed'), value: stats.completed, color: BRAND_COLORS.success, icon: <CheckCircleOutlined />, bg: BRAND_COLORS.successBg },
        { title: t('projects.incomplete'), value: stats.incomplete, color: BRAND_COLORS.warning, icon: <ClockCircleOutlined />, bg: '#FFFBEB' },
        { title: t('projects.delayed'), value: stats.delayed, color: BRAND_COLORS.error, icon: <ExclamationCircleOutlined />, bg: '#FEF2F2' },
    ];

    return (
        <div>
            {/* INFO STRIP */}
            <div className="info-strip">
                <div className="info-item">
                    <span className="info-label">{t('projects.formBranch')}</span>
                    <span className="info-value">
                        {(() => {
                            const loc = normalizeId(project.location);
                            const branch = branches.find(b => normalizeId(b.id) === loc || normalizeId(b.code) === loc);
                            return branch ? branch.code : (project.location || '--');
                        })()}
                    </span>
                </div>
                <div className="info-item">
                    <span className="info-label">{t('projects.formInvestor')}</span>
                    <span className="info-value">{project.investor || '--'}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">{t('projects.contractCode')}</span>
                    <span className="info-value">{stats.contractCode}</span>
                </div>
                <div className="info-item">
                    <span className="info-label">{t('projects.expectedTime')}</span>
                    <div className="info-value" style={{ color: BRAND_COLORS.secondaryLight }}>
                        <CalendarOutlined style={{ color: BRAND_COLORS.error, fontSize: '11px' }} />
                        {formatDate(project.startDate, 'DD/MM/YY')} → {formatDate(project.endDate, 'DD/MM/YY')}
                    </div>
                </div>
            </div>

            {/* STATS ROW */}
            <Row gutter={[16, 16]} className="stat-card-row">
                {statCards.map((stat, idx) => (
                    <Col xs={24} sm={12} md={6} lg={6} xl={6} key={idx}>
                        <div className="stat-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div className="stat-title">{stat.title}</div>
                                    <div className="stat-value">{stat.value}</div>
                                </div>
                                <div className="stat-icon-box" style={{ backgroundColor: stat.bg, color: stat.color }}>
                                    {stat.icon}
                                </div>
                            </div>
                        </div>
                    </Col>
                ))}
            </Row>

            {/* CHARTS ROW */}
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} md={12}>
                    <div className="chart-card">
                        <div className="chart-header">
                            <RocketOutlined style={{ color: BRAND_COLORS.error }} /> {t('projects.constructionProgress')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0' }}>
                            <Progress
                                type="dashboard"
                                percent={avgProgress}
                                size={220}
                                strokeWidth={12}
                                strokeColor={{
                                    '0%': BRAND_COLORS.primary,
                                    '100%': '#FF8080',
                                }}
                                format={(percent) => (
                                    <div style={{ marginTop: -8 }}>
                                        <div style={{ fontSize: '32px', fontWeight: '800', lineHeight: 1, color: BRAND_COLORS.textPrimary }}>{percent}%</div>
                                        <div style={{ fontSize: '10px', color: BRAND_COLORS.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>{t('projects.statusDone')}</div>
                                    </div>
                                )}
                            />
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={12}>
                    <div className="chart-card">
                        <div className="chart-header">
                            <ClockCircleOutlined style={{ color: BRAND_COLORS.warning }} /> {t('projects.timeProgress')}
                        </div>
                        <div style={{ padding: '8px 4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span className="info-label">{t('projects.timeUsed')}</span>
                                <span style={{ fontWeight: 700, fontSize: '13px', color: BRAND_COLORS.success }}>
                                    {hasRange ? `${timeProgress}%` : '--'}
                                </span>
                            </div>
                            <Progress
                                percent={timeProgress}
                                showInfo={false}
                                strokeColor={BRAND_COLORS.success}
                                size="small"
                                trailColor={BRAND_COLORS.borderLight}
                                strokeWidth={8}
                                style={{ marginBottom: 24 }}
                            />

                            <Row gutter={12}>
                                <Col span={12}>
                                    <div style={{ background: BRAND_COLORS.backgroundLight, padding: '12px', borderRadius: '8px', border: `1px solid ${BRAND_COLORS.borderLight}`, textAlign: 'center' }}>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: BRAND_COLORS.secondaryLight, lineHeight: 1 }}>
                                            {hasRange ? elapsedDays : '--'}
                                        </div>
                                        <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: BRAND_COLORS.textMuted, marginTop: 4 }}>{t('projects.daysPassed')}</div>
                                    </div>
                                </Col>
                                <Col span={12}>
                                    <div style={{ background: BRAND_COLORS.successBg, padding: '12px', borderRadius: '8px', border: '1px solid #D1FAE5', textAlign: 'center' }}>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: BRAND_COLORS.successText, lineHeight: 1 }}>
                                            {end ? remainingDays : '--'}
                                        </div>
                                        <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: BRAND_COLORS.success, marginTop: 4 }}>{t('projects.daysRemaining')}</div>
                                    </div>
                                </Col>
                            </Row>
                        </div>
                    </div>
                </Col>
            </Row>
        </div>
    );
}


interface TasksTabProps {
    projectId: string;
    tasks: Task[];
    users: { id: string; name?: string }[];
    members: ProjectMember[];
    canEdit: boolean;
}


function TasksTab({ projectId, tasks, users, members, canEdit }: TasksTabProps) {
    const { t } = useTranslation();
    const [view, setView] = useState<'list' | 'kanban'>('list');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const progressValue = Form.useWatch('progress', form) ?? 0;

    // Mutations
    const { createTask, updateTask, deleteTask } = useTaskMutations(projectId);

    const openModal = (task?: Task) => {
        setEditingTask(task ?? null);
        form.resetFields();
        if (task) {
            form.setFieldsValue({
                name: task.name,
                itemType: task.itemType,
                assigneeId: task.assigneeId,
                status: task.status,
                priority: task.priority,
                progress: task.progress ?? 0,
                description: task.description,
                startDate: task.startDate ? dayjs(task.startDate) : null,
                endDate: task.endDate ? dayjs(task.endDate) : null,
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        let values;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }

        setSubmitting(true);
        try {
            // Backend validate ngày bằng regex YYYY-MM-DD; gửi ISO đầy đủ sẽ bị 400.
            const payload: TaskInput = {
                name: values.name,
                itemType: values.itemType,
                assigneeId: values.assigneeId,
                status: values.status,
                priority: values.priority,
                progress: values.progress ?? 0,
                description: values.description,
                projectId,
                startDate: toApiDate(values.startDate),
                endDate: toApiDate(values.endDate),
            };

            if (editingTask) {
                await updateTask.mutateAsync({ ...payload, id: editingTask.id });
                message.success(t('projects.updateTaskSuccess'));
            } else {
                await createTask.mutateAsync({ ...payload, name: values.name });
                message.success(t('projects.createTaskSuccess'));
            }
            setIsModalOpen(false);
            form.resetFields();
        } catch (err) {
            message.error(err instanceof Error ? err.message : t('projects.genericError'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = (id: string) => {
        deleteTask.mutate({ id }, {
            onSuccess: () => message.success(t('projects.deleteTaskSuccess')),
            onError: (err: Error) => message.error(err.message || t('projects.genericError')),
        });
    };

    const renderTaskRow = (task: Task) => {
        const overdue = Boolean(task.endDate && dayjs(task.endDate).isValid() && dayjs(task.endDate).isBefore(dayjs(), 'day'));
        return (
            <div key={task.id} className="task-row-item">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    {/* Status & Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                            backgroundColor: statusDotColor(task.status)
                        }} />
                        <Text strong style={{ fontSize: '13px', color: BRAND_COLORS.textPrimary }}>{task.name}</Text>
                    </div>

                    {/* Progress */}
                    <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Progress percent={task.progress || 0} size="small" steps={5} strokeColor={BRAND_COLORS.info} showInfo={false} style={{ width: 40 }} />
                        <span style={{ fontSize: '11px', color: BRAND_COLORS.textSecondary }}>{task.progress || 0}%</span>
                    </div>

                    {/* Priority */}
                    <div style={{ width: 80, display: 'flex', justifyContent: 'center' }}>
                        <PriorityTag priority={task.priority} />
                    </div>

                    {/* Assignee */}
                    <div style={{ width: 120, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar size={20} icon={<UserOutlined />} style={{ flexShrink: 0, backgroundColor: BRAND_COLORS.borderLight, color: BRAND_COLORS.textMuted }} />
                        <Text ellipsis style={{ fontSize: '11px', color: BRAND_COLORS.textSecondary }}>
                            {users.find(u => u.id === task.assigneeId)?.name || t('projects.noAssignee')}
                        </Text>
                    </div>

                    {/* Date */}
                    <div style={{ width: 100, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CalendarOutlined style={{ fontSize: '11px', color: overdue ? BRAND_COLORS.error : BRAND_COLORS.textMuted }} />
                        <span style={{ fontSize: '11px', color: overdue ? BRAND_COLORS.error : BRAND_COLORS.textSecondary, fontWeight: 500 }}>
                            {formatDate(task.endDate)}
                        </span>
                    </div>

                    {/* Actions */}
                    <div style={{ width: 80, display: 'flex', justifyContent: 'flex-end' }}>
                        <VcmActionGroup
                            onEdit={canEdit ? () => openModal(task) : undefined}
                            onDelete={canEdit ? () => handleDelete(task.id) : undefined}
                            canEdit={canEdit}
                            canDelete={canEdit}
                            deleteConfirmTitle={t('projects.deleteTaskConfirm')}
                        />
                    </div>
                </div>
            </div>
        );
    };

    const renderTaskCard = (task: Task) => (
        <div key={task.id} className="kanban-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                    <div style={{
                        marginTop: 6, width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        backgroundColor: statusDotColor(task.status)
                    }} />
                    <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: BRAND_COLORS.textPrimary, marginBottom: 6, lineHeight: 1.3 }}>{task.name}</div>
                            <VcmActionGroup
                                onEdit={canEdit ? () => openModal(task) : undefined}
                                canEdit={canEdit}
                                editTooltip={t('common.edit')}
                            />
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                            <PriorityTag priority={task.priority} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', color: BRAND_COLORS.textMuted }}>
                                <UserOutlined style={{ fontSize: '9px' }} />
                                {users.find(u => u.id === task.assigneeId)?.name || t('projects.noAssignee')}
                            </div>
                        </div>

                        {/* Progress Bar in Card */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Progress percent={task.progress || 0} size="small" showInfo={false} strokeColor={BRAND_COLORS.info} trailColor={BRAND_COLORS.borderLight} strokeWidth={4} />
                            <span style={{ fontSize: '10px', color: BRAND_COLORS.textSecondary, minWidth: 24 }}>{task.progress || 0}%</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div>
            <div className="task-toolbar">
                <Space size="small">
                    <Button
                        size="small"
                        type={view === 'list' ? 'primary' : 'text'}
                        icon={<BarsOutlined />}
                        onClick={() => setView('list')}
                    >
                        {t('projects.viewList')}
                    </Button>
                    <Button
                        size="small"
                        type={view === 'kanban' ? 'primary' : 'text'}
                        icon={<AppstoreOutlined />}
                        onClick={() => setView('kanban')}
                    >
                        {t('projects.viewKanban')}
                    </Button>
                </Space>
                {canEdit && (
                    <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openModal()} className="vcm-btn-premium" style={{ height: '32px' }}>
                        {t('projects.progressTask')}
                    </Button>
                )}
            </div>

            {tasks.length === 0 ? (
                <Empty description={t('projects.noTaskData')} />
            ) : view === 'list' ? (
                <div className="task-list-container">
                    {tasks.map(renderTaskRow)}
                </div>
            ) : (
                <Row gutter={16}>
                    {(['TODO', 'INPROCESS', 'DONE'] as const).map(status => (
                        <Col xs={24} md={8} lg={8} xl={8} key={status}>
                            <div className="task-kanban-col">
                                <div className="kanban-header">
                                    <span className="kanban-title">
                                        {status === 'TODO' ? t('projects.todo') : status === 'INPROCESS' ? t('projects.inProcess') : t('projects.done')}
                                    </span>
                                    <span className="kanban-count">{tasks.filter(task => task.status === status).length}</span>
                                </div>
                                <div style={{ background: BRAND_COLORS.slate50, padding: 8, borderRadius: 12, minHeight: 300 }}>
                                    {tasks.filter(task => task.status === status).map(renderTaskCard)}
                                </div>
                            </div>
                        </Col>
                    ))}
                </Row>
            )}

            {/* ADD/EDIT TASK MODAL */}
            <Modal
                title={editingTask ? t('projects.editTask') : t('projects.createTask')}
                open={isModalOpen}
                onCancel={() => { setIsModalOpen(false); form.resetFields(); }}
                onOk={handleSubmit}
                confirmLoading={submitting}
                okText={editingTask ? t('common.update') : t('common.add')}
                cancelText={t('common.cancel')}
                width="min(500px, 94vw)"
                centered
            >
                <Form form={form} layout="vertical" size="small" style={{ marginTop: 16 }}>
                    <Form.Item name="name" label={t('projects.taskName')} rules={[{ required: true, message: t('projects.taskNameReq') }]}>
                        <Input placeholder={t('projects.taskNamePlaceholder')} />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="itemType" label={t('projects.taskCategory')}>
                                <Select placeholder={t('projects.taskCategoryPlaceholder')} allowClear>
                                    <Select.Option value="THI_CONG">{t('projects.catConstruction')}</Select.Option>
                                    <Select.Option value="HO_SO_CHAT_LUONG">{t('projects.catQuality')}</Select.Option>
                                    <Select.Option value="HO_SO_THANH_TOAN">{t('projects.catPayment')}</Select.Option>
                                    <Select.Option value="KHAC">{t('projects.catOther')}</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="assigneeId" label={t('projects.taskAssignee')}>
                                <Select placeholder={t('projects.taskAssigneePlaceholder')} allowClear>
                                    {members && members.length > 0 ? (
                                        members.map(m => (
                                            <Select.Option key={m.userId} value={m.userId}>
                                                {m.userName} {m.role ? `(${m.role})` : ''}
                                            </Select.Option>
                                        ))
                                    ) : (
                                        <Select.Option disabled value="">{t('projects.noAssignee')}</Select.Option>
                                    )}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col xs={24} sm={8}>
                            <Form.Item name="status" label={t('projects.taskStatus')} initialValue="TODO">
                                <Select>
                                    <Select.Option value="TODO">{t('projects.statusTodo')}</Select.Option>
                                    <Select.Option value="INPROCESS">{t('projects.statusInProcess')}</Select.Option>
                                    <Select.Option value="DONE">{t('projects.statusDone')}</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Form.Item name="priority" label={t('projects.taskPriority')} initialValue="MEDIUM">
                                <Select>
                                    <Select.Option value="HIGH">{t('projects.priorityHigh')}</Select.Option>
                                    <Select.Option value="MEDIUM">{t('projects.priorityMedium')}</Select.Option>
                                    <Select.Option value="LOW">{t('projects.priorityLow')}</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                            <Form.Item
                                name="progress"
                                initialValue={0}
                                label={t('projects.taskProgress')}
                                style={{ marginBottom: 0 }}
                            >
                                <Row align="middle" gutter={8}>
                                    <Col flex="auto">
                                        <Slider
                                            min={0}
                                            max={100}
                                            step={5}
                                            value={progressValue}
                                            onChange={(v) => form.setFieldValue('progress', v)}
                                            tooltip={{ formatter: (v) => `${v}%` }}
                                            styles={{
                                                track: { backgroundColor: BRAND_COLORS.primary },
                                                handle: { borderColor: BRAND_COLORS.primary },
                                            }}
                                        />
                                    </Col>
                                    <Col style={{ width: 56 }}>
                                        <InputNumber
                                            min={0}
                                            max={100}
                                            step={5}
                                            size="small"
                                            value={progressValue}
                                            onChange={(v) => form.setFieldValue('progress', v ?? 0)}
                                            formatter={(v) => `${v}%`}
                                            parser={(v) => Number(v?.replace('%', '') || 0) as 0}
                                            style={{ width: '100%' }}
                                        />
                                    </Col>
                                </Row>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item name="startDate" label={t('projects.taskStartDate')}>
                                <DatePicker style={{ width: '100%' }} format={DISPLAY_DATE} placeholder={t('common.selectDate')} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                name="endDate"
                                label={t('projects.taskEndDate')}
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

                    <Form.Item name="description" label={t('projects.taskDesc')}>
                        <TextArea rows={3} placeholder={t('projects.taskDescPlaceholder')} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

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
