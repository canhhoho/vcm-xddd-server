/**
 * Dashboard Routes — GET /dashboard/stats, /branch-performance, /general-performance
 * Port of getDashboardStats from Code.gs — SQL aggregation replaces array loops
 */
const router = require('express').Router();
const { query } = require('../config/database');
const CacheService = require('../services/cacheService');

// GET /dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    const { forceRefresh, targetDate } = req.query;
    const cacheKey = `DASHBOARD_STATS_${targetDate || 'now'}`;

    if (forceRefresh === 'true') CacheService.clear([cacheKey]);

    const data = await CacheService.getOrSet(cacheKey, async () => {
      const now = targetDate ? new Date(targetDate) : new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

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

      // KPI: Thu tiền YTD (paid invoices)
      const ttYtd = await query(`
        SELECT COALESCE(SUM(payment), 0) as total
        FROM invoices WHERE payment > 0 AND EXTRACT(YEAR FROM issued_date) = $1
      `, [year]);

      // KPI: Thu tiền MTD
      const ttMtd = await query(`
        SELECT COALESCE(SUM(payment), 0) as total
        FROM invoices WHERE payment > 0 AND EXTRACT(YEAR FROM issued_date) = $1 AND EXTRACT(MONTH FROM issued_date) = $2
      `, [year, month]);

      // KPI: Dự án stats
      const projStats = await query(`
        SELECT status, COUNT(*) as cnt FROM projects GROUP BY status
      `);

      const projectExecution = { total: 0, done: 0, inProgress: 0, waiting: 0 };
      projStats.rows.forEach(r => {
        const count = parseInt(r.cnt);
        projectExecution.total += count;
        if (r.status === 'DONE') projectExecution.done = count;
        else if (r.status === 'INPROCESS' || r.status === 'IN_PROGRESS') projectExecution.inProgress = count;
        else projectExecution.waiting = count;
      });

      // Nguồn việc target (Yearly)
      const nvTarget = await query(`
        SELECT COALESCE(target_value, 0) as tv FROM targets
        WHERE (type = 'NGUON_VIEC' OR type ILIKE '%NGUON%' OR type ILIKE '%NGUỒN%') AND period_type LIKE '%YEAR%' AND period LIKE '%' || $1 || '%' AND (unit_type = 'GENERAL' OR unit_type IS NULL OR unit_type = '')
        LIMIT 1
      `, [String(year)]);

      // Doanh thu target (Yearly)
      const dtTarget = await query(`
        SELECT COALESCE(target_value, 0) as tv FROM targets
        WHERE (type = 'DOANH_THU' OR type ILIKE '%DOANH%') AND period_type LIKE '%YEAR%' AND period LIKE '%' || $1 || '%' AND (unit_type = 'GENERAL' OR unit_type IS NULL OR unit_type = '')
        LIMIT 1
      `, [String(year)]);

      // Current month for target filtering (e.g. "2026-03")
      const currentMonthStr = `${year}-${String(month).padStart(2, '0')}`;

      // Nguồn việc target (Monthly)
      const nvTargetMonth = await query(`
        SELECT COALESCE(target_value, 0) as tv FROM targets
        WHERE (type = 'NGUON_VIEC' OR type ILIKE '%NGUON%' OR type ILIKE '%NGUỒN%') AND period_type LIKE '%MONTH%' AND period LIKE '%' || $1 || '%' AND (unit_type = 'GENERAL' OR unit_type IS NULL OR unit_type = '')
        LIMIT 1
      `, [currentMonthStr]);

      // Doanh thu target (Monthly)
      const dtTargetMonth = await query(`
        SELECT COALESCE(target_value, 0) as tv FROM targets
        WHERE (type = 'DOANH_THU' OR type ILIKE '%DOANH%') AND period_type LIKE '%MONTH%' AND period LIKE '%' || $1 || '%' AND (unit_type = 'GENERAL' OR unit_type IS NULL OR unit_type = '')
        LIMIT 1
      `, [currentMonthStr]);

      // YEAR targets from GAS may be in tỷ (e.g. 6.8) → convert to triệu (×1000)
      let nvTargetVal = parseFloat(nvTarget.rows[0]?.tv) || 0;
      let dtTargetVal = parseFloat(dtTarget.rows[0]?.tv) || 0;
      if (nvTargetVal > 0 && nvTargetVal < 100) nvTargetVal = Math.round(nvTargetVal * 1000 * 100) / 100;
      if (dtTargetVal > 0 && dtTargetVal < 100) dtTargetVal = Math.round(dtTargetVal * 1000 * 100) / 100;
      const nvTargetMtdVal = nvTargetMonth.rows[0]?.tv || 0;
      const dtTargetMtdVal = dtTargetMonth.rows[0]?.tv || 0;

      // All values in triệu (millions) — round to 2 decimals for consistency
      const round2 = (v) => Math.round(v * 100) / 100;
      const nvActual = round2(parseFloat(nvYtd.rows[0].total) / 1000000);
      const dtActual = round2(parseFloat(dtYtd.rows[0].total) / 1000000);
      const ttActual = round2(parseFloat(ttYtd.rows[0].total) / 1000000);

      const nvMtdVal = round2(parseFloat(nvMtd.rows[0].total) / 1000000);
      const dtMtdValActual = round2(parseFloat(dtMtd.rows[0].total) / 1000000);
      const ttMtdValActual = round2(parseFloat(ttMtd.rows[0].total) / 1000000);

      // Monthly trend: nguồn việc
      const nvTrend = await query(`
        SELECT EXTRACT(MONTH FROM start_date)::int as m, COALESCE(SUM(value)/1000000, 0) as actual
        FROM contracts WHERE EXTRACT(YEAR FROM start_date) = $1
        GROUP BY m ORDER BY m
      `, [year]);

      // Monthly trend: doanh thu
      const dtTrend = await query(`
        SELECT EXTRACT(MONTH FROM issued_date)::int as m, COALESCE(SUM(value)/1000000, 0) as actual
        FROM invoices WHERE EXTRACT(YEAR FROM issued_date) = $1
        GROUP BY m ORDER BY m
      `, [year]);

      // Get monthly targets for trends
      const monthlyNvTargets = await query(`
        SELECT period, target_value FROM targets
        WHERE (type = 'NGUON_VIEC' OR type ILIKE '%NGUON%' OR type ILIKE '%NGUỒN%') AND period_type LIKE '%MONTH%' AND period LIKE $1
        AND (unit_type = 'GENERAL' OR unit_type IS NULL OR unit_type = '')
      `, [`${year}-%`]);

      const monthlyDtTargets = await query(`
        SELECT period, target_value FROM targets
        WHERE (type = 'DOANH_THU' OR type ILIKE '%DOANH%') AND period_type LIKE '%MONTH%' AND period LIKE $1
        AND (unit_type = 'GENERAL' OR unit_type IS NULL OR unit_type = '')
      `, [`${year}-%`]);

      // Build trend arrays
      const nvTrendMap = {};
      nvTrend.rows.forEach(r => { nvTrendMap[r.m] = parseFloat(r.actual); });
      const nvMonthTargetMap = {};
      monthlyNvTargets.rows.forEach(r => {
        const m = parseInt(r.period.split('-')[1]);
        nvMonthTargetMap[m] = parseFloat(r.target_value);
      });

      const dtTrendMap = {};
      dtTrend.rows.forEach(r => { dtTrendMap[r.m] = parseFloat(r.actual); });
      const dtMonthTargetMap = {};
      monthlyDtTargets.rows.forEach(r => {
        const m = parseInt(r.period.split('-')[1]);
        dtMonthTargetMap[m] = parseFloat(r.target_value);
      });

      const nguonViecTrend = [];
      const doanhThuTrend = [];
      for (let m = 1; m <= 12; m++) {
        nguonViecTrend.push({ month: `T${m}`, actual: nvTrendMap[m] || 0, plan: nvMonthTargetMap[m] || 0 });
        doanhThuTrend.push({ month: `T${m}`, actual: dtTrendMap[m] || 0, plan: dtMonthTargetMap[m] || 0 });
      }

      // Branch breakdown
      const branchBreak = await query(`
        SELECT c.branch_id, b.code as branch_code, b.name as branch_name,
          COALESCE(SUM(c.value)/1000000, 0) as actual
        FROM contracts c
        LEFT JOIN branches b ON c.branch_id = b.id
        WHERE EXTRACT(YEAR FROM c.start_date) = $1
        GROUP BY c.branch_id, b.code, b.name
        ORDER BY actual DESC
      `, [year]);

      // Business structure
      const bizStruct = await query(`
        SELECT business_field, COUNT(*) as cnt
        FROM contracts WHERE EXTRACT(YEAR FROM start_date) = $1
        GROUP BY business_field
      `, [year]);

      let b2b = 0, b2c = 0;
      bizStruct.rows.forEach(r => {
        if (r.business_field === 'B2B') b2b = parseInt(r.cnt);
        else if (r.business_field === 'B2C') b2c = parseInt(r.cnt);
      });
      const bizTotal = b2b + b2c || 1;

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
        FROM invoices WHERE payment > 0 AND EXTRACT(YEAR FROM issued_date) = $1 AND EXTRACT(MONTH FROM issued_date) = $2
      `, [prevYear, prevMonth]);

      // All-time totals
      const nvAllTime = await query(`SELECT COALESCE(SUM(value)/1000000, 0) as total FROM contracts`);
      const dtAllTime = await query(`SELECT COALESCE(SUM(value)/1000000, 0) as total FROM invoices`);
      const ttAllTime = await query(`SELECT COALESCE(SUM(payment)/1000000, 0) as total FROM invoices WHERE payment > 0`);

      const nvMom = Math.round((nvMtdVal - parseFloat(nvPrevMonth.rows[0].total)) * 100) / 100;
      const dtMom = Math.round((dtMtdValActual - parseFloat(dtPrevMonth.rows[0].total)) * 100) / 100;
      const ttMom = Math.round((ttMtdValActual - parseFloat(ttPrevMonth.rows[0].total)) * 100) / 100;

      // Recent activities
      const recentActs = await query(
        'SELECT id, email, action, description, created_at FROM activities ORDER BY created_at DESC LIMIT 10'
      );
      const recentActivities = recentActs.rows.map(r => ({
        id: r.id,
        userName: r.email || '',
        description: `${r.action}: ${r.description || ''}`,
        type: r.action || '',
        createdAt: r.created_at,
      }));

      return {
        success: true,
        data: {
          kpi: {
            nguonViec: {
              value: round2(nvMtdVal),
              valueYTD: round2(nvActual),
              valueAllTime: round2(parseFloat(nvAllTime.rows[0].total)),
              achievedPct: nvTargetMtdVal > 0 ? Math.round(nvMtdVal / nvTargetMtdVal * 100 * 10) / 10 : 0,
              target: parseFloat(nvTargetMtdVal),
              targetYTD: parseFloat(nvTargetVal),
              yearPct: nvTargetVal > 0 ? Math.round(nvActual / nvTargetVal * 100) : 0,
              mom: nvMom,
            },
            doanhThu: {
              value: round2(dtMtdValActual),
              valueYTD: round2(dtActual),
              valueAllTime: round2(parseFloat(dtAllTime.rows[0].total)),
              valueSuffix: 'Tr',
              achievedPct: dtTargetMtdVal > 0 ? Math.round(dtMtdValActual / dtTargetMtdVal * 100 * 10) / 10 : 0,
              target: parseFloat(dtTargetMtdVal),
              targetYTD: parseFloat(dtTargetVal),
              yearPct: dtTargetVal > 0 ? Math.round(dtActual / dtTargetVal * 100) : 0,
              mom: dtMom,
            },
            thuTien: {
              value: round2(ttMtdValActual),
              valueYTD: round2(ttActual),
              valueAllTime: round2(parseFloat(ttAllTime.rows[0].total)),
              target: parseFloat(dtTargetMtdVal),
              targetYTD: parseFloat(dtTargetVal),
              achievedPct: dtTargetMtdVal > 0 ? Math.round(ttMtdValActual / dtTargetMtdVal * 100) : 0,
              yearPct: dtTargetVal > 0 ? Math.round(ttActual / dtTargetVal * 100) : 0,
              pct: dtTargetMtdVal > 0 ? Math.round(ttMtdValActual / dtTargetMtdVal * 100) : 0,
              mom: ttMom,
            },
            duAn: { ...projectExecution, delayed: 0 },
          },
          nguonViecTrend,
          doanhThuTrend,
          branchBreakdown: branchBreak.rows.map(r => ({
            branchCode: r.branch_code || '', branchName: r.branch_name || '',
            actual: parseFloat(r.actual),
            actualDT: parseFloat(r.actual),
            planDT: 0,
          })),
          businessStructure: { b2b: Math.round(b2b / bizTotal * 100), b2c: Math.round(b2c / bizTotal * 100) },
          projectExecution: { ...projectExecution, delayed: 0 },
          recentActivities,
          priorityTasks: [],
          totalContracts: parseInt(nvYtd.rows[0].count),
          totalValue: parseFloat(nvYtd.rows[0].total),
          VERSION: require('../../package.json').version || '1.0.0',
        }
      };
    }, CacheService.TTL.SHORT);

    res.json(data);
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.json({ success: false, error: err.message });
  }
});

// GET /dashboard/branch-performance
router.get('/branch-performance', async (req, res) => {
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
    res.json({ success: false, error: err.message });
  }
});

// GET /dashboard/general-performance
router.get('/general-performance', async (req, res) => {
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
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
