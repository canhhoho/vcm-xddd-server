/**
 * ProjectWorkItemsTab.tsx
 * Tab Tiến độ hạng mục công việc trong ProjectDetail.
 *
 * Luồng: quản lý import file Excel danh mục (nhiều sheet, mỗi sheet một tab con)
 * -> kỹ sư là thành viên dự án nhập khối lượng đã thực hiện theo ngày.
 *
 * PHÂN QUYỀN — phải khớp CHÍNH XÁC middleware server/src/middleware/projectMemberAccess.js:
 *   - canManageItems  = canEdit (projects=EDIT/admin)  -> Import, sửa ngày mục tiêu
 *   - canUpdateProgress = canEdit || là member         -> nhập khối lượng, ghi chú ngày
 * Nới rộng hơn server là tái hiện đúng lỗi cũ của tab Nhật ký: nút hiện ra rồi
 * request bị 403 (xem comment đầu ProjectLogTab.tsx).
 *
 * Xuất Excel KHÔNG gác quyền: là thao tác chỉ đọc, backend cũng không chặn, và
 * người giám sát chỉ có quyền xem vẫn cần tự lấy được báo cáo.
 */

import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
    Table, Button, InputNumber, DatePicker, Empty, Tag, Upload,
    Modal, message, Drawer, Popconfirm, Popover, Tabs, Alert, Spin,
    Row, Col, Input, Segmented, Typography, Dropdown,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
    UploadOutlined, FileExcelOutlined, HistoryOutlined,
    DeleteOutlined, SaveOutlined, SearchOutlined, DownOutlined, EditOutlined,
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
import { FilterChips } from '../components/FilterChips';
import { BRAND_COLORS } from '../styles/brandIdentity';

interface Props {
    project: Project;
    canEdit: boolean;
}

type StatusFilter = 'ALL' | 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'OVERDUE';
type Scope = 'SHEET' | 'PROJECT';

const STATUS_COLOR: Record<string, string> = {
    NOT_STARTED: 'default',
    IN_PROGRESS: 'processing',
    DONE: 'success',
};

/**
 * Map cứng bộ lọc -> key i18n. KHÔNG dựng key bằng nối chuỗi: đúng cách đó đã
 * từng đẩy `statusInprogress` (không tồn tại) ra file Excel ở phần Kế hoạch,
 * xem comment đầu components/plan/planConstants.ts.
 */
const STATUS_FILTER_KEY: Record<Exclude<StatusFilter, 'ALL'>, string> = {
    PENDING: 'projectWorkItems.filterPending',
    IN_PROGRESS: 'projectWorkItems.filterInProgress',
    DONE: 'projectWorkItems.filterDone',
    OVERDUE: 'projectWorkItems.filterOverdue',
};

/** Chỉ dòng lá mới là hạng mục thật — dòng nhóm là tiêu đề, không đếm */
const leafCount = (rows: ProjectWorkItem[]) =>
    rows.reduce((n, r) => n + (r.level === 2 ? 1 : 0), 0);

/** Nhãn ngắn của một dòng nhóm, dùng cho đường dẫn "E › E.2" */
const groupLabel = (r: ProjectWorkItem) => (r.code ? `${r.code}. ${r.nameVi}` : r.nameVi);

/** Bỏ dấu + ký tự Windows cấm, để ghép vào tên file tải về */
const fileSlug = (s: string) =>
    s.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || 'Sheet';

// ── Ô khối lượng ─────────────────────────────────────────────────────────────

/**
 * Tự giữ draft của riêng mình.
 *
 * Trước đây draft nằm ở state cha và `columns` đóng bao quanh nó, nên mỗi ký tự
 * gõ vào một ô là dựng lại toàn bộ mảng cột -> antd render lại cả bảng
 * (~13ms/dòng × 20 dòng). Giữ state tại đây thì gõ chỉ render lại đúng một ô.
 *
 * Cha reset bằng `key={id:dateStr}`: đổi ngày ghi là component remount với giá
 * trị mới của server, không cần dọn draft thủ công ở ba chỗ như trước.
 */
interface QtyCellProps {
    item: ProjectWorkItem;
    onSave: (item: ProjectWorkItem, qty: number) => Promise<boolean>;
}

const QtyCell: React.FC<QtyCellProps> = ({ item, onSave }) => {
    const serverValue = item.dayQty ?? item.completedQty;
    const [draft, setDraft] = useState<number | undefined>(undefined);
    const [saving, setSaving] = useState(false);

    const dirty = draft !== undefined && draft !== serverValue;

    const save = async () => {
        if (draft === undefined) return;
        setSaving(true);
        const ok = await onSave(item, draft);
        setSaving(false);
        if (ok) setDraft(undefined);
    };

    return (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <InputNumber
                size="small"
                min={0}
                // controls={false}: bỏ hai nút tăng/giảm. Không ai bấm từng
                // đơn vị cho khối lượng, mà 50 dòng là 100 nút thừa.
                controls={false}
                value={draft !== undefined ? draft : serverValue}
                onChange={val => setDraft(Number(val) || 0)}
                style={{ width: 96 }}
            />
            {dirty && (
                <Button
                    size="small" type="primary" icon={<SaveOutlined />}
                    loading={saving}
                    onClick={save}
                />
            )}
        </div>
    );
};

// ── Ô ghi chú ────────────────────────────────────────────────────────────────

/**
 * Hai tầng ghi chú khác nhau, phải phân biệt rõ trên giao diện:
 *   - `note`    — từ file Excel, gắn với hạng mục, chưa có endpoint sửa.
 *   - `dayNote` — của đúng ngày đang chọn, sửa được qua PUT /:id/progress.
 *
 * Cũng tự giữ state như QtyCell, và vì lý do y hệt: đưa draft ghi chú lên cha
 * là mỗi ký tự lại dựng lại cả bảng.
 *
 * Dùng Popover + TextArea chứ không Typography editable: ghi chú thực tế là câu
 * ("chờ vật tư, mưa 2 ngày") nên cần nhiều dòng, mà ô sửa một dòng nở ra sẽ đội
 * chiều cao dòng và làm reflow cả bảng.
 */
interface DayNoteCellProps {
    item: ProjectWorkItem;
    dateLabel: string;
    editable: boolean;
    onSave: (item: ProjectWorkItem, note: string) => Promise<boolean>;
}

const DayNoteCell: React.FC<DayNoteCellProps> = ({ item, dateLabel, editable, onSave }) => {
    const { t } = useTranslation();
    const dayNote = item.dayNote || '';
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(dayNote);
    const [saving, setSaving] = useState(false);

    const save = async () => {
        setSaving(true);
        const ok = await onSave(item, text.trim());
        setSaving(false);
        if (ok) setOpen(false);
    };

    const editor = (
        <div style={{ width: 260 }}>
            <Input.TextArea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={t('projectWorkItems.dayNotePlaceholder')}
                autoSize={{ minRows: 2, maxRows: 6 }}
                maxLength={500}
                showCount
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <Button size="small" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                <Button size="small" type="primary" loading={saving} onClick={save}>
                    {t('common.save')}
                </Button>
            </div>
        </div>
    );

    return (
        <div className="vcm-wi-note">
            {item.note && (
                <Typography.Text
                    type="secondary"
                    className="vcm-wi-note-src"
                    ellipsis={{ tooltip: `${t('projectWorkItems.noteFromFile')}: ${item.note}` }}
                >
                    {item.note}
                </Typography.Text>
            )}
            {editable ? (
                <Popover
                    open={open}
                    // Chỉ cho đóng từ ngoài; mở thì phải qua onClick để nạp lại
                    // text từ server, tránh giữ bản nháp cũ của lần mở trước.
                    onOpenChange={v => { if (!v) setOpen(false); }}
                    trigger="click"
                    placement="topRight"
                    title={t('projectWorkItems.dayNoteTitle', { date: dateLabel })}
                    content={editor}
                    destroyOnHidden
                >
                    {dayNote ? (
                        <Typography.Text
                            className="vcm-wi-note-day"
                            ellipsis={{ tooltip: dayNote }}
                            onClick={() => { setText(dayNote); setOpen(true); }}
                        >
                            {dayNote}
                        </Typography.Text>
                    ) : (
                        <span
                            className="vcm-wi-note-add"
                            onClick={() => { setText(''); setOpen(true); }}
                        >
                            <EditOutlined /> {t('projectWorkItems.dayNoteAdd')}
                        </span>
                    )}
                </Popover>
            ) : dayNote ? (
                <Typography.Text className="vcm-wi-note-day" ellipsis={{ tooltip: dayNote }}>
                    {dayNote}
                </Typography.Text>
            ) : null}
        </div>
    );
};

// ── Tab ──────────────────────────────────────────────────────────────────────

const ProjectWorkItemsTab: React.FC<Props> = ({ project, canEdit }) => {
    const { t } = useTranslation();
    const projectId = project?.id || '';

    const [logDate, setLogDate] = useState<Dayjs>(() => dayjs());
    const [activeSheet, setActiveSheet] = useState<string>('');
    const [parsed, setParsed] = useState<ParseResult | null>(null);
    const [historyItem, setHistoryItem] = useState<ProjectWorkItem | null>(null);
    const [importing, setImporting] = useState(false);

    const dateStr = logDate.format('YYYY-MM-DD');
    const dateLabel = logDate.format('DD/MM/YYYY');
    const { data: items = [], isLoading } = useProjectWorkItems(projectId, dateStr);
    const { importItems, updateProgress, updateDates, deleteLog } = useWorkItemMutations(projectId);

    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [search, setSearch] = useState('');
    const [scope, setScope] = useState<Scope>('SHEET');
    const [sortActive, setSortActive] = useState(false);

    // Hoãn việc lọc lại: ô nhập vẫn bám `search` nên gõ mượt, còn bảng dựng lại
    // ở mức ưu tiên thấp và bị huỷ khi có phím mới. Đúng việc debounce cố làm,
    // mà không phải chọn sẵn một con số ms.
    const deferredSearch = useDeferredValue(search);

    const currentUserId = useMemo(() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}').id || ''; }
        catch { return ''; }
    }, []);

    const isMember = (project.members || []).some(m => m.userId === currentUserId);
    const canManageItems = canEdit;
    const canUpdateProgress = canEdit || isMember;

    const showError = useCallback((e: Error) => {
        message.error(e.message || t('common.saveError'));
    }, [t]);

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

    /**
     * Phạm vi làm việc. Thẻ thống kê, bộ lọc và bảng đều đọc chung biến này —
     * trước đây thẻ đếm toàn dự án còn bộ lọc chỉ áp trong sheet đang xem, nên
     * thẻ báo trễ hạn 12 mà bảng ra 3 dòng, và cả hai con số đều đúng.
     */
    const scopeItems = scope === 'PROJECT' ? items : sheetItems;

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
    // useCallback để tham chiếu ổn định — columns memo hoá theo các hàm này, hàm
    // đổi mỗi render là memo vô hiệu.
    const isOverdue = useCallback((r: ProjectWorkItem) =>
        r.level === 2 && !!r.targetDate && r.progressPct < 100
        && dayjs(r.targetDate).isBefore(dayjs(), 'day'), []);

    const overdueDays = useCallback((r: ProjectWorkItem) =>
        r.targetDate ? dayjs().startOf('day').diff(dayjs(r.targetDate).startOf('day'), 'day') : 0, []);

    /** Thống kê trong phạm vi đang chọn, chỉ tính dòng lá vì dòng nhóm là tiêu đề */
    const stats = useMemo(() => {
        const leaves = scopeItems.filter(i => i.level === 2);
        const done = leaves.filter(i => i.progressPct >= 100).length;
        const overdue = leaves.filter(isOverdue).length;
        return { total: leaves.length, done, pending: leaves.length - done, overdue };
    }, [scopeItems, isOverdue]);

    /**
     * Một lượt quét O(n) sinh cả hai thứ cần cho ngữ cảnh cây:
     *   - `pathById`    — đường dẫn nhóm để in inline trên màn hình
     *   - `parentsById` — id các dòng cha, để chèn lại dòng nhóm vào file Excel
     *
     * Suy ra cha theo vị trí được, vì server đã ORDER BY sheet_order, sort_order:
     * dòng cấp thấp hơn đứng ngay trước chính là cha. Không cần cột parent_id.
     * Memo chỉ phụ thuộc `items` nên không bị dựng lại lúc gõ tìm kiếm.
     */
    const { pathById, parentsById } = useMemo(() => {
        const paths = new Map<string, string>();
        const parents = new Map<string, string[]>();
        let sheet = '';
        let l0: ProjectWorkItem | null = null;
        let l1: ProjectWorkItem | null = null;

        items.forEach(it => {
            if (it.sheetName !== sheet) { sheet = it.sheetName; l0 = null; l1 = null; }
            if (it.level === 0) { l0 = it; l1 = null; return; }
            if (it.level === 1) {
                if (l0) {
                    parents.set(it.id, [l0.id]);
                    paths.set(it.id, groupLabel(l0));
                }
                l1 = it;
                return;
            }
            const chain = [l0, l1].filter((p): p is ProjectWorkItem => p !== null);
            if (chain.length > 0) {
                parents.set(it.id, chain.map(p => p.id));
                paths.set(it.id, chain.map(groupLabel).join(' › '));
            }
        });
        return { pathById: paths, parentsById: parents };
    }, [items]);

    /**
     * Chỉ mục tìm kiếm dựng sẵn theo phạm vi, KHÔNG dựng lại mỗi ký tự.
     * Khớp tên, ghi chú gốc, ghi chú theo ngày — trước đây chỉ khớp tên nên gõ
     * một cụm chỉ có trong ghi chú là trượt.
     *
     * Gộp cả ĐƯỜNG DẪN NHÓM vào chỉ mục, không chỉ `code` của chính dòng: trong
     * file import, dòng lá là dòng KHÔNG có STT (xem deriveLevel), nên STT chỉ
     * tồn tại ở dòng nhóm — mà dòng nhóm lại bị bộ lọc bỏ đi. Có đường dẫn thì
     * gõ "A.2" ra đúng các hạng mục thuộc nhóm A.2.
     */
    const searchIndex = useMemo(() => {
        const m = new Map<string, string>();
        scopeItems.forEach(r => m.set(
            r.id,
            `${r.code} ${pathById.get(r.id) || ''} ${r.nameVi} ${r.nameEn} ${r.note} ${r.dayNote ?? ''}`
                .toLowerCase(),
        ));
        return m;
    }, [scopeItems, pathById]);

    // isFiltering phải tính từ giá trị ĐÃ HOÃN, không phải `search` thô — nếu
    // không khối Empty bên dưới sẽ nhấp nháy trong lúc gõ.
    const isFiltering = statusFilter !== 'ALL' || deferredSearch.trim() !== '';

    /**
     * Bỏ dòng nhóm khi đang lọc HOẶC đang sắp xếp.
     * Sắp xếp mà vẫn trộn dòng nhóm vào giữa sẽ phá thứ tự cây — thứ vốn phản
     * ánh đúng file Excel gốc; lúc đó danh sách phẳng mới là cái người dùng muốn.
     */
    const flatten = isFiltering || sortActive;

    const visibleItems = useMemo(() => {
        if (!flatten) return scopeItems;
        const q = deferredSearch.trim().toLowerCase();
        return scopeItems.filter(r => {
            if (r.level !== 2) return false;
            if (q && !(searchIndex.get(r.id) || '').includes(q)) return false;
            if (statusFilter === 'DONE') return r.progressPct >= 100;
            if (statusFilter === 'PENDING') return r.progressPct < 100;
            if (statusFilter === 'IN_PROGRESS') return r.progressPct > 0 && r.progressPct < 100;
            if (statusFilter === 'OVERDUE') return isOverdue(r);
            return true;
        });
    }, [scopeItems, statusFilter, deferredSearch, flatten, searchIndex, isOverdue]);

    /** Số kết quả của bộ lọc, để hiện cạnh ô tìm kiếm */
    const filteredLeafCount = useMemo(() => leafCount(visibleItems), [visibleItems]);

    const clearFilters = useCallback(() => {
        setStatusFilter('ALL');
        setSearch('');
    }, []);

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

    /** Dòng lá đã lọc + dòng nhóm cha của chúng, giữ nguyên thứ tự gốc */
    const withAncestors = useCallback((ordered: ProjectWorkItem[], leaves: ProjectWorkItem[]) => {
        const keep = new Set<string>();
        leaves.forEach(r => {
            keep.add(r.id);
            (parentsById.get(r.id) || []).forEach(p => keep.add(p));
        });
        return ordered.filter(r => keep.has(r.id));
    }, [parentsById]);

    const scopeText = scope === 'PROJECT'
        ? t('projectWorkItems.scopeProject')
        : `${t('projectWorkItems.scopeSheet')} — ${currentSheet}`;

    const buildScopeNote = useCallback((scopeLabel: string, withFilters: boolean) => {
        const parts = [t('projectWorkItems.exportScopeNote', { scope: scopeLabel })];
        if (withFilters) {
            if (statusFilter !== 'ALL') {
                parts.push(t('projectWorkItems.exportScopeFilter', {
                    status: t(STATUS_FILTER_KEY[statusFilter]),
                }));
            }
            const q = deferredSearch.trim();
            if (q) parts.push(t('projectWorkItems.exportScopeSearch', { query: q }));
        }
        return parts.join(' · ');
    }, [t, statusFilter, deferredSearch]);

    const runExport = useCallback(async (
        rows: ProjectWorkItem[], suffix: string, scopeNote?: string,
    ) => {
        const fileName = `TienDo_${project.code || 'Project'}_${suffix}_${dayjs().format('YYYYMMDD')}.xlsx`;
        const ok = await exportWorkItemsExcel(rows, fileName, project.name || '', scopeNote);
        message[ok ? 'success' : 'warning'](
            ok ? t('common.exportSuccess') : t('projectWorkItems.exportNoData')
        );
    }, [project.code, project.name, t]);

    const handleExport: MenuProps['onClick'] = ({ key }) => {
        if (key === 'visible') {
            const base = scope === 'PROJECT' ? items : sheetItems;
            const scopePart = scope === 'PROJECT' ? 'ToanBo' : fileSlug(currentSheet);
            void runExport(
                withAncestors(base, visibleItems),
                `${scopePart}_DaLoc`,
                buildScopeNote(scopeText, true),
            );
            return;
        }
        if (key === 'sheet') {
            void runExport(
                sheetItems,
                fileSlug(currentSheet),
                buildScopeNote(`${t('projectWorkItems.scopeSheet')} — ${currentSheet}`, false),
            );
            return;
        }
        // Toàn bộ dự án: KHÔNG kèm dòng chú thích, để bố cục khớp đúng file mẫu.
        void runExport(items, 'ToanBo');
    };

    const exportMenuItems = useMemo(() => {
        const list: NonNullable<MenuProps['items']> = [];
        if (flatten) {
            list.push({
                key: 'visible',
                label: t('projectWorkItems.exportVisible', { count: filteredLeafCount }),
            });
        }
        if (sheetNames.length > 1) {
            list.push({
                key: 'sheet',
                label: t('projectWorkItems.exportSheet', {
                    sheet: currentSheet, count: leafCount(sheetItems),
                }),
            });
        }
        list.push({
            key: 'all',
            label: t('projectWorkItems.exportAll', { count: leafCount(items) }),
        });
        return list;
    }, [flatten, filteredLeafCount, sheetNames.length, currentSheet, sheetItems, items, t]);

    // ── Lưu ───────────────────────────────────────────────────────────────────

    // Giữ mutation trong ref: object của React Query đổi tham chiếu mỗi render,
    // đưa thẳng vào deps là `columns` memo hoá vô nghĩa.
    const mutationsRef = useRef({ updateProgress, updateDates });
    // Cập nhật trong effect chứ không phải giữa render — ref khởi tạo đã đúng
    // ngay từ lần render đầu nên không có khoảng trống nào.
    useEffect(() => {
        mutationsRef.current = { updateProgress, updateDates };
    });

    /**
     * MỘT đường lưu duy nhất cho cả khối lượng lẫn ghi chú.
     *
     * Bắt buộc gửi ĐỦ cả hai trường: server upsert theo (item_id, log_date) với
     * `SET note = EXCLUDED.note`, mà textOrEmpty(undefined) trả ''. Gửi thiếu
     * `note` là xoá trắng ghi chú của ngày đó — đúng lỗi cũ của saveRow.
     *
     * Và không bao giờ để khối lượng rơi về 0: syncCompletedQty lấy log có
     * log_date MỚI NHẤT, nên ghi log hôm nay với qty 0 sẽ kéo tụt khối lượng
     * luỹ kế của cả hạng mục về 0.
     */
    const saveProgress = useCallback(async (
        item: ProjectWorkItem, patch: { qty?: number; note?: string },
    ): Promise<boolean> => {
        const completedQty = patch.qty ?? item.dayQty ?? item.completedQty;
        const note = patch.note ?? item.dayNote ?? '';
        try {
            await mutationsRef.current.updateProgress.mutateAsync({
                id: item.id, logDate: dateStr, completedQty, note,
            });
            return true;
        } catch (e) {
            showError(e as Error);
            return false;
        }
    }, [dateStr, showError]);

    const saveQty = useCallback(async (item: ProjectWorkItem, qty: number) => {
        const ok = await saveProgress(item, { qty });
        if (ok) message.success(t('projectWorkItems.saveSuccess'));
        return ok;
    }, [saveProgress, t]);

    const saveNote = useCallback(async (item: ProjectWorkItem, note: string) => {
        const ok = await saveProgress(item, { note });
        if (ok) message.success(t('projectWorkItems.noteSaveSuccess'));
        return ok;
    }, [saveProgress, t]);

    const saveDate = useCallback((
        item: ProjectWorkItem, field: 'targetDate' | 'actualDate', value: Dayjs | null,
    ) => {
        mutationsRef.current.updateDates.mutate(
            { id: item.id, [field]: value ? value.format('YYYY-MM-DD') : null },
            {
                onSuccess: () => message.success(t('projectWorkItems.dateSaveSuccess')),
                onError: showError,
            }
        );
    }, [t, showError]);

    // ── Cột ───────────────────────────────────────────────────────────────────
    // Nhờ QtyCell/DayNoteCell tự giữ draft, mảng deps dưới đây chỉ còn giá trị
    // ổn định — gõ một ký tự không còn dựng lại cả bảng như trước.
    const columns: ColumnsType<ProjectWorkItem> = useMemo(() => {
        const cols: ColumnsType<ProjectWorkItem> = [];

        if (scope === 'PROJECT') {
            cols.push({
                title: t('projectWorkItems.colSheet'), dataIndex: 'sheetName', key: 'sheetName',
                width: 140, ellipsis: true,
            });
        }

        cols.push(
            {
                title: t('projectWorkItems.colNo'), dataIndex: 'code', key: 'code',
                width: 70, align: 'center',
            },
            {
                title: t('projectWorkItems.colName'), dataIndex: 'nameVi', key: 'name', width: 320,
                render: (_: unknown, r: ProjectWorkItem) => (
                    // Thụt lề chỉ có nghĩa khi còn cây; ở danh sách phẳng thì
                    // thay bằng đường dẫn nhóm để không mất ngữ cảnh.
                    <div style={{ paddingLeft: flatten ? 0 : r.level * 14 }}>
                        {flatten && pathById.get(r.id) && (
                            <div className="vcm-wi-path">{pathById.get(r.id)}</div>
                        )}
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
                    return <QtyCell key={`${r.id}:${dateStr}`} item={r} onSave={saveQty} />;
                },
            },
            {
                title: t('projectWorkItems.colProgress'), key: 'progress', width: 130,
                sorter: (a: ProjectWorkItem, b: ProjectWorkItem) => a.progressPct - b.progressPct,
                render: (_: unknown, r: ProjectWorkItem) => r.level < 2 ? null : (
                    // Thanh CSS thuần thay cho antd Progress: cùng hình thức nhưng chỉ 2
                    // thẻ div, nhân 20 dòng mỗi lần đổi sheet thì khác biệt thấy được.
                    <div className="vcm-wi-bar">
                        <div className="vcm-wi-bar-track">
                            <div
                                className="vcm-wi-bar-fill"
                                style={{
                                    width: `${Math.min(100, r.progressPct)}%`,
                                    background: r.progressPct >= 100 ? BRAND_COLORS.success : BRAND_COLORS.info,
                                }}
                            />
                        </div>
                        <span className="vcm-wi-bar-text">{r.progressPct}%</span>
                    </div>
                ),
            },
            {
                title: t('projectWorkItems.colTargetDate'), key: 'targetDate', width: 150, align: 'center',
                sorter: (a: ProjectWorkItem, b: ProjectWorkItem) =>
                    (a.targetDate || '').localeCompare(b.targetDate || ''),
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
                title: (
                    <span title={t('projectWorkItems.colNoteTooltip')}>
                        {t('projectWorkItems.colNote')}
                    </span>
                ),
                key: 'note', width: 200,
                render: (_: unknown, r: ProjectWorkItem) => {
                    // Dòng nhóm cũng có thể mang ghi chú từ file, nhưng không ghi
                    // được khối lượng nên cũng không có ghi chú theo ngày.
                    if (r.level < 2) return r.note || null;
                    return (
                        <DayNoteCell
                            key={`${r.id}:${dateStr}`}
                            item={r}
                            dateLabel={dateLabel}
                            editable={canUpdateProgress}
                            onSave={saveNote}
                        />
                    );
                },
            },
            {
                title: '', key: 'action', width: 50, align: 'center', fixed: 'right',
                render: (_: unknown, r: ProjectWorkItem) => r.level < 2 ? null : (
                    <Button
                        type="text" size="small" icon={<HistoryOutlined />}
                        title={t('projectWorkItems.history')}
                        onClick={() => setHistoryItem(r)}
                    />
                ),
            },
        );
        return cols;
    }, [
        t, scope, flatten, pathById, dateStr, dateLabel,
        canManageItems, canUpdateProgress,
        isOverdue, overdueDays, saveQty, saveNote, saveDate,
    ]);

    const statCards = useMemo(() => ([
        {
            key: 'ALL' as StatusFilter, label: t('projectWorkItems.statTotal'), value: stats.total,
            icon: '📋', color: BRAND_COLORS.info, bg: '#EFF6FF',
        },
        {
            key: 'DONE' as StatusFilter, label: t('projectWorkItems.statDone'), value: stats.done,
            icon: '✅', color: BRAND_COLORS.success, bg: '#ECFDF5',
        },
        {
            key: 'PENDING' as StatusFilter, label: t('projectWorkItems.statPending'), value: stats.pending,
            icon: '🚧', color: BRAND_COLORS.warning, bg: '#FFFBEB',
        },
        {
            key: 'OVERDUE' as StatusFilter, label: t('projectWorkItems.statOverdue'), value: stats.overdue,
            icon: '⚠️',
            color: stats.overdue > 0 ? BRAND_COLORS.error : BRAND_COLORS.textMuted,
            bg: stats.overdue > 0 ? '#FEF2F2' : BRAND_COLORS.backgroundLight,
        },
    ]), [t, stats]);

    const scopeSuffix = scope === 'PROJECT'
        ? t('projectWorkItems.statScopeProject')
        : t('projectWorkItems.statScopeSheet');

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
                                onChange={d => { if (d) setLogDate(d); }}
                                allowClear={false}
                                format="DD/MM/YYYY"
                                disabledDate={d => d.isAfter(dayjs(), 'day')}
                            />
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {items.length > 0 && (
                        <Dropdown
                            menu={{ items: exportMenuItems, onClick: handleExport }}
                            trigger={['click']}
                        >
                            <Button size="small" icon={<FileExcelOutlined />}>
                                {t('projectWorkItems.exportExcel')} <DownOutlined />
                            </Button>
                        </Dropdown>
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
                <>
                <Row gutter={[16, 16]} className="log-stats-row">
                    {statCards.map(s => {
                        const active = statusFilter === s.key;
                        const toggle = () => setStatusFilter(active ? 'ALL' : s.key);
                        return (
                            <Col xs={12} sm={12} md={6} key={s.key}>
                                <div
                                    className={`log-stats-card is-clickable${active ? ' is-active' : ''}`}
                                    role="button"
                                    tabIndex={0}
                                    aria-pressed={active}
                                    onClick={toggle}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
                                    }}
                                >
                                    <div className="log-stats-icon" style={{ backgroundColor: s.bg }}>{s.icon}</div>
                                    <div className="log-stats-info">
                                        <div className="log-stats-label">{s.label}</div>
                                        {/* Phạm vi đứng cạnh con số chứ không nối vào nhãn:
                                            .log-stats-label có nowrap + ellipsis nên nối vào
                                            là bị cắt cụt ("TỔNG HẠNG MỤC tro..."). */}
                                        <div className="log-stats-value" style={{ color: s.color }}>
                                            {s.value}
                                            <span className="log-stats-scope">{scopeSuffix}</span>
                                        </div>
                                    </div>
                                </div>
                            </Col>
                        );
                    })}
                </Row>

                {/*
                  * Tabs chỉ làm THANH CHỌN sheet, KHÔNG chứa bảng.
                  * Trước đây mỗi pane đều dựng một <Table> riêng, mà antd giữ pane
                  * đã mở trong DOM -> bấm qua 6 sheet là 6 bảng cùng mount, mỗi lần
                  * gõ một ô là render lại tất cả. Đó là nguyên nhân đơ với 427 hạng
                  * mục. Cùng khuôn với Tabs ở ProjectDetail.tsx.
                  */}
                <Tabs
                    activeKey={currentSheet}
                    // Bấm một sheet thì phải về phạm vi sheet, nếu không tab đổi
                    // mà bảng vẫn gộp cả dự án — đúng kiểu bẫy im lặng.
                    onChange={key => { setActiveSheet(key); setScope('SHEET'); }}
                    items={sheetNames.map(name => ({
                        key: name,
                        label: `${name} — ${sheetPct[name]}%`,
                    }))}
                />

                {/* Thanh lọc */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    flexWrap: 'wrap', marginBottom: 12,
                }}>
                    <Input
                        allowClear
                        prefix={<SearchOutlined style={{ color: BRAND_COLORS.textMuted }} />}
                        placeholder={t('projectWorkItems.searchPlaceholder')}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ width: 'min(280px, 100%)' }}
                        size="small"
                    />
                    <Segmented
                        size="small"
                        value={statusFilter}
                        onChange={val => setStatusFilter(val as StatusFilter)}
                        options={[
                            { label: t('projectWorkItems.filterAll'), value: 'ALL' },
                            { label: t('projectWorkItems.filterPending'), value: 'PENDING' },
                            { label: t('projectWorkItems.filterInProgress'), value: 'IN_PROGRESS' },
                            { label: t('projectWorkItems.filterDone'), value: 'DONE' },
                            { label: t('projectWorkItems.filterOverdue'), value: 'OVERDUE' },
                        ]}
                    />
                    {sheetNames.length > 1 && (
                        <Segmented
                            size="small"
                            value={scope}
                            onChange={val => setScope(val as Scope)}
                            options={[
                                { label: t('projectWorkItems.scopeSheet'), value: 'SHEET' },
                                { label: t('projectWorkItems.scopeProject'), value: 'PROJECT' },
                            ]}
                        />
                    )}
                    {isFiltering && (
                        <span style={{ fontSize: 12, color: BRAND_COLORS.textSecondary }}>
                            {t('projectWorkItems.filterResult', { count: filteredLeafCount })}
                        </span>
                    )}
                    {sortActive && (
                        <span style={{ fontSize: 12, color: BRAND_COLORS.textMuted }}>
                            {t('projectWorkItems.sortedFlatHint')}
                        </span>
                    )}
                </div>

                <FilterChips
                    filters={[
                        {
                            key: 'search', label: t('common.search'), value: search,
                            onRemove: () => setSearch(''),
                        },
                        {
                            key: 'status', label: t('common.status'), value: statusFilter,
                            displayValue: statusFilter === 'ALL'
                                ? undefined
                                : t(STATUS_FILTER_KEY[statusFilter]),
                            onRemove: () => setStatusFilter('ALL'),
                        },
                    ]}
                    onClearAll={clearFilters}
                />

                {isFiltering && visibleItems.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={t('projectWorkItems.noFilterResult')}
                        style={{ padding: '32px 0' }}
                    />
                ) : (
                    <Table
                        dataSource={visibleItems}
                        columns={columns}
                        rowKey="id"
                        size="small"
                        onChange={(_pagination, _filters, sorter) => {
                            const list = Array.isArray(sorter) ? sorter : [sorter];
                            setSortActive(list.some(s => Boolean(s.order)));
                        }}
                        // Phân trang là bắt buộc: một sheet có thể hơn trăm dòng, mỗi
                        // dòng có InputNumber + Progress + Tag. Dựng hết một lúc là treo.
                        pagination={{
                            // 20 là mặc định vì chi phí render ~13ms/dòng: 50 dòng là
                            // ngót 700ms mỗi lần đổi sheet. Ai cần xem nhiều hơn thì
                            // tự tăng bằng ô chọn bên cạnh.
                            defaultPageSize: 20,
                            pageSizeOptions: [20, 50, 100, 200],
                            showSizeChanger: true,
                            size: 'small',
                            showTotal: (total, range) =>
                                t('projectWorkItems.pageTotal', { from: range[0], to: range[1], total }),
                        }}
                        scroll={{ x: scope === 'PROJECT' ? 1700 : 1560 }}
                        rowClassName={r =>
                            `vcm-wi-level-${r.level}${isOverdue(r) ? ' vcm-wi-overdue' : ''}`}
                    />
                )}
                </>
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
