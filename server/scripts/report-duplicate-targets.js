#!/usr/bin/env node
/**
 * VCM XDDD — Báo cáo chỉ tiêu trùng
 *
 * CHỈ ĐỌC. Không INSERT/UPDATE/DELETE gì cả nên chạy được trên production.
 *
 *   node scripts/report-duplicate-targets.js
 *
 * Nhóm theo khoá nghiệp vụ **đã chuẩn hoá**: type + period_type + period +
 * unit_type + unit_id. Bắt buộc phải chuẩn hoá trước khi so, vì dữ liệu di cư từ
 * Google Sheets có `period` dạng '2026.0', 'Năm 2026', hoặc **rỗng** — ba dòng đó
 * khác nhau ở cột thô nhưng trang Chỉ tiêu hiển thị chúng là **cùng một chỉ tiêu**.
 * Nhóm theo cột thô sẽ báo "không có gì trùng" trong khi giao diện đang chồng dòng.
 *
 * Trang Chỉ tiêu dựng mỗi kỳ đúng một hàng bằng .find() nên dòng trùng không bao
 * giờ lộ ra trên giao diện — phải chạy script này mới thấy.
 *
 * Chạy trước khi áp migrate-target-allocation.js.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const { normalizeTargetRow, targetKey, pickWinner, needsNormalizing } = require('../src/routes/_targetNormalize');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'vcm_xddd',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

(async () => {
    const { rows } = await pool.query(
        `SELECT id, name, type, period_type, period, unit_type, unit_id, target_value, created_at
         FROM targets
         ORDER BY created_at DESC, id DESC`
    );

    console.log(`DB: ${process.env.DB_NAME || 'vcm_xddd'} @ ${process.env.DB_HOST || 'localhost'}`);
    console.log(`Tổng số chỉ tiêu: ${rows.length}\n`);

    // Nhóm theo khoá đã chuẩn hoá. rows đã sắp DESC nên phần tử đầu mỗi nhóm là
    // dòng "mới nhất" — đúng dòng mà migration sẽ giữ lại.
    const groups = new Map();
    const dirty = [];
    for (const r of rows) {
        const norm = normalizeTargetRow(r);
        const key = targetKey(norm);
        if (!groups.has(key)) groups.set(key, { norm, rows: [] });
        groups.get(key).rows.push(r);

        // Dòng có giá trị thô khác giá trị đã chuẩn hoá → sẽ được migration ghi lại
        if (needsNormalizing(r)) dirty.push({ r, norm });
    }

    const dups = [...groups.values()].filter(g => g.rows.length > 1);

    // ── Phần 1: dòng cần chuẩn hoá ──────────────────────────────────────────
    if (dirty.length > 0) {
        console.log(`${dirty.length} dòng có giá trị thô lệch so với giá trị đang hiển thị:\n`);
        for (const { r, norm } of dirty) {
            const before = `type='${r.type}' period_type='${r.period_type}' period='${r.period}'`;
            const after = `type='${norm.type}' period_type='${norm.periodType}' period='${norm.period}'`;
            console.log(`  ${r.id}`);
            console.log(`      thô:       ${before}`);
            console.log(`      hiển thị:  ${after}`);
            if (!String(r.period || '').trim() && norm.periodType === 'YEAR') {
                console.log(`      ⚠ period rỗng → gán năm hiện tại. Dòng này TỰ NHẢY SANG NĂM SAU.`);
            }
        }
        console.log('');
    }

    // ── Phần 2: nhóm trùng ──────────────────────────────────────────────────
    if (dups.length === 0) {
        console.log('Không có nhóm trùng nào sau chuẩn hoá.');
    } else {
        let thuaTong = 0, nhomThang = 0, thuaThang = 0;
        console.log(`Tìm thấy ${dups.length} nhóm trùng:\n`);
        for (const g of dups) {
            const thua = g.rows.length - 1;
            thuaTong += thua;
            const laThang = g.norm.periodType === 'MONTH';
            if (laThang) { nhomThang++; thuaThang += thua; }

            const scope = g.norm.isGeneral ? 'GENERAL' : `BRANCH ${g.norm.unitId}`;
            const winner = pickWinner(g.rows);
            console.log(`  ${g.norm.type} / ${g.norm.periodType} / ${g.norm.period} / ${scope} — ${g.rows.length} dòng${laThang ? '  [THÁNG]' : ''}`);
            g.rows.forEach(r => {
                const act = r.id === winner.id ? 'GIỮ ' : 'XOÁ ';
                console.log(`      ${act} ${r.id}  giá trị=${r.target_value}  period thô='${r.period}'  tạo lúc ${new Date(r.created_at).toISOString()}`);
            });
            const others = g.rows.filter(r => r.id !== winner.id).map(r => r.target_value);
            if (others.some(v => parseFloat(v) !== parseFloat(winner.target_value))) {
                console.log(`      → giữ giá trị ${winner.target_value}, bỏ ${others.join(', ')}`);
            }
            console.log('');
        }

        console.log('─'.repeat(70));
        console.log(`Số dòng sẽ bị xoá nếu áp migration: ${thuaTong}`);
        console.log(`Riêng chỉ tiêu THÁNG: ${nhomThang} nhóm, ${thuaThang} dòng thừa`);
        if (thuaThang > 0) {
            console.log('\n⚠ Chỉ tiêu tháng bị trùng là nhóm nguy hiểm nhất: cơ chế tự phân bổ');
            console.log('  cộng tổng các tháng, còn dòng trùng thì cộng đôi. Phải dọn trước.');
        }
        console.log('\nDòng "GIỮ" chọn theo thứ tự: created_at mới nhất → dòng không cần');
        console.log('chuẩn hoá (là dòng giao diện đang hiển thị) → id lớn nhất. Đúng dòng mà');
        console.log('migrate-target-allocation.js sẽ giữ. Rà lại trước khi chạy migration.');
    }

    await pool.end();
})().catch(e => {
    console.error('FAILED:', e.message);
    process.exit(1);
});
