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
    const positions = posResult.rows.map(p => ({
      id: p.id,
      name: p.name,
      code: p.code,
      defaultRole: p.default_role,
      category: p.category,
      description: p.description,
    }));

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
