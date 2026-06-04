/**
 * ProjectLogTab.tsx
 * Tab Nhật ký Thi công trong ProjectDetail.
 *
 * Tính năng:
 * - Timeline nhật ký theo tháng (mới nhất trên đầu)
 * - Thống kê tháng: ngày làm việc, tổng lao động, tiến độ TB, số sự cố
 * - Bảng tổng hợp vật tư & thiết bị trong tháng
 * - Nút "Ghi nhật ký hôm nay" / Sửa / Xóa
 * - Phân quyền: chỉ members của project mới ghi được
 */

import React, { useState, useMemo } from 'react';
import {
    Button, Tag, Progress, Empty, Popconfirm, message,
    Row, Col, Statistic, Divider, Tooltip, Spin,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    LeftOutlined,
    RightOutlined,
    UserOutlined,
    WarningOutlined,
    ToolOutlined,
    FileExcelOutlined,
    FileWordOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { useProjectLogs, useProjectLogMutations } from '../hooks/useProjectLogs';
import ProjectLogForm from '../components/ProjectLogForm';
import type { ProjectLog, ProjectLogPayload } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

const WEATHER_MAP: Record<string, { icon: string; label: string; color: string }> = {
    SUNNY:  { icon: '☀️',  label: 'Nắng',    color: '#FA8C16' },
    CLOUDY: { icon: '⛅',  label: 'Mây',     color: '#597EF7' },
    RAINY:  { icon: '🌧️', label: 'Mưa',     color: '#1890FF' },
    STORMY: { icon: '⛈️', label: 'Bão/Gió', color: '#FF4D4F' },
};

// Lấy currentUser từ localStorage
function getCurrentUserId(): string {
    try {
        return JSON.parse(localStorage.getItem('user') || '{}')?.id || '';
    } catch {
        return '';
    }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface ProjectLogTabProps {
    project: any;   // project details object
    members: { id: string; userId: string; role: string }[];   // project members
    canEdit: boolean;   // Admin/Manager quyền cao nhất
}

// ── Main Component ────────────────────────────────────────────────────────────
const ProjectLogTab: React.FC<ProjectLogTabProps> = ({ project, members, canEdit }) => {
    const { t } = useTranslation();
    const projectId = project?.id || '';

    // Month state (mặc định = tháng hiện tại)
    const [currentMonth, setCurrentMonth] = useState(() => dayjs().format('YYYY-MM'));
    const [formOpen, setFormOpen] = useState(false);
    const [editingLog, setEditingLog] = useState<ProjectLog | null>(null);

    // Phân quyền ghi nhật ký: canEdit (admin) HOẶC là member của project
    const currentUserId = getCurrentUserId();
    const isMember = members.some(m => m.userId === currentUserId);
    const canWriteLog = canEdit || isMember;

    // Data
    const { data: logs = [], isLoading } = useProjectLogs(projectId, currentMonth);
    const { upsertLog, deleteLog } = useProjectLogMutations(projectId, currentMonth);

    // Kiểm tra đã có log hôm nay chưa
    const today = dayjs().format('YYYY-MM-DD');
    const todayLog = useMemo(() => logs.find(l => l.logDate === today), [logs, today]);

    // ── Thống kê tháng ──────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const workDays = logs.length;
        const totalWorkers = logs.reduce((s, l) => s + (l.workersCount || 0), 0);
        const avgProgress = workDays > 0
            ? Math.round(logs.reduce((s, l) => s + (l.progressPct || 0), 0) / workDays)
            : 0;
        const incidentDays = logs.filter(l => l.issues && l.issues.trim()).length;
        return { workDays, totalWorkers, avgProgress, incidentDays };
    }, [logs]);

    // ── Tổng hợp vật tư + thiết bị trong tháng ──────────────────────────────
    const monthSummaryText = useMemo(() => {
        const mats = logs
            .filter(l => l.materials?.trim())
            .map(l => `[${dayjs(l.logDate).format('DD/MM')}] ${l.materials}`)
            .join('\n');
        const equip = logs
            .filter(l => l.equipment?.trim())
            .map(l => `[${dayjs(l.logDate).format('DD/MM')}] ${l.equipment}`)
            .join('\n');
        return { mats, equip };
    }, [logs]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const exportToExcel = () => {
        if (logs.length === 0) {
            message.warning('Không có dữ liệu nhật ký trong tháng này để xuất');
            return;
        }

        const sheetData = [
            ['BÁO CÁO NHẬT KÝ THI CÔNG DỰ ÁN'],
            ['Tên dự án:', project?.name || 'N/A'],
            ['Mã dự án:', project?.code || 'N/A'],
            ['Chủ đầu tư:', project?.investor || 'N/A'],
            ['Địa điểm:', project?.location || 'N/A'],
            ['Tháng báo cáo:', dayjs(currentMonth).format('MM/YYYY')],
            ['Tiến độ TB tháng:', `${stats.avgProgress}%`],
            [],
            ['STT', 'Ngày thi công', 'Thời tiết', 'Nhân sự (người)', 'Tiến độ lũy kế (%)', 'Công việc đã thực hiện', 'Vướng mắc / Sự cố', 'Vật tư sử dụng', 'Thiết bị thi công', 'Ghi chú', 'Người ghi']
        ];

        logs.forEach((log, index) => {
            const weatherText = log.weather ? WEATHER_MAP[log.weather]?.label || log.weather : '';
            sheetData.push([
                index + 1,
                dayjs(log.logDate).format('DD/MM/YYYY'),
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
        XLSX.utils.book_append_sheet(wb, ws, 'NhatKyThiCong');

        const fileName = `NhatKyThiCong_${project?.code || 'Project'}_${currentMonth}.xlsx`;
        XLSX.writeFile(wb, fileName);
        message.success('Đã xuất file Excel thành công!');
    };

    const exportToWord = () => {
        if (logs.length === 0) {
            message.warning('Không có dữ liệu nhật ký trong tháng này để xuất');
            return;
        }

        const projectName = project?.name || 'N/A';
        const projectCode = project?.code || 'N/A';
        const investor = project?.investor || 'N/A';
        const location = project?.location || 'N/A';
        const monthStr = dayjs(currentMonth).format('MM/YYYY');

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
                        CÔNG TY CỔ PHẦN CÔNG TRÌNH VIETTEL<br>
                        <strong>CHI NHÁNH CÔNG TRÌNH MẪU DỰ ÁN</strong>
                    </td>
                    <td class="header-right">
                        CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br>
                        Độc lập - Tự do - Hạnh phúc<br>
                        ---------------------
                    </td>
                </tr>
            </table>

            <div class="title">BÁO CÁO NHẬT KÝ THI CÔNG</div>
            <div class="subtitle">Tháng ${monthStr}</div>

            <div class="section-title">I. THÔNG TIN CHUNG DỰ ÁN</div>
            <table class="info-table">
                <tr>
                    <td class="info-label">Tên dự án:</td>
                    <td>${projectName}</td>
                </tr>
                <tr>
                    <td class="info-label">Mã dự án:</td>
                    <td>${projectCode}</td>
                </tr>
                <tr>
                    <td class="info-label">Chủ đầu tư:</td>
                    <td>${investor}</td>
                </tr>
                <tr>
                    <td class="info-label">Địa điểm thi công:</td>
                    <td>${location}</td>
                </tr>
            </table>

            <div class="section-title">II. TỔNG HỢP HIỆU SUẤT TRONG THÁNG</div>
            <table class="info-table">
                <tr>
                    <td style="width: 50%;"><strong>Số ngày thi công thực tế:</strong> ${stats.workDays} ngày</td>
                    <td style="width: 50%;"><strong>Tổng lượt lao động huy động:</strong> ${stats.totalWorkers} lượt người</td>
                </tr>
                <tr>
                    <td style="width: 50%;"><strong>Tiến độ hoàn thành trung bình:</strong> ${stats.avgProgress}%</td>
                    <td style="width: 50%;"><strong>Số ngày phát sinh sự cố:</strong> ${stats.incidentDays} ngày</td>
                </tr>
            </table>

            <div class="section-title">III. CHI TIẾT NHẬT KÝ THI CÔNG HÀNG NGÀY</div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 5%;">STT</th>
                        <th style="width: 10%;">Ngày</th>
                        <th style="width: 10%;">Thời tiết</th>
                        <th style="width: 8%;">Nhân sự (người)</th>
                        <th style="width: 10%;">Tiến độ lũy kế</th>
                        <th style="width: 37%;">Công việc thực hiện</th>
                        <th style="width: 20%;">Vật tư & Thiết bị</th>
                    </tr>
                </thead>
                <tbody>
        `;

        logs.forEach((log, index) => {
            const weatherText = log.weather ? WEATHER_MAP[log.weather]?.label || log.weather : '--';
            const workers = log.workersCount || 0;
            const progress = `${log.progressPct || 0}%`;

            let activitiesText = log.activities || 'Không ghi nhận công việc cụ thể.';
            if (log.issues) {
                activitiesText += `<br><strong style="color: #FF0000;">[Sự cố/Vướng mắc]:</strong> ${log.issues}`;
            }
            if (log.note) {
                activitiesText += `<br><span style="color: #666666; font-style: italic;">(Ghi chú: ${log.note})</span>`;
            }

            let resourcesText = '';
            if (log.materials) {
                resourcesText += `<strong>Vật tư:</strong> ${log.materials}`;
            }
            if (log.equipment) {
                if (resourcesText) resourcesText += '<br>';
                resourcesText += `<strong>Thiết bị:</strong> ${log.equipment}`;
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
                        ĐẠI DIỆN BAN CHỈ HUY CÔNG TRÌNH<br>
                        (Ký, ghi rõ họ tên)
                    </td>
                    <td class="sign-title" style="width: 50%;">
                        NGƯỜI LẬP BÁO CÁO<br>
                        (Ký, ghi rõ họ tên)
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
        a.download = `BaoCaoThiCong_${projectCode || 'Project'}_${currentMonth}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        message.success('Đã xuất báo cáo Word thành công!');
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
            onSuccess: res => {
                if (res.success) {
                    message.success(editingLog ? 'Đã cập nhật nhật ký' : 'Đã ghi nhật ký thành công');
                    setFormOpen(false);
                } else {
                    message.error(res.error || 'Có lỗi xảy ra');
                }
            },
            onError: () => message.error('Không thể lưu nhật ký'),
        });
    };

    const handleDelete = (id: string) => {
        deleteLog.mutate(id, {
            onSuccess: res => {
                if (res.success) message.success('Đã xóa nhật ký');
                else message.error(res.error || 'Có lỗi xảy ra');
            },
            onError: () => message.error('Không thể xóa nhật ký'),
        });
    };

    // Month navigation
    const prevMonth = () => setCurrentMonth(dayjs(currentMonth).subtract(1, 'month').format('YYYY-MM'));
    const nextMonth = () => setCurrentMonth(dayjs(currentMonth).add(1, 'month').format('YYYY-MM'));
    const isCurrentMonth = currentMonth === dayjs().format('YYYY-MM');

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

            {/* ── Header ── */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20,
                flexWrap: 'wrap',
                gap: 12,
            }}>
                {/* Month picker */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Button
                        icon={<LeftOutlined />}
                        size="small"
                        onClick={prevMonth}
                        style={{ borderRadius: 6 }}
                    />
                    <div style={{
                        fontWeight: 700,
                        fontSize: 16,
                        color: '#1F2937',
                        minWidth: 120,
                        textAlign: 'center',
                    }}>
                        {dayjs(currentMonth).format('MM/YYYY')}
                    </div>
                    <Button
                        icon={<RightOutlined />}
                        size="small"
                        onClick={nextMonth}
                        disabled={isCurrentMonth}
                        style={{ borderRadius: 6 }}
                    />
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button
                        icon={<FileExcelOutlined />}
                        onClick={exportToExcel}
                        disabled={logs.length === 0}
                        style={{ borderColor: '#10B981', color: '#10B981', borderRadius: 8 }}
                    >
                        Xuất Excel
                    </Button>
                    <Button
                        icon={<FileWordOutlined />}
                        onClick={exportToWord}
                        disabled={logs.length === 0}
                        style={{ borderColor: '#3B82F6', color: '#3B82F6', borderRadius: 8 }}
                    >
                        Xuất Word
                    </Button>
                    {canWriteLog && (
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={openNew}
                            style={{ background: '#E11D2E', borderColor: '#E11D2E', borderRadius: 8 }}
                        >
                            {todayLog && isCurrentMonth ? '✏️ Chỉnh sửa nhật ký hôm nay' : '+ Ghi nhật ký hôm nay'}
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Thống kê tháng ── */}
            <div style={{
                background: 'linear-gradient(135deg, #1F2937 0%, #374151 100%)',
                borderRadius: 16,
                padding: '20px 24px',
                marginBottom: 24,
                color: '#fff',
            }}>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16, fontWeight: 600, letterSpacing: 1 }}>
                    THỐNG KÊ THÁNG {dayjs(currentMonth).format('MM/YYYY')}
                </div>
                <Row gutter={[24, 16]}>
                    <Col xs={12} sm={6}>
                        <Statistic
                            title={<span style={{ color: '#9CA3AF', fontSize: 12 }}>Ngày làm việc</span>}
                            value={stats.workDays}
                            suffix="ngày"
                            valueStyle={{ color: '#fff', fontSize: 22 }}
                        />
                    </Col>
                    <Col xs={12} sm={6}>
                        <Statistic
                            title={<span style={{ color: '#9CA3AF', fontSize: 12 }}>Tổng lao động</span>}
                            value={stats.totalWorkers}
                            suffix="lượt"
                            prefix={<UserOutlined style={{ fontSize: 14 }} />}
                            valueStyle={{ color: '#60A5FA', fontSize: 22 }}
                        />
                    </Col>
                    <Col xs={12} sm={6}>
                        <Statistic
                            title={<span style={{ color: '#9CA3AF', fontSize: 12 }}>Tiến độ TB</span>}
                            value={stats.avgProgress}
                            suffix="%"
                            valueStyle={{ color: stats.avgProgress >= 70 ? '#34D399' : stats.avgProgress >= 40 ? '#FCD34D' : '#F87171', fontSize: 22 }}
                        />
                    </Col>
                    <Col xs={12} sm={6}>
                        <Statistic
                            title={<span style={{ color: '#9CA3AF', fontSize: 12 }}>Ngày có sự cố</span>}
                            value={stats.incidentDays}
                            suffix="ngày"
                            prefix={<WarningOutlined style={{ fontSize: 14 }} />}
                            valueStyle={{ color: stats.incidentDays > 0 ? '#FBBF24' : '#9CA3AF', fontSize: 22 }}
                        />
                    </Col>
                </Row>
            </div>

            {/* ── Tổng hợp vật tư & thiết bị (nếu có) ── */}
            {(monthSummaryText.mats || monthSummaryText.equip) && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: monthSummaryText.mats && monthSummaryText.equip ? '1fr 1fr' : '1fr',
                    gap: 16,
                    marginBottom: 24,
                }}>
                    {monthSummaryText.mats && (
                        <div style={{
                            background: '#FFFBEB',
                            border: '1px solid #FDE68A',
                            borderRadius: 12,
                            padding: 16,
                        }}>
                            <div style={{ fontWeight: 700, color: '#D97706', marginBottom: 8, fontSize: 13 }}>
                                📦 Vật tư sử dụng trong tháng
                            </div>
                            <pre style={{
                                fontSize: 12,
                                color: '#78350F',
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'inherit',
                                margin: 0,
                                maxHeight: 150,
                                overflowY: 'auto',
                            }}>
                                {monthSummaryText.mats}
                            </pre>
                        </div>
                    )}
                    {monthSummaryText.equip && (
                        <div style={{
                            background: '#F5F3FF',
                            border: '1px solid #DDD6FE',
                            borderRadius: 12,
                            padding: 16,
                        }}>
                            <div style={{ fontWeight: 700, color: '#7C3AED', marginBottom: 8, fontSize: 13 }}>
                                <ToolOutlined style={{ marginRight: 4 }} />
                                Thiết bị thi công trong tháng
                            </div>
                            <pre style={{
                                fontSize: 12,
                                color: '#4C1D95',
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'inherit',
                                margin: 0,
                                maxHeight: 150,
                                overflowY: 'auto',
                            }}>
                                {monthSummaryText.equip}
                            </pre>
                        </div>
                    )}
                </div>
            )}

            {/* ── Timeline ── */}
            <Divider style={{ margin: '0 0 20px' }}>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {logs.length > 0 ? `${logs.length} nhật ký` : 'Nhật ký thi công'}
                </span>
            </Divider>

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: 48 }}>
                    <Spin size="large" />
                </div>
            ) : logs.length === 0 ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                        <div>
                            <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                                Chưa có nhật ký trong tháng {dayjs(currentMonth).format('MM/YYYY')}
                            </div>
                            <div style={{ fontSize: 13, color: '#9CA3AF' }}>
                                {canWriteLog
                                    ? 'Nhấn "+ Ghi nhật ký hôm nay" để bắt đầu'
                                    : 'Chưa có dữ liệu nhật ký thi công'}
                            </div>
                        </div>
                    }
                    style={{ padding: '40px 0' }}
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {logs.map(log => {
                        const weather = log.weather ? WEATHER_MAP[log.weather] : null;
                        const isToday = log.logDate === today;
                        const pct = log.progressPct || 0;
                        const progressColor = pct >= 80 ? '#10B981' : pct >= 50 ? '#3B82F6' : pct >= 30 ? '#F59E0B' : '#94A3B8';
                        const canEditThisLog = canEdit || log.createdBy === currentUserId;

                        return (
                            <div
                                key={log.id}
                                style={{
                                    background: '#fff',
                                    borderRadius: 14,
                                    border: `1.5px solid ${isToday ? '#E11D2E' : '#E5E7EB'}`,
                                    overflow: 'hidden',
                                    boxShadow: isToday ? '0 0 0 3px rgba(225,29,46,0.08)' : '0 1px 4px rgba(0,0,0,0.05)',
                                    transition: 'all 0.2s ease',
                                }}
                            >
                                {/* Log header */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '14px 18px',
                                    background: isToday ? '#FFF5F5' : '#F9FAFB',
                                    borderBottom: '1px solid #E5E7EB',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        {/* Date */}
                                        <div style={{
                                            fontWeight: 800,
                                            fontSize: 15,
                                            color: isToday ? '#E11D2E' : '#1F2937',
                                        }}>
                                            {dayjs(log.logDate).format('DD/MM/YYYY')}
                                            {isToday && (
                                                <Tag color="red" style={{ marginLeft: 8, fontSize: 10, fontWeight: 700 }}>
                                                    HÔM NAY
                                                </Tag>
                                            )}
                                        </div>

                                        {/* Weather */}
                                        {weather && (
                                            <Tooltip title={weather.label}>
                                                <span style={{ fontSize: 20 }}>{weather.icon}</span>
                                            </Tooltip>
                                        )}

                                        {/* Workers */}
                                        {(log.workersCount ?? 0) > 0 && (
                                            <Tag icon={<UserOutlined />} color="blue" style={{ fontSize: 12 }}>
                                                {log.workersCount} người
                                            </Tag>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {/* Progress badge */}
                                        <div style={{
                                            fontWeight: 700,
                                            fontSize: 14,
                                            color: progressColor,
                                            minWidth: 40,
                                            textAlign: 'right',
                                        }}>
                                            {pct}%
                                        </div>
                                        {canEditThisLog && (
                                            <>
                                                <Button
                                                    size="small"
                                                    icon={<EditOutlined />}
                                                    onClick={() => openEdit(log)}
                                                    style={{ borderRadius: 6 }}
                                                />
                                                <Popconfirm
                                                    title="Xóa nhật ký này?"
                                                    description="Hành động này không thể hoàn tác."
                                                    onConfirm={() => handleDelete(log.id)}
                                                    okText="Xóa"
                                                    cancelText="Hủy"
                                                    okButtonProps={{ danger: true }}
                                                >
                                                    <Button
                                                        size="small"
                                                        icon={<DeleteOutlined />}
                                                        danger
                                                        style={{ borderRadius: 6 }}
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
                                    strokeWidth={4}
                                    style={{ margin: 0, padding: 0 }}
                                />

                                {/* Log body */}
                                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {/* Activities */}
                                    {log.activities && (
                                        <div>
                                            <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                📋 Công việc đã thực hiện
                                            </div>
                                            <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                                {log.activities}
                                            </div>
                                        </div>
                                    )}

                                    {/* Issues */}
                                    {log.issues && (
                                        <div style={{
                                            background: '#FFFBEB',
                                            border: '1px solid #FDE68A',
                                            borderRadius: 8,
                                            padding: '8px 12px',
                                        }}>
                                            <div style={{ fontSize: 11, color: '#D97706', fontWeight: 600, marginBottom: 2 }}>
                                                ⚠️ Vướng mắc / Sự cố
                                            </div>
                                            <div style={{ fontSize: 13, color: '#78350F', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                                {log.issues}
                                            </div>
                                        </div>
                                    )}

                                    {/* Materials + Equipment */}
                                    {(log.materials || log.equipment) && (
                                        <div style={{ display: 'flex', gap: 12 }}>
                                            {log.materials && (
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginBottom: 2 }}>
                                                        📦 Vật tư
                                                    </div>
                                                    <div style={{ fontSize: 12, color: '#4B5563', whiteSpace: 'pre-wrap' }}>
                                                        {log.materials}
                                                    </div>
                                                </div>
                                            )}
                                            {log.equipment && (
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginBottom: 2 }}>
                                                        <ToolOutlined style={{ marginRight: 2 }} />Thiết bị
                                                    </div>
                                                    <div style={{ fontSize: 12, color: '#4B5563', whiteSpace: 'pre-wrap' }}>
                                                        {log.equipment}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Note */}
                                    {log.note && (
                                        <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>
                                            💬 {log.note}
                                        </div>
                                    )}

                                    {/* Footer: người ghi */}
                                    <div style={{ fontSize: 11, color: '#D1D5DB', marginTop: 4, paddingTop: 8, borderTop: '1px solid #F3F4F6' }}>
                                        Ghi bởi: <strong style={{ color: '#9CA3AF' }}>{log.createdByName || 'N/A'}</strong>
                                        {log.updatedAt && (
                                            <span style={{ marginLeft: 8 }}>
                                                · Cập nhật lúc {dayjs(log.updatedAt).format('HH:mm DD/MM')}
                                            </span>
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
