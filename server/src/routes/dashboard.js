/**
 * Dashboard Routes — GET /dashboard/stats, /branch-performance, /general-performance
 * Port of getDashboardStats from Code.gs — SQL aggregation replaces array loops
 */
const router = require('express').Router();
const { query } = require('../config/database');
const CacheService = require('../services/cacheService');
const { loadTargetIndex, getGeneralTarget, listTargets } = require('./_targetLookup');

// GET /dashboard/stats
router.get('/stats', async (req, res, next) => {
  try {
    const { forceRefresh, targetDate, viewMode } = req.query;
    const cacheKey = `DASHBOARD_STATS_${targetDate || 'now'}_MODE_${viewMode || 'MONTH'}`;

    if (forceRefresh === 'true') CacheService.clear([cacheKey]);

    const data = await CacheService.getOrSet(cacheKey, async () => {
      const now = targetDate ? new Date(targetDate) : new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      
      const bizYear = viewMode === 'ALL' ? null : year;
      const bizMonth = (viewMode === 'ALL' || viewMode === 'YEAR') ? null : month;

      // KPI: Nguồn việc MTD (contracts signed this month)
      const nvMtd = await query(`
        SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as total
        FROM contracts WHERE EXTRACT(YEAR FROM start_date) = $1 AND EXTRACT(MONTH FROM start_date) = $2
      `, [year, month]);

      // KPI: Nguồn việc YTD
      const nvYtd = await query(`
        SELECT COUNT(*) as count, COALESCE(SUM(value), 0) as total
        FROM contracts WHERE EXTRACT(YEAR FROM start_date) = $1
      `, [year]);

      // KPI: Doanh thu YTD (invoice values)
      const dtYtd = await query(`
        SELECT COALESCE(SUM(value), 0) as total
        FROM invoices WHERE EXTRACT(YEAR FROM issued_date) = $1
      `, [year]);

      // KPI: Doanh thu MTD
      const dtMtd = await query(`
        SELECT COALESCE(SUM(value), 0) as total
        FROM invoices WHERE EXTRACT(YEAR FROM issued_date) = $1 AND EXTRACT(MONTH FROM issued_date) = $2
      `, [year, month]);

      // KPI: Thu tiền YTD.
      // Quy về issued_date vì bảng invoices không có cột ngày thu tiền: con số này là
      // "đã thu được bao nhiêu trên các hoá đơn PHÁT HÀNH trong kỳ", không phải dòng
      // tiền thực tế của kỳ đó.
      const ttYtd = await query(`
        SELECT COALESCE(SUM(payment), 0) as total
        FROM invoices WHERE EXTRACT(YEAR FROM issued_date) = $1
      `, [year]);

      // KPI: Thu tiền MTD
      const ttMtd = await query(`
        SELECT COALESCE(SUM(payment), 0) as total
        FROM invoices WHERE EXTRACT(YEAR FROM issued_date) = $1 AND EXTRACT(MONTH FROM issued_date) = $2
      `, [year, month]);

      // KPI: Dự án stats
      const projStats = await query(`
        SELECT status, COUNT(*) as cnt FROM projects GROUP BY status
      `);

      // Phải cộng dồn: GROUP BY status sinh một nhóm cho mỗi giá trị status khác
      // nhau, mà projects.status là VARCHAR nullable không CHECK constraint. Gán (=)
      // khiến nhóm sau xoá nhóm trước — 'INPROCESS' và 'IN_PROGRESS' cùng tồn tại,
      // và nhánh else gom cả 'TODO'/'PENDING'/NULL nên chạy nhiều lần.
      const projectExecution = { total: 0, done: 0, inProgress: 0, waiting: 0 };
      projStats.rows.forEach(r => {
        const count = parseInt(r.cnt);
        projectExecution.total += count;
        if (r.status === 'DONE') projectExecution.done += count;
        else if (r.status === 'INPROCESS' || r.status === 'IN_PROGRESS') projectExecution.inProgress += count;
        else projectExecution.waiting += count;
      });

      // ── Chỉ tiêu ──────────────────────────────────────────────────────────
      // Đọc cả bảng targets một lần rồi tra trên khoá đã CHUẨN HOÁ, thay cho các
      // query SQL thô trước đây. Hai lý do, đều đã thành lỗi thật:
      //   1. `period LIKE '%2026%'` + `period_type LIKE '%YEAR%'` bỏ sót dòng di
      //      cư từ GAS (period_type='Năm', period='2026.0' hay rỗng) — trong khi
      //      trang Chỉ tiêu chuẩn hoá lúc đọc nên vẫn hiện chúng. Hai màn hình ra
      //      hai số cho cùng một chỉ tiêu.
      //   2. `LIMIT 1` không `ORDER BY`: kỳ nào có hai dòng thì Postgres trả dòng
      //      nào là tuỳ ý. DB local có đúng ca đó — NGUON_VIEC/YEAR/2026 vừa có
      //      t-001=500 vừa có t-008=100.
      // Quy tắc chọn dòng thắng nằm ở _targetNormalize.js:pickWinner.
      const targetIndex = await loadTargetIndex();
      const yearStr = String(year);
      const currentMonthStr = `${year}-${String(month).padStart(2, '0')}`; // vd "2026-03"

      const nvTargetVal = getGeneralTarget(targetIndex, 'NGUON_VIEC', 'YEAR', yearStr);
      const dtTargetVal = getGeneralTarget(targetIndex, 'DOANH_THU', 'YEAR', yearStr);
      const nvTargetMtdVal = getGeneralTarget(targetIndex, 'NGUON_VIEC', 'MONTH', currentMonthStr);
      const dtTargetMtdVal = getGeneralTarget(targetIndex, 'DOANH_THU', 'MONTH', currentMonthStr);

      // Card Thu tiền không đọc bảng targets — chỉ tiêu của nó là doanh thu thực
      // trong kỳ, tính ở chỗ dựng response bên dưới. Dòng type='THU_TIEN' còn sót
      // trong DB (dữ liệu GAS cũ) vì thế không được dùng ở đây.

      // All values in triệu (millions) — round to 2 decimals for consistency
      const round2 = (v) => Math.round(v * 100) / 100;

      // Tỷ lệ đạt (%) — một chữ số thập phân, dùng chung cho cả ba thẻ KPI.
      // Frontend đổ achievedPct (tháng) và yearPct (năm) vào cùng một ô tuỳ viewMode,
      // nên hai giá trị phải cùng độ chính xác, nếu không ô đó lúc "88.7%" lúc "71%".
      // parseFloat vì target_value là NUMERIC → node-postgres trả về chuỗi.
      const pct1 = (actual, target) => {
        const t = parseFloat(target) || 0;
        return t > 0 ? Math.round((actual / t) * 1000) / 10 : 0;
      };
      const nvActual = round2(parseFloat(nvYtd.rows[0].total) / 1000000);
      const dtActual = round2(parseFloat(dtYtd.rows[0].total) / 1000000);
      const ttActual = round2(parseFloat(ttYtd.rows[0].total) / 1000000);

      const nvMtdVal = round2(parseFloat(nvMtd.rows[0].total) / 1000000);
      const dtMtdValActual = round2(parseFloat(dtMtd.rows[0].total) / 1000000);
      const ttMtdValActual = round2(parseFloat(ttMtd.rows[0].total) / 1000000);

      // Monthly trend: nguồn việc
      const nvTrend = await query(`
        SELECT EXTRACT(MONTH FROM start_date)::int as m, COALESCE(SUM(value)/1000000, 0) as actual
        FROM contracts WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM start_date) = $1)
        GROUP BY m ORDER BY m
      `, [bizYear]);

      // Monthly trend: doanh thu
      const dtTrend = await query(`
        SELECT EXTRACT(MONTH FROM issued_date)::int as m, COALESCE(SUM(value)/1000000, 0) as actual
        FROM invoices WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM issued_date) = $1)
        GROUP BY m ORDER BY m
      `, [bizYear]);

      // Chỉ tiêu tháng cho đường "kế hoạch" của biểu đồ trend.
      // Vẫn cộng dồn vì chế độ ALL (bizYear = null) gộp mọi năm vào 12 ô tháng —
      // đó là chủ ý. Cái phải tránh là cộng đôi hai dòng TRÙNG trong cùng một kỳ,
      // và loadTargetIndex đã khử trùng trước khi tới đây.
      const monthTargetMap = (type) => {
        const map = {};
        for (const t of listTargets(targetIndex, {
          type, periodType: 'MONTH', isGeneral: true, year: bizYear,
        })) {
          const m = parseInt(t.norm.period.split('-')[1], 10);
          // period bẩn cho ra NaN, để lọt sẽ tạo key "NaN" trong map
          if (m >= 1 && m <= 12) map[m] = (map[m] || 0) + t.value;
        }
        return map;
      };

      // Build trend arrays
      const nvTrendMap = {};
      nvTrend.rows.forEach(r => { nvTrendMap[r.m] = parseFloat(r.actual); });
      const nvMonthTargetMap = monthTargetMap('NGUON_VIEC');

      const dtTrendMap = {};
      dtTrend.rows.forEach(r => { dtTrendMap[r.m] = parseFloat(r.actual); });
      const dtMonthTargetMap = monthTargetMap('DOANH_THU');

      const nguonViecTrend = [];
      const doanhThuTrend = [];
      for (let m = 1; m <= 12; m++) {
        nguonViecTrend.push({ month: `T${m}`, actual: nvTrendMap[m] || 0, plan: nvMonthTargetMap[m] || 0 });
        doanhThuTrend.push({ month: `T${m}`, actual: dtTrendMap[m] || 0, plan: dtMonthTargetMap[m] || 0 });
      }

      // Branch breakdown — Doanh thu (Revenue from invoices, not contracts)
      const branchBreak = await query(`
        SELECT c.branch_id, b.code as branch_code, b.name as branch_name,
          COALESCE(SUM(i.value)/1000000, 0) as actual
        FROM invoices i
        LEFT JOIN contracts c ON i.contract_id = c.id
        LEFT JOIN branches b ON c.branch_id = b.id
        WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM i.issued_date) = $1)
        GROUP BY c.branch_id, b.code, b.name
        ORDER BY actual DESC
      `, [bizYear]);

      // Danh bạ chi nhánh — dùng cho cả việc quy unit_id của targets về mã chi
      // nhánh lẫn việc tra tên cho mã chỉ có trong targets mà không có doanh thu.
      // targets.unit_id khi thì là id, khi thì là code, nên map cả hai chiều.
      const allBranches = await query('SELECT id, code, name FROM branches ORDER BY code');
      const branchCodeByKey = {};
      const branchInfoMap = {};
      allBranches.rows.forEach(b => {
        if (b.id) branchCodeByKey[b.id] = b.code;
        if (b.code) {
          branchCodeByKey[b.code] = b.code;
          branchCodeByKey[b.code.toUpperCase()] = b.code;
          branchInfoMap[b.code] = b.name;
        }
      });

      // Build maps
      const branchActualMap = {};
      branchBreak.rows.forEach(r => {
        branchActualMap[r.branch_code] = {
          branchCode: r.branch_code || '',
          branchName: r.branch_name || '',
          actual: parseFloat(r.actual),
        };
      });

      // Chỉ tiêu DOANH_THU theo chi nhánh, lấy từ index đã chuẩn hoá + khử trùng.
      // Chỉ tiêu chi nhánh vốn đã tính bằng triệu, normalizeTargetValue không quy
      // đổi cho nhánh BRANCH nên giá trị giữ nguyên.
      const branchTargetMap = {};
      for (const t of listTargets(targetIndex, {
        type: 'DOANH_THU', periodType: 'YEAR', isGeneral: false, year: bizYear,
      })) {
        const raw = t.norm.unitId;
        if (!raw) continue;
        const code = branchCodeByKey[raw] || branchCodeByKey[raw.toUpperCase()] || raw;
        branchTargetMap[code] = (branchTargetMap[code] || 0) + t.value;
      }

      // Merge: all branches with actuals OR targets
      const allBranchCodes = new Set([
        ...Object.keys(branchActualMap),
        ...Object.keys(branchTargetMap),
      ]);

      const branchBreakdown = Array.from(allBranchCodes)
        .filter(code => code) // skip empty
        .map(code => ({
          branchCode: code,
          branchName: branchActualMap[code]?.branchName || branchInfoMap[code] || code,
          actual: branchActualMap[code]?.actual || 0,
          actualDT: branchActualMap[code]?.actual || 0,
          planDT: branchTargetMap[code] || 0,
        }))
        .sort((a, b) => (b.planDT + b.actualDT) - (a.planDT + a.actualDT));

      // Business structure — 3-Chart System (Nguồn Việc, Doanh Thu, Thu Tiền)
      const [swQuery, revQuery, payQuery] = await Promise.all([
        query(`
          SELECT UPPER(COALESCE(NULLIF(business_field, ''), 'OTHER')) as field, COALESCE(SUM(value), 0) as total_val
          FROM contracts
          WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM start_date) = $1)
            AND ($2::int IS NULL OR EXTRACT(MONTH FROM start_date) = $2)
          GROUP BY field
        `, [bizYear, bizMonth]),
        query(`
          SELECT UPPER(COALESCE(NULLIF(c.business_field, ''), 'OTHER')) as field, COALESCE(SUM(i.value), 0) as total_val
          FROM invoices i
          LEFT JOIN contracts c ON i.contract_id = c.id
          WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM i.issued_date) = $1)
            AND ($2::int IS NULL OR EXTRACT(MONTH FROM i.issued_date) = $2)
          GROUP BY field
        `, [bizYear, bizMonth]),
        query(`
          SELECT UPPER(COALESCE(NULLIF(c.business_field, ''), 'OTHER')) as field, COALESCE(SUM(i.payment), 0) as total_val
          FROM invoices i
          LEFT JOIN contracts c ON i.contract_id = c.id
          WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM i.issued_date) = $1)
            AND ($2::int IS NULL OR EXTRACT(MONTH FROM i.issued_date) = $2)
          GROUP BY field
        `, [bizYear, bizMonth])
      ]);

      const formatBizStruct = (qResult) => {
        let b2bTotal = 0; let b2cTotal = 0;
        (qResult?.rows || []).forEach(r => {
          const val = parseFloat(r.total_val) || 0;
          if (r.field === 'B2B') b2bTotal += val;
          else if (r.field === 'B2C') b2cTotal += val;
        });
        const total = (b2bTotal + b2cTotal) || 1;
        return [
          { field: 'B2B', value: b2bTotal, percent: Math.round((b2bTotal / total) * 100) },
          { field: 'B2C', value: b2cTotal, percent: Math.round((b2cTotal / total) * 100) }
        ];
      };

      const businessStructure = {
        sourceWork: formatBizStruct(swQuery),
        revenue: formatBizStruct(revQuery),
        payment: formatBizStruct(payQuery)
      };

      // Previous month for MoM calculation
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const nvPrevMonth = await query(`
        SELECT COALESCE(SUM(value)/1000000, 0) as total
        FROM contracts WHERE EXTRACT(YEAR FROM start_date) = $1 AND EXTRACT(MONTH FROM start_date) = $2
      `, [prevYear, prevMonth]);

      const dtPrevMonth = await query(`
        SELECT COALESCE(SUM(value)/1000000, 0) as total
        FROM invoices WHERE EXTRACT(YEAR FROM issued_date) = $1 AND EXTRACT(MONTH FROM issued_date) = $2
      `, [prevYear, prevMonth]);

      const ttPrevMonth = await query(`
        SELECT COALESCE(SUM(payment)/1000000, 0) as total
        FROM invoices WHERE EXTRACT(YEAR FROM issued_date) = $1 AND EXTRACT(MONTH FROM issued_date) = $2
      `, [prevYear, prevMonth]);

      // All-time totals.
      // Loại bản ghi thiếu ngày: mọi query theo năm/tháng dùng EXTRACT(... FROM cột),
      // mà EXTRACT của NULL cho NULL nên bản ghi đó rơi khỏi hết các kỳ. Nếu ở đây
      // không lọc, nó vẫn cộng vào all-time và tổng các năm sẽ không bao giờ bằng
      // tổng "Tất cả" — chênh đúng bằng phần dữ liệu mồ côi, không có cảnh báo nào.
      const nvAllTime = await query(`SELECT COALESCE(SUM(value)/1000000, 0) as total FROM contracts WHERE start_date IS NOT NULL`);
      const dtAllTime = await query(`SELECT COALESCE(SUM(value)/1000000, 0) as total FROM invoices WHERE issued_date IS NOT NULL`);
      const ttAllTime = await query(`SELECT COALESCE(SUM(payment)/1000000, 0) as total FROM invoices WHERE issued_date IS NOT NULL`);

      const nvMom = Math.round((nvMtdVal - parseFloat(nvPrevMonth.rows[0].total)) * 100) / 100;
      const dtMom = Math.round((dtMtdValActual - parseFloat(dtPrevMonth.rows[0].total)) * 100) / 100;
      const ttMom = Math.round((ttMtdValActual - parseFloat(ttPrevMonth.rows[0].total)) * 100) / 100;

      // Không đọc bảng activities ở đây: /api/activities đã bị giới hạn cho ADMIN,
      // mà /api/dashboard mount trần nên trả nhật ký hệ thống (kèm email) ra đây
      // là đường vòng qua giới hạn đó. Frontend cũng không render dữ liệu này.

      // Sales Pipeline B2B
      const pipelineB2BQuery = await query(`
        SELECT UPPER(status) as stage, COUNT(id) as cnt, COALESCE(SUM(estimated_value), 0) as total_val
        FROM prospects
        WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM created_at) = $1)
          AND ($2::int IS NULL OR EXTRACT(MONTH FROM created_at) = $2)
          AND COALESCE(prospect_type, 'B2B') = 'B2B'
        GROUP BY stage
      `, [bizYear, bizMonth]);

      // Sales Pipeline B2C
      const pipelineB2CQuery = await query(`
        SELECT UPPER(status) as stage, COUNT(id) as cnt, COALESCE(SUM(estimated_value), 0) as total_val
        FROM prospects
        WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM created_at) = $1)
          AND ($2::int IS NULL OR EXTRACT(MONTH FROM created_at) = $2)
          AND prospect_type = 'B2C'
        GROUP BY stage
      `, [bizYear, bizMonth]);

      const prospectStages = ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION', 'WON'];

      const b2bMap = {};
      (pipelineB2BQuery?.rows || []).forEach(r => {
        b2bMap[r.stage] = { count: parseInt(r.cnt) || 0, value: parseFloat(r.total_val) || 0 };
      });
      const pipelineData = prospectStages.map(st => ({
        stage: st, count: b2bMap[st]?.count || 0, value: b2bMap[st]?.value || 0
      }));

      const b2cMap = {};
      (pipelineB2CQuery?.rows || []).forEach(r => {
        b2cMap[r.stage] = { count: parseInt(r.cnt) || 0, value: parseFloat(r.total_val) || 0 };
      });
      const pipelineDataB2C = prospectStages.map(st => ({
        stage: st, count: b2cMap[st]?.count || 0, value: b2cMap[st]?.value || 0
      }));

      return {
        success: true,
        data: {
          kpi: {
            nguonViec: {
              value: round2(nvMtdVal),
              valueYTD: round2(nvActual),
              valueAllTime: round2(parseFloat(nvAllTime.rows[0].total)),
              achievedPct: pct1(nvMtdVal, nvTargetMtdVal),
              target: parseFloat(nvTargetMtdVal),
              targetYTD: parseFloat(nvTargetVal),
              yearPct: pct1(nvActual, nvTargetVal),
              mom: nvMom,
            },
            doanhThu: {
              value: round2(dtMtdValActual),
              valueYTD: round2(dtActual),
              valueAllTime: round2(parseFloat(dtAllTime.rows[0].total)),
              valueSuffix: 'Tr',
              achievedPct: pct1(dtMtdValActual, dtTargetMtdVal),
              target: parseFloat(dtTargetMtdVal),
              targetYTD: parseFloat(dtTargetVal),
              yearPct: pct1(dtActual, dtTargetVal),
              mom: dtMom,
            },
            // Thu tiền KHÔNG lấy chỉ tiêu từ bảng targets. Chỉ tiêu của nó là
            // doanh thu THỰC trong kỳ — tức tổng giá trị hoá đơn đã phát hành —
            // còn số thực hiện là phần chủ đầu tư đã thanh toán trên chính những
            // hoá đơn đó (invoices.payment). Nên tỷ lệ ở đây là TỶ LỆ THU HỒI
            // CÔNG NỢ, không phải mức hoàn thành một chỉ tiêu do người dùng nhập.
            // Hai vế cùng lọc theo issued_date nên luôn so trên cùng một tập hoá
            // đơn; invoices không có cột ngày thu tiền để làm khác đi.
            thuTien: {
              value: round2(ttMtdValActual),
              valueYTD: round2(ttActual),
              valueAllTime: round2(parseFloat(ttAllTime.rows[0].total)),
              target: dtMtdValActual,
              targetYTD: dtActual,
              achievedPct: pct1(ttMtdValActual, dtMtdValActual),
              yearPct: pct1(ttActual, dtActual),
              mom: ttMom,
            },
            duAn: { ...projectExecution, delayed: 0 },
          },
          nguonViecTrend,
          doanhThuTrend,
          branchBreakdown,
          businessStructure,
          projectExecution: { ...projectExecution, delayed: 0 },
          pipelineData,
          pipelineDataB2C,
          totalContracts: parseInt(nvYtd.rows[0].count),
          totalValue: parseFloat(nvYtd.rows[0].total),
          VERSION: require('../../package.json').version || '1.0.0',
        }
      };
    }, CacheService.TTL.SHORT);

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /dashboard/branch-performance
router.get('/branch-performance', async (req, res, next) => {
  try {
    const { year } = req.query;
    const y = year || new Date().getFullYear();

    const branches = await query('SELECT id, name, code FROM branches');
    const result = {};

    for (const b of branches.rows) {
      const nvByMonth = await query(`
        SELECT EXTRACT(MONTH FROM start_date)::int as m, COALESCE(SUM(value)/1000000, 0) as total
        FROM contracts WHERE branch_id = $1 AND EXTRACT(YEAR FROM start_date) = $2
        GROUP BY m
      `, [b.id, y]);

      const dtByMonth = await query(`
        SELECT EXTRACT(MONTH FROM i.issued_date)::int as m, COALESCE(SUM(i.value)/1000000, 0) as total
        FROM invoices i JOIN contracts c ON i.contract_id = c.id
        WHERE c.branch_id = $1 AND EXTRACT(YEAR FROM i.issued_date) = $2
        GROUP BY m
      `, [b.id, y]);

      // All values in triệu — round to 2 decimals for consistency
      const round2 = (v) => Math.round(v * 100) / 100;
      const sourceWork = { total: 0, months: {} };
      nvByMonth.rows.forEach(r => { const v = parseFloat(r.total); sourceWork.months[r.m] = round2(v); sourceWork.total += v; });
      sourceWork.total = round2(sourceWork.total);

      const revenue = { total: 0, months: {} };
      dtByMonth.rows.forEach(r => { const v = parseFloat(r.total); revenue.months[r.m] = round2(v); revenue.total += v; });
      revenue.total = round2(revenue.total);

      result[b.id] = { id: b.id, name: b.name, code: b.code, sourceWork, revenue };
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// GET /dashboard/general-performance
router.get('/general-performance', async (req, res, next) => {
  try {
    const { year } = req.query;
    const y = year || new Date().getFullYear();

    const nvByMonth = await query(`
      SELECT EXTRACT(MONTH FROM start_date)::int as m, COALESCE(SUM(value)/1000000, 0) as total
      FROM contracts WHERE EXTRACT(YEAR FROM start_date) = $1 GROUP BY m
    `, [y]);

    const dtByMonth = await query(`
      SELECT EXTRACT(MONTH FROM issued_date)::int as m, COALESCE(SUM(value)/1000000, 0) as total
      FROM invoices WHERE EXTRACT(YEAR FROM issued_date) = $1 GROUP BY m
    `, [y]);

    // All values in triệu (millions) — round to 2 decimals for consistency with calcActualValue
    const round2 = (v) => Math.round(v * 100) / 100;
    const buildPerf = (rows) => {
      const months = {}; const quarters = { 1: 0, 2: 0, 3: 0, 4: 0 }; let yearTotal = 0;
      rows.forEach(r => {
        const m = r.m; const v = parseFloat(r.total);
        months[m] = round2(v); quarters[Math.ceil(m / 3)] += v; yearTotal += v;
      });
      // Round quarters and year total to 2 decimal places
      for (const q of [1,2,3,4]) quarters[q] = round2(quarters[q]);
      return { year: round2(yearTotal), quarters, months };
    };

    res.json({
      success: true,
      data: {
        nguonViec: buildPerf(nvByMonth.rows),
        doanhThu: buildPerf(dtByMonth.rows),
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
