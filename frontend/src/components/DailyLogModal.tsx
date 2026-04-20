import React, { useEffect, useState } from 'react';
import { Modal, Slider, Input, Button, List, Tag, Typography, Divider, message, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { apiService } from '../services/api';
import type { WeeklyPlanItem, DailyLog } from '../types';

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
    item: WeeklyPlanItem | null;
    open: boolean;
    onClose: (refreshed: boolean) => void;
}

const DailyLogModal: React.FC<Props> = ({ item, open, onClose }) => {
    const { t } = useTranslation();
    const today = dayjs().format('YYYY-MM-DD');

    const [progressPct, setProgressPct] = useState(0);
    const [note, setNote] = useState('');
    const [logs, setLogs] = useState<DailyLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open || !item) return;
        // Pre-fill with current item progress
        setProgressPct(item.progressPct || 0);
        setNote('');
        // Load log history
        setLoadingLogs(true);
        apiService.getDailyLogs(item.id).then(res => {
            if (res.success) {
                const allLogs: DailyLog[] = res.data || [];
                setLogs(allLogs);
                // If today's log exists, pre-fill its values
                const todayLog = allLogs.find(l => dayjs(l.logDate).format('YYYY-MM-DD') === today);
                if (todayLog) {
                    setProgressPct(todayLog.progressPct);
                    setNote(todayLog.note || '');
                }
            }
        }).finally(() => setLoadingLogs(false));
    }, [open, item]);

    const handleSave = async () => {
        if (!item) return;
        setSaving(true);
        try {
            const res = await apiService.upsertDailyLog({
                itemId: item.id,
                logDate: today,
                progressPct,
                note: note.trim() || null,
            });
            if (res.success) {
                message.success(t('plans.daily.saveSuccess'));
                onClose(true);
            } else {
                message.error(t('common.saveError'));
            }
        } catch {
            message.error(t('common.saveError'));
        }
        setSaving(false);
    };

    const progressColor = progressPct >= 100 ? '#52c41a' : progressPct >= 60 ? '#1677ff' : progressPct >= 30 ? '#fa8c16' : '#94a3b8';

    return (
        <Modal
            title={
                <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{t('plans.daily.modalTitle')}</div>
                    {item && <div style={{ fontWeight: 400, fontSize: 13, color: '#64748b', marginTop: 2 }}>{item.title}</div>}
                </div>
            }
            open={open}
            onCancel={() => onClose(false)}
            footer={[
                <Button key="cancel" onClick={() => onClose(false)}>{t('common.cancel')}</Button>,
                <Button key="save" type="primary" loading={saving} onClick={handleSave}>{t('common.save')}</Button>,
            ]}
            width={500}
            destroyOnClose
        >
            <div style={{ marginBottom: 8, color: '#64748b', fontSize: 13 }}>
                {t('plans.daily.logDate')}: <strong>{dayjs().format('DD/MM/YYYY')}</strong>
            </div>

            {/* Progress slider */}
            <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text strong style={{ fontSize: 13 }}>{t('plans.daily.progress')}</Text>
                    <Text strong style={{ fontSize: 18, color: progressColor }}>{progressPct}%</Text>
                </div>
                <Slider
                    min={0} max={100} step={5}
                    value={progressPct}
                    onChange={setProgressPct}
                    trackStyle={{ backgroundColor: progressColor }}
                    handleStyle={{ borderColor: progressColor }}
                    marks={{ 0: '0', 25: '25', 50: '50', 75: '75', 100: '100' }}
                />
            </div>

            {/* Note */}
            <div style={{ marginBottom: 16 }}>
                <Text strong style={{ fontSize: 13 }}>{t('plans.daily.note')}</Text>
                <TextArea
                    rows={3}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder={t('plans.daily.notePlaceholder')}
                    style={{ marginTop: 6 }}
                />
            </div>

            {/* Log history */}
            <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8' }}>
                {t('plans.daily.history')}
            </Divider>

            {loadingLogs ? (
                <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
            ) : logs.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '8px 0' }}>
                    {t('plans.daily.noHistory')}
                </div>
            ) : (
                <List
                    size="small"
                    dataSource={logs}
                    renderItem={(log: DailyLog) => {
                        const isToday = dayjs(log.logDate).format('YYYY-MM-DD') === today;
                        const pct = log.progressPct;
                        const color = pct >= 100 ? 'success' : pct >= 60 ? 'processing' : pct >= 30 ? 'warning' : 'default';
                        return (
                            <List.Item style={{ padding: '6px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%' }}>
                                    <Text style={{ fontSize: 12, color: '#64748b', minWidth: 70 }}>
                                        {dayjs(log.logDate).format('DD/MM')}
                                        {isToday && <Tag color="red" style={{ marginLeft: 4, fontSize: 10 }}>Hôm nay</Tag>}
                                    </Text>
                                    <Tag color={color} style={{ minWidth: 48, textAlign: 'center' }}>{pct}%</Tag>
                                    <Text style={{ fontSize: 12, color: '#475569', flex: 1 }}>{log.note || '-'}</Text>
                                </div>
                            </List.Item>
                        );
                    }}
                    style={{ maxHeight: 200, overflowY: 'auto' }}
                />
            )}
        </Modal>
    );
};

export default DailyLogModal;
