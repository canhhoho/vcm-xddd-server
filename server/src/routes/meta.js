/**
 * Meta Routes — GET /meta/app
 * Port of getAppMetaData() from Code.gs
 */
const router = require('express').Router();
const APP_CONFIG = require('../config');
const { query } = require('../config/database');

// GET /meta/app
router.get('/app', async (req, res) => {
  try {
    // Get branches from DB
    const branchResult = await query('SELECT id, name, code, address FROM branches ORDER BY name');
    const branches = branchResult.rows;

    // Get positions from DB
    const posResult = await query('SELECT id, name, code, default_role, category, description FROM positions ORDER BY name');
    // Lookup position names from users table for positions with missing/UUID names
    const userPosResult = await query(`
      SELECT DISTINCT position_id, position_name, position_code
      FROM users WHERE position_id IS NOT NULL AND position_id != ''
        AND position_name IS NOT NULL AND position_name != ''
    `);
    const userPosMap = {};
    userPosResult.rows.forEach(r => { userPosMap[r.position_id] = { name: r.position_name, code: r.position_code }; });

    const positions = posResult.rows.map(p => {
      const isNameMissing = !p.name || p.name === p.id || /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(p.name);
      const userPos = userPosMap[p.id];
      return {
        id: p.id,
        name: isNameMissing && userPos ? userPos.name : (p.name || p.id),
        code: (!p.code && userPos) ? userPos.code : (p.code || ''),
        defaultRole: p.default_role,
        category: p.category,
        description: p.description,
      };
    });

    res.json({
      success: true,
      data: {
        appName: 'VCM Contract Management',
        version: APP_CONFIG.VERSION,
        VERSION: APP_CONFIG.VERSION,
        environment: process.env.NODE_ENV || 'development',
        lastUpdated: new Date().toISOString(),
        SHEETS: {
          ACTIVITIES: 'Activities', TARGETS: 'Targets', CONTRACTS: 'Contracts',
          INVOICES: 'Invoices', PROJECTS: 'Projects', TASKS: 'Tasks',
          BRANCHES: 'Branches', STAFF: 'Staff', USERS: 'Users', POSITIONS: 'Positions'
        },
        BRANCHES: branches,
        BUSINESS_TYPES: APP_CONFIG.BUSINESS_TYPES,
        STATUS: APP_CONFIG.STATUS,
        POSITIONS: APP_CONFIG.POSITIONS,
        GROUPS: APP_CONFIG.GROUPS,
        ACTIONS: APP_CONFIG.ACTIONS,
      }
    });
  } catch (err) {
    console.error('getAppMetaData error:', err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
