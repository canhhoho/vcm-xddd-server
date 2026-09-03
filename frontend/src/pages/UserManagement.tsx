import React, { useCallback, useState, useMemo } from 'react';
import {
    Tabs,
    Table,
    Button,
    Modal,
    Form,
    Input,
    Select,
    Tag,
    Space,
    message,
    Popconfirm,
    Typography,
    Tooltip,
    Col,
    Dropdown,
    Radio
} from 'antd';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    PlusOutlined,
    EditOutlined,
    TeamOutlined,
    SafetyCertificateOutlined,
    SaveOutlined,
    KeyOutlined,
    SearchOutlined,
    FilterOutlined,
    FileExcelOutlined,
    IdcardOutlined,
    HistoryOutlined
} from '@ant-design/icons';
import { usePermissions } from '../hooks/usePermissions';
import type { Position, User, UserRole, ModulePermission, ModuleAccess, Activity } from '../types';
import type { ApiResponse } from '../services/api.interface';
import { BRAND_COLORS } from '../styles/brandIdentity';
import './UserManagement.css';
import { useFilterSync } from '../hooks/useFilterSync';
import { VcmFilterBar } from '../components/VcmFilterBar';
import { FilterChips } from '../components/FilterChips';
import { VcmActionGroup } from '../components/VcmActionGroup';

// React Query Hooks
import {
    useUsers,
    usePositions,
    useModulePermissions,
    useActivities,
    useUserMutations,
    usePositionMutations,
    usePermissionMutations
} from '../hooks/useUsers';
import { useAppConfig } from '../hooks/useAppConfig';
import { usePresence } from '../hooks/usePresence';
import { OnlineStatus } from '../components/OnlineUsers';

const { Title, Text } = Typography;

const { Option } = Select;

/**
 * Cột của ma trận phân quyền.
 *
 * Thứ tự PHẢI khớp menu ở layouts/MainLayout.tsx (Chỉ tiêu -> Kinh doanh -> Kế
 * hoạch -> Hợp đồng -> Dự án -> Chi nhánh): admin cấp quyền theo đúng những trang
 * họ thấy trên sidebar, hai nơi lệch nhau là phải dò lại từ đầu mỗi lần.
 *
 * 5 quyền plans_* là quyền con của MỘT trang Kế hoạch nên gom dưới một tiêu đề
 * cha, thay vì bày ngang hàng như thể là 5 trang riêng biệt.
 */
/**
 * Chỉ những field của ModulePermission có kiểu ModuleAccess. Khai thế này để TS chặn
 * ngay tại MODULE_GROUPS nếu ai đó viết một key không tồn tại trên ModulePermission.
 */
type ModuleKey = {
    [K in keyof ModulePermission]-?: ModulePermission[K] extends ModuleAccess | undefined ? K : never
}[keyof ModulePermission];

/**
 * 5 cột con của trang Kế hoạch. `Extract` vừa ràng buộc vừa CHỨNG MINH cả 5 key đều
 * tồn tại trên ModulePermission: viết sai một cái là PlanKey hụt đi một nhánh và
 * PLAN_SHORT_LABEL bên dưới báo thiếu key ngay lúc build.
 */
const PLAN_KEYS = ['plans_bd', 'plans_mkt', 'plans_qs', 'plans_des', 'plans_pm'] as const;
type PlanKey = Extract<ModuleKey, typeof PLAN_KEYS[number]>;

type ModuleColumn = { key: ModuleKey } | { groupLabel: string; keys: readonly PlanKey[] };

const MODULE_GROUPS: ModuleColumn[] = [
    { key: 'targets' },
    { key: 'business' },
    // groupLabel lấy thẳng nhãn sidebar để hai chỗ không bao giờ lệch chữ
    { groupLabel: 'layout.plans', keys: PLAN_KEYS },
    { key: 'contracts' },
    { key: 'projects' },
    { key: 'branches' },
];

/** Danh sách phẳng mọi cột quyền — SUY RA từ MODULE_GROUPS để không thể lệch nhau */
const ALL_MODULE_KEYS: ModuleKey[] = MODULE_GROUPS.flatMap(
    (col): readonly ModuleKey[] => 'groupLabel' in col ? col.keys : [col.key]
);

/**
 * Bề rộng của MỌI cột quyền. Nhóm 3 nút "Sửa/Xem/Không" đo được 109.8px ở font-size
 * 11px, cộng padding ô (đã bóp còn 2px mỗi bên bằng .perm-cell trong
 * UserManagement.css) là ~114px. Đặt hẹp hơn thì nút xuống dòng và mỗi hàng cao gấp
 * đôi — 115px cũ vẫn thiếu ~10px nên cả bảng đang bị wrap.
 *
 * Dùng CHUNG cho module lẻ và 5 cột con Kế hoạch: cùng nội dung thì cùng bề rộng,
 * và ma trận trông thẳng hàng.
 */
const PERM_COL_WIDTH = 116;

/** Nhãn ngắn cho 5 cột con — tiêu đề cha đã nói "Kế hoạch" rồi, không lặp lại */
const PLAN_SHORT_LABEL: Record<PlanKey, string> = {
    plans_bd: 'BD', plans_mkt: 'MKT', plans_qs: 'QS', plans_des: 'DES', plans_pm: 'PM',
};

/**
 * Nhóm chức danh, theo thứ hạng nghiệp vụ — thứ tự của mảng CHÍNH LÀ thứ hạng sắp xếp.
 *
 * Phải phủ đủ 8 nhóm của APP_CONFIG.GROUPS (server/src/config/index.js) vì dropdown
 * "Nhóm" lấy option từ đó: thiếu 'marketing' và 'design' như trước là hai nhóm ấy
 * nhận rank -1 và bị dồn xuống cuối bảng, sau cả nhóm "Khác".
 */
const DEFAULT_CATEGORY_KEYS = [
    'leader', 'construction', 'business', 'marketing', 'qs', 'design', 'project', 'other',
];

/**
 * DB đang có BA lối viết category song song, không quy đổi thì cả sort lẫn filter đều sai:
 *   - key chuẩn lowercase:  'leader', 'construction'      (seed-test.sql:6-13)
 *   - nhãn tiếng Việt:      'Lãnh đạo', 'Kinh doanh'      (seed-data.sql:43-48)
 *   - UPPERCASE:            'LEADER', 'CONSTRUCTION'      (APP_CONFIG.GROUPS — chính là
 *                                                          giá trị dropdown gửi lên)
 * Nhãn tiếng Việt lấy từ `users.groups` trong locales/vi.json; thêm nhóm mới ở
 * APP_CONFIG.GROUPS thì bổ sung cả nhãn tương ứng vào đây.
 */
const CATEGORY_ALIAS: Record<string, string> = {
    leadership: 'leader',
    'lãnh đạo': 'leader',
    'xây dựng': 'construction',
    'thi công': 'construction',
    'kinh doanh': 'business',
    'thiết kế': 'design',
    'dự án': 'project',
    'khác': 'other',
};

/**
 * Option "Tất cả" của các Select filter gửi lên sentinel 'ALL', KHÔNG phải undefined
 * (lối đã dùng ở Branches.tsx:229-257). Quên coi 'ALL' là "không lọc" thì điều kiện
 * thành `positionId === 'ALL'` -> không khớp dòng nào -> bảng trắng trơn.
 */
const noFilter = (v?: string) => !v || v === 'ALL';

/**
 * SheetJS nạp bằng <script> từ CDN (index.html), không có package nên không có type.
 * Chỉ khai đúng hai hàm đang dùng, trả undefined khi script chưa tải xong.
 */
type XlsxSheet = { '!cols'?: { wch: number }[] };
type XlsxGlobal = {
    utils: {
        json_to_sheet: (rows: Record<string, unknown>[]) => XlsxSheet;
        book_new: () => unknown;
        book_append_sheet: (wb: unknown, ws: XlsxSheet, name: string) => void;
    };
    writeFile: (wb: unknown, fileName: string) => void;
};

const getXlsx = (): XlsxGlobal | undefined => (window as unknown as { XLSX?: XlsxGlobal }).XLSX;

// Role tag colors
const getRoleColor = (role?: UserRole | ModuleAccess) => {
    switch (role) {
        case 'ADMIN': return 'red';
        case 'EDIT': return 'blue';
        case 'VIEW': return 'green';
        case 'NO_ACCESS': return 'default';
        default: return 'default';
    }
};

/**
 * Về key chuẩn lowercase. PHẢI gọi ở CẢ HAI đầu mọi phép so sánh category — dropdown
 * gửi 'LEADER' còn DB trả 'leader'/'Lãnh đạo', so sánh `===` thô không khớp dòng nào.
 */
const normalizeCategory = (c?: string) => {
    const raw = String(c || '').trim().toLowerCase();
    return CATEGORY_ALIAS[raw] || raw;
};

const categoryRank = (c?: string) => {
    const i = DEFAULT_CATEGORY_KEYS.indexOf(normalizeCategory(c));
    return i === -1 ? DEFAULT_CATEGORY_KEYS.length : i;   // nhóm lạ/trống xuống cuối
};

/**
 * Thứ tự hiển thị người dùng: nhóm chức danh theo thứ hạng nghiệp vụ, trong mỗi
 * nhóm xếp tên A-Z.
 *
 * Dùng CHUNG cho tab Người dùng và tab Phân quyền. Trước đây hai tab lấy dữ liệu
 * từ hai endpoint sắp xếp khác nhau (/users: created_at DESC, /permissions: name)
 * nên cùng một người nằm ở hai vị trí khác hẳn giữa hai tab — đó là nguyên nhân
 * chính khiến trang này trông lộn xộn.
 *
 * Sắp ở client chứ không sửa ORDER BY: thứ hạng nhóm là DEFAULT_CATEGORY_KEYS
 * chứ không phải alphabet, đưa vào SQL là phải chép CASE WHEN vào hai file route.
 */
const compareUsers = (
    a: { category?: string; name?: string },
    b: { category?: string; name?: string },
) => categoryRank(a.category) - categoryRank(b.category)
    // localeCompare 'vi': so sánh chuỗi thô sẽ đẩy hết tên có dấu xuống cuối
    || String(a.name || '').localeCompare(String(b.name || ''), 'vi');

/**
 * Nhãn chức danh để hiển thị. Dùng CHUNG cho tab Người dùng và tab Phân quyền —
 * trước đây tab Phân quyền in thẳng `position_name` nên có lúc hiện UUID và không
 * dịch được sang EN.
 */
const positionLabel = (
    positionName: string | undefined,
    positionId: string | undefined,
    positions: Position[],
    t: TFunction,
) => {
    const pos = positions.find((p: Position) => p.id === positionId);
    if (pos) return t(`users.positions.${pos.code}`, pos.name) as string;
    // position_name của bảng users có thể còn lưu UUID từ dữ liệu cũ
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(positionName || '');
    return isUuid ? '' : (positionName || '');
};

const UserManagement: React.FC = () => {
    const { t } = useTranslation();
    const { isAdmin } = usePermissions();
    const canEdit = isAdmin; // Only admins can manage users
    const [activeTab, setActiveTab] = useFilterSync<'users' | 'positions' | 'permissions' | 'activities'>('tab', 'users');

    // --- REACT QUERY DATA ---
    const { data: positions = [] } = usePositions();
    const { data: users = [], isLoading: usersLoading } = useUsers();
    const { data: modulePermissions = [], isLoading: permissionsLoading } = useModulePermissions();
    const { data: activities = [], isLoading: activitiesLoading } = useActivities(activeTab === 'activities');
    const { data: appConfig } = useAppConfig();
    // Chỉ cần khi đang ở tab Người dùng — tránh polling 60s khi xem tab khác.
    const { data: presence = [] } = usePresence(activeTab === 'users');
    const presenceById = useMemo(() => new Map(presence.map(p => [p.id, p])), [presence]);

    // Mutations
    const { createUser, updateUser, deleteUser } = useUserMutations();
    const { createPosition, updatePosition, deletePosition } = usePositionMutations();
    const { savePermissions } = usePermissionMutations();

    const [userModalOpen, setUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userForm] = Form.useForm();

    // Password Reset Modal State
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);
    const [passwordForm] = Form.useForm();
    const [changePasswordUser, setChangePasswordUser] = useState<User | null>(null);

    // Position Modal State
    const [positionModalOpen, setPositionModalOpen] = useState(false);
    const [editingPosition, setEditingPosition] = useState<Position | null>(null);
    const [positionForm] = Form.useForm();

    // Module Permissions State — bản nháp NULLABLE, không phải bản copy sync bằng effect.
    //
    // `null` = chưa chỉnh gì, bảng đọc thẳng dữ liệu server. Chỉ khi admin bấm ô đầu
    // tiên mới sinh ra bản nháp. Trước đây là `useState([])` + useEffect copy
    // `modulePermissions` vào mỗi lần query đổi, nên mọi invalidate
    // PERMISSION_KEYS.all (create/update/delete user — useUsers.ts) XOÁ SẠCH các ô
    // đang chỉnh mà nút Lưu vẫn sáng: admin bấm Lưu và ghi lại đúng dữ liệu cũ.
    const [draftPermissions, setDraftPermissions] = useState<ModulePermission[] | null>(null);
    const permissionRows = draftPermissions ?? modulePermissions;
    const permissionsDirty = draftPermissions !== null;

    // Activities State
    const [activityFilterUser, setActivityFilterUser] = useState<string | null>(null);

    // Filters State
    const [searchText, setSearchText] = useFilterSync('q', '');
    const [selectedPosition, setSelectedPosition] = useFilterSync<string | undefined>('position', undefined);
    const [selectedCategory, setSelectedCategory] = useFilterSync<string | undefined>('category', undefined);

    // Active Filters List for Chips
    // `noFilter(...) ? undefined : ...`: sentinel 'ALL' nghĩa là không lọc, đừng hiện chip.
    const activeFilters = [
        { key: 'q', label: t('common.search'), value: searchText, onRemove: () => setSearchText('') },
        {
            key: 'position',
            label: t('users.colPosition'),
            value: noFilter(selectedPosition) ? undefined : selectedPosition,
            // Select dùng value={p.id} nên phải tra theo `p.id`, không phải `p.code` —
            // tra sai key trả undefined và chip in nguyên UUID ra cho người dùng xem.
            displayValue: positionLabel(undefined, selectedPosition, positions, t),
            onRemove: () => setSelectedPosition(undefined)
        },
        {
            key: 'category',
            label: t('users.colGroup'),
            value: noFilter(selectedCategory) ? undefined : selectedCategory,
            displayValue: selectedCategory ? (t(`users.groups.${selectedCategory}`, selectedCategory) as string) : undefined,
            onRemove: () => setSelectedCategory(undefined)
        }
    ];

    // Guard !isAdmin nằm ở cuối, ngay trước return chính — KHÔNG được early-return
    // ở đây vì bên dưới còn 5 useMemo; thoát sớm sẽ đổi số hook giữa các lần render
    // và ném "Rendered fewer hooks than expected".

    const clearAllFilters = () => {
        setSearchText('');
        setSelectedPosition(undefined);
        setSelectedCategory(undefined);
    };

    const categories = useMemo(() => {
        const configGroups = appConfig?.GROUPS;
        if (configGroups && configGroups.length > 0) return configGroups;
        return DEFAULT_CATEGORY_KEYS.map(key => t(`users.categories.${key}`, key));
    }, [appConfig, t]);

    // Filtered users based on filters
    const filteredUsers = useMemo(() => {
        return users.filter((u: User) => {
            const name = String(u?.name || '').toLowerCase();
            const email = String(u?.email || '').toLowerCase();
            const searchTerm = searchText.toLowerCase();

            const matchSearch = !searchText ||
                name.includes(searchTerm) ||
                email.includes(searchTerm) ||
                (u.positionName && String(u.positionName).toLowerCase().includes(searchTerm));
            const matchPosition = noFilter(selectedPosition) || u.positionId === selectedPosition;
            // u.category, KHÔNG position?.category: cùng nguồn với compareUsers bên dưới
            // (lý do ở comment ngay sau .filter), và so hai đầu qua normalizeCategory vì
            // dropdown gửi 'LEADER' còn DB trả 'leader'/'Lãnh đạo'.
            const matchCategory = noFilter(selectedCategory)
                || normalizeCategory(u.category) === normalizeCategory(selectedCategory);
            return matchSearch && matchPosition && matchCategory;
        })
        // filter() da tra mang moi nen sort tai cho khong dung vao state goc.
        //
        // Dung u.category chu KHONG tra nguoc qua positions.find(): usePositions()
        // loc trung theo code (useUsers.ts), nen chuc danh nao bi loai se tra ra
        // undefined va toan bo user cua no roi xuong cuoi bang — dung cai lon xon
        // dang phai sua. Backend da tinh san category tren ban positions DAY DU.
        .sort(compareUsers);
    }, [users, searchText, selectedPosition, selectedCategory]);

    /**
     * Tra User theo id. /api/permissions trả `category` đọc thẳng cột users.category
     * (permissions.js) — thường rỗng — còn /api/users trả
     * COALESCE(NULLIF(p.category,''), u.category) (users.js). Muốn tab Phân quyền lọc
     * và sắp GIỐNG tab Người dùng thì phải lấy category (và positionId) từ đây.
     */
    const usersById = useMemo(
        () => new Map<string, User>(users.map((u: User) => [u.id, u])),
        [users]
    );

    const filteredActivities = useMemo(() => {
        if (!activityFilterUser) return activities;
        return activities.filter((a: Activity) => a.email === activityFilterUser);
    }, [activities, activityFilterUser]);

    // Filtered permissions based on filters
    const filteredPermissions = useMemo(() => {
        return permissionRows.filter((p: ModulePermission) => {
            const user = usersById.get(p.userId);
            const name = String(p.userName || '').toLowerCase();
            const searchTerm = searchText.toLowerCase();

            const matchSearch = !searchText || name.includes(searchTerm);
            const matchPosition = noFilter(selectedPosition) || user?.positionId === selectedPosition;
            // user.category, KHÔNG p.category — xem comment của usersById. Dùng
            // p.category thì mọi người đều rank "không xác định" và bảng quay về thứ
            // tự tên, khác hẳn tab Người dùng.
            const matchCategory = noFilter(selectedCategory)
                || normalizeCategory(user?.category) === normalizeCategory(selectedCategory);

            return matchSearch && matchPosition && matchCategory;
        })
        // PHẢI cùng thứ tự với filteredUsers, nếu không hai tab hiện cùng một danh
        // sách người ở hai thứ tự khác nhau.
        .sort((a: ModulePermission, b: ModulePermission) => compareUsers(
            { category: usersById.get(a.userId)?.category, name: a.userName },
            { category: usersById.get(b.userId)?.category, name: b.userName },
        ));
    }, [permissionRows, usersById, searchText, selectedPosition, selectedCategory]);

    const exportActivities = async () => {
        const dataToExport = filteredActivities.map((a: Activity) => ({
            [t('users.activities.colTime')]: new Date(a.createdAt).toLocaleString('vi-VN'),
            [t('users.activities.colUser')]: a.email,
            [t('users.activities.colAction')]: a.action,
            [t('users.activities.colDetail')]: a.description
        }));

        // Use global XLSX from CDN
        const XLSX = getXlsx();
        if (!XLSX) {
            message.error(t('users.excelNotLoaded'));
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, t('users.activities.exportSheetName'));
        XLSX.writeFile(workbook, `${t('users.activities.exportFileName')}.xlsx`);
    };

    // Export Excel Handler
    const handleExportExcel = async () => {
        // Prepare data for export (exclude sensitive fields)
        const exportData = filteredUsers.map((u: User) => ({
            [t('users.colPosition')]: u.positionName || '',
            [t('users.colName')]: u.name || '',
            [t('users.colEmail')]: u.email || '',
            [t('users.colGroup')]: u.category || '',
            [t('users.colDescription')]: u.description || '',
        }));

        // Use global XLSX from CDN
        const XLSX = getXlsx();
        if (!XLSX) {
            message.error(t('users.excelNotLoaded'));
            return;
        }

        // Create workbook and worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t('users.usersSheetName'));

        // Set column widths
        ws['!cols'] = [
            { wch: 20 }, // Chức danh
            { wch: 25 }, // Họ tên
            { wch: 25 }, // Email
            { wch: 15 }, // Nhóm
            { wch: 40 }, // Mô tả chi tiết
        ];

        // Generate filename with date
        const fileName = `${t('users.export.usersFileName')}_${new Date().toISOString().slice(0, 10)}.xlsx`;

        // Download file
        XLSX.writeFile(wb, fileName);
        message.success(t('users.exportSuccess', { total: filteredUsers.length }));
    };

    // User Handlers
    const handleCreateUser = () => {
        setEditingUser(null);
        userForm.resetFields();
        setUserModalOpen(true);
    };

    const handleEditUser = (record: User) => {
        setEditingUser(record);
        userForm.setFieldsValue(record);
        setUserModalOpen(true);
    };

    const handleDeleteUser = (id: string) => {
        Modal.confirm({
            title: t('users.deleteUserConfirm'),
            content: t('users.deleteUserConfirmDesc'),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => {
                deleteUser.mutate({ id }, {
                    onSuccess: (res: ApiResponse) => {
                        if (res.success) {
                            message.success(t('common.success'));
                        } else {
                            message.error(res.error);
                        }
                    },
                    onError: () => {
                        message.error(t('common.error'));
                    }
                });
            }
        });
    };

    const handleUserSubmit = async () => {
        try {
            const values = await userForm.validateFields();

            // Lookup positionCode and positionName from selected position
            const selectedPosition = positions.find((p: Position) => p.id === values.positionId);
            const payload = {
                ...values,
                id: editingUser?.id,
                positionCode: selectedPosition?.code || '',
                positionName: selectedPosition?.name || values.positionId || '', // Use name or fallback to ID
            };

            const onSuccess = (res: ApiResponse) => {
                if (res.success) {
                    message.success(editingUser ? t('common.success') : t('common.success'));
                    setUserModalOpen(false);
                } else {
                    message.error(res.error);
                }
            };

            const onError = () => {
                message.error(t('common.error'));
            };

            if (editingUser) {
                updateUser.mutate(payload, { onSuccess, onError });
            } else {
                createUser.mutate(payload, { onSuccess, onError });
            }
        } catch {
            // Validation error
        }
    };

    const handlePasswordReset = (record: User) => {
        setChangePasswordUser(record);
        passwordForm.resetFields();
        setPasswordModalOpen(true);
    };

    const handlePasswordSubmit = async () => {
        try {
            const values = await passwordForm.validateFields();
            if (!changePasswordUser) return;

            const payload = {
                id: changePasswordUser.id,
                password: values.newPassword
            };

            updateUser.mutate(payload, {
                onSuccess: (res: ApiResponse) => {
                    if (res.success) {
                        message.success(t('users.resetPasswordSuccess'));
                        setPasswordModalOpen(false);
                    } else {
                        message.error(res.error);
                    }
                },
                onError: () => {
                    message.error(t('common.error'));
                }
            });
        } catch {
            // Validation error
        }
    };

    // Position Handlers
    const handleCreatePosition = () => {
        setEditingPosition(null);
        positionForm.resetFields();
        setPositionModalOpen(true);
    };

    const handleEditPosition = (position: Position) => {
        setEditingPosition(position);
        positionForm.setFieldsValue(position);
        setPositionModalOpen(true);
    };

    const handleDeletePosition = (id: string) => {
        Modal.confirm({
            title: t('users.deletePositionConfirm'),
            content: t('users.deletePositionConfirmDesc'),
            okText: t('common.delete'),
            okType: 'danger',
            cancelText: t('common.cancel'),
            onOk: () => {
                deletePosition.mutate({ id }, {
                    onSuccess: (res: ApiResponse) => {
                        if (res.success) {
                            message.success(t('common.success'));
                        } else {
                            message.error(res.error);
                        }
                    },
                    onError: () => {
                        message.error(t('common.error'));
                    }
                });
            }
        });
    };

    const handlePositionSubmit = async () => {
        try {
            const values = await positionForm.validateFields();
            const payload = { ...values, id: editingPosition?.id };

            const onSuccess = (res: ApiResponse) => {
                if (res.success) {
                    message.success(t('common.success'));
                    setPositionModalOpen(false);
                } else {
                    message.error(res.error);
                }
            };

            const onError = () => {
                message.error(t('common.error'));
            };

            if (editingPosition) {
                updatePosition.mutate(payload, { onSuccess, onError });
            } else {
                createPosition.mutate(payload, { onSuccess, onError });
            }
        } catch {
            // Validation error
        }
    };

    // Module Permission Handlers
    // `prev ?? modulePermissions`: lần bấm đầu tiên sinh bản nháp từ dữ liệu server
    // hiện có; các lần sau chỉnh tiếp trên bản nháp.
    const handlePermissionChange = useCallback((userId: string, moduleKey: string, value: ModuleAccess) => {
        setDraftPermissions(prev =>
            (prev ?? modulePermissions).map((p: ModulePermission) =>
                p.userId === userId
                    ? { ...p, [moduleKey]: value }
                    : p
            )
        );
    }, [modulePermissions]);

    const handleBulkPermissionChange = useCallback((userId: string, value: ModuleAccess) => {
        setDraftPermissions(prev =>
            (prev ?? modulePermissions).map((p: ModulePermission) => {
                if (p.userId !== userId) return p;
                // Object.fromEntries thay vì gán vòng lặp: ALL_MODULE_KEYS được khai là
                // ModuleKey nên TS kiểm được từng key là field thật của ModulePermission,
                // không cần cast sang Record<string, unknown>.
                const allSet = Object.fromEntries(
                    ALL_MODULE_KEYS.map(key => [key, value])
                ) as Record<ModuleKey, ModuleAccess>;
                return { ...p, ...allSet };
            })
        );
    }, [modulePermissions]);

    const handleSavePermissions = () => {
        savePermissions.mutate(permissionRows, {
            onSuccess: (res) => {
                if (res.success) {
                    message.success(t('common.success'));
                    // Bỏ bản nháp -> bảng quay về đọc dữ liệu server (query vừa được
                    // invalidate trong usePermissionMutations nên sẽ là dữ liệu mới).
                    setDraftPermissions(null);
                } else {
                    message.error(res.error);
                }
            },
            onError: () => {
                message.error(t('common.error'));
            }
        });
    };

    const getRoleLabel = useCallback((role?: UserRole | ModuleAccess) => {
        switch (role) {
            case 'ADMIN': return t('users.formDefaultRoleAdmin');
            case 'EDIT': return t('users.formDefaultRoleEdit');
            case 'VIEW': return t('users.formDefaultRoleView');
            case 'NO_ACCESS': return t('users.formDefaultRoleNo');
            default: return role || '-';
        }
    }, [t]);

    const renderFilters = () => (
        <VcmFilterBar>
            <Col xs={24} sm={12} md={8}>
                <Input
                    placeholder={t('users.searchPlaceholder')}
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                />
            </Col>
            <Col xs={24} sm={12} md={8}>
                <Select
                    placeholder={t('users.filterPosition')}
                    value={noFilter(selectedPosition) ? undefined : selectedPosition}
                    onChange={setSelectedPosition}
                    allowClear
                    style={{ width: '100%' }}
                    suffixIcon={<FilterOutlined />}
                >
                    <Select.Option value="ALL">{t('common.all')}</Select.Option>
                    {positions.map((p: Position) => (
                        <Select.Option key={p.id} value={p.id}>
                            {t(`users.positions.${p.code}`, p.name)}
                        </Select.Option>
                    ))}
                </Select>
            </Col>
            <Col xs={24} sm={12} md={8}>
                <Select
                    placeholder={t('users.filterGroup')}
                    value={noFilter(selectedCategory) ? undefined : selectedCategory}
                    onChange={setSelectedCategory}
                    allowClear
                    style={{ width: '100%' }}
                >
                    {categories.map((cat: string) => (
                        <Option key={cat} value={cat}>
                            {t(`users.groups.${cat}`, cat)}
                        </Option>
                    ))}
                </Select>
            </Col>
        </VcmFilterBar>
    );

    // Combined Users Table Columns (with Position info)
    const userColumns = [
        {
            title: t('users.colName'),
            dataIndex: 'name',
            key: 'name',
            width: 160,
            render: (text: string) => <Text strong>{text}</Text>
        },
        {
            title: t('users.colEmail'),
            dataIndex: 'email',
            key: 'email',
            width: 200,
            ellipsis: true,
            render: (text: string) => <Text type="secondary">{text}</Text>
        },
        {
            title: t('users.colPosition'),
            dataIndex: 'positionName',
            key: 'positionName',
            width: 140,
            render: (text: string, record: User) => {
                const label = positionLabel(text, record.positionId, positions, t);
                return label ? <Text strong style={{ color: BRAND_COLORS.info }}>{label}</Text> : <Text type="secondary">-</Text>;
            }
        },
        {
            title: t('users.colGroup'),
            dataIndex: 'category',
            key: 'category',
            width: 110,
            align: 'center' as const,
            render: (text: string) => text ? <Tag style={{ margin: 0 }}>{t(`users.groups.${text}`, text)}</Tag> : '-'
        },
        {
            title: t('users.colRole'),
            dataIndex: 'role',
            key: 'role',
            width: 130,
            align: 'center' as const,
            render: (role: UserRole) => (
                <Tag color={getRoleColor(role)} style={{ margin: 0 }}>{getRoleLabel(role)}</Tag>
            )
        },
        {
            // Trạng thái lấy từ usePresence (endpoint riêng, không cache), KHÔNG từ
            // record của bảng users: GET /users cache 5 phút ở server và 15 phút ở
            // client nên chấm xanh sẽ đứng hình nếu đọc từ đó.
            title: t('presence.colStatus'),
            key: 'presence',
            width: 130,
            align: 'center' as const,
            render: (_: unknown, record: User) => {
                const p = presenceById.get(record.id);
                return <OnlineStatus online={p?.online ?? false} lastSeenAt={p?.lastSeenAt ?? null} />;
            }
        },
        {
            title: t('users.colDescription'),
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
            render: (text: string) => {
                const desc = text || '-';
                return (
                    <Tooltip title={desc} placement="topLeft">
                        <Text type="secondary" ellipsis>{desc}</Text>
                    </Tooltip>
                );
            }
        },
        {
            title: t('common.actions'),
            key: 'actions',
            width: 100,
            align: 'center' as const,
            fixed: 'right' as const,
            render: (_: unknown, record: User) => (
                <VcmActionGroup
                    onEdit={() => handleEditUser(record)}
                    onDelete={() => handleDeleteUser(record.id)}
                    canEdit={canEdit}
                    canDelete={canEdit}
                    deleteConfirmTitle={t('users.deleteUserConfirm')}
                >
                    <Tooltip title={t('users.modalResetPassword')}>
                        <Button
                            type="text"
                            size="small"
                            className="vcm-table-action-btn"
                            icon={<KeyOutlined />}
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePasswordReset(record);
                            }}
                            style={{ color: '#fa8c16' }}
                        />
                    </Tooltip>
                </VcmActionGroup>
            )
        }
    ];

    // Module Permissions Table Columns
    /** Một cột quyền: 3 nút EDIT/VIEW/NO. Dùng cho cả module lẻ lẫn 5 cột con Kế hoạch. */
    const permissionColumn = useCallback((key: string, label: string, width: number) => ({
        title: label,
        dataIndex: key,
        key,
        width,
        align: 'center' as const,
        className: 'perm-cell',
        render: (access: ModuleAccess, record: ModulePermission) => (
            <Radio.Group
                value={access || 'NO_ACCESS'}
                onChange={(e) => handlePermissionChange(record.userId, key, e.target.value)}
                size="small"
                buttonStyle="solid"
                className={`perm-radio perm-radio-${access || 'NO_ACCESS'}`}
            >
                <Radio.Button value="EDIT">{t('common.edit')}</Radio.Button>
                <Radio.Button value="VIEW">{t('common.view')}</Radio.Button>
                <Radio.Button value="NO_ACCESS">{t('common.no')}</Radio.Button>
            </Radio.Group>
        ),
    }), [handlePermissionChange, t]);

    const permissionColumns = useMemo(() => [
        {
            title: t('users.tabUsers'),
            dataIndex: 'userName',
            key: 'userName',
            fixed: 'left' as const,
            width: 160,
            render: (text: string) => <Text strong>{text}</Text>
        },
        {
            title: t('users.colPosition'),
            key: 'position',
            width: 150,
            render: (_: unknown, record: ModulePermission) => {
                // Cùng helper với tab Người dùng: guard UUID + dịch theo position code.
                const label = positionLabel(record.positionName, record.positionId, positions, t);
                return <Text type="secondary">{label || '-'}</Text>;
            }
        },
        {
            // Read-only, đổi role vẫn ở tab Người dùng. Có mặt ở đây vì role='ADMIN'
            // BYPASS toàn bộ ma trận (moduleAccess.js:70, planAccess.js:134): không
            // hiện cột này thì admin thấy 10 cột NO_ACCESS và tin là đã khoá, trong
            // khi người đó đang toàn quyền.
            title: t('users.colRole'),
            dataIndex: 'role',
            key: 'role',
            width: 90,
            align: 'center' as const,
            render: (role: UserRole | undefined) => {
                const tag = <Tag color={getRoleColor(role)} style={{ margin: 0 }}>{getRoleLabel(role)}</Tag>;
                return role === 'ADMIN'
                    ? <Tooltip title={t('users.adminBypassHint')}>{tag}</Tooltip>
                    : tag;
            }
        },
        ...MODULE_GROUPS.map(col => 'groupLabel' in col
            // Tiêu đề cha 2 tầng của antd Table: 5 cột plans_* nằm dưới "Kế hoạch"
            ? {
                title: t(col.groupLabel),
                key: col.groupLabel,
                children: col.keys.map(key => permissionColumn(key, PLAN_SHORT_LABEL[key], PERM_COL_WIDTH)),
            }
            : permissionColumn(col.key, t(`users.modules.${col.key}`), PERM_COL_WIDTH)
        ),
        {
            title: t('common.setAll'),
            key: 'bulk',
            width: 100,
            fixed: 'right' as const,
            align: 'center' as const,
            render: (_: unknown, record: ModulePermission) => (
                <Dropdown
                    menu={{
                        items: [
                            { key: 'EDIT', label: <Tag color="blue">{t('common.edit')} {t('common.all')}</Tag>, onClick: () => handleBulkPermissionChange(record.userId, 'EDIT') },
                            { key: 'VIEW', label: <Tag color="green">{t('common.view')} {t('common.all')}</Tag>, onClick: () => handleBulkPermissionChange(record.userId, 'VIEW') },
                            { key: 'NO_ACCESS', label: <Tag>{t('common.no')} {t('common.all')}</Tag>, onClick: () => handleBulkPermissionChange(record.userId, 'NO_ACCESS') },
                        ]
                    }}
                    trigger={['click']}
                >
                    <Button size="small" icon={<EditOutlined />}>{t('common.set')}</Button>
                </Dropdown>
            )
        }
    ], [positions, permissionColumn, handleBulkPermissionChange, getRoleLabel, t]);

    // Position Table Columns
    const positionColumns = [
        {
            title: t('common.code'),
            dataIndex: 'code',
            key: 'code',
            width: 100,
            align: 'center' as const,
            render: (text: string) => <Tag color="blue" style={{ margin: 0 }}>{text}</Tag>
        },
        {
            title: t('users.formPositionName'),
            dataIndex: 'name',
            key: 'name',
            width: 180,
            render: (text: string, record: Position) => <Text strong>{t(`users.positions.${record.code}`, text)}</Text>
        },
        {
            title: t('users.colGroup'),
            dataIndex: 'category',
            key: 'category',
            width: 120,
            align: 'center' as const,
            render: (text: string) => text ? <Tag style={{ margin: 0 }}>{t(`users.groups.${text}`, text)}</Tag> : '-'
        },
        {
            title: t('users.formDefaultRole'),
            dataIndex: 'defaultRole',
            key: 'defaultRole',
            width: 120,
            align: 'center' as const,
            render: (role: UserRole) => (
                <Tag color={getRoleColor(role)} style={{ margin: 0 }}>{getRoleLabel(role)}</Tag>
            )
        },
        {
            title: t('common.description'),
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
            render: (text: string) => <Text type="secondary" ellipsis>{text || '-'}</Text>
        },
        {
            title: t('common.actions'),
            key: 'actions',
            width: 80,
            align: 'center' as const,
            fixed: 'right' as const,
            render: (_: unknown, record: Position) => (
                <VcmActionGroup
                    onEdit={() => handleEditPosition(record)}
                    onDelete={() => handleDeletePosition(record.id)}
                    canEdit={canEdit}
                    canDelete={canEdit}
                    deleteConfirmTitle={t('users.deletePositionConfirm')}
                />
            )
        }
    ];



    // --- ACCESS CONTROL --- (đặt sau toàn bộ hook, xem ghi chú ở trên)
    if (!isAdmin) {
        return (
            <div className="user-management-blocked">
                <SafetyCertificateOutlined
                    style={{ fontSize: 64, color: BRAND_COLORS.error, marginBottom: 16 }}
                />
                <Title level={3}>{t('branches.noAccess')}</Title>
                <Text type="secondary">{t('users.noAccessDescShort')}</Text>
                <Button type="primary" style={{ marginTop: 24 }} href="#/dashboard">
                    {t('common.back')}
                </Button>
            </div>
        );
    }

    return (
        <div className="vcm-page-container">
            {/* Premium Header - Standardized across the app */}
            <div className="vcm-premium-header">
                {/* Decorative circles */}
                <div className="vcm-header-decorative-circle vcm-circle-1" />
                <div className="vcm-header-decorative-circle vcm-circle-2" />

                <div className="vcm-header-content">
                    <h2 className="vcm-header-title">
                        {t('users.title')}
                    </h2>
                    <Space>
                        <Dropdown
                            menu={{
                                items: [
                                    {
                                        key: 'users',
                                        label: t('users.export.users'),
                                        icon: <TeamOutlined />,
                                        onClick: handleExportExcel
                                    },
                                    {
                                        key: 'activities',
                                        label: t('users.export.activities'),
                                        icon: <HistoryOutlined />,
                                        onClick: exportActivities
                                    }
                                ]
                            }}
                            placement="bottomRight"
                        >
                            <Button
                                type="primary"
                                icon={<FileExcelOutlined />}
                                className="vcm-btn-secondary"
                            >
                                {t('users.exportExcel')}
                            </Button>
                        </Dropdown>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleCreateUser}
                            className="vcm-btn-premium"
                        >
                            {t('users.modalAddUser').toUpperCase()}
                        </Button>
                    </Space>
                </div>
            </div>

            {/* Tabs Content */}
            <div className="user-management-content">
                <Tabs
                    activeKey={activeTab}
                    onChange={(key) => setActiveTab(key as 'users' | 'positions' | 'permissions' | 'activities')}
                    tabBarExtraContent={activeTab === 'permissions' ? (
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            onClick={handleSavePermissions}
                            loading={savePermissions.isPending}
                            disabled={!permissionsDirty || savePermissions.isPending}
                            className={permissionsDirty ? "vcm-btn-premium" : ""}
                        >
                            {permissionsDirty ? t('users.savePermissions') : t('users.saved')}
                        </Button>
                    ) : null}
                    items={[
                        {
                            key: 'users',
                            label: (
                                <span>
                                    <TeamOutlined /> {t('users.tabUsers')} ({filteredUsers.length})
                                </span>
                            ),
                            children: (
                                <>
                                    {renderFilters()}
                                    <div style={{ marginBottom: 16 }}>
                                        <FilterChips filters={activeFilters} onClearAll={clearAllFilters} />
                                    </div>
                                    <Table
                                        columns={userColumns}
                                        dataSource={filteredUsers}
                                        rowKey="id"
                                        loading={usersLoading}
                                        pagination={{
                                            pageSize: 10,
                                            showSizeChanger: true,
                                            showTotal: (total) => t('users.totalUsers', { total }),
                                        }}
                                        // 140+160+200+110+130+100 = 840, cộng ~200 cho cột mô tả co giãn
                                        scroll={{ x: 1040 }}
                                        className="user-table"
                                        size="small"
                                    />
                                </>
                            )
                        },

                        {
                            // Tab này từng bị gỡ khỏi items trong khi toàn bộ phần còn
                            // lại (positionColumns, modal, các handler, mutations, key
                            // i18n) vẫn nguyên — và cảnh báo "biến không dùng" bị tắt
                            // bằng eslint-disable thay vì xoá code. Hệ quả: quản lý
                            // chức danh biến mất khỏi UI, và link ?tab=positions ra
                            // vùng nội dung trống vì items.find() trả undefined.
                            key: 'positions',
                            label: (
                                <span>
                                    <IdcardOutlined /> {t('users.tabPositions')} ({positions.length})
                                </span>
                            ),
                            children: (
                                <>
                                    <div style={{ marginBottom: 16 }}>
                                        <Button
                                            type="primary"
                                            icon={<PlusOutlined />}
                                            onClick={handleCreatePosition}
                                        >
                                            {t('users.addPosition')}
                                        </Button>
                                    </div>
                                    <Table
                                        columns={positionColumns}
                                        dataSource={positions}
                                        rowKey="id"
                                        pagination={{
                                            pageSize: 10,
                                            showSizeChanger: true,
                                        }}
                                        size="small"
                                    />
                                </>
                            )
                        },

                        {
                            key: 'permissions',
                            label: (
                                <span>
                                    <SafetyCertificateOutlined /> {t('users.tabPermissions')}
                                </span>
                            ),
                            children: (
                                <>
                                    {/* Bảng này DÙNG CHUNG searchText/position/category với tab
                                        Người dùng (useFilterSync giữ trong URL). Không render
                                        filter bar ở đây thì admin lọc bên tab kia rồi sang đây
                                        thấy bảng thiếu người mà không có gì cho biết đang lọc. */}
                                    {renderFilters()}
                                    <div style={{ marginBottom: 16 }}>
                                        <FilterChips filters={activeFilters} onClearAll={clearAllFilters} />
                                    </div>
                                    <div className="permissions-matrix">
                                        <div className="permissions-legend">
                                            <Text type="secondary">{t('users.legendTitle')}</Text>
                                            <Tag color="blue">{t('users.legendEdit')}</Tag>
                                            <Tag color="green">{t('users.legendView')}</Tag>
                                            <Tag color="default">{t('users.legendNoAccess')}</Tag>
                                        </div>
                                        <Table
                                            columns={permissionColumns}
                                            dataSource={filteredPermissions}
                                            rowKey="userId"
                                            loading={permissionsLoading}
                                            pagination={{
                                                pageSize: 20,
                                                showSizeChanger: true,
                                                showTotal: (total) => t('users.totalUsers', { total }),
                                            }}
                                            // 160 tên + 150 chức danh + 90 role
                                            // + 10×116 quyền + 100 "Đặt tất cả" = 1660
                                            scroll={{ x: 160 + 150 + 90 + 10 * PERM_COL_WIDTH + 100 }}
                                            bordered
                                            size="small"
                                        />
                                    </div>
                                </>
                            )
                        },
                        {
                            key: 'activities',
                            label: (
                                <span>
                                    <HistoryOutlined /> {t('users.activities.tabTitle')}
                                </span>
                            ),
                            children: (
                                <>
                                    <div style={{ marginBottom: 16 }}>
                                        <Space>
                                            <span style={{ fontStyle: 'italic', color: '#666' }}>{t('users.activities.filterLabel')}</span>
                                            <Select
                                                style={{ width: 250 }}
                                                placeholder={t('users.activities.filterPlaceholder')}
                                                allowClear
                                                onChange={setActivityFilterUser}
                                                showSearch
                                                optionFilterProp="children"
                                            >
                                                {(users || []).map((u: User) => (
                                                    <Option key={u.email} value={u.email}>{u.name} ({u.email})</Option>
                                                ))}
                                            </Select>
                                        </Space>
                                    </div>
                                    <Table
                                        columns={[
                                            {
                                                title: t('users.activities.colTime'),
                                                dataIndex: 'createdAt',
                                                key: 'createdAt',
                                                width: 180,
                                                render: (text) => {
                                                    if (!text) return '-';
                                                    const d = new Date(text);
                                                    return isNaN(d.getTime()) ? '-' : d.toLocaleString('vi-VN');
                                                }
                                            },
                                            {
                                                title: t('users.activities.colUser'),
                                                dataIndex: 'email',
                                                key: 'email',
                                                width: 250,
                                            },
                                            {
                                                title: t('users.activities.colAction'),
                                                dataIndex: 'action',
                                                key: 'action',
                                                width: 150,
                                                render: (action) => {
                                                    let color = 'default';
                                                    if (action === 'LOGIN') color = 'green';
                                                    else if (action === 'LOGOUT') color = 'default';
                                                    else if (action.includes('CREATE')) color = 'blue';
                                                    else if (action.includes('UPDATE')) color = 'orange';
                                                    else if (action.includes('DELETE')) color = 'red';
                                                    return <Tag color={color}>{action}</Tag>;
                                                }
                                            },
                                            {
                                                title: t('users.activities.colDetail'),
                                                dataIndex: 'description',
                                                key: 'description',
                                            }
                                        ]}
                                        dataSource={filteredActivities}
                                        rowKey="id"
                                        loading={activitiesLoading}
                                        pagination={{ pageSize: 20, showSizeChanger: true }}
                                        scroll={{ x: 900 }}
                                        size="small"
                                    />
                                </>
                            )
                        }
                    ]}
                />
            </div>

            {/* User Modal */}
            <Modal
                title={editingUser ? t('users.modalEditUser') : t('users.modalAddUser')}
                open={userModalOpen}
                onOk={handleUserSubmit}
                onCancel={() => setUserModalOpen(false)}
                okText={editingUser ? t('common.save') : t('common.add')}
                cancelText={t('common.cancel')}
                width={500}
            >
                <Form form={userForm} layout="vertical">
                    <Form.Item
                        name="name"
                        label={t('users.formName')}
                        rules={[{ required: true, message: t('users.formNameReq') }]}
                    >
                        <Input placeholder={t('users.placeholders.fullName')} />
                    </Form.Item>
                    <Form.Item
                        name="email"
                        label={t('users.formEmail')}
                        rules={[
                            { required: true, message: t('users.formEmailReq') },
                            { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t('users.formEmailInvalid') }
                        ]}
                        normalize={(value) => value.trim()}
                    >
                        <Input placeholder="user@vcm.com" />
                    </Form.Item>
                    {!editingUser && (
                        <Form.Item
                            name="password"
                            label={t('users.formPassword')}
                            rules={[{ required: true, message: t('users.formPasswordReq') }]}
                        >
                            <Input.Password placeholder={t('users.formPassword')} />
                        </Form.Item>
                    )}
                    <Form.Item name="positionId" label={t('users.formPosition')}>
                        <Select
                            placeholder={t('users.formPositionPlaceholder')}
                            allowClear
                            onChange={(value) => {
                                const selectedPos = positions.find((p: Position) => p.id === value);
                                if (selectedPos) {
                                    userForm.setFieldsValue({
                                        category: selectedPos.category,
                                        description: selectedPos.description
                                    });
                                }
                            }}
                        >
                            {(positions || []).map((p: Position) => (
                                <Option key={p.id} value={p.id}>
                                    {t(`users.positions.${p.code}`, p.name)}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="category" label={t('users.formGroup')}>
                        <Select placeholder={t('users.formGroupPlaceholder')}>
                            {categories.map((cat: string) => (
                                <Option key={cat} value={cat}>{t(`users.groups.${cat}`, cat)}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="role"
                        label={t('users.formRole')}
                        initialValue="VIEW"
                        rules={[{ required: true, message: t('users.formDefaultRoleReq') }]}
                    >
                        <Select>
                            <Option value="ADMIN">{t('users.formDefaultRoleAdmin')}</Option>
                            <Option value="EDIT">{t('users.formDefaultRoleEdit')}</Option>
                            <Option value="VIEW">{t('users.formDefaultRoleView')}</Option>
                            <Option value="NO_ACCESS">{t('users.formDefaultRoleNo')}</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="description" label={t('users.formDescription')}>
                        <Input.TextArea
                            rows={3}
                            placeholder={t('users.formDescriptionPlaceholder')}
                        />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Password Modal */}
            <Modal
                title={`${t('users.modalResetPassword')}: ${changePasswordUser?.name || ''} `}
                open={passwordModalOpen}
                onOk={handlePasswordSubmit}
                onCancel={() => setPasswordModalOpen(false)}
                okText={t('common.save')}
                cancelText={t('common.cancel')}
                width={400}
            >
                <Form form={passwordForm} layout="vertical">
                    <Form.Item
                        name="newPassword"
                        label={t('users.formNewPassword')}
                        rules={[
                            { required: true, message: t('users.formNewPasswordReq') },
                            { min: 6, message: t('users.formNewPasswordMin') }
                        ]}
                    >
                        <Input.Password placeholder={t('users.formNewPassword')} />
                    </Form.Item>
                    <Form.Item
                        name="confirmPassword"
                        label={t('users.formConfirmPassword')}
                        dependencies={['newPassword']}
                        rules={[
                            { required: true, message: t('users.formConfirmPasswordReq') },
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (!value || getFieldValue('newPassword') === value) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error(t('users.formConfirmPasswordMismatch')));
                                },
                            }),
                        ]}
                    >
                        <Input.Password placeholder={t('users.formConfirmPassword')} />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Position Modal */}
            <Modal
                title={editingPosition ? t('users.modalEditPosition') : t('users.modalAddPosition')}
                open={positionModalOpen}
                onOk={handlePositionSubmit}
                onCancel={() => setPositionModalOpen(false)}
                okText={editingPosition ? t('common.save') : t('common.add')}
                cancelText={t('common.cancel')}
                width={500}
                footer={[
                    editingPosition && (
                        <Popconfirm
                            key="delete"
                            title={t('users.deletePositionConfirm')}
                            onConfirm={() => {
                                handleDeletePosition(editingPosition.id);
                                setPositionModalOpen(false);
                            }}
                            okText={t('common.delete')}
                            cancelText={t('common.cancel')}
                        >
                            <Button danger>{t('users.deletePositionBtn')}</Button>
                        </Popconfirm>
                    ),
                    <Button key="cancel" onClick={() => setPositionModalOpen(false)}>{t('common.cancel')}</Button>,
                    <Button key="submit" type="primary" onClick={handlePositionSubmit}>
                        {editingPosition ? t('common.save') : t('common.add')}
                    </Button>
                ]}
            >
                <Form form={positionForm} layout="vertical">
                    <Form.Item
                        name="name"
                        label={t('users.formPositionName')}
                        rules={[{ required: true, message: t('users.formPositionNameReq') }]}
                    >
                        <Input placeholder={t('users.placeholders.posName')} />
                    </Form.Item>
                    <Form.Item
                        name="code"
                        label={t('users.formPositionCode')}
                        rules={[{ required: true, message: t('users.formPositionCodeReq') }]}
                    >
                        <Input placeholder={t('users.placeholders.posCode')} />
                    </Form.Item>
                    <Form.Item
                        name="category"
                        label={t('users.formPositionGroup')}
                        rules={[{ required: true, message: t('users.formPositionGroupReq') }]}
                    >
                        <Select placeholder={t('users.formGroupPlaceholder')}>
                            {categories.map((cat: string) => (
                                <Option key={cat} value={cat}>{t(`users.groups.${cat}`, cat)}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="defaultRole"
                        label={t('users.formDefaultRole')}
                        rules={[{ required: true, message: t('users.formDefaultRoleReq') }]}
                    >
                        <Select placeholder={t('users.formDefaultRoleReq')}>
                            <Option value="ADMIN">{t('users.formDefaultRoleAdmin')}</Option>
                            <Option value="EDIT">{t('users.formDefaultRoleEdit')}</Option>
                            <Option value="VIEW">{t('users.formDefaultRoleView')}</Option>
                            <Option value="NO_ACCESS">{t('users.formDefaultRoleNo')}</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="description" label={t('common.description')}>
                        <Input.TextArea rows={2} placeholder={`${t('common.description')}...`} />
                    </Form.Item>
                </Form>
            </Modal>
        </div >
    );
};

export default UserManagement;
