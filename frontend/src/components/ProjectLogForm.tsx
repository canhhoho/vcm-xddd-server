/**
 * ProjectLogForm.tsx
 * Form nhập/sửa Nhật ký Thi công.
 * Dùng Drawer từ phải, hỗ trợ tạo mới và chỉnh sửa.
 */

import React, { useEffect } from 'react';
import {
    Drawer, Form, DatePicker, InputNumber, Slider,
    Input, Button, Row, Col, Space, message,
} from 'antd';
import {
    UserOutlined,
    ToolOutlined,
    WarningOutlined,
    FormOutlined,
    SaveOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { ProjectLog, ProjectLogPayload, WeatherType } from '../types';

const { TextArea } = Input;

// ── Weather selector ─────────────────────────────────────────────────────────
const WEATHER_OPTIONS: { value: WeatherType; icon: string; label: string; bg: string; color: string }[] = [
    { value: 'SUNNY',  icon: '☀️',  label: 'Nắng',     bg: '#FFF7E6', color: '#FA8C16' },
    { value: 'CLOUDY', icon: '⛅',  label: 'Mây',      bg: '#F0F5FF', color: '#597EF7' },
    { value: 'RAINY',  icon: '🌧️', label: 'Mưa',      bg: '#E6F7FF', color: '#1890FF' },
    { value: 'STORMY', icon: '⛈️', label: 'Bão/Gió',  bg: '#FFF1F0', color: '#FF4D4F' },
];

interface WeatherSelectorProps {
    value?: WeatherType;
    onChange?: (v: WeatherType) => void;
    t: (key: string) => string;
}

const WeatherSelector: React.FC<WeatherSelectorProps> = ({ value, onChange, t }) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {WEATHER_OPTIONS.map(opt => {
            const selected = value === opt.value;
            return (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange?.(opt.value)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: `2px solid ${selected ? opt.color : '#E5E7EB'}`,
                        background: selected ? opt.bg : '#FAFAFA',
                        color: selected ? opt.color : BRAND_COLORS.textSecondary,
                        fontWeight: selected ? 700 : 400,
                        fontSize: 13,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        outline: 'none',
                    }}
                >
                    <span style={{ fontSize: 18 }}>{opt.icon}</span>
                    {t(`projectLog.weather.${opt.value}`)}
                </button>
            );
        })}
    </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
interface ProjectLogFormProps {
    open: boolean;
    projectId: string;
    editingLog?: ProjectLog | null;
    onClose: () => void;
    onSave: (payload: ProjectLogPayload) => void;
    isSaving: boolean;
}

const ProjectLogForm: React.FC<ProjectLogFormProps> = ({
    open,
    projectId,
    editingLog,
    onClose,
    onSave,
    isSaving,
}) => {
    const { t } = useTranslation();
    const [form] = Form.useForm();
    const progressValue = Form.useWatch('progressPct', form) ?? 0;

    // Pre-fill form khi mở
    useEffect(() => {
        if (!open) return;
        if (editingLog) {
            form.setFieldsValue({
                ...editingLog,
                logDate: editingLog.logDate ? dayjs(editingLog.logDate) : dayjs(),
            });
        } else {
            form.resetFields();
            form.setFieldsValue({ logDate: dayjs(), progressPct: 0 });
        }
    }, [open, editingLog]);

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            const payload: ProjectLogPayload = {
                projectId,
                logDate: values.logDate.format('YYYY-MM-DD'),
                weather: values.weather,
                workersCount: values.workersCount ?? 0,
                progressPct: values.progressPct ?? 0,
                activities: values.activities?.trim() || undefined,
                issues: values.issues?.trim() || undefined,
                materials: values.materials?.trim() || undefined,
                equipment: values.equipment?.trim() || undefined,
                note: values.note?.trim() || undefined,
            };
            onSave(payload);
        } catch {
            message.warning(t('projectLog.form.logDateReq'));
        }
    };

    const isEditing = !!editingLog;
    const title = isEditing
        ? `✏️ ${t('projectLog.form.titleEdit')}`
        : `📋 ${t('projectLog.form.titleAdd')}`;

    return (
        <Drawer
            title={
                <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: BRAND_COLORS.textPrimary }}>{title}</div>
                    {isEditing && (
                        <div style={{ fontSize: 12, color: BRAND_COLORS.textSecondary, marginTop: 2 }}>
                            {dayjs(editingLog?.logDate).format('DD/MM/YYYY')}
                        </div>
                    )}
                </div>
            }
            open={open}
            onClose={onClose}
            width={520}
            placement="right"
            destroyOnClose
            footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Button onClick={onClose}>{t('common.cancel', 'Hủy')}</Button>
                    <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        loading={isSaving}
                        onClick={handleSubmit}
                        style={{ background: BRAND_COLORS.primary, borderColor: BRAND_COLORS.primary }}
                    >
                        {t('common.save', 'Lưu nhật ký')}
                    </Button>
                </div>
            }
        >
            <Form form={form} layout="vertical" size="middle">

                {/* Ngày */}
                <Form.Item
                    name="logDate"
                    label={<span style={{ fontWeight: 600 }}>📅 {t('projectLog.form.logDate')}</span>}
                    rules={[{ required: true, message: t('projectLog.form.logDateReq') }]}
                >
                    <DatePicker
                        format="DD/MM/YYYY"
                        style={{ width: '100%' }}
                        placeholder={t('common.selectDate')}
                        disabledDate={d => d && d.isAfter(dayjs(), 'day')}
                    />
                </Form.Item>

                {/* Thời tiết */}
                <Form.Item
                    name="weather"
                    label={<span style={{ fontWeight: 600 }}>🌤️ {t('projectLog.form.weather')}</span>}
                >
                    <WeatherSelector t={t} />
                </Form.Item>

                {/* Nhân sự + Tiến độ */}
                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item
                            name="workersCount"
                            label={
                                <span style={{ fontWeight: 600 }}>
                                    <UserOutlined style={{ marginRight: 4, color: BRAND_COLORS.info }} />
                                    {t('projectLog.form.workers')}
                                </span>
                            }
                        >
                            <InputNumber
                                min={0}
                                max={9999}
                                style={{ width: '100%' }}
                                addonAfter={t('projectLog.workers')}
                                placeholder="0"
                            />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            name="progressPct"
                            initialValue={0}
                            label={<span style={{ fontWeight: 600 }}>📈 {t('projectLog.form.progress')}</span>}
                        >
                            <Row align="middle" gutter={8}>
                                <Col flex="auto">
                                    <Slider
                                        min={0} max={100} step={5}
                                        value={progressValue}
                                        onChange={v => form.setFieldValue('progressPct', v)}
                                        tooltip={{ formatter: v => `${v}%` }}
                                        styles={{
                                            track: { backgroundColor: BRAND_COLORS.primary },
                                            handle: { borderColor: BRAND_COLORS.primary },
                                        }}
                                    />
                                </Col>
                                <Col style={{ width: 58 }}>
                                    <InputNumber
                                        min={0} max={100} step={5} size="small"
                                        value={progressValue}
                                        onChange={v => form.setFieldValue('progressPct', v ?? 0)}
                                        formatter={v => `${v}%`}
                                        parser={v => Number(v?.replace('%', '') || 0) as 0}
                                        style={{ width: '100%' }}
                                    />
                                </Col>
                            </Row>
                        </Form.Item>
                    </Col>
                </Row>

                {/* Công việc đã thực hiện */}
                <Form.Item
                    name="activities"
                    label={
                        <span style={{ fontWeight: 600 }}>
                            <FormOutlined style={{ marginRight: 4, color: BRAND_COLORS.success }} />
                            {t('projectLog.form.activities')}
                        </span>
                    }
                >
                    <TextArea
                        rows={4}
                        placeholder={t('projectLog.form.activitiesPlaceholder')}
                        showCount
                        maxLength={2000}
                    />
                </Form.Item>

                {/* Vướng mắc / Sự cố */}
                <Form.Item
                    name="issues"
                    label={
                        <span style={{ fontWeight: 600 }}>
                            <WarningOutlined style={{ marginRight: 4, color: BRAND_COLORS.warning }} />
                            {t('projectLog.form.issues')}
                            <span style={{ fontWeight: 400, color: BRAND_COLORS.textMuted, marginLeft: 6, fontSize: 12 }}>{t('common.optional')}</span>
                        </span>
                    }
                >
                    <TextArea
                        rows={3}
                        placeholder={t('projectLog.form.issuesPlaceholder')}
                        showCount
                        maxLength={1000}
                    />
                </Form.Item>

                {/* Vật tư + Thiết bị */}
                <Row gutter={12}>
                    <Col span={12}>
                        <Form.Item
                            name="materials"
                            label={
                                <span style={{ fontWeight: 600 }}>
                                    📦 {t('projectLog.form.materials')}
                                    <span style={{ fontWeight: 400, color: BRAND_COLORS.textMuted, marginLeft: 6, fontSize: 12 }}>{t('common.optional')}</span>
                                </span>
                            }
                        >
                            <TextArea
                                rows={3}
                                placeholder={t('projectLog.form.materialsPlaceholder')}
                                maxLength={500}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            name="equipment"
                            label={
                                <span style={{ fontWeight: 600 }}>
                                    <ToolOutlined style={{ marginRight: 4, color: '#8B5CF6' }} />
                                    {t('projectLog.form.equipment')}
                                    <span style={{ fontWeight: 400, color: BRAND_COLORS.textMuted, marginLeft: 6, fontSize: 12 }}>{t('common.optional')}</span>
                                </span>
                            }
                        >
                            <TextArea
                                rows={3}
                                placeholder={t('projectLog.form.equipmentPlaceholder')}
                                maxLength={500}
                            />
                        </Form.Item>
                    </Col>
                </Row>

                {/* Ghi chú */}
                <Form.Item
                    name="note"
                    label={<span style={{ fontWeight: 600 }}>💬 {t('projectLog.form.note')}</span>}
                >
                    <TextArea
                        rows={2}
                        placeholder={t('projectLog.form.notePlaceholder')}
                        maxLength={500}
                    />
                </Form.Item>

            </Form>
        </Drawer>
    );
};

export default ProjectLogForm;
