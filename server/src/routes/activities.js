/**
 * Activity Routes — GET /activities
 */
const router = require('express').Router();
const { query } = require('../config/database');

// GET /activities
router.get('/', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM activities ORDER BY created_at DESC LIMIT 200');
    const data = result.rows.map(r => ({
      id: r.id, email: r.email, action: r.action,
      description: r.description || '', createdAt: r.created_at,
    }));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
