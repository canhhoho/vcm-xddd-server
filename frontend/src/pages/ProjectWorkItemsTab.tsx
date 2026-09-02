/**
 * ProjectWorkItemsTab.tsx
 * Tab Tiến độ hạng mục công việc trong ProjectDetail.
 *
 * Luồng: quản lý import file Excel danh mục (nhiều sheet, mỗi sheet một tab con)
 * -> kỹ sư là thành viên dự án nhập khối lượng đã thực hiện theo ngày.
 *
 * PHÂN QUYỀN — phải khớp CHÍNH XÁC middleware server/src/middleware/projectMemberAccess.js:
 *   - canManageItems  = canEdit (projects=EDIT/admin)  -> Import, xuất Excel
 *   - canUpdateProgress = canEdit || là member         -> nhập khối lượng
 * Nới rộng hơn server là tái hiện đúng lỗi cũ của tab Nhật ký: nút hiện ra rồi
 * request bị 403 (xem comment đầu ProjectLogTab.tsx).
 */

import React, { useMemo, useState } from 'react';
import {
    Table, Button, InputNumber, DatePicker, Empty, Tag, Progress, Upload,
    Modal, message, Drawer, Popconfirm, Tabs, Alert, Spin, Tooltip, Switch, Badge,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    UploadOutlined, FileExcelOutlined, HistoryOutlined,
    DeleteOutlined, SaveOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { Project, ProjectWorkItem, WorkItemSheetInput } from '../types';
import {
    useProjectWorkItems, useWorkItemLogs, useWorkItemMutations,
} from '../hooks/useProjectWorkItems';
import { parseWorkItemsExcel, exportWorkItemsExcel } from '../utils/workItemsExcel';
import type { ParseResult } from '../utils/workItemsExcel';
import { BRAND_COLORS } from '../styles/brandIdentity';

interface Props {
    project: Project;
    canEdit: boolean;
}

const STATUS_COLOR: Record<string, string> = {
    NOT_STARTED: 'default',
    IN_PROGRESS: 'processing',
    DONE: 'success',
};

const ProjectWorkItemsTab: React.FC<Props> = ({ project, canEdit }) => {
    const { t } = useTranslation();
    const projectId = project?.id || '';

    const [logDate, setLogDate] = useState<Dayjs>(() => dayjs());
    const [activeSheet, setActiveSheet] = useState<string>('');
    const [drafts, setDrafts] = useState<Record<string, number>>({});
    const [parsed, setParsed] = useState<ParseResult | null>(null);
    const [historyItem, setHistoryItem] = useState<ProjectWorkItem | null>(null);
    const [importing, setImporting] = useState(false);

    const dateStr = logDate.format('YYYY-MM-DD');
    const { data: items = [], isLoading } = useProjectWorkItems(projectId, dateStr);
    const { importItems, updateProgress, updateDates, deleteLog } = useWorkItemMutations(projectId);
    const [onlyOverdue, setOnlyOverdue] = useState(false);

    const currentUserId = useMemo(() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}').id || ''; }
        catch { return ''; }
    }, []);

    const isMember = (project.members || []).some(m => m.userId === currentUserId);
    const canManageItems = canEdit;
    const canUpdateProgress = canEdit || isMember;

    const showError = (e: Error) => message.error(e.message || t('common.saveError'));

    // ── Gom theo sheet ────────────────────────────────────────────────────────
    const sheetNames = useMemo(() => {
        const seen: string[] = [];
        items.forEach(i => {
            if (!seen.includes(i.sheetName)) seen.push(i.sheetName);
        });
        return seen;
    }, [items]);

    const currentSheet = activeSheet && sheetNames.includes(activeSheet)
        ? activeSheet
        : sheetNames[0] || '';

    const sheetItems = useMemo(
        () => items.filter(i => i.sheetName === currentSheet),
        [items, currentSheet]
    );

    /** % của một sheet: trung bình có trọng số theo khối lượng kế hoạch của dòng lá */
    const sheetPct = useMemo(() => {
        const map: Record<string, number> = {};
        sheetNames.forEach(name => {
            const leaves = items.filter(i => i.sheetName === name && i.level === 2);
            const planned = leaves.reduce((s, i) => s + i.plannedQty, 0);
            const done = leaves.reduce((s, i) => s + Math.min(i.completedQty, i.plannedQty), 0);
            map[name] = planned > 0 ? Math.round((done / planned) * 1000) / 10 : 0;
        });
        return map;
    }, [items, sheetNames]);

    /**
     * Hạng mục trễ: có ngày mục tiêu, chưa xong, và đã quá hạn.
     * Xong muộn thì KHÔNG tính là trễ nữa — cột ngày thực tế đã nói lên điều đó.
     */
    const isOverdue = (r: ProjectWorkItem) =>
        r.level === 2 && !!r.targetDate && r.progressPct < 100
        && dayjs(r.targetDate).isBefore(dayjs(), 'day');

    const overdueDays = (r: ProjectWorkItem) =>
        r.targetDate ? dayjs().startOf('day').diff(dayjs(r.targetDate).startOf('day'), 'day') : 0;

    const overdueCount = useMemo(() => items.filter(isOverdue).length, [items]);

    // Khi lọc, bỏ luôn dòng nhóm: giữ lại tiêu đề nhóm mà không có dòng con nào
    // bên dưới chỉ làm bảng đầy dòng rỗng.
    const visibleItems = useMemo(
        () => onlyOverdue ? sheetItems.filter(isOverdue) : sheetItems,
        [sheetItems, onlyOverdue]
    );

    // ── Import ────────────────────────────────────────────────────────────────
    const handleFile = async (file: File) => {
        try {
            const result = await parseWorkItemsExcel(file);
            if (result.leafCount === 0) {
                message.error(t('projectWorkItems.importNoLeaf'));
                return;
            }
            setParsed(result);
        } catch (e) {
            message.error((e as Error).message || t('projectWorkItems.importParseError'));
        }
    };

    const runImport = (sheets: WorkItemSheetInput[]) => {
        setImporting(true);
        importItems.mutate(sheets, {
            onSuccess: (data) => {
                message.success(t('projectWorkItems.importSuccess', { count: data.count }));
                setParsed(null);
                setDrafts({});
            },
            onError: showError,
            onSettled: () => setImporting(false),
        });
    };

    const confirmImport = () => {
        if (!parsed) return;
        // Dự án đã có danh mục -> import là XOÁ SẠCH rồi nạp lại, phải cảnh báo rõ.
        if (items.length > 0) {
            Modal.confirm({
                title: t('projectWorkItems.replaceTitle'),
                content: t('projectWorkItems.replaceWarning', { count: items.length }),
                okText: t('projectWorkItems.replaceOk'),
                cancelText: t('common.cancel'),
                okButtonProps: { danger: true },
                onOk: () => runImport(parsed.sheets),
            });
        } else {
            runImport(parsed.sheets);
        }
    };

    // ── Xuất ──────────────────────────────────────────────────────────────────
    const handleExport = async () => {
        const ok = await exportWorkItemsExcel(
            items,
            `TienDo_${project.code || 'Project'}_${dayjs().format('YYYYMMDD')}.xlsx`,
            project.name || ''
        );
        message[ok ? 'success' : 'warning'](
            ok ? t('common.exportSuccess') : t('projectWorkItems.exportNoData')
        );
    };

    // ── Lưu một dòng ──────────────────────────────────────────────────────────
    const saveRow = (item: ProjectWorkItem) => {
        const value = drafts[item.id];
        if (value === undefined) return;
        updateProgress.mutate(
            { id: item.id, logDate: dateStr, completedQty: value },
            {
                onSuccess: () => {
                    message.success(t('projectWorkItems.saveSuccess'));
                    setDrafts(prev => {
                        const next = { ...prev };
                        delete next[item.id];
                        return next;
                    });
                },
                onError: showError,
            }
        );
    };

    const saveDate = (item: ProjectWorkItem, field: 'targetDate' | 'actualDate', value: Dayjs | null) => {
        updateDates.mutate(
            { id: item.id, [field]: value ? value.format('YYYY-MM-DD') : null },
            {
                onSuccess: () => message.success(t('projectWorkItems.dateSaveSuccess')),
                onError: showError,
            }
        );
    };

    // ── Cột ───────────────────────────────────────────────────────────────────
    const columns: ColumnsType<ProjectWorkItem> = [
        {
            title: t('projectWorkItems.colNo'), dataIndex: 'code', key: 'code',
            width: 70, align: 'center',
        },
        {
            title: t('projectWorkItems.colName'), dataIndex: 'nameVi', key: 'name', width: 320,
            render: (_: unknown, r: ProjectWorkItem) => (
                <div style={{ paddingLeft: r.level * 14 }}>
                    <div style={{ fontWeight: r.level < 2 ? 700 : 400 }}>{r.nameVi}</div>
                    {r.nameEn && (
                        <div style={{ fontSize: 12, color: BRAND_COLORS.success }}>{r.nameEn}</div>
                    )}
                </div>
            ),
        },
        {
            title: t('projectWorkItems.colUnit'), key: 'unit', width: 90, align: 'center',
            render: (_: unknown, r: ProjectWorkItem) => r.level < 2 ? null : (
                <div>
                    <div>{r.unitVi}</div>
                    {r.unitEn && <div style={{ fontSize: 12, color: BRAND_COLORS.success }}>{r.unitEn}</div>}
                </div>
            ),
        },
        {
            title: t('projectWorkItems.colPlanned'), dataIndex: 'plannedQty', key: 'planned',
            width: 110, align: 'right',
            render: (v: number, r: ProjectWorkItem) => r.level < 2 ? null : v.toLocaleString('vi-VN'),
        },
        {
            title: t('projectWorkItems.colCompleted'), key: 'completed', width: 150, align: 'right',
            render: (_: unknown, r: ProjectWorkItem) => {
                if (r.level < 2) return null;
                if (!canUpdateProgress) return r.completedQty.toLocaleString('vi-VN');
                const draft = drafts[r.id];
                const dirty = draft !== undefined && draft !== (r.dayQty ?? r.completedQty);
                return (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <InputNumber
                            size="small"
                            min={0}
                            value={draft !== undefined ? draft : (r.dayQty ?? r.completedQty)}
                            onChange={val => setDrafts(prev => ({ ...prev, [r.id]: Number(val) || 0 }))}
                            style={{ width: 96 }}
                        />
                        {dirty && (
                            <Button
                                size="small" type="primary" icon={<SaveOutlined />}
                                loading={updateProgress.isPending}
                                onClick={() => saveRow(r)}
                            />
                        )}
                    </div>
                );
            },
        },
        {
            title: t('projectWorkItems.colProgress'), key: 'progress', width: 130,
            render: (_: unknown, r: ProjectWorkItem) => r.level < 2 ? null : (
                <Progress
                    percent={r.progressPct}
                    size="small"
                    status={r.progressPct >= 100 ? 'success' : 'active'}
                />
            ),
        },
        {
            title: t('projectWorkItems.colTargetDate'), key: 'targetDate', width: 150, align: 'center',
            render: (_: unknown, r: ProjectWorkItem) => {
                if (r.level < 2) return null;
                const late = isOverdue(r);
                return (
                    <div>
                        {canManageItems ? (
                            <DatePicker
                                size="small"
                                value={r.targetDate ? dayjs(r.targetDate) : null}
                                onChange={d => saveDate(r, 'targetDate', d)}
                                format="DD/MM/YYYY"
                                placeholder="--"
                                style={{ width: 122 }}
                                status={late ? 'error' : undefined}
                            />
                        ) : (
                            <span>{r.targetDate ? dayjs(r.targetDate).format('DD/MM/YYYY') : '--'}</span>
                        )}
                        {late && (
                            <div style={{ marginTop: 2 }}>
                                <Tag color="error" style={{ margin: 0, fontSize: 11 }}>
                                    {t('projectWorkItems.overdue', { count: overdueDays(r) })}
                                </Tag>
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: t('projectWorkItems.colActualDate'), key: 'actualDate', width: 140, align: 'center',
            render: (_: unknown, r: ProjectWorkItem) => {
                if (r.level < 2) return null;
                if (!canUpdateProgress) {
                    return <span>{r.actualDate ? dayjs(r.actualDate).format('DD/MM/YYYY') : '--'}</span>;
                }
                return (
                    <DatePicker
                        size="small"
                        value={r.actualDate ? dayjs(r.actualDate) : null}
                        onChange={d => saveDate(r, 'actualDate', d)}
                        format="DD/MM/YYYY"
                        placeholder="--"
                        style={{ width: 122 }}
                    />
                );
            },
        },
        {
            title: t('projectWorkItems.colStatus'), dataIndex: 'status', key: 'status',
            width: 130, align: 'center',
            render: (v: string, r: ProjectWorkItem) => r.level < 2 ? null : (
                <Tag color={STATUS_COLOR[v]}>{t(`projectWorkItems.status.${v}`)}</Tag>
            ),
        },
        {
            title: t('projectWorkItems.colNote'), dataIndex: 'note', key: 'note', width: 160,
        },
        {
            title: '', key: 'action', width: 50, align: 'center', fixed: 'right',
            render: (_: unknown, r: ProjectWorkItem) => r.level < 2 ? null : (
                <Tooltip title={t('projectWorkItems.history')}>
                    <Button
                        type="text" size="small" icon={<HistoryOutlined />}
                        onClick={() => setHistoryItem(r)}
                    />
                </Tooltip>
            ),
        },
    ];

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div>
            {/* Toolbar */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: 8, padding: '12px 0',
            }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {canUpdateProgress && (
                        <>
                            <span style={{ fontSize: 13, color: BRAND_COLORS.textSecondary }}>
                                {t('projectWorkItems.logDate')}
                            </span>
                            <DatePicker
                                size="small"
                                value={logDate}
                                onChange={d => { if (d) { setLogDate(d); setDrafts({}); } }}
                                allowClear={false}
                                format="DD/MM/YYYY"
                                disabledDate={d => d.isAfter(dayjs(), 'day')}
                            />
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {items.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
                            <Switch size="small" checked={onlyOverdue} onChange={setOnlyOverdue} />
                            <span style={{ fontSize: 13, color: BRAND_COLORS.textSecondary }}>
                                {t('projectWorkItems.filterOverdue')}
                            </span>
                            <Badge
                                count={overdueCount}
                                showZero
                                style={{ backgroundColor: overdueCount > 0 ? BRAND_COLORS.error : BRAND_COLORS.textMuted }}
                            />
                        </span>
                    )}
                    {items.length > 0 && (
                        <Button size="small" icon={<FileExcelOutlined />} onClick={handleExport}>
                            {t('projectWorkItems.exportExcel')}
                        </Button>
                    )}
                    {canManageItems && (
                        <Upload
                            accept=".xlsx"
                            showUploadList={false}
                            beforeUpload={file => { handleFile(file); return false; }}
                        >
                            <Button size="small" type="primary" icon={<UploadOutlined />}>
                                {t('projectWorkItems.import')}
                            </Button>
                        </Upload>
                    )}
                </div>
            </div>

            {!canUpdateProgress && items.length > 0 && (
                <Alert
                    type="info" showIcon style={{ marginBottom: 12 }}
                    message={t('projectWorkItems.readOnlyHint')}
                />
            )}

            {/* Bảng */}
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
            ) : items.length === 0 ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={canManageItems
                        ? t('projectWorkItems.emptyHint')
                        : t('projectWorkItems.emptyReadOnly')}
                    style={{ padding: '32px 0' }}
                />
            ) : (
                <Tabs
                    activeKey={currentSheet}
                    onChange={key => { setActiveSheet(key); setDrafts({}); }}
                    items={sheetNames.map(name => ({
                        key: name,
                        label: `${name} — ${sheetPct[name]}%`,
                        children: onlyOverdue && visibleItems.length === 0 ? (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={t('projectWorkItems.noOverdue')}
                                style={{ padding: '32px 0' }}
                            />
                        ) : (
                            <Table
                                dataSource={visibleItems}
                                columns={columns}
                                rowKey="id"
                                size="small"
                                pagination={false}
                                scroll={{ x: 1520 }}
                                rowClassName={r =>
                                    `vcm-wi-level-${r.level}${isOverdue(r) ? ' vcm-wi-overdue' : ''}`}
                            />
                        ),
                    }))}
                />
            )}

            {/* Preview trước khi import */}
            <Modal
                open={!!parsed}
                title={t('projectWorkItems.previewTitle')}
                onCancel={() => setParsed(null)}
                onOk={confirmImport}
                okText={t('projectWorkItems.importOk')}
                cancelText={t('common.cancel')}
                confirmLoading={importing || importItems.isPending}
                width="min(760px, 94vw)"
                destroyOnHidden
            >
                {parsed && (
                    <>
                        <p>
                            {t('projectWorkItems.previewSummary', {
                                sheets: parsed.sheets.length,
                                total: parsed.totalItems,
                                leaf: parsed.leafCount,
                            })}
                        </p>
                        <ul style={{ maxHeight: 180, overflow: 'auto', paddingLeft: 20 }}>
                            {parsed.sheets.map(s => (
                                <li key={s.sheetName}>
                                    <strong>{s.sheetName}</strong> — {s.items.length} {t('projectWorkItems.rows')}
                                </li>
                            ))}
                        </ul>
                        {parsed.warnings.length > 0 && (
                            <Alert
                                type="warning" showIcon
                                message={t('projectWorkItems.warningsTitle', { count: parsed.warnings.length })}
                                description={
                                    <div style={{ maxHeight: 140, overflow: 'auto', fontSize: 12 }}>
                                        {parsed.warnings.slice(0, 30).map((w, i) => (
                                            <div key={i}>[{w.sheetName}] {t('projectWorkItems.row')} {w.row}: {w.message}</div>
                                        ))}
                                    </div>
                                }
                            />
                        )}
                    </>
                )}
            </Modal>

            {/* Lịch sử cập nhật */}
            <WorkItemHistoryDrawer
                item={historyItem}
                onClose={() => setHistoryItem(null)}
                canDelete={canUpdateProgress}
                onDelete={(logId) => {
                    if (!historyItem) return;
                    deleteLog.mutate({ id: historyItem.id, logId }, {
                        onSuccess: () => message.success(t('common.deleteSuccess')),
                        onError: showError,
                    });
                }}
                deleting={deleteLog.isPending}
            />
        </div>
    );
};

// ── Drawer lịch sử ───────────────────────────────────────────────────────────

interface HistoryProps {
    item: ProjectWorkItem | null;
    onClose: () => void;
    canDelete: boolean;
    onDelete: (logId: string) => void;
    deleting: boolean;
}

const WorkItemHistoryDrawer: React.FC<HistoryProps> = ({ item, onClose, canDelete, onDelete, deleting }) => {
    const { t } = useTranslation();
    const { data: logs = [], isLoading } = useWorkItemLogs(item?.id || '', !!item);

    return (
        <Drawer
            open={!!item}
            onClose={onClose}
            title={item?.nameVi}
            width="min(560px, 94vw)"
        >
            {isLoading ? (
                <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
            ) : logs.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('projectWorkItems.noLogs')} />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {logs.map(log => (
                        <div key={log.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 12px', borderRadius: 6,
                            background: BRAND_COLORS.backgroundLight,
                        }}>
                            <div>
                                <div style={{ fontWeight: 600 }}>
                                    {dayjs(log.logDate).format('DD/MM/YYYY')} — {log.completedQty.toLocaleString('vi-VN')} {item?.unitVi}
                                </div>
                                <div style={{ fontSize: 12, color: BRAND_COLORS.textMuted }}>
                                    {log.createdByName || log.createdBy || 'N/A'}
                                    {log.note ? ` · ${log.note}` : ''}
                                </div>
                            </div>
                            {canDelete && (
                                <Popconfirm
                                    title={t('projectWorkItems.deleteLogConfirm')}
                                    onConfirm={() => onDelete(log.id)}
                                    okText={t('common.delete')}
                                    cancelText={t('common.cancel')}
                                    okButtonProps={{ danger: true, loading: deleting }}
                                >
                                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Drawer>
    );
};

export default ProjectWorkItemsTab;
