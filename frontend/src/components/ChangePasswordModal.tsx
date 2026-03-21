import React, { useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { apiService } from '../services/api';
import { useTranslation } from 'react-i18next';

interface ChangePasswordModalProps {
    open: boolean;
    onCancel: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ open, onCancel }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const { t } = useTranslation();

    const handleSubmit = async (values: any) => {
        setLoading(true);
        try {
            const { oldPassword, newPassword } = values;
            await apiService.changePassword(oldPassword, newPassword);
            message.success(t('changePassword.success'));
            form.resetFields();
            onCancel();
        } catch (error) {
            message.error(t('changePassword.failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={t('changePassword.title')}
            open={open}
            onCancel={onCancel}
            onOk={() => form.submit()}
            confirmLoading={loading}
            okText={t('changePassword.submit')}
            cancelText={t('changePassword.cancel')}
        >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
                <Form.Item
                    name="oldPassword"
                    label={t('changePassword.oldPassword')}
                    rules={[{ required: true, message: t('changePassword.oldPasswordReq') }]}
                >
                    <Input.Password placeholder={t('changePassword.oldPasswordPlaceholder')} />
                </Form.Item>
                <Form.Item
                    name="newPassword"
                    label={t('changePassword.newPassword')}
                    rules={[
                        { required: true, message: t('changePassword.newPasswordReq') },
                        { min: 6, message: t('changePassword.newPasswordMin') },
                    ]}
                >
                    <Input.Password placeholder={t('changePassword.newPasswordPlaceholder')} />
                </Form.Item>
                <Form.Item
                    name="confirmPassword"
                    label={t('changePassword.confirmPassword')}
                    dependencies={['newPassword']}
                    rules={[
                        { required: true, message: t('changePassword.confirmPasswordReq') },
                        ({ getFieldValue }) => ({
                            validator(_, value) {
                                if (!value || getFieldValue('newPassword') === value) {
                                    return Promise.resolve();
                                }
                                return Promise.reject(new Error(t('changePassword.mismatch')));
                            },
                        }),
                    ]}
                >
                    <Input.Password placeholder={t('changePassword.confirmPasswordPlaceholder')} />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default ChangePasswordModal;
