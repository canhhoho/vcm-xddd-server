/**
 * Province Routes — GET /provinces (alias for branches, backward compat)
 */
const router = require('express').Router();
const { query } = require('../config/database');

// GET /provinces
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT id, name, code FROM branches ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
