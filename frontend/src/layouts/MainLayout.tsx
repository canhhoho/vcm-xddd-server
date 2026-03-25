import React, { useState, useMemo } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Tooltip, Drawer, Grid } from 'antd';
import {
    DashboardOutlined,
    FileTextOutlined,
    ProjectOutlined,
    UserOutlined,
    BankOutlined,
    BellOutlined,
    LogoutOutlined,
    SettingOutlined,
    AimOutlined,
    GlobalOutlined,
    KeyOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import type { MenuProps } from 'antd';
import { usePermissions } from '../hooks/usePermissions';
import { APP_VERSION } from '../styles/brandIdentity';
import { useTranslation } from 'react-i18next';
import ChangePasswordModal from '../components/ChangePasswordModal';
import './MainLayout.css';

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

const MainLayout: React.FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [changePasswordOpen, setChangePasswordOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { isAdmin, permissions } = usePermissions();
    const { t, i18n } = useTranslation();

    const toggleLanguage = () => {
        const newLang = i18n.language === 'vi' ? 'en' : 'vi';
        i18n.changeLanguage(newLang);
    };

    const menuItems: MenuProps['items'] = useMemo(() => {
        const items: MenuProps['items'] = [
            {
                key: '/dashboard',
                icon: <DashboardOutlined />,
                label: t('layout.dashboard'),
            },
        ];

        // Targets Module
        if (permissions?.targets !== 'NO_ACCESS') {
            items.push({
                key: '/targets',
                icon: <AimOutlined />,
                label: t('layout.targets'),
            });
        }

        // Business Module
        if (permissions?.business !== 'NO_ACCESS') {
            items.push({
                key: '/business',
                icon: <BankOutlined />,
                label: t('layout.business'),
            });
        }

        // Contracts Module
        if (permissions?.contracts !== 'NO_ACCESS') {
            items.push({
                key: '/contracts',
                icon: <FileTextOutlined />,
                label: t('layout.contracts'),
            });
        }

        // Projects Module
        if (permissions?.projects !== 'NO_ACCESS') {
            items.push({
                key: '/projects',
                icon: <ProjectOutlined />,
                label: t('layout.projects'),
            });
        }

        // Branches Module
        if (permissions?.branches !== 'NO_ACCESS') {
            items.push({
                key: '/branches',
                icon: <BankOutlined />,
                label: t('layout.branches'),
            });
        }

        // Only show User Management for Admins
        if (isAdmin) {
            items.push({
                key: '/users',
                icon: <UserOutlined />,
                label: t('layout.users'),
            });
        }

        return items;
    }, [isAdmin, permissions, t]);

    const userMenuItems: MenuProps['items'] = [
        {
            key: 'profile',
            icon: <UserOutlined />,
            label: t('layout.profile'),
        },
        {
            key: 'change_password',
            icon: <KeyOutlined />,
            label: t('changePassword.title'),
        },
        {
            key: 'settings',
            icon: <SettingOutlined />,
            label: t('layout.settings'),
        },
        {
            type: 'divider',
        },
        {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: t('layout.logout'),
            danger: true,
        },
    ];

    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const screens = useBreakpoint();
    const isMobile = !screens.md; // Tablet and below

    const handleMenuClick = ({ key }: { key: string }) => {
        navigate(key);
        if (isMobile) setMobileDrawerOpen(false);
    };

    const handleUserMenuClick = ({ key }: { key: string }) => {
        if (key === 'logout') {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            navigate('/login');
        } else if (key === 'change_password') {
            setChangePasswordOpen(true);
        }
        if (isMobile) setMobileDrawerOpen(false);
    };

    return (
        <Layout style={{ minHeight: '100vh' }}>
            {!isMobile && (
                <Sider
                    collapsible
                    collapsed={collapsed}
                    onCollapse={setCollapsed}
                    width={180}
                    className="main-sider"
                >
                    <div className="logo-container">
                        <div className="logo-icon">VCM</div>
                        {!collapsed && (
                            <div className="logo-text">
                                <div className="logo-title">{t('layout.appTitle')}</div>
                                <div className="logo-subtitle">{t('layout.appSubtitle')}</div>
                            </div>
                        )}
                    </div>
                    <Menu
                        theme="dark"
                        mode="inline"
                        selectedKeys={[location.pathname]}
                        items={menuItems}
                        onClick={handleMenuClick}
                        className="main-menu"
                    />

                    {!collapsed && (
                        <div className="sidebar-footer">
                            <div className="sidebar-version">v{APP_VERSION}</div>
                            <div className="sidebar-signature">{t('layout.footer')}</div>
                        </div>
                    )}
                </Sider>
            )}

            <Drawer
                title={
                    <div className="logo-container" style={{ border: 'none', padding: 0 }}>
                        <div className="logo-icon" style={{ background: '#E11D2E', color: 'white' }}>VCM</div>
                        <div className="logo-text">
                            <div className="logo-title" style={{ color: '#111827' }}>{t('layout.appTitle')}</div>
                            <div className="logo-subtitle" style={{ color: '#6B7280' }}>{t('layout.appSubtitle')}</div>
                        </div>
                    </div>
                }
                placement="left"
                onClose={() => setMobileDrawerOpen(false)}
                open={mobileDrawerOpen}
                width={280}
                styles={{ body: { padding: 0 } }}
            >
                <Menu
                    mode="inline"
                    selectedKeys={[location.pathname]}
                    items={menuItems}
                    onClick={handleMenuClick}
                    style={{ border: 'none' }}
                />
                <div className="drawer-footer">
                    <div className="sidebar-version" style={{ color: '#111827' }}>v{APP_VERSION}</div>
                    <div className="sidebar-signature" style={{ color: '#6B7280' }}>{t('layout.footer')}</div>
                </div>
            </Drawer>

            <Layout className="inner-layout">
                <Header className="main-header">
                    <div className="header-left">
                        {isMobile && (
                            <Button
                                type="text"
                                icon={mobileDrawerOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                                onClick={() => setMobileDrawerOpen(true)}
                                className="mobile-toggle"
                            />
                        )}
                        <div className="header-title">
                            {(() => {
                                const item = menuItems.find((item) => item?.key === location.pathname);
                                return (item && 'label' in item) ? item.label : t('layout.dashboard');
                            })()}
                        </div>
                    </div>
                    <div className="header-actions">
                        <Tooltip title={i18n.language === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}>
                            <Button
                                type="text"
                                icon={<GlobalOutlined />}
                                onClick={toggleLanguage}
                                style={{ color: '#E11D2E', fontWeight: 600, fontSize: 13 }}
                            >
                                {i18n.language === 'vi' ? 'EN' : 'VN'}
                            </Button>
                        </Tooltip>
                        <Badge count={5} className="notification-badge">
                            <BellOutlined className="header-icon" />
                        </Badge>
                        <Dropdown menu={{ items: userMenuItems, onClick: handleUserMenuClick }} placement="bottomRight">
                            <div className="user-info">
                                <Avatar icon={<UserOutlined />} className="user-avatar" />
                                {!isMobile && (
                                    <span className="user-name">
                                        {(() => {
                                            try {
                                                const userStr = localStorage.getItem('user');
                                                const user = userStr ? JSON.parse(userStr) : null;
                                                return user?.email || 'User';
                                            } catch {
                                                return 'User';
                                            }
                                        })()}
                                    </span>
                                )}
                            </div>
                        </Dropdown>
                    </div>
                </Header>
                <Content className="main-content">
                    <Outlet />
                </Content>
                <ChangePasswordModal open={changePasswordOpen} onCancel={() => setChangePasswordOpen(false)} />
            </Layout>
        </Layout>
    );
};

export default MainLayout;
