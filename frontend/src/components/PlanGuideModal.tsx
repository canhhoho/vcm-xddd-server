import React from 'react';
import { Modal, Divider } from 'antd';
import { useTranslation } from 'react-i18next';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
} from '@ant-design/icons';

interface Props {
    open: boolean;
    onClose: () => void;
}

const PlanGuideModal: React.FC<Props> = ({ open, onClose }) => {
    const { t } = useTranslation();

    const W_KEYS = ['WHAT', 'WHY', 'WHO', 'WHEN', 'WHERE', 'HOW'] as const;
    const W_COLORS = {
        WHAT: { bg: '#fff1f0', border: '#ffa39e', accent: '#cf1322' },
        WHY: { bg: '#fff7e6', border: '#ffd591', accent: '#d46b08' },
        WHO: { bg: '#fffbe6', border: '#ffe58f', accent: '#d48806' },
        WHEN: { bg: '#f6ffed', border: '#b7eb8f', accent: '#389e0d' },
        WHERE: { bg: '#e6f7ff', border: '#91d5ff', accent: '#096dd9' },
        HOW: { bg: '#f9f0ff', border: '#d3adf7', accent: '#531dab' },
    };

    const SMART_ITEMS = [
        { letter: 'S', name: 'Specific', viName: 'Cụ thể', descKey: 'Specific' },
        { letter: 'M', name: 'Measurable', viName: 'Đo lường được', descKey: 'Measurable' },
        { letter: 'A', name: 'Achievable', viName: 'Khả thi', descKey: 'Achievable' },
        { letter: 'R', name: 'Relevant', viName: 'Liên quan', descKey: 'Relevant' },
        { letter: 'T', name: 'Time-bound', viName: 'Có thời hạn', descKey: 'Time-bound' },
    ];

    return (
        <Modal
            title={t('plans.guide.title')}
            open={open}
            onCancel={onClose}
            footer={null}
            width={700}
            styles={{ body: { maxHeight: '70vh', overflowY: 'auto', padding: '16px 24px' } }}
        >
            <p style={{ color: '#64748b', marginBottom: 16, fontSize: 13 }}>
                {t('plans.guide.intro')}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {W_KEYS.map(key => {
                    const colors = W_COLORS[key];
                    return (
                        <div key={key} style={{
                            background: colors.bg,
                            border: `1px solid ${colors.border}`,
                            borderRadius: 8,
                            padding: '10px 12px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: colors.accent }}>{key}</span>
                                <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{t(`plans.guide.labels.${key}`)}</span>
                            </div>
                            <p style={{ fontSize: 12, color: '#374151', margin: '0 0 6px', lineHeight: 1.5 }}>
                                {t(`plans.guide.descs.${key}`)}
                            </p>
                            <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span style={{ color: '#15803d' }}>
                                    <CheckCircleOutlined style={{ marginRight: 4 }} />
                                    {t(`business.weeklyPlan.${key.toLowerCase()}Placeholder`).replace('VD: ', '')}
                                </span>
                                <span style={{ color: '#b91c1c' }}>
                                    <CloseCircleOutlined style={{ marginRight: 4 }} />
                                    {t('common.noData')}...
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <Divider style={{ margin: '16px 0' }} />

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px' }}>
                <p style={{ fontWeight: 700, fontSize: 13, color: '#1d4ed8', margin: '0 0 10px' }}>
                    {t('plans.guide.smartTitle')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {SMART_ITEMS.map(s => (
                        <div key={s.letter} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                            <span style={{
                                fontWeight: 700, color: '#1d4ed8', minWidth: 20,
                                background: '#dbeafe', borderRadius: 4, padding: '1px 5px', textAlign: 'center',
                            }}>
                                {s.letter}
                            </span>
                            <span>
                                <strong>{s.name}</strong>
                                <span style={{ color: '#64748b', fontSize: 11 }}> ({s.viName})</span>
                                <span style={{ color: '#475569' }}> — {t(`plans.guide.smart${s.letter}`, s.descKey)}</span>
                            </span>
                        </div>
                    ))}
                </div>
                <div style={{
                    marginTop: 10, padding: '8px 10px', background: '#fff',
                    borderRadius: 6, border: '1px solid #bfdbfe', fontSize: 12, color: '#374151',
                }}>
                    <strong>{t('plans.guide.smartExample')}</strong>{' '}
                    {t('plans.guide.smartExampleText')}
                </div>
            </div>
        </Modal>
    );
};

export default PlanGuideModal;
