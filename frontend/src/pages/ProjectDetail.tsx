import React, { useState, useMemo } from 'react';
import {
    ProjectOutlined,
    EnvironmentOutlined,
    AppstoreOutlined,
    CalendarOutlined,
    EditOutlined,
    DeleteOutlined,
    PlusOutlined,
    BarsOutlined,
    UserOutlined,
    ArrowLeftOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    RocketOutlined,
    InfoCircleOutlined,
    ExclamationCircleOutlined,
    UserAddOutlined,
    MoreOutlined,
    BankOutlined
} from '@ant-design/icons';
import { Tabs, Button, Progress, Tag, Avatar, Card, Empty, List, Row, Col, Typography, Space, Divider, Modal, Form, Input, Select, DatePicker, message, Popconfirm, Tooltip, Badge } from 'antd';
import dayjs from 'dayjs';
import { apiService } from '../services/api'; // Still needed for some updates? Or move to hooks? 
// Ideally move updates to hooks too.
import { usePermissions } from '../hooks/usePermissions';
import { useTranslation } from 'react-i18next';
import './ProjectDetail.css';
import { VcmActionGroup } from '../components/VcmActionGroup';

// React Query Hooks
import { useProjectItems, useProjectMembers, useProjectMutations } from '../hooks/useProjects';
import { useContracts } from '../hooks/useContracts';
import { useAppConfig } from '../hooks/useAppConfig';
import { useUsers } from '../hooks/useUsers';
import { useTasks, useTaskMutations } from '../hooks/useTasks';

const { Title, Text } = Typography;
const { TextArea } = Input;

// --- UTILS ---
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

const StatusBadge = ({ status }: { status: string }) => {
    const { t } = useTranslation();
    let color = 'default';
    let text = status;
    let icon = <ClockCircleOutlined />;

    if (status === 'DONE') { color = '#10B981'; text = t('projects.statusDone'); icon = <CheckCircleOutlined />; } // Green
    else if (status === 'INPROCESS') { color = '#3B82F6'; text = t('projects.statusInProcess'); icon = <RocketOutlined />; } // Blue
    else if (status === 'TODO') { color = '#F59E0B'; text = t('projects.statusTodo'); icon = <ClockCircleOutlined />; } // Orange

    return (
        <span className="status-badge" style={{ backgroundColor: status === 'DONE' ? '#ECFDF5' : status === 'INPROCESS' ? '#EFF6FF' : '#FFFBEB', color }}>
            {icon} {text}
        </span>
    );
};

const PriorityTag = ({ priority }: { priority: string }) => {
    const { t } = useTranslation();
    const config: Record<string, { color: string; text: string }> = {
        'HIGH': { color: '#EF4444', text: t('projects.priorityHigh') },
        'MEDIUM': { color: '#F59E0B', text: t('projects.priorityMedium') },
        'LOW': { color: '#6B7280', text: t('projects.priorityLow') },
    };
    const { color, text } = config[priority] || { color: '#6B7280', text: priority };
    return <Tag color={color} style={{ margin: 0, fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', lineHeight: '14px' }}>{text}</Tag>;
};

// --- MAIN COMPONENT ---
interface ProjectDetailProps {
    project: any;
    onBack: () => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, onBack }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('summary');

    // Permissions
    const { permissions, isAdmin } = usePermissions();
    const canEdit = isAdmin || permissions.projects === 'EDIT';

    // React Query Hooks
    const { data: projectItems = [] } = useProjectItems(project.id);
    const { data: projectMembers = [], refetch: refetchMembers } = useProjectMembers(project.id);
    const { data: users = [] } = useUsers();
    const { data: contracts = [] } = useContracts(true);
    const { data: appConfig } = useAppConfig();
    const branches = appConfig?.BRANCHES || [];
    const { data: tasks = [], refetch: refetchTasks } = useTasks(true, { projectId: project.id });
    const { updateProject } = useProjectMutations();


    // Update Project Modal State
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false); // Can use mutation.isLoading
    const [updateForm] = Form.useForm();

    const openUpdateModal = () => {
        let locationValue = project.location;
        if (locationValue) {
            const normLoc = normalizeId(locationValue);
            const matchId = branches.find((b: any) => normalizeId(b.id) === normLoc);
            if (matchId) {
                locationValue = matchId.id;
            } else {
                const matchCode = branches.find((b: any) => b.code === locationValue);
                if (matchCode) locationValue = matchCode.id;
            }
        }
        updateForm.setFieldsValue({
            ...project,
            location: locationValue,
            startDate: project.startDate ? dayjs(project.startDate) : null,
            endDate: project.endDate ? dayjs(project.endDate) : null,
        });
        setIsUpdateModalOpen(true);
    };

    const handleUpdateProject = async () => {
        try {
            const values = await updateForm.validateFields();
            setUpdateLoading(true);
            const payload = {
                id: project.id,
                ...values,
                startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : '',
                endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : '',
            };

            updateProject.mutate(payload, {
                onSuccess: (res) => {
                    if (res.success) {
                        message.success(t('projects.updateSuccess'));
                        setIsUpdateModalOpen(false);
                        // window.location.reload(); // No reload needed with React Query
                        // But wait, project prop comes from parent. 
                        // Parent should invalidate projects list, forcing re-render of this if needed?
                        // Actually if this is a detail view, we might need to fetch project detail individually to see updates immediately
                        // if we are not passing it down from list.
                        // But here `project` is a prop.
                        // So parent component needs to refetch.
                        // In `Projects.tsx`, `useProjects` is invalidated on update. So `projects` list updates.
                        // So `selectedProject` updates. So this component updates.
                    } else {
                        message.error(t('projects.saveFailed') + (res.error || 'Unknown'));
                    }
                    setUpdateLoading(false);
                },
                onError: () => {
                    message.error(t('projects.saveFailed'));
                    setUpdateLoading(false);
                }
            });

        } catch (e) {
            setUpdateLoading(false);
        }
    };

    // --- DERIVED DATA FOR SUMMARY ---
    const summaryStats = useMemo(() => {
        const total = tasks.length;
        const completed = tasks.filter((t: any) => t.status === 'DONE').length;
        const incomplete = total - completed;
        const delayed = tasks.filter((t: any) => t.status !== 'DONE' && t.endDate && dayjs(t.endDate).isBefore(dayjs(), 'day')).length;

        // Contract Code
        const contract = contracts.find(c => c.id === project.contractId);
        const contractCode = contract ? contract.code : (project.contractId || 'N/A');

        return { total, completed, incomplete, delayed, contractCode };
    }, [tasks, project.contractId, contracts]);

    const items = [
        { key: 'summary', label: t('projects.tabSummary'), children: <SummaryTab project={project} stats={summaryStats} tasks={tasks} branches={branches} /> },
        { key: 'tasks', label: t('projects.tabTasks'), children: <TasksTab projectId={project.id} phases={projectItems} tasks={tasks} users={users} members={projectMembers} onRefresh={refetchTasks} canEdit={canEdit} /> },
        {
            key: 'team',
            label: t('projects.tabTeam'),
            children: <TeamTab projectId={project.id} members={projectMembers} users={users} canEdit={canEdit} onRefresh={refetchMembers} />
        }
    ];

    return (
        <div className="project-detail-container">
            {/* COMPACT TOP HEADER */}
            <div className="project-header">
                <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
                    <Button
                        type="text"
                        icon={<ArrowLeftOutlined style={{ fontSize: '11px' }} />}
                        onClick={onBack}
                        className="back-button"
                    >
                        {t('projects.backToList')}
                    </Button>

                    <div className="header-title-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <h1 className="project-title">{project.name}</h1>
                            <StatusBadge status={project.status} />
                        </div>

                        {canEdit && (
                            <Button
                                icon={<EditOutlined />}
                                size="small"
                                onClick={openUpdateModal}
                                className="vcm-btn-premium"
                                style={{ height: '32px' }}
                            >
                                {t('common.update')}
                            </Button>
                        )}
                    </div>

                    <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        items={items.map(item => ({ key: item.key, label: item.label }))}
                        className="project-tabs-compact"
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
                width={700}
                centered
                destroyOnClose
            >
                <Form form={updateForm} layout="vertical" size="small" style={{ marginTop: 16 }}>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="code" label={t('projects.formCode')} rules={[{ required: true, message: t('projects.formCodeReq') }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="name" label={t('projects.formName')} rules={[{ required: true, message: t('projects.formNameReq') }]}>
                                <Input />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="investor" label={t('projects.formInvestor')}>
                                <Input />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="location" label={t('projects.formBranch')}>
                                <Select showSearch optionFilterProp="children" placeholder={t('projects.branchPlaceholder')} allowClear>
                                    {branches.map((b: any) => (
                                        <Select.Option key={b.id} value={b.id}>{b.code}</Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="contractId" label={t('projects.formContract')}>
                                <Select showSearch optionFilterProp="children" allowClear placeholder={t('projects.formContract')}>
                                    {contracts.map((c: any) => (
                                        <Select.Option key={c.id} value={c.id}>{c.code} - {c.name}</Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
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
                        <Col span={12}>
                            <Form.Item name="startDate" label={t('projects.formStart')}>
                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder={t('common.selectDate')} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="endDate" label={t('projects.formEnd')}>
                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder={t('common.selectDate')} />
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

function SummaryTab({ project, stats, tasks, branches }: { project: any, stats: any, tasks: any[], branches: any[] }) {
    const { t } = useTranslation();
    // Calculate average progress from tasks
    const avgProgress = useMemo(() => {
        if (!tasks || tasks.length === 0) return 0;
        const total = tasks.reduce((sum, t) => sum + (Number(t.progress) || 0), 0);
        return Math.round(total / tasks.length);
    }, [tasks]);

    const remainingDays = Math.max(0, dayjs(project.endDate).diff(dayjs(), 'day'));

    // Formula: % Time Used = (Days to Current + 1) / (Total Days + 1)
    const totalDays = dayjs(project.endDate).diff(dayjs(project.startDate), 'day') + 1;
    const daysToCurrent = dayjs().diff(dayjs(project.startDate), 'day') + 1;

    // Clamp elapsed days between 0 and totalDays
    const elapsedDays = Math.max(0, Math.min(daysToCurrent, totalDays));

    const timeProgress = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;

    // Stats Cards Data
    const statCards = [
        { title: t('projects.totalTasks'), value: stats.total, color: '#3B82F6', icon: <BarsOutlined />, bg: '#EFF6FF' },
        { title: t('projects.completed'), value: stats.completed, color: '#10B981', icon: <CheckCircleOutlined />, bg: '#ECFDF5' },
        { title: t('projects.incomplete'), value: stats.incomplete, color: '#F59E0B', icon: <ClockCircleOutlined />, bg: '#FFFBEB' },
        { title: t('projects.delayed'), value: stats.delayed, color: '#EF4444', icon: <ExclamationCircleOutlined />, bg: '#FEF2F2' },
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
                    <div className="info-value" style={{ color: '#4B5563' }}>
                        <CalendarOutlined style={{ color: '#EF4444', fontSize: '11px' }} />
                        {project.startDate ? dayjs(project.startDate).format('DD/MM/YY') : '--'} → {project.endDate ? dayjs(project.endDate).format('DD/MM/YY') : '--'}
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
                            <RocketOutlined style={{ color: '#EF4444' }} /> {t('projects.constructionProgress')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0' }}>
                            <Progress
                                type="dashboard"
                                percent={avgProgress}
                                size={220}
                                strokeWidth={12}
                                strokeColor={{
                                    '0%': '#E11D2E',
                                    '100%': '#FF8080',
                                }}
                                format={(percent) => (
                                    <div style={{ marginTop: -8 }}>
                                        <div style={{ fontSize: '32px', fontWeight: '800', lineHeight: 1, color: '#1F2937' }}>{percent}%</div>
                                        <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>{t('projects.statusDone')}</div>
                                    </div>
                                )}
                            />
                        </div>
                    </div>
                </Col>
                <Col xs={24} md={12}>
                    <div className="chart-card">
                        <div className="chart-header">
                            <ClockCircleOutlined style={{ color: '#F59E0B' }} /> {t('projects.timeProgress')}
                        </div>
                        <div style={{ padding: '8px 4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span className="info-label">{t('projects.timeUsed')}</span>
                                <span style={{ fontWeight: 700, fontSize: '13px', color: timeProgress > 100 ? '#EF4444' : '#10B981' }}>{timeProgress}%</span>
                            </div>
                            <Progress
                                percent={timeProgress}
                                showInfo={false}
                                strokeColor={timeProgress > 100 ? '#EF4444' : '#10B981'}
                                size="small"
                                trailColor="#F3F4F6"
                                strokeWidth={8}
                                style={{ marginBottom: 24 }}
                            />

                            <Row gutter={12}>
                                <Col span={12}>
                                    <div style={{ background: '#F9FAFB', padding: '12px', borderRadius: '8px', border: '1px solid #F3F4F6', textAlign: 'center' }}>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#4B5563', lineHeight: 1 }}>{elapsedDays}</div>
                                        <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: '#9CA3AF', marginTop: 4 }}>{t('projects.daysPassed')}</div>
                                    </div>
                                </Col>
                                <Col span={12}>
                                    <div style={{ background: '#ECFDF5', padding: '12px', borderRadius: '8px', border: '1px solid #D1FAE5', textAlign: 'center' }}>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#059669', lineHeight: 1 }}>{remainingDays}</div>
                                        <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: '#6EE7B7', marginTop: 4 }}>{t('projects.daysRemaining')}</div>
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
    phases: any[];
    tasks: any[];
    users: any[];
    members: any[]; // NEW: Accept project members
    onRefresh: () => void;
    canEdit: boolean;
}


function TasksTab({ projectId, phases, tasks, users, members, onRefresh, canEdit }: TasksTabProps) {
    const { t } = useTranslation();
    const [view, setView] = useState<'list' | 'kanban'>('list');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<any>(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    // Mutations
    const { createTask, updateTask, deleteTask } = useTaskMutations(projectId);

    const openModal = (task?: any) => {
        if (task) {
            setEditingTask(task);
            form.setFieldsValue({
                ...task,
                startDate: task.startDate ? dayjs(task.startDate) : null,
                endDate: task.endDate ? dayjs(task.endDate) : null,
            });
        } else {
            setEditingTask(null);
            form.resetFields();
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);

            const payload = {
                ...values,
                projectId,
                startDate: values.startDate ? values.startDate.toISOString() : null,
                endDate: values.endDate ? values.endDate.toISOString() : null,
            };

            const onSuccess = (res: any) => {
                if (res.success) {
                    message.success(editingTask ? t('projects.updateTaskSuccess') : t('projects.createTaskSuccess'));
                    setIsModalOpen(false);
                    form.resetFields();
                    // onRefresh(); // Handled by React Query invalidation
                } else {
                    message.error(res.error || 'Có lỗi xảy ra');
                }
                setSubmitting(false);
            };

            const onError = () => {
                message.error('Có lỗi xảy ra');
                setSubmitting(false);
            }

            if (editingTask) {
                updateTask.mutate({ id: editingTask.id, ...payload }, { onSuccess, onError });
            } else {
                createTask.mutate(payload, { onSuccess, onError });
            }
        } catch (e) {
            setSubmitting(false);
        }
    };

    const handleDelete = (id: string) => {
        deleteTask.mutate({ id }, {
            onSuccess: (res) => {
                if (res.success) {
                    message.success(t('projects.deleteTaskSuccess'));
                    // onRefresh(); // Handled by React Query
                } else {
                    message.error(res.error || 'Có lỗi xảy ra');
                }
            },
            onError: () => {
                message.error('Có lỗi xảy ra');
            }
        });
    };

    const renderTaskRow = (task: any) => (
        <div key={task.id} className="task-row-item">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                {/* Status & Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        backgroundColor: task.status === 'DONE' ? '#10B981' : task.status === 'INPROCESS' ? '#3B82F6' : '#D1D5DB'
                    }} />
                    <Text strong style={{ fontSize: '13px', color: '#1F2937' }}>{task.name}</Text>
                </div>

                {/* Progress */}
                <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Progress percent={task.progress || 0} size="small" steps={5} strokeColor="#3B82F6" showInfo={false} style={{ width: 40 }} />
                    <span style={{ fontSize: '11px', color: '#6B7280' }}>{task.progress || 0}%</span>
                </div>

                {/* Priority */}
                <div style={{ width: 80, display: 'flex', justifyContent: 'center' }}>
                    <PriorityTag priority={task.priority} />
                </div>


                {/* Assignee */}
                <div style={{ width: 120, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar size={20} icon={<UserOutlined />} style={{ flexShrink: 0, backgroundColor: '#F3F4F6', color: '#9CA3AF' }} />
                    <Text ellipsis style={{ fontSize: '11px', color: '#6B7280' }}>
                        {users.find(u => u.id === task.assigneeId)?.name || t('projects.noAssignee')}
                    </Text>
                </div>

                {/* Date */}
                <div style={{ width: 100, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CalendarOutlined style={{ fontSize: '11px', color: dayjs(task.endDate).isBefore(dayjs()) ? '#EF4444' : '#9CA3AF' }} />
                    <span style={{ fontSize: '11px', color: dayjs(task.endDate).isBefore(dayjs()) ? '#EF4444' : '#6B7280', fontWeight: 500 }}>
                        {task.endDate ? dayjs(task.endDate).format('DD/MM/YYYY') : '--'}
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

    const renderTaskCard = (task: any) => (
        <div key={task.id} className="kanban-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                    <div style={{
                        marginTop: 6, width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        backgroundColor: task.status === 'DONE' ? '#10B981' : task.status === 'INPROCESS' ? '#3B82F6' : '#D1D5DB'
                    }} />
                    <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#1F2937', marginBottom: 6, lineHeight: 1.3 }}>{task.name}</div>
                            <VcmActionGroup
                                onEdit={canEdit ? () => openModal(task) : undefined}
                                canEdit={canEdit}
                                editTooltip={t('common.edit')}
                            />
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                            <PriorityTag priority={task.priority} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', color: '#9CA3AF' }}>
                                <UserOutlined style={{ fontSize: '9px' }} />
                                {users.find(u => u.id === task.assigneeId)?.name || t('projects.noAssignee')}
                            </div>
                        </div>

                        {/* Progress Bar in Card */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Progress percent={task.progress || 0} size="small" showInfo={false} strokeColor="#3B82F6" trailColor="#F3F4F6" strokeWidth={4} />
                            <span style={{ fontSize: '10px', color: '#6B7280', minWidth: 24 }}>{task.progress || 0}%</span>
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
                    {['TODO', 'INPROCESS', 'DONE'].map(status => (
                        <Col xs={24} md={8} lg={8} xl={8} key={status}>
                            <div className="task-kanban-col">
                                <div className="kanban-header">
                                    <span className="kanban-title">
                                        {status === 'TODO' ? t('projects.todo') : status === 'INPROCESS' ? t('projects.inProcess') : t('projects.done')}
                                    </span>
                                    <span className="kanban-count">{tasks.filter(t => t.status === status).length}</span>
                                </div>
                                <div style={{ background: '#F8FAFC', padding: 8, borderRadius: 12, minHeight: 300 }}>
                                    {tasks.filter(t => t.status === status).map(renderTaskCard)}
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
                width={500}
                centered
            >
                <Form form={form} layout="vertical" size="small" style={{ marginTop: 16 }}>
                    <Form.Item name="name" label={t('projects.taskName')} rules={[{ required: true, message: t('projects.taskNameReq') }]}>
                        <Input placeholder={t('projects.taskNamePlaceholder')} />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="itemType" label={t('projects.taskCategory')}>
                                <Select placeholder={t('projects.taskCategoryPlaceholder')} allowClear>
                                    <Select.Option value="THI_CONG">{t('projects.catConstruction')}</Select.Option>
                                    <Select.Option value="HO_SO_CHAT_LUONG">{t('projects.catQuality')}</Select.Option>
                                    <Select.Option value="HO_SO_THANH_TOAN">{t('projects.catPayment')}</Select.Option>
                                    <Select.Option value="KHAC">{t('projects.catOther')}</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
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
                        <Col span={8}>
                            <Form.Item name="status" label={t('projects.taskStatus')} initialValue="TODO">
                                <Select>
                                    <Select.Option value="TODO">{t('projects.statusTodo')}</Select.Option>
                                    <Select.Option value="INPROCESS">{t('projects.statusInProcess')}</Select.Option>
                                    <Select.Option value="DONE">{t('projects.statusDone')}</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="progress" label={t('projects.taskProgress')} initialValue={0}>
                                <Select>
                                    <Select.Option value={0}>0%</Select.Option>
                                    <Select.Option value={10}>10%</Select.Option>
                                    <Select.Option value={20}>20%</Select.Option>
                                    <Select.Option value={30}>30%</Select.Option>
                                    <Select.Option value={40}>40%</Select.Option>
                                    <Select.Option value={50}>50%</Select.Option>
                                    <Select.Option value={60}>60%</Select.Option>
                                    <Select.Option value={70}>70%</Select.Option>
                                    <Select.Option value={80}>80%</Select.Option>
                                    <Select.Option value={90}>90%</Select.Option>
                                    <Select.Option value={100}>100%</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item name="priority" label={t('projects.taskPriority')} initialValue="MEDIUM">
                                <Select>
                                    <Select.Option value="HIGH">{t('projects.priorityHigh')}</Select.Option>
                                    <Select.Option value="MEDIUM">{t('projects.priorityMedium')}</Select.Option>
                                    <Select.Option value="LOW">{t('projects.priorityLow')}</Select.Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="startDate" label={t('projects.taskStartDate')}>
                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder={t('common.selectDate')} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="endDate" label={t('projects.taskEndDate')}>
                                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder={t('common.selectDate')} />
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
    members: any[];
    users: any[];
    onRefresh: () => void;
    canEdit: boolean;
}

function TeamTab({ projectId, members, users, onRefresh, canEdit }: TeamTabProps) {
    const { t } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm();

    const handleAddMember = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);

            const res = await apiService.addProjectMember({
                projectId,
                userId: values.userId,
                role: values.role
            });

            if (res.success) {
                message.success(t('projects.addMemberSuccess'));
                setIsModalOpen(false);
                form.resetFields();
                onRefresh();
            } else {
                message.error(res.error || 'Có lỗi xảy ra');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveMember = async (id: string) => {
        try {
            const res = await apiService.removeProjectMember({ id });
            if (res.success) {
                message.success(t('projects.deleteMemberSuccess'));
                onRefresh();
            } else {
                message.error(res.error || 'Có lỗi xảy ra');
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BankOutlined style={{ color: '#3B82F6', fontSize: 16 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{t('projects.teamList')}</span>
                </div>
                {canEdit && (
                    <Button type="primary" size="small" icon={<UserAddOutlined />} onClick={() => setIsModalOpen(true)} className="vcm-btn-premium" style={{ height: '32px' }}>{t('projects.addMember')}</Button>
                )}
            </div>

            <Row gutter={[12, 12]}>
                {members.map(m => (
                    <Col xs={24} sm={12} md={12} lg={8} xl={6} xxl={4} key={m.id}>
                        <div className="member-card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Avatar size={36} className="member-avatar">
                                    {(m.userName || 'U').substring(0, 1)}
                                </Avatar>
                                <div>
                                    <div className="member-info-name">{m.userName || 'Unknown'}</div>
                                    <Tag className="member-role-tag">{m.role || 'Member'}</Tag>
                                </div>
                            </div>
                            {canEdit && (
                                <VcmActionGroup
                                    onDelete={() => handleRemoveMember(m.id)}
                                    canDelete={canEdit}
                                    deleteConfirmTitle={t('projects.deleteMemberConfirm')}
                                />
                            )}
                        </div>
                    </Col>
                ))}
                {members.length === 0 && <Col span={24}><Empty description={t('projects.noMember')} /></Col>}
            </Row>

            <Modal
                title={t('projects.addMemberTitle')}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={handleAddMember}
                confirmLoading={loading}
                okText={t('common.add')}
                cancelText={t('common.cancel')}
                width={400}
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
