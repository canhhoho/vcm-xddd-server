import React from 'react';
import { Modal, Divider } from 'antd';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
} from '@ant-design/icons';

interface Props {
    open: boolean;
    onClose: () => void;
}

const W_ITEMS = [
    {
        key: 'WHAT',
        label: 'Nội dung (What)',
        color: '#fff1f0',
        border: '#ffa39e',
        accent: '#cf1322',
        desc: 'Mô tả hành động cụ thể, đo lường được — không dùng từ mơ hồ.',
        engDesc: 'Describe specific, measurable actions — avoid vague terms.',
        good: 'Gọi 10 khách hàng tiềm năng mỗi ngày trong tuần',
        bad: 'Làm việc chăm chỉ hơn',
    },
    {
        key: 'WHY',
        label: 'Mục đích (Why)',
        color: '#fff7e6',
        border: '#ffd591',
        accent: '#d46b08',
        desc: 'Lý do thực hiện — kết nối trực tiếp với KPI hoặc mục tiêu phòng ban.',
        engDesc: 'The reason behind the task — link directly to team KPI or company goals.',
        good: 'Đạt chỉ tiêu doanh số Q2: 500 triệu',
        bad: 'Vì sếp yêu cầu',
    },
    {
        key: 'WHO',
        label: 'Phụ trách (Who)',
        color: '#fffbe6',
        border: '#ffe58f',
        accent: '#d48806',
        desc: 'Tên người chịu trách nhiệm chính — cụ thể, không để chung chung.',
        engDesc: 'The specific person responsible — name and role, not just a team.',
        good: 'Nguyễn Văn A – trưởng nhóm BD',
        bad: 'Nhóm BD',
    },
    {
        key: 'WHEN',
        label: 'Thời gian (When)',
        color: '#f6ffed',
        border: '#b7eb8f',
        accent: '#389e0d',
        desc: 'Ngày bắt đầu và deadline rõ ràng.',
        engDesc: 'Clear start date and deadline — no open-ended timelines.',
        good: '01/04 – 05/04/2025',
        bad: 'Tuần này',
    },
    {
        key: 'WHERE',
        label: 'Địa điểm (Where)',
        color: '#e6f7ff',
        border: '#91d5ff',
        accent: '#096dd9',
        desc: 'Địa điểm hoặc kênh thực hiện công việc.',
        engDesc: 'The location or channel where the task is carried out.',
        good: 'Văn phòng, gọi điện thoại, Zoom',
        bad: 'Online',
    },
    {
        key: 'HOW',
        label: 'Phương pháp (How)',
        color: '#f9f0ff',
        border: '#d3adf7',
        accent: '#531dab',
        desc: 'Công cụ, quy trình hoặc cách thức thực hiện cụ thể.',
        engDesc: 'The specific tools, process, or method used to execute the task.',
        good: 'Script telesale mới + theo dõi trên CRM',
        bad: 'Gọi điện',
    },
];

const SMART_ITEMS = [
    { letter: 'S', name: 'Specific', viName: 'Cụ thể', desc: 'Rõ số liệu — không dùng từ "cải thiện", "tăng cường"' },
    { letter: 'M', name: 'Measurable', viName: 'Đo lường được', desc: 'Có chỉ số để đánh giá hoàn thành' },
    { letter: 'A', name: 'Achievable', viName: 'Khả thi', desc: 'Thực tế với nguồn lực và thời gian hiện có' },
    { letter: 'R', name: 'Relevant', viName: 'Liên quan', desc: 'Gắn với mục tiêu công ty hoặc phòng ban' },
    { letter: 'T', name: 'Time-bound', viName: 'Có thời hạn', desc: 'Deadline cụ thể, không để ngỏ' },
];

const PlanGuideModal: React.FC<Props> = ({ open, onClose }) => (
    <Modal
        title="Hướng dẫn lập kế hoạch 5W1H"
        open={open}
        onCancel={onClose}
        footer={null}
        width={700}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto', padding: '16px 24px' } }}
    >
        <p style={{ color: '#64748b', marginBottom: 16, fontSize: 13 }}>
            Mỗi đầu việc phải trả lời đủ 6 câu hỏi sau. Kế hoạch càng cụ thể, càng dễ thực hiện và đánh giá.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {W_ITEMS.map(item => (
                <div key={item.key} style={{
                    background: item.color,
                    border: `1px solid ${item.border}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: item.accent }}>{item.key}</span>
                        <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>{item.label}</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#374151', margin: '0 0 2px', lineHeight: 1.5 }}>{item.desc}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 6px', lineHeight: 1.4, fontStyle: 'italic' }}>{item.engDesc}</p>
                    <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ color: '#15803d' }}>
                            <CheckCircleOutlined style={{ marginRight: 4 }} />
                            {item.good}
                        </span>
                        <span style={{ color: '#b91c1c' }}>
                            <CloseCircleOutlined style={{ marginRight: 4 }} />
                            {item.bad}
                        </span>
                    </div>
                </div>
            ))}
        </div>

        <Divider style={{ margin: '16px 0' }} />

        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px' }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: '#1d4ed8', margin: '0 0 10px' }}>
                Mục tiêu phải đạt chuẩn SMART
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
                            <span style={{ color: '#475569' }}> — {s.desc}</span>
                        </span>
                    </div>
                ))}
            </div>
            <div style={{
                marginTop: 10, padding: '8px 10px', background: '#fff',
                borderRadius: 6, border: '1px solid #bfdbfe', fontSize: 12, color: '#374151',
            }}>
                <strong>Ví dụ SMART:</strong>{' '}
                "Tăng doanh số từ 300tr → 500tr trong tháng 04/2025 bằng cách gọi 10 KH/ngày + demo sản phẩm 2 lần/tuần"
            </div>
        </div>
    </Modal>
);

export default PlanGuideModal;
