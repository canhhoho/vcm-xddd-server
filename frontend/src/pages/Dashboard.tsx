import React, { useMemo, useState } from 'react';
import { Row, Col, Card, Spin, Table, Progress, Tag, Tooltip, Button, DatePicker, message, Alert, Segmented, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import {
    FileTextOutlined,
    DollarOutlined,
    CreditCardOutlined,
    ProjectOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ExclamationCircleOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    AimOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
// Dynamic import for heavy chart library
const Pie = React.lazy(() => import('@ant-design/charts').then(module => ({ default: module.Pie })));
import CustomColumnChart from '../components/CustomColumnChart';
import { useTranslation } from 'react-i18next';
import { useDashboardStats } from '../hooks/useDashboardStats';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [targetDate, setTargetDate] = useState<Dayjs>(dayjs());
    const currentYear = dayjs().year();
    const [viewMode, setViewMode] = useState<'MONTH' | 'YEAR' | 'ALL'>('MONTH');
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [appVersion] = useState<string>(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.6.7');

    // Use React Query Hook
    const dateStr = targetDate.format('YYYY-MM-DD');
    const { data: stats, isLoading: loading, error, refetch } = useDashboardStats(dateStr, viewMode);

    const onDateChange = (date: Dayjs | null) => {
        if (date) {
            setTargetDate(date);
        }
    };

    const onYearChange = (year: number) => {
        setSelectedYear(year);
        // Set targetDate to Dec 31 of the selected year (or today if current year)
        if (year === currentYear) {
            setTargetDate(dayjs());
        } else {
            setTargetDate(dayjs(`${year}-12-31`));
        }
    };

    const handleModeChange = (val: string) => {
        const mode = val as 'MONTH' | 'YEAR' | 'ALL';
        setViewMode(mode);
        if (mode === 'YEAR') {
            // When switching to YEAR, apply selectedYear
            onYearChange(selectedYear);
        } else if (mode === 'MONTH') {
            // When switching to MONTH, reset to today
            setTargetDate(dayjs());
        }
    };

    // Generate year options from 2023 to current year
    const yearOptions = useMemo(() => {
        const years = [];
        for (let y = currentYear; y >= 2023; y--) {
            years.push({ label: String(y), value: y });
        }
        return years;
    }, [currentYear]);

    const handleRefresh = () => {
        refetch();
        message.success(t('dashboard.refreshSuccess'));
    };

    // Derived State using useMemo
    const kpi = useMemo(() => stats?.kpi, [stats]);
    const businessStructure = useMemo(() => stats?.businessStructure, [stats]);
    const projectExecution = useMemo(() => stats?.projectExecution, [stats]);
    const recentActivities = useMemo(() => stats?.recentActivities || [], [stats]);
    const priorityTasks = useMemo(() => stats?.priorityTasks || [], [stats]);

    // Hardcode labels to ensure distinction and avoid translation issues
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const actualLabel = t('dashboard.actual', 'Actual');
    const planLabel = t('dashboard.plan', 'Target');

    const nguonViecChartData = useMemo(() => {
        if (!stats?.nguonViecTrend) return [];
        const result: any[] = [];
        stats.nguonViecTrend.forEach(d => {
            result.push({ month: d.month, value: d.plan, type: planLabel });
            result.push({ month: d.month, value: d.actual, type: actualLabel });
        });
        return result;
    }, [stats?.nguonViecTrend, actualLabel, planLabel]);

    const doanhThuChartData = useMemo(() => {
        if (!stats?.doanhThuTrend) return [];
        const result: any[] = [];
        stats.doanhThuTrend.forEach(d => {
            result.push({ month: d.month, value: d.plan, type: planLabel });
            result.push({ month: d.month, value: d.actual, type: actualLabel });
        });
        return result;
    }, [stats?.doanhThuTrend, actualLabel, planLabel]);

    const branchChartData = useMemo(() => {
        if (!stats?.branchBreakdown) return [];
        const result: any[] = [];
        stats.branchBreakdown.forEach(b => {
            result.push({ branch: b.branchCode, value: b.planDT, type: planLabel });
            result.push({ branch: b.branchCode, value: b.actualDT, type: actualLabel });
        });
        return result;
    }, [stats?.branchBreakdown, actualLabel, planLabel]);

    const formatBusinessData = (dataArray: any[]) => {
        if (!dataArray || !Array.isArray(dataArray) || dataArray.length === 0) return [];
        return dataArray.map((item: any) => {
            return {
                type: item.field,
                value: item.value,
                field: item.field,
                percent: item.percent
            };
        });
    };

    const sourceWorkData = useMemo(() => formatBusinessData(businessStructure?.sourceWork || []), [businessStructure]);
    const revenueData = useMemo(() => formatBusinessData(businessStructure?.revenue || []), [businessStructure]);
    const paymentData = useMemo(() => formatBusinessData(businessStructure?.payment || []), [businessStructure]);

    // Helpers
    const renderMom = (val: number) => {
        const isUp = val >= 0;
        return (
            <span className={`dash-mom ${isUp ? 'up' : 'down'}`}>
                {isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                {isUp ? '+' : ''}{val.toLocaleString()} Tr
            </span>
        );
    };

    const userName = stats?.userName || localStorage.getItem('userName') || 'User';

    const activityColumns = useMemo(() => [
        {
            title: t('dashboard.account'),
            dataIndex: 'userName',
            key: 'userName',
            width: 150,
            render: (text: string) => <span style={{ fontWeight: 500 }}>{text || '-'}</span>,
        },
        {
            title: t('dashboard.activity'),
            dataIndex: 'description',
            key: 'description',
            render: (text: string) => <span className="dash-activity-text">{text}</span>,
        },
        {
            title: t('dashboard.time'),
            dataIndex: 'createdAt',
            key: 'timestamp',
            width: 80,
            render: (text: string) => {
                if (!text) return '-';
                const d = new Date(text);
                return <span className="dash-time">{isNaN(d.getTime()) ? '-' : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>;
            },
        },
        {
            title: t('dashboard.date'),
            dataIndex: 'createdAt',
            key: 'date',
            width: 110,
            render: (text: string) => {
                if (!text) return '-';
                const d = new Date(text);
                return <span className="dash-date">{isNaN(d.getTime()) ? '-' : d.toLocaleDateString('vi-VN')}</span>;
            },
        },
    ], [t]);

    const statusLabelMap = useMemo(() => ({
        URGENT: { label: t('dashboard.urgent'), color: '#EF4444' },
        PENDING_APPROVAL: { label: t('dashboard.pendingApproval'), color: '#F59E0B' },
        HIGH: { label: t('dashboard.high'), color: '#E11D2E' },
    }), [t]);

    // Render logic
    if (loading && !stats) {
        return (
            <div className="dash-loading">
                <Spin size="large" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="dash-container" style={{ padding: 20 }}>
                <Alert
                    message="Error Loading Dashboard"
                    description={
                        <div>
                            <p>{(error as Error).message || 'Unknown error'}</p>
                            <Button type="primary" onClick={() => refetch()}>Retry</Button>
                        </div>
                    }
                    type="error"
                    showIcon
                />
            </div>
        );
    }

    // Check if essential data is available after loading
    if (!kpi || !businessStructure || !projectExecution) return null;

    // Execution progress percent
    const execDonePct = projectExecution.total > 0 ? Math.round((projectExecution.done / projectExecution.total) * 100) : 0;
    const execInProgressPct = projectExecution.total > 0 ? Math.round((projectExecution.inProgress / projectExecution.total) * 100) : 0;
    const execWaitingPct = projectExecution.total > 0 ? Math.round((projectExecution.waiting / projectExecution.total) * 100) : 0;

    const gridProgress = (val: number, total: number) => {
        return total > 0 ? Math.round((val / total) * 100) : 0;
    };

    const renderMiniDonut = (title: string, data: any[], colorB2B: string, colorB2C: string) => {
        const topField = data && data.length > 0 ? data[0] : null;
        
        return (
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: '#4B5563' }}>{title}</div>
                <Pie
                    data={data}
                    angleField="value"
                    colorField="type"
                    radius={1}
                    innerRadius={0.7}
                    color={({ type }: any) => type === 'B2B' ? colorB2B : colorB2C}
                    label={false}
                    statistic={{
                        title: {
                            content: topField ? `${topField.percent}%` : '0%',
                            style: { fontSize: '18px', fontWeight: 700, color: '#171717' },
                        },
                        content: false,
                    }}
                    tooltip={{
                        formatter: (datum: any) => {
                            const valInM = (datum.value / 1000000).toLocaleString(i18n.language === 'en' ? 'en-US' : 'vi-VN');
                            return { name: datum.field, value: `${datum.percent}% | ${valInM} ${t('dashboard.millionUnit')}` };
                        }
                    }}
                    legend={false}
                    height={150}
                />
                <div style={{ marginTop: '12px', fontSize: '11.5px', textAlign: 'left', padding: '0 4px' }}>
                    {data.map(d => (
                        <div key={d.field} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ color: d.field === 'B2B' ? colorB2B : colorB2C, fontWeight: 700 }}>
                                {d.field}
                            </span>
                            <span style={{ color: '#4B5563', fontWeight: 500 }}>
                                {d.percent}% ({(d.value / 1000000).toLocaleString(i18n.language === 'en' ? 'en-US' : 'vi-VN')} {t('dashboard.millionUnit')})
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="dash-container">
            <div className="dashboard-header">
                <div className="dash-header-left">
                    <h2>{t('dashboard.title')} <span style={{ fontSize: '0.6em', color: '#888', fontWeight: 'normal' }}>v{stats?.VERSION || appVersion}</span></h2>
                    <p>{t('dashboard.welcome')}, {userName}!</p>
                </div>
                <div className="dash-header-actions">
                    <Segmented 
                        options={[
                            { label: t('dashboard.all', 'Tất cả'), value: 'ALL' },
                            { label: t('dashboard.year', 'Năm'), value: 'YEAR' },
                            { label: t('dashboard.month', 'Tháng'), value: 'MONTH' }
                        ]}
                        value={viewMode}
                        onChange={handleModeChange}
                        style={{ marginRight: 8 }}
                    />
                    {viewMode === 'YEAR' && (
                        <Select
                            value={selectedYear}
                            onChange={onYearChange}
                            options={yearOptions}
                            style={{ width: 90, marginRight: 8 }}
                            size="middle"
                        />
                    )}
                    <Button
                        className="dash-refresh-btn"
                        icon={<ReloadOutlined spin={loading} />}
                        onClick={handleRefresh}
                        disabled={loading}
                    />
                    {viewMode === 'MONTH' && (
                        <DatePicker
                            className="dash-date-picker"
                            value={targetDate}
                            format="DD/MM/YYYY"
                            onChange={onDateChange}
                            allowClear={false}
                            suffixIcon={null}
                        />
                    )}
                </div>
            </div>

            {/* ==================== ROW 1: KPI Cards ==================== */}
            <Row gutter={[20, 20]} className="dash-row">
                {/* KPI 1: Nguồn việc */}
                <Col xs={24} sm={12} md={6} lg={6}>
                    <div className="dash-kpi-card">
                        <div className="dash-kpi-header">
                            <span className="dash-kpi-label">{t('dashboard.nguonViec')}</span>
                            <div className="dash-kpi-icon" style={{ backgroundColor: '#EE0033' }}>
                                <FileTextOutlined style={{ color: '#fff' }} />
                            </div>
                        </div>
                        <div className="dash-kpi-main">
                            <span className="dash-kpi-value">{viewMode === 'ALL' ? kpi.nguonViec.valueAllTime?.toLocaleString() : viewMode === 'YEAR' ? kpi.nguonViec.valueYTD?.toLocaleString() : kpi.nguonViec.value?.toLocaleString()}</span>
                            <span className="dash-kpi-unit">Tr</span>
                        </div>
                        <div className="dash-kpi-bar-section" style={{ visibility: viewMode === 'ALL' ? 'hidden' : 'visible' }}>
                            <Progress
                                percent={Math.min(viewMode === 'YEAR' ? kpi.nguonViec.yearPct : kpi.nguonViec.achievedPct, 100)}
                                showInfo={false}
                                strokeColor={{ from: '#EE0033', to: '#FF6B6B' }}
                                trailColor="#F0F0F0"
                                size="small"
                            />
                            <div className="dash-kpi-bar-info">
                                <span>{viewMode === 'YEAR' ? kpi.nguonViec.yearPct : kpi.nguonViec.achievedPct}%</span>
                                <span>{t('dashboard.target')}: {(viewMode === 'YEAR' ? kpi.nguonViec.targetYTD : kpi.nguonViec.target)?.toLocaleString()} Tr</span>
                            </div>
                        </div>
                        <div className="dash-kpi-footer" style={{ visibility: viewMode === 'ALL' ? 'hidden' : 'visible' }}>
                            <div className="dash-kpi-mom-badge" style={{ visibility: viewMode !== 'MONTH' ? 'hidden' : 'visible' }}>
                                {renderMom(kpi.nguonViec.mom)}
                                <span className="mom-label">MoM</span>
                            </div>
                            <Tooltip title={`${viewMode === 'YEAR' ? t('dashboard.year', 'Năm') : t('dashboard.month', 'Tháng')}: ${viewMode === 'YEAR' ? kpi.nguonViec.yearPct : kpi.nguonViec.achievedPct}%`}>
                                <Progress
                                    type="circle"
                                    percent={Math.min(viewMode === 'YEAR' ? kpi.nguonViec.yearPct : kpi.nguonViec.achievedPct, 100)}
                                    size={38}
                                    strokeColor="#EE0033"
                                    trailColor="#FFE8EC"
                                    format={() => <span className="dash-circle-text">{viewMode === 'YEAR' ? kpi.nguonViec.yearPct : kpi.nguonViec.achievedPct}%</span>}
                                />
                            </Tooltip>
                        </div>
                    </div>
                </Col>

                {/* KPI 2: Doanh thu */}
                <Col xs={24} sm={12} md={6} lg={6}>
                    <div className="dash-kpi-card">
                        <div className="dash-kpi-header">
                            <span className="dash-kpi-label">{t('dashboard.doanhThu')}</span>
                            <div className="dash-kpi-icon" style={{ backgroundColor: '#FFD700' }}>
                                <DollarOutlined style={{ color: '#fff' }} />
                            </div>
                        </div>
                        <div className="dash-kpi-main">
                            <span className="dash-kpi-value">{viewMode === 'ALL' ? kpi.doanhThu.valueAllTime?.toLocaleString() : viewMode === 'YEAR' ? kpi.doanhThu.valueYTD?.toLocaleString() : kpi.doanhThu.value?.toLocaleString()}</span>
                            <span className="dash-kpi-unit">Tr</span>
                        </div>
                        <div className="dash-kpi-bar-section" style={{ visibility: viewMode === 'ALL' ? 'hidden' : 'visible' }}>
                            <Progress
                                percent={Math.min(viewMode === 'YEAR' ? kpi.doanhThu.yearPct : kpi.doanhThu.achievedPct, 100)}
                                showInfo={false}
                                strokeColor={{ from: '#F59E0B', to: '#FFD700' }}
                                trailColor="#F0F0F0"
                                size="small"
                            />
                            <div className="dash-kpi-bar-info">
                                <span>{viewMode === 'YEAR' ? kpi.doanhThu.yearPct : kpi.doanhThu.achievedPct}%</span>
                                <span>{t('dashboard.target')}: {(viewMode === 'YEAR' ? kpi.doanhThu.targetYTD : kpi.doanhThu.target)?.toLocaleString()} Tr</span>
                            </div>
                        </div>
                        <div className="dash-kpi-footer" style={{ visibility: viewMode === 'ALL' ? 'hidden' : 'visible' }}>
                            <div className="dash-kpi-mom-badge" style={{ visibility: viewMode !== 'MONTH' ? 'hidden' : 'visible' }}>
                                {renderMom(kpi.doanhThu.mom)}
                                <span className="mom-label">MoM</span>
                            </div>
                            <Tooltip title={`${viewMode === 'YEAR' ? t('dashboard.year', 'Năm') : t('dashboard.month', 'Tháng')}: ${viewMode === 'YEAR' ? kpi.doanhThu.yearPct : kpi.doanhThu.achievedPct}%`}>
                                <Progress
                                    type="circle"
                                    percent={Math.min(viewMode === 'YEAR' ? kpi.doanhThu.yearPct : kpi.doanhThu.achievedPct, 100)}
                                    size={38}
                                    strokeColor="#F59E0B"
                                    trailColor="#FFF8E1"
                                    format={() => <span className="dash-circle-text">{viewMode === 'YEAR' ? kpi.doanhThu.yearPct : kpi.doanhThu.achievedPct}%</span>}
                                />
                            </Tooltip>
                        </div>
                    </div>
                </Col>

                {/* KPI 3: Thu tiền */}
                <Col xs={24} sm={12} md={6} lg={6}>
                    <div className="dash-kpi-card">
                        <div className="dash-kpi-header">
                            <span className="dash-kpi-label">{t('dashboard.thuTien')}</span>
                            <div className="dash-kpi-icon" style={{ backgroundColor: '#00C853' }}>
                                <CreditCardOutlined style={{ color: '#fff' }} />
                            </div>
                        </div>
                        <div className="dash-kpi-main">
                            <span className="dash-kpi-value">{viewMode === 'ALL' ? kpi.thuTien.valueAllTime?.toLocaleString() : viewMode === 'YEAR' ? kpi.thuTien.valueYTD?.toLocaleString() : kpi.thuTien.value?.toLocaleString()}</span>
                            <span className="dash-kpi-unit">Tr</span>
                        </div>
                        <div className="dash-kpi-bar-section" style={{ visibility: viewMode === 'ALL' ? 'hidden' : 'visible' }}>
                            <Progress
                                percent={Math.min(viewMode === 'YEAR' ? (kpi.thuTien.yearPct || 0) : (kpi.thuTien.achievedPct || 0), 100)}
                                showInfo={false}
                                strokeColor={{ from: '#00C853', to: '#69F0AE' }}
                                trailColor="#F0F0F0"
                                size="small"
                            />
                            <div className="dash-kpi-bar-info">
                                <span>{viewMode === 'YEAR' ? (kpi.thuTien.yearPct || 0) : (kpi.thuTien.achievedPct || 0)}%</span>
                                <span>{t('dashboard.target')}: {(viewMode === 'YEAR' ? kpi.thuTien.targetYTD : kpi.thuTien.target)?.toLocaleString() || '-'} Tr</span>
                            </div>
                        </div>
                        <div className="dash-kpi-footer" style={{ visibility: viewMode === 'ALL' ? 'hidden' : 'visible' }}>
                            <div className="dash-kpi-mom-badge" style={{ visibility: viewMode !== 'MONTH' ? 'hidden' : 'visible' }}>
                                {renderMom(kpi.thuTien.mom || 0)}
                                <span className="mom-label">MoM</span>
                            </div>
                            <Tooltip title={`${viewMode === 'YEAR' ? t('dashboard.year', 'Năm') : t('dashboard.month', 'Tháng')}: ${viewMode === 'YEAR' ? (kpi.thuTien.yearPct || 0) : (kpi.thuTien.achievedPct || 0)}%`}>
                                <Progress
                                    type="circle"
                                    percent={Math.min(viewMode === 'YEAR' ? (kpi.thuTien.yearPct || 0) : (kpi.thuTien.achievedPct || 0), 100)}
                                    size={38}
                                    strokeColor="#00C853"
                                    trailColor="#E8F5E9"
                                    format={() => <span className="dash-circle-text">{viewMode === 'YEAR' ? (kpi.thuTien.yearPct || 0) : (kpi.thuTien.achievedPct || 0)}%</span>}
                                />
                            </Tooltip>
                        </div>
                    </div>
                </Col>

                {/* KPI 4: Dự án */}
                <Col xs={24} sm={12} md={6} lg={6}>
                    <div className="dash-kpi-card">
                        <div className="dash-kpi-header">
                            <span className="dash-kpi-label">{t('dashboard.duAn')}</span>
                            <div className="dash-kpi-icon" style={{ backgroundColor: '#E11D2E' }}>
                                <ProjectOutlined style={{ color: '#fff' }} />
                            </div>
                        </div>
                        <div className="dash-kpi-main">
                            <span className="dash-kpi-value">{kpi.duAn.total}</span>
                            <span className="dash-kpi-unit"></span>
                        </div>
                        <div className="dash-kpi-detail">
                            <span className="dash-dot dot-warning" />{t('dashboard.inProgress')}: <b> {kpi.duAn.inProgress}</b>
                            <span className="dash-dot dot-danger" style={{ marginLeft: 12 }} />{t('dashboard.delayed')}: <b> {kpi.duAn.delayed}</b>
                        </div>
                        <div className="dash-kpi-progress-only">
                            <Progress percent={gridProgress(kpi.duAn.inProgress, kpi.duAn.total)} showInfo={false} strokeColor="#E11D2E" trailColor="#F5F5F5" size="small" />
                        </div>
                    </div>
                </Col>
            </Row>

            {/* ==================== ROW 2: Monthly Trends (12 Months) ==================== */}
            <Row gutter={[16, 16]} className="dash-row">
                {/* Left: Recent Activities (2/3 width) */}
                <Col xs={24} lg={12}>
                    <Card className="dash-chart-card" title={t('dashboard.nguonViecTrend')}>
                        <CustomColumnChart
                            data={nguonViecChartData}
                            xField="month"
                            yField="value"
                            seriesField="type"
                            colors={['#D1D5DB', '#E11D2E']} // Gray (Plan) first, Red (Actual) second
                            height={280}
                        />
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <Card className="dash-chart-card" title={t('dashboard.doanhThuTrend')}>
                        <CustomColumnChart
                            data={doanhThuChartData}
                            xField="month"
                            yField="value"
                            seriesField="type"
                            colors={['#D1D5DB', '#E11D2E']} // Gray (Plan) first, Red (Actual) second
                            height={280}
                        />
                    </Card>
                </Col>
            </Row>

            {/* ==================== ROW 3: Branch Breakdown ==================== */}
            <Row gutter={[20, 20]} className="dash-row">
                <Col span={24}>
                    <Card className="dash-chart-card" title={t('dashboard.branchRevenueCompare')}>
                        <CustomColumnChart
                            data={branchChartData}
                            xField="branch"
                            yField="value"
                            seriesField="type"
                            colors={['#D1D5DB', '#E11D2E']} // Gray (Plan) first, Red (Actual) second
                            height={300}
                            maxColumnWidth={28}
                        />
                    </Card>
                </Col>
            </Row>

            {/* ==================== ROW 4: Structure & Execution ==================== */}
            <Row gutter={[20, 20]} className="dash-row">
                {/* Donut: Business Structure */}
                <Col xs={24} lg={14}>
                    <Card className="dash-chart-card" title={t('dashboard.businessStructure')}>
                        <Row gutter={[16, 16]}>
                            <Col xs={24} md={8}>
                                {renderMiniDonut('Nguồn Việc', sourceWorkData, '#1D4ED8', '#60A5FA')}
                            </Col>
                            <Col xs={24} md={8}>
                                {renderMiniDonut('Doanh Thu', revenueData, '#C2410C', '#FB923C')}
                            </Col>
                            <Col xs={24} md={8}>
                                {renderMiniDonut('Thu Tiền', paymentData, '#15803D', '#4ADE80')}
                            </Col>
                        </Row>
                    </Card>
                </Col>

                {/* Right: Project Execution */}
                <Col xs={24} lg={10}>
                    <Card className="dash-chart-card" title={t('dashboard.projectExecution')}>
                        {/* Stacked progress bar */}
                        <div className="dash-exec-progress">
                            <div className="dash-exec-bar-wrap">
                                <Tooltip title={`${t('dashboard.done')}: ${projectExecution.done}`}>
                                    <div className="dash-exec-seg done" style={{ width: `${execDonePct}%` }} />
                                </Tooltip>
                                <Tooltip title={`${t('dashboard.inProgress')}: ${projectExecution.inProgress}`}>
                                    <div className="dash-exec-seg in-progress" style={{ width: `${execInProgressPct}%` }} />
                                </Tooltip>
                                <Tooltip title={`${t('dashboard.waiting')}: ${projectExecution.waiting}`}>
                                    <div className="dash-exec-seg waiting" style={{ width: `${execWaitingPct}%` }} />
                                </Tooltip>
                            </div>
                            <div className="dash-exec-legend">
                                <span><span className="dash-dot dot-success" />{t('dashboard.done')} ({execDonePct}%)</span>
                                <span><span className="dash-dot dot-warning" />{t('dashboard.inProgress')} ({execInProgressPct}%)</span>
                                <span><span className="dash-dot dot-muted" />{t('dashboard.waiting')} ({execWaitingPct}%)</span>
                            </div>
                        </div>

                        {/* 3 KPI blocks */}
                        <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
                            <Col xs={8}>
                                <div className="dash-exec-kpi">
                                    <CheckCircleOutlined className="dash-exec-icon" style={{ color: '#10B981' }} />
                                    <div className="dash-exec-num">{projectExecution.done}</div>
                                    <div className="dash-exec-label">{t('dashboard.done')}</div>
                                </div>
                            </Col>
                            <Col xs={8}>
                                <div className="dash-exec-kpi">
                                    <ClockCircleOutlined className="dash-exec-icon" style={{ color: '#F59E0B' }} />
                                    <div className="dash-exec-num">{projectExecution.inProgress}</div>
                                    <div className="dash-exec-label">{t('dashboard.inProgress')}</div>
                                </div>
                            </Col>
                            <Col xs={8}>
                                <div className="dash-exec-kpi">
                                    <ExclamationCircleOutlined className="dash-exec-icon" style={{ color: '#9CA3AF' }} />
                                    <div className="dash-exec-num">{projectExecution.waiting}</div>
                                    <div className="dash-exec-label">{t('dashboard.waiting')}</div>
                                </div>
                            </Col>
                        </Row>
                    </Card>
                </Col>
            </Row>

            {/* ==================== ROW 5: Activity Log & Priority ==================== */}
            <Row gutter={[20, 20]} className="dash-row">
                {/* Left: Recent Activities (2/3 width) */}
                <Col xs={24} lg={16}>
                    <Card className="dash-chart-card" title={t('dashboard.recentActivities')}>
                        <Table
                            columns={activityColumns}
                            dataSource={recentActivities}
                            rowKey="id"
                            pagination={false}
                            size="small"
                            className="dash-activity-table"
                            scroll={{ x: 600 }}
                        />
                    </Card>
                </Col>

                {/* Right: Priority Tasks (1/3 width) */}
                <Col xs={24} lg={8}>
                    <Card className="dash-chart-card dash-priority-card" title={t('dashboard.priorityTasks')}>
                        <div className="dash-priority-list">
                            {priorityTasks.map(task => (
                                <div key={task.id} className="dash-priority-item">
                                    <div className="dash-priority-top">
                                        <Tag
                                            color={statusLabelMap[task.status]?.color || '#999'}
                                            className="dash-priority-tag"
                                        >
                                            {statusLabelMap[task.status]?.label || task.status}
                                        </Tag>
                                        {task.dueDate && <span className="dash-priority-due">{task.dueDate}</span>}
                                    </div>
                                    <div className="dash-priority-name">{task.name}</div>
                                    {task.projectName && (
                                        <div className="dash-priority-project">
                                            <AimOutlined /> {task.projectName}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default Dashboard;
