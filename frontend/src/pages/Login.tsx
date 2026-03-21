import React, { useState } from 'react';
import { Card, Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useTranslation } from 'react-i18next';
import './Login.css';

const Login: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const toggleLanguage = () => {
        const newLang = i18n.language === 'vi' ? 'en' : 'vi';
        i18n.changeLanguage(newLang);
    };

    const onFinish = async (values: { email: string; password: string }) => {
        setLoading(true);
        try {
            const response = await apiService.login(values.email, values.password);
            if (response.success) {
                localStorage.setItem('token', response.token);
                localStorage.setItem('userId', response.user.id);
                localStorage.setItem('userName', response.user.name);
                // Save full user object for permission checks
                localStorage.setItem('user', JSON.stringify(response.user));
                message.success(t('login.loginSuccess'));
                navigate('/dashboard');
            } else {
                message.error(response.error || t('login.loginFailed'));
            }
        } catch (error) {
            message.error(t('login.genericError'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-background"></div>
            <Card className="login-card">
                {/* Language toggle */}
                <div style={{ position: 'absolute', top: 16, right: 16 }}>
                    <Button
                        type="text"
                        icon={<GlobalOutlined />}
                        onClick={toggleLanguage}
                        style={{ color: '#888', fontWeight: 600 }}
                    >
                        {i18n.language === 'vi' ? 'EN' : 'VN'}
                    </Button>
                </div>

                <div className="login-header">
                    <div className="login-logo">VCM</div>
                    <h1 className="login-title">{t('login.title')}</h1>
                    <p className="login-subtitle">{t('login.subtitle')}</p>
                </div>
                <Form name="login" onFinish={onFinish} layout="vertical" size="large">
                    <Form.Item
                        name="email"
                        rules={[
                            { required: true, message: t('login.emailRequired') },
                            { type: 'email', message: t('login.emailInvalid') },
                        ]}
                    >
                        <Input prefix={<UserOutlined />} placeholder={t('login.emailPlaceholder')} />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: t('login.passwordRequired') }]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder={t('login.passwordPlaceholder')} />
                    </Form.Item>
                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={loading} block>
                            {t('login.loginButton')}
                        </Button>
                    </Form.Item>
                </Form>
                <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: '#aaa' }}>
                    v{__APP_VERSION__} - {new Date().toLocaleString()}
                </div>
            </Card>
        </div>
    );
};

export default Login;
