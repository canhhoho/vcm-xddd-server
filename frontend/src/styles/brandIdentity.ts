/**
 * VCM XDDD - Brand Identity & Style Guide
 * =========================================
 * File này định nghĩa các quy chuẩn thiết kế cho toàn bộ ứng dụng.
 * Khi phát triển các chức năng mới, PHẢI tuân thủ các quy định này.
 * 
 * Version: 1.0.5
 * Last Updated: 2026-02-13
 */

export const APP_VERSION = '1.1.2';


// ============================================
// 1. COLOR PALETTE - BẢNG MÀU
// ============================================

export const BRAND_COLORS = {
    // Primary Colors - Màu chính (VCM Red)
    primary: '#E11D2E',
    primaryLight: '#FF4D5A',
    primaryDark: '#B91C2A',
    primaryGradient: 'linear-gradient(135deg, #E11D2E 0%, #FF4D5A 100%)',

    // Secondary Colors - Màu phụ (Dark Theme)
    secondary: '#1F2937',      // Header background start
    secondaryMid: '#374151',   // Header background mid
    secondaryLight: '#4B5563', // Header background end
    headerGradient: 'linear-gradient(135deg, #1F2937 0%, #374151 50%, #4B5563 100%)',

    // Neutral Colors - Màu trung tính
    white: '#FFFFFF',
    background: '#F5F5F5',
    backgroundLight: '#FAFAFA',
    border: '#E5E7EB',
    borderLight: '#F3F4F6',

    // Text Colors - Màu chữ
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    textWhite: '#FFFFFF',

    // Action Button Colors - Màu nút hành động
    actionView: '#10B981',     // Xanh lá - Xem
    actionEdit: '#1890ff',     // Xanh dương - Sửa
    actionDelete: '#EF4444',   // Đỏ - Xóa

    // Status Colors - Màu trạng thái
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
};

// ============================================
// 2. TYPOGRAPHY - FONT CHỮ
// ============================================

export const TYPOGRAPHY = {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",

    // Font Sizes
    fontSize: {
        xs: '11px',
        sm: '13px',
        base: '14px',
        lg: '16px',
        xl: '18px',
        '2xl': '20px',
        '3xl': '24px',
        '4xl': '30px',
    },

    // Font Weights
    fontWeight: {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
    },

    // Line Heights
    lineHeight: {
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75,
    },
};

// ============================================
// 3. SPACING - KHOẢNG CÁCH
// ============================================

export const SPACING = {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
};

// ============================================
// 4. COMPONENT STYLES - STYLE THÀNH PHẦN
// ============================================

// 4.1 Premium Header (Trang quản lý)
export const HEADER_STYLES = {
    container: {
        background: BRAND_COLORS.headerGradient,
        borderRadius: '16px',
        padding: '32px',
        marginBottom: '16px',
        position: 'relative' as const,
        overflow: 'hidden' as const,
        boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
    },
    title: {
        fontSize: '24px',
        fontWeight: 700,
        color: BRAND_COLORS.textWhite,
        margin: 0,
        letterSpacing: '-0.5px',
        textShadow: '0 2px 4px rgba(0,0,0,0.2)',
    },
    decorativeCircle1: {
        position: 'absolute' as const,
        top: '-60%',
        right: '-5%',
        width: '350px',
        height: '350px',
        background: 'radial-gradient(circle, rgba(225,29,46,0.2) 0%, transparent 70%)',
        borderRadius: '50%',
    },
    decorativeCircle2: {
        position: 'absolute' as const,
        bottom: '-40%',
        left: '10%',
        width: '200px',
        height: '200px',
        background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)',
        borderRadius: '50%',
    },
};

// 4.2 CTA Button (Nút hành động chính)
export const CTA_BUTTON_STYLES = {
    primary: {
        height: 40,
        borderRadius: '10px',
        background: BRAND_COLORS.primaryGradient,
        border: 'none',
        fontWeight: 600,
        boxShadow: '0 4px 15px rgba(225,29,46,0.4)',
        paddingLeft: 20,
        paddingRight: 20,
    },
    secondary: {
        height: 40,
        borderRadius: '10px',
        fontWeight: 600,
        paddingLeft: 20,
        paddingRight: 20,
    },
};

// 4.3 Filter Section (Vùng lọc)
export const FILTER_STYLES = {
    container: {
        marginBottom: '16px',
        padding: '16px',
        background: BRAND_COLORS.backgroundLight,
        borderRadius: '8px',
        border: `1px solid ${BRAND_COLORS.border}`,
    },
    rowGutter: [16, 16] as [number, number],
};

// 4.4 Card Styles
export const CARD_STYLES = {
    default: {
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    },
    hover: {
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        transform: 'translateY(-2px)',
    },
};

// 4.5 Table Styles
export const TABLE_STYLES = {
    headerBackground: '#F9FAFB',
    rowHoverBackground: '#FAFAFA',
    fontSize: '13px',
    cellPadding: '8px 12px',
};

// 4.6 Tabs Styles
export const TABS_STYLES = {
    inkBarColor: BRAND_COLORS.primary,
    inkBarHeight: '3px',
    tabFontWeight: {
        default: 500,
        active: 600,
    },
};

// 4.7 Action Icon Buttons (Xem, Sửa, Xóa)
export const ACTION_ICON_STYLES = {
    view: { color: BRAND_COLORS.actionView },    // #10B981
    edit: { color: BRAND_COLORS.actionEdit },    // #1890ff
    delete: { color: BRAND_COLORS.actionDelete }, // danger (Ant Design)
};

// ============================================
// 5. SHADOWS - ĐỔ BÓNG
// ============================================

export const SHADOWS = {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px -1px rgba(0,0,0,0.1)',
    lg: '0 10px 15px -3px rgba(0,0,0,0.1)',
    xl: '0 10px 40px rgba(0,0,0,0.15)',
    button: '0 4px 15px rgba(225,29,46,0.4)',
};

// ============================================
// 6. BORDER RADIUS - BO GÓC
// ============================================

export const BORDER_RADIUS = {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
};

// ============================================
// 7. Z-INDEX - THỨ TỰ LỚP
// ============================================

export const Z_INDEX = {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modal: 1040,
    popover: 1050,
    tooltip: 1060,
};

// ============================================
// 8. TRANSITIONS - HIỆU ỨNG CHUYỂN ĐỔI
// ============================================

export const TRANSITIONS = {
    fast: '0.15s ease',
    normal: '0.3s ease',
    slow: '0.5s ease',
};

// ============================================
// 9. BREAKPOINTS - ĐIỂM CHUYỂN RESPONSIVE
// ============================================

export const BREAKPOINTS = {
    xs: 480,
    sm: 576,
    md: 768,
    lg: 992,
    xl: 1200,
    xxl: 1600,
};

// ============================================
// 10. STANDARD TEXT - VĂN BẢN CHUẨN
// ============================================

export const STANDARD_TEXT = {
    buttons: {
        exportExcel: 'XUẤT FILE EXCEL',
        create: 'TẠO MỚI',
        save: 'LƯU',
        cancel: 'HỦY',
        delete: 'XÓA',
        edit: 'SỬA',
        view: 'XEM',
    },
    pagePrefix: 'Quản lý', // Prefix cho tiêu đề trang
};

// ============================================
// USAGE EXAMPLE - VÍ DỤ SỬ DỤNG
// ============================================
/*
import { 
    BRAND_COLORS, 
    HEADER_STYLES, 
    CTA_BUTTON_STYLES,
    ACTION_ICON_STYLES 
} from '../styles/brandIdentity';

// Sử dụng trong component:
<div style={HEADER_STYLES.container}>
    <div style={HEADER_STYLES.decorativeCircle1} />
    <div style={HEADER_STYLES.decorativeCircle2} />
    <h2 style={HEADER_STYLES.title}>Quản lý Dự án</h2>
</div>

// Button CTA:
<Button style={CTA_BUTTON_STYLES.primary}>TẠO DỰ ÁN MỚI</Button>

// Action icons:
<EditOutlined style={ACTION_ICON_STYLES.edit} />
<EyeOutlined style={ACTION_ICON_STYLES.view} />
*/

export default {
    BRAND_COLORS,
    TYPOGRAPHY,
    SPACING,
    HEADER_STYLES,
    CTA_BUTTON_STYLES,
    FILTER_STYLES,
    CARD_STYLES,
    TABLE_STYLES,
    TABS_STYLES,
    ACTION_ICON_STYLES,
    SHADOWS,
    BORDER_RADIUS,
    Z_INDEX,
    TRANSITIONS,
    BREAKPOINTS,
    STANDARD_TEXT,
};
