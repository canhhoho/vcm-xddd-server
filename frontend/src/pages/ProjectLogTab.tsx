/**
 * ProjectLogTab.tsx
 * Tab Nhật ký Thi công trong ProjectDetail.
 *
 * Tính năng:
 * - Timeline nhật ký theo tháng (mới nhất trên đầu)
 * - Thống kê tháng: ngày làm việc, tổng lao động, tiến độ TB, số sự cố
 * - Bảng tổng hợp vật tư & thiết bị trong tháng
 * - Nút "Ghi nhật ký hôm nay" / Sửa / Xóa
 * - Phân quyền: server gác /api/project-logs bằng moduleAccess('projects'),
 *   nên UI phải theo đúng `canEdit` — không tự nới cho member của dự án nữa,
 *   nếu không nút hiện ra rồi request bị 403.
 */

import React, { useState, useMemo } from 'react';
import {
    Button, Tag, Progress, Empty, Popconfirm, message,
    Row, Col, Tooltip, Spin,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    LeftOutlined,
    RightOutlined,
    UserOutlined,
    ToolOutlined,
    FileExcelOutlined,
    FileWordOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { excelDateCell } from '../utils/excelExport';
import type { ExcelCell } from '../utils/excelExport';
import { useProjectLogs, useProjectLogMutations } from '../hooks/useProjectLogs';
import ProjectLogForm from '../components/ProjectLogForm';
import type { Project, ProjectLog, ProjectLogPayload } from '../types';
import { BRAND_COLORS } from '../styles/brandIdentity';

// ── Helpers ──────────────────────────────────────────────────────────────────

const WEATHER_ICONS: Record<string, { icon: string; color: string }> = {
    SUNNY:  { icon: '☀️',  color: '#FA8C16' },
    CLOUDY: { icon: '⛅',  color: '#597EF7' },
    RAINY:  { icon: '🌧️', color: '#1890FF' },
    STORMY: { icon: '⛈️', color: '#FF4D4F' },
};

/**
 * Nội dung nhật ký do người dùng nhập được nhúng thẳng vào chuỗi HTML của file
 * Word xuất ra. Không escape thì một dấu `</td>` trong phần "công việc" là vỡ
 * cả bảng báo cáo.
 */
function escapeHtml(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface ProjectLogTabProps {
    project: Project;
    canEdit: boolean;   // quyền `projects` = EDIT hoặc ADMIN
}

// ── Main Component ────────────────────────────────────────────────────────────
const ProjectLogTab: React.FC<ProjectLogTabProps> = ({ project, canEdit }) => {
    const { t } = useTranslation();
    const projectId = project?.id || '';

    // Month state (mặc định = tháng hiện tại)
    const [currentMonth, setCurrentMonth] = useState(() => dayjs().format('YYYY-MM'));
    const [formOpen, setFormOpen] = useState(false);
    const [editingLog, setEditingLog] = useState<ProjectLog | null>(null);

    const canWriteLog = canEdit;

    // Lấy userId hiện tại từ localStorage
    const currentUserId = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}').id || ''; }
        catch { return ''; }
    })();

    // Data
    const { data: logs = [], isLoading } = useProjectLogs(projectId, currentMonth);
    const { upsertLog, deleteLog } = useProjectLogMutations(projectId);

    // Kiểm tra đã có log hôm nay chưa
    const today = dayjs().format('YYYY-MM-DD');
    const todayLog = useMemo(() => logs.find((l: ProjectLog) => l.logDate === today), [logs, today]);

    // ── Thống kê tháng ──────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const workDays = logs.length;
        const totalWorkers = logs.reduce((s: number, l: ProjectLog) => s + (l.workersCount || 0), 0);
        const avgProgress = workDays > 0
            ? Math.round(logs.reduce((s: number, l: ProjectLog) => s + (l.progressPct || 0), 0) / workDays)
            : 0;
        const incidentDays = logs.filter((l: ProjectLog) => l.issues && l.issues.trim()).length;
        return { workDays, totalWorkers, avgProgress, incidentDays };
    }, [logs]);

    // ── Tổng hợp vật tư + thiết bị trong tháng ──────────────────────────────
    const monthSummaryText = useMemo(() => {
        const mats = logs
            .filter((l: ProjectLog) => l.materials?.trim())
            .map((l: ProjectLog) => `[${dayjs(l.logDate).format('DD/MM')}] ${l.materials}`)
            .join('\n');
        const equip = logs
            .filter((l: ProjectLog) => l.equipment?.trim())
            .map((l: ProjectLog) => `[${dayjs(l.logDate).format('DD/MM')}] ${l.equipment}`)
            .join('\n');
        return { mats, equip };
    }, [logs]);

    // ── Helpers (i18n-aware) ──────────────────────────────────────────────────
    const getWeatherLabel = (key: string) => t(`projectLog.weather.${key}`, key);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const exportToExcel = () => {
        if (logs.length === 0) {
            message.warning(t('projectLog.noDataWarning'));
            return;
        }

        const sheetData: ExcelCell[][] = [
            [t('projectLog.export.reportTitle')],
            [t('projectLog.export.projectName'), project?.name || 'N/A'],
            [t('projectLog.export.projectCode'), project?.code || 'N/A'],
            [t('projectLog.export.investor'), project?.investor || 'N/A'],
            [t('projectLog.export.location'), project?.location || 'N/A'],
            [t('projectLog.export.reportMonth'), dayjs(currentMonth).format('MM/YYYY')],
            [t('projectLog.export.avgProgressLabel'), `${stats.avgProgress}%`],
            [],
            [
                t('projectLog.export.colNo'),
                t('projectLog.export.colDate'),
                t('projectLog.export.colWeather'),
                t('projectLog.export.colWorkers'),
                t('projectLog.export.colProgress'),
                t('projectLog.export.colActivities'),
                t('projectLog.export.colIssues'),
                t('projectLog.export.colMaterials'),
                t('projectLog.export.colEquipment'),
                t('projectLog.export.colNote'),
                t('projectLog.export.colRecorder'),
            ]
        ];

        logs.forEach((log: ProjectLog, index: number) => {
            const weatherText = log.weather ? getWeatherLabel(log.weather) : '';
            sheetData.push([
                index + 1,
                // Ô ngày THẬT — ô text thì Excel không lọc/sắp xếp theo ngày được.
                excelDateCell(log.logDate),
                weatherText,
                log.workersCount || 0,
                `${log.progressPct || 0}%`,
                log.activities || '',
                log.issues || '',
                log.materials || '',
                log.equipment || '',
                log.note || '',
                log.createdByName || ''
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(sheetData);

        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t('projectLog.export.sheetName'));

        const fileName = `${t('projectLog.export.fileName')}_${project?.code || 'Project'}_${currentMonth}.xlsx`;
        XLSX.writeFile(wb, fileName);
        message.success(t('projectLog.excelSuccess'));
    };

    const exportToWord = () => {
        if (logs.length === 0) {
            message.warning(t('projectLog.noDataWarning'));
            return;
        }

        // Mọi giá trị do người dùng nhập phải đi qua escapeHtml trước khi nhúng.
        const projectName = escapeHtml(project?.name || 'N/A');
        const projectCode = escapeHtml(project?.code || 'N/A');
        const investor = escapeHtml(project?.investor || 'N/A');
        const location = escapeHtml(project?.location || 'N/A');
        const monthStr = dayjs(currentMonth).format('MM/YYYY');
        const reportTitle = t('projectLog.export.reportTitle');

        let htmlString = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <title>Báo cáo Nhật ký thi công</title>
            <!--[if gte mso 9]>
            <xml>
                <w:WordDocument>
                    <w:View>Print</w:View>
                    <w:Zoom>100</w:Zoom>
                    <w:DoNotOptimizeForBrowser/>
                </w:WordDocument>
            </xml>
            <![endif]-->
            <style>
                body {
                    font-family: "Times New Roman", Times, serif;
                    font-size: 12pt;
                    line-height: 1.5;
                    color: #000000;
                }
                .header-table {
                    width: 100%;
                    border: none;
                    margin-bottom: 20px;
                }
                .header-left {
                    text-align: center;
                    width: 45%;
                    font-size: 11pt;
                }
                .header-right {
                    text-align: center;
                    width: 55%;
                    font-weight: bold;
                    font-size: 11pt;
                }
                .title {
                    text-align: center;
                    font-weight: bold;
                    font-size: 16pt;
                    margin-top: 30px;
                    margin-bottom: 5px;
                    text-transform: uppercase;
                    color: #E11D2E;
                }
                .subtitle {
                    text-align: center;
                    font-style: italic;
                    margin-bottom: 30px;
                    font-size: 12pt;
                }
                .section-title {
                    font-weight: bold;
                    font-size: 13pt;
                    margin-top: 20px;
                    margin-bottom: 10px;
                    text-decoration: underline;
                }
                .info-table {
                    width: 100%;
                    border: none;
                    margin-bottom: 15px;
                }
                .info-table td {
                    padding: 4px 0;
                }
                .info-label {
                    font-weight: bold;
                    width: 25%;
                }
                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 15px;
                    margin-bottom: 20px;
                }
                .data-table th {
                    border: 1px solid #000000;
                    padding: 8px;
                    background-color: #F3F4F6;
                    font-weight: bold;
                    text-align: center;
                    font-size: 11pt;
                }
                .data-table td {
                    border: 1px solid #000000;
                    padding: 8px;
                    font-size: 11pt;
                    vertical-align: top;
                }
                .text-center {
                    text-align: center;
                }
                .text-bold {
                    font-weight: bold;
                }
                .sign-table {
                    width: 100%;
                    border: none;
                    margin-top: 40px;
                }
                .sign-title {
                    font-weight: bold;
                    text-align: center;
                    height: 100px;
                    vertical-align: top;
                }
            </style>
        </head>
        <body>
            <table class="header-table">
                <tr>
                    <td class="header-left">
                        ${t('projectLog.export.companyName')}<br>
                        <strong>${t('projectLog.export.branchName')}</strong>
                    </td>
                    <td class="header-right">
                        ${t('projectLog.export.nationalTitle')}<br>
                        ${t('projectLog.export.nationalSubtitle')}<br>
                        ---------------------
                    </td>
                </tr>
            </table>

            <div class="title">${reportTitle}</div>
            <div class="subtitle">${t('projectLog.export.reportMonth')} ${monthStr}</div>

            <div class="section-title">I. ${t('projectLog.export.reportTitle')}</div>
            <table class="info-table">
                <tr>
                    <td class="info-label">${t('projectLog.export.projectName')}</td>
                    <td>${projectName}</td>
                </tr>
                <tr>
                    <td class="info-label">${t('projectLog.export.projectCode')}</td>
                    <td>${projectCode}</td>
                </tr>
                <tr>
                    <td class="info-label">${t('projectLog.export.investor')}</td>
                    <td>${investor}</td>
                </tr>
                <tr>
                    <td class="info-label">${t('projectLog.export.location')}</td>
                    <td>${location}</td>
                </tr>
            </table>

            <div class="section-title">II. ${t("projectLog.export.sectionSummary")}</div>
            <table class="info-table">
                <tr>
                    <td style="width: 50%;"><strong>${t("projectLog.export.actualWorkDays")}</strong> ${stats.workDays} ${t("projectLog.workDaysUnit")}</td>
                    <td style="width: 50%;"><strong>${t("projectLog.export.totalWorkersMobilized")}</strong> ${stats.totalWorkers} ${t("projectLog.totalWorkersUnit")}</td>
                </tr>
                <tr>
                    <td style="width: 50%;"><strong>${t("projectLog.export.avgProgressCompleted")}</strong> ${stats.avgProgress}%</td>
                    <td style="width: 50%;"><strong>${t("projectLog.export.incidentDaysOccurred")}</strong> ${stats.incidentDays} ${t("projectLog.workDaysUnit")}</td>
                </tr>
            </table>

            <div class="section-title">III. ${t("projectLog.export.sectionDetail")}</div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 5%;">${t('projectLog.export.colNo')}</th>
                        <th style="width: 10%;">${t('projectLog.export.colDate')}</th>
                        <th style="width: 10%;">${t('projectLog.export.colWeather')}</th>
                        <th style="width: 8%;">${t('projectLog.export.colWorkers')}</th>
                        <th style="width: 10%;">${t('projectLog.export.colProgress')}</th>
                        <th style="width: 37%;">${t('projectLog.export.colActivities')}</th>
                        <th style="width: 20%;">${t('projectLog.export.colMaterials')} & ${t('projectLog.export.colEquipment')}</th>
                    </tr>
                </thead>
                <tbody>
        `;

        logs.forEach((log: ProjectLog, index: number) => {
            const weatherText = log.weather ? getWeatherLabel(log.weather) : '--';
            const workers = log.workersCount || 0;
            const progress = `${log.progressPct || 0}%`;

            let activitiesText = escapeHtml(log.activities || t('projectLog.export.noActivities'));
            if (log.issues) {
                activitiesText += `<br><strong style="color: #FF0000;">${t('projectLog.export.incidentIssuesLabel')}</strong> ${escapeHtml(log.issues)}`;
            }
            if (log.note) {
                activitiesText += `<br><span style="color: #666666; font-style: italic;">${escapeHtml(t('projectLog.export.noteLabel', { note: log.note }))}</span>`;
            }

            let resourcesText = '';
            if (log.materials) {
                resourcesText += `<strong>${t('projectLog.export.materialLabel')}</strong> ${escapeHtml(log.materials)}`;
            }
            if (log.equipment) {
                if (resourcesText) resourcesText += '<br>';
                resourcesText += `<strong>${t('projectLog.export.equipmentLabel')}</strong> ${escapeHtml(log.equipment)}`;
            }
            if (!resourcesText) resourcesText = '--';

            htmlString += `
                <tr>
                    <td class="text-center">${index + 1}</td>
                    <td class="text-center">${dayjs(log.logDate).format('DD/MM/YYYY')}</td>
                    <td class="text-center">${weatherText}</td>
                    <td class="text-center">${workers}</td>
                    <td class="text-center text-bold">${progress}</td>
                    <td>${activitiesText}</td>
                    <td>${resourcesText}</td>
                </tr>
            `;
        });

        htmlString += `
                </tbody>
            </table>

            <table class="sign-table">
                <tr>
                    <td class="sign-title" style="width: 50%;">
                        ${t('projectLog.export.repManagement')}<br>
                        ${t('projectLog.export.signText')}
                    </td>
                    <td class="sign-title" style="width: 50%;">
                        ${t('projectLog.export.repPreparedBy')}<br>
                        ${t('projectLog.export.signText')}
                    </td>
                </tr>
            </table>
        </body>
        </html>
        `;

        const blob = new Blob(['\ufeff' + htmlString], {
            type: 'application/msword;charset=utf-8'
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${t('projectLog.export.fileName')}_${projectCode || 'Project'}_${currentMonth}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success(t('projectLog.wordSuccess'));
    };

    const openNew = () => {
        setEditingLog(null);
        setFormOpen(true);
    };

    const openEdit = (log: ProjectLog) => {
        setEditingLog(log);
        setFormOpen(true);
    };

    const handleSave = (payload: ProjectLogPayload) => {
        upsertLog.mutate(payload, {
            onSuccess: () => {
                message.success(editingLog ? t('projectLog.updateSuccess') : t('projectLog.saveSuccess'));
                setFormOpen(false);
            },
            onError: (err: Error) => message.error(err.message || t('projectLog.saveError')),
        });
    };

    const handleDelete = (id: string) => {
        deleteLog.mutate(id, {
            onSuccess: () => message.success(t('projectLog.deleteSuccess')),
            onError: (err: Error) => message.error(err.message || t('projectLog.deleteError')),
        });
    };

    // Month navigation
    const prevMonth = () => setCurrentMonth(dayjs(currentMonth).subtract(1, 'month').format('YYYY-MM'));
    const nextMonth = () => setCurrentMonth(dayjs(currentMonth).add(1, 'month').format('YYYY-MM'));
    const isCurrentMonth = currentMonth === dayjs().format('YYYY-MM');

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="log-tab-container">

            {/* ── Toolbar ── */}
            <div className="log-toolbar">
                {/* Month navigator */}
                <div className="month-navigator">
                    <Button
                        type="text"
                        icon={<LeftOutlined style={{ fontSize: 11 }} />}
                        size="small"
                        onClick={prevMonth}
                        style={{ borderRadius: 6, color: BRAND_COLORS.textSecondary, width: 28, height: 28, minWidth: 28, padding: 0 }}
                    />
                    <div className="month-display">
                        {dayjs(currentMonth).format('MM / YYYY')}
                    </div>
                    <Button
                        type="text"
                        icon={<RightOutlined style={{ fontSize: 11 }} />}
                        size="small"
                        onClick={nextMonth}
                        disabled={isCurrentMonth}
                        style={{ borderRadius: 6, color: isCurrentMonth ? '#D1D5DB' : BRAND_COLORS.textSecondary, width: 28, height: 28, minWidth: 28, padding: 0 }}
                    />
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button
                        icon={<FileExcelOutlined />}
                        size="small"
                        onClick={exportToExcel}
                        disabled={logs.length === 0}
                        style={{
                            borderColor: BRAND_COLORS.success, color: BRAND_COLORS.success, borderRadius: 7,
                            fontWeight: 600, fontSize: 12, height: 32,
                            opacity: logs.length === 0 ? 0.45 : 1,
                        }}
                    >
                        {t('projectLog.exportExcel')}
                    </Button>
                    <Button
                        icon={<FileWordOutlined />}
                        size="small"
                        onClick={exportToWord}
                        disabled={logs.length === 0}
                        style={{
                            borderColor: BRAND_COLORS.info, color: BRAND_COLORS.info, borderRadius: 7,
                            fontWeight: 600, fontSize: 12, height: 32,
                            opacity: logs.length === 0 ? 0.45 : 1,
                        }}
                    >
                        {t('projectLog.exportWord')}
                    </Button>
                    {canWriteLog && (
                        <Button
                            type="primary"
                            icon={todayLog && isCurrentMonth ? <EditOutlined /> : <PlusOutlined />}
                            size="small"
                            onClick={openNew}
                            style={{
                                background: BRAND_COLORS.primary, borderColor: BRAND_COLORS.primary, borderRadius: 7,
                                fontWeight: 600, fontSize: 12, height: 32,
                            }}
                        >
                            {todayLog && isCurrentMonth ? t('projectLog.editToday') : t('projectLog.writeToday')}
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Stats row ── */}
            <Row gutter={[16, 16]} className="log-stats-row">
                {[
                    {
                        label: t('projectLog.workDays'),
                        value: stats.workDays,
                        suffix: t('projectLog.workDaysUnit'),
                        icon: '📅',
                        color: '#6366F1',
                        bg: '#EEF2FF',
                    },
                    {
                        label: t('projectLog.totalWorkers'),
                        value: stats.totalWorkers,
                        suffix: t('projectLog.totalWorkersUnit'),
                        icon: '👷',
                        color: '#0EA5E9',
                        bg: '#E0F2FE',
                    },
                    {
                        label: t('projectLog.avgProgress'),
                        value: `${stats.avgProgress}%`,
                        suffix: '',
                        icon: '📈',
                        color: stats.avgProgress >= 70 ? '#10B981' : stats.avgProgress >= 40 ? '#F59E0B' : BRAND_COLORS.error,
                        bg: stats.avgProgress >= 70 ? '#ECFDF5' : stats.avgProgress >= 40 ? '#FFFBEB' : '#FEF2F2',
                    },
                    {
                        label: t('projectLog.incidentDays'),
                        value: stats.incidentDays,
                        suffix: t('projectLog.workDaysUnit'),
                        icon: '⚠️',
                        color: stats.incidentDays > 0 ? '#F59E0B' : BRAND_COLORS.textMuted,
                        bg: stats.incidentDays > 0 ? '#FFFBEB' : BRAND_COLORS.backgroundLight,
                    },
                ].map((s, i) => (
                    <Col xs={12} sm={12} md={6} key={i}>
                        <div className="log-stats-card">
                            <div className="log-stats-icon" style={{ backgroundColor: s.bg }}>
                                {s.icon}
                            </div>
                            <div className="log-stats-info">
                                <div className="log-stats-label">
                                    {s.label}
                                </div>
                                <div className="log-stats-value" style={{ color: s.color }}>
                                    {s.value}
                                    {s.suffix && <span className="log-stats-suffix">{s.suffix}</span>}
                                </div>
                            </div>
                        </div>
                    </Col>
                ))}
            </Row>

            {/* ── Monthly summary (Materials & Equipment) ── */}
            {(monthSummaryText.mats || monthSummaryText.equip) && (
                <Row gutter={[16, 16]} className="log-stats-row">
                    {monthSummaryText.mats && (
                        <Col xs={24} md={monthSummaryText.equip ? 12 : 24}>
                            <div className="summary-panel-materials">
                                <div className="summary-panel-title" style={{ color: '#D97706' }}>
                                    📦 {t('projectLog.materialsTitle')}
                                </div>
                                <pre className="summary-panel-content" style={{ color: '#78350F' }}>
                                    {monthSummaryText.mats}
                                </pre>
                            </div>
                        </Col>
                    )}
                    {monthSummaryText.equip && (
                        <Col xs={24} md={monthSummaryText.mats ? 12 : 24}>
                            <div className="summary-panel-equipment">
                                <div className="summary-panel-title" style={{ color: '#7C3AED' }}>
                                    <ToolOutlined style={{ marginRight: 4 }} />
                                    {t('projectLog.equipmentTitle')}
                                </div>
                                <pre className="summary-panel-content" style={{ color: '#4C1D95' }}>
                                    {monthSummaryText.equip}
                                </pre>
                            </div>
                        </Col>
                    )}
                </Row>
            )}

            {/* ── Log divider ── */}
            <div className="log-timeline-divider">
                <div className="log-timeline-line" />
                <span className="log-timeline-text">
                    {logs.length > 0 ? t('projectLog.logsCount', { count: logs.length }) : t('projects.tabLogs')}
                </span>
                <div className="log-timeline-line" />
            </div>

            {/* ── Log list ── */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: 48 }}>
                    <Spin size="large" />
                </div>
            ) : logs.length === 0 ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                        <div>
                            <div style={{ fontWeight: 600, color: BRAND_COLORS.secondaryMid, marginBottom: 4 }}>
                                {t('projectLog.noLogsTitle')} {dayjs(currentMonth).format('MM/YYYY')}
                            </div>
                            <div style={{ fontSize: 13, color: BRAND_COLORS.textMuted }}>
                                {canWriteLog ? t('projectLog.noLogsHint') : t('projectLog.noLogsReadOnly')}
                            </div>
                        </div>
                    }
                    style={{ padding: '32px 0' }}
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {logs.map((log: ProjectLog) => {
                        const weather = log.weather ? WEATHER_ICONS[log.weather] : null;
                        const weatherLabel = log.weather ? getWeatherLabel(log.weather) : '';
                        const isToday = log.logDate === today;
                        const pct = log.progressPct || 0;
                        const progressColor = pct >= 80 ? '#10B981' : pct >= 50 ? '#3B82F6' : pct >= 30 ? '#F59E0B' : BRAND_COLORS.slate400;
                        const canEditThisLog = canEdit || log.createdBy === currentUserId;

                        return (
                            <div
                                key={log.id}
                                className={`log-item-card ${isToday ? 'today-active' : ''}`}
                                style={{ borderLeft: `4px solid ${isToday ? '#E11D2E' : progressColor}` }}
                            >
                                {/* Header row */}
                                <div className={`log-item-header ${isToday ? 'today-bg' : 'normal-bg'}`}>
                                    {/* Left: date + weather + workers */}
                                    <div className="log-item-meta">
                                        <span className={`log-item-date ${isToday ? 'today-text' : 'normal-text'}`}>{dayjs(log.logDate).format('ddd, DD/MM/YYYY')}</span>
                                        {isToday && (
                                            <Tag color="red" style={{ fontSize: 10, fontWeight: 700, margin: 0, lineHeight: '18px' }}>
                                                {t('projectLog.today')}
                                            </Tag>
                                        )}
                                        {weather && (
                                            <Tooltip title={weatherLabel}>
                                                <span style={{ fontSize: 16, cursor: 'default' }}>{weather.icon}</span>
                                            </Tooltip>
                                        )}
                                        {(log.workersCount ?? 0) > 0 && (
                                            <span style={{ fontSize: 12, color: BRAND_COLORS.textSecondary, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                <UserOutlined style={{ fontSize: 11 }} />
                                                {log.workersCount} {t('projectLog.workers')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="log-item-actions">
                                        <div className="log-item-progress-badge" style={{ background: `${progressColor}18`, color: progressColor }}>
                                            {pct}%
                                        </div>
                                        {canEditThisLog && (
                                            <>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<EditOutlined />}
                                                    onClick={() => openEdit(log)}
                                                    style={{ color: BRAND_COLORS.textSecondary, borderRadius: 6, width: 28, height: 28, padding: 0 }}
                                                />
                                                <Popconfirm
                                                    title={t('projectLog.deleteConfirm')}
                                                    description={t('projectLog.deleteConfirmDesc')}
                                                    onConfirm={() => handleDelete(log.id)}
                                                    okText={t('projectLog.deleteOk')}
                                                    cancelText={t('projectLog.deleteCancel')}
                                                    okButtonProps={{ danger: true }}
                                                >
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        icon={<DeleteOutlined />}
                                                        style={{ color: BRAND_COLORS.error, borderRadius: 6, width: 28, height: 28, padding: 0 }}
                                                    />
                                                </Popconfirm>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <Progress
                                    percent={pct}
                                    showInfo={false}
                                    strokeColor={progressColor}
                                    trailColor="#F3F4F6"
                                    strokeWidth={3}
                                    style={{ margin: 0, padding: 0, display: 'block' }}
                                />

                                {/* Body */}
                                <div className="log-item-body">
                                    {/* Activities */}
                                    {log.activities && (
                                        <div>
                                            <div className="log-item-section-title">
                                                {t('projectLog.activitiesLabel')}
                                            </div>
                                            <div className="log-item-activities">
                                                {log.activities}
                                            </div>
                                        </div>
                                    )}

                                    {/* Issues */}
                                    {log.issues && (
                                        <div className="log-item-issues-box">
                                            <div className="log-item-issues-title">
                                                {t('projectLog.issuesLabel')}
                                            </div>
                                            <div className="log-item-issues-text">
                                                {log.issues}
                                            </div>
                                        </div>
                                    )}

                                    {/* Materials + Equipment in 2 columns */}
                                    {(log.materials || log.equipment) && (
                                        <Row gutter={[12, 8]}>
                                            {log.materials && (
                                                <Col xs={24} sm={12} className="log-item-resource-col">
                                                    <div className="log-item-section-title">
                                                        {t('projectLog.materialsLabel')}
                                                    </div>
                                                    <div className="log-item-resource-text">
                                                        {log.materials}
                                                    </div>
                                                </Col>
                                            )}
                                            {log.equipment && (
                                                <Col xs={24} sm={12} className="log-item-resource-col">
                                                    <div className="log-item-section-title">
                                                        <ToolOutlined style={{ marginRight: 3 }} />{t('projectLog.equipmentLabel')}
                                                    </div>
                                                    <div className="log-item-resource-text">
                                                        {log.equipment}
                                                    </div>
                                                </Col>
                                            )}
                                        </Row>
                                    )}

                                    {/* Note */}
                                    {log.note && (
                                        <div className="log-item-note">
                                            💬 {log.note}
                                        </div>
                                    )}

                                    {/* Footer */}
                                    <div className="log-item-footer">
                                        <span>
                                            {t('projectLog.createdBy')} <strong style={{ color: BRAND_COLORS.textMuted }}>{log.createdByName || 'N/A'}</strong>
                                        </span>
                                        {log.updatedAt && (
                                            <span>{t('projectLog.updatedAt')} {dayjs(log.updatedAt).format('HH:mm DD/MM')}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Form Drawer ── */}
            <ProjectLogForm
                open={formOpen}
                projectId={projectId}
                editingLog={editingLog}
                onClose={() => setFormOpen(false)}
                onSave={handleSave}
                isSaving={upsertLog.isPending}
            />
        </div>
    );
};

export default ProjectLogTab;
