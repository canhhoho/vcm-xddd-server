/**
 * Position Routes — CRUD /positions
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');

// GET /positions
router.get('/', async (req, res) => {
  try {
    const data = await CacheService.getOrSet('POSITIONS_LIST', async () => {
      const result = await query('SELECT * FROM positions ORDER BY name');

      // Lookup position names from users table for positions with missing/UUID names
      const userPosResult = await query(`
        SELECT DISTINCT position_id, position_name, position_code
        FROM users
        WHERE position_id IS NOT NULL AND position_id != ''
          AND position_name IS NOT NULL AND position_name != ''
      `);
      const userPosMap = {};
      userPosResult.rows.forEach(r => {
        userPosMap[r.position_id] = { name: r.position_name, code: r.position_code };
      });

      return {
        success: true,
        data: result.rows.map(r => {
          // If name is empty or looks like a UUID, try to get from users table
          const isNameMissing = !r.name || r.name === r.id || /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(r.name);
          const userPos = userPosMap[r.id];
          return {
            id: r.id,
            name: isNameMissing && userPos ? userPos.name : (r.name || r.id),
            code: (!r.code && userPos) ? userPos.code : (r.code || ''),
            defaultRole: r.default_role, category: r.category,
            description: r.description || '', createdAt: r.created_at,
          };
        })
      };
    }, CacheService.TTL.STATIC);
    res.json(data);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /positions
router.post('/', async (req, res) => {
  try {
    const d = req.body; const id = uuidv4();
    await query('INSERT INTO positions (id,name,code,default_role,category,description) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, d.name, d.code || '', d.defaultRole || 'VIEW', d.category || '', d.description || '']);
    CacheService.clear(['POSITIONS_LIST']);
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /positions/:id
router.put('/:id', async (req, res) => {
  try {
    const d = req.body;
    await query('UPDATE positions SET name=$1,code=$2,default_role=$3,category=$4,description=$5 WHERE id=$6',
      [d.name, d.code || '', d.defaultRole || 'VIEW', d.category || '', d.description || '', req.params.id]);
    CacheService.clear(['POSITIONS_LIST']);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /positions/:id
router.delete('/:id', async (req, res) => {
  try {
    const r = await query('DELETE FROM positions WHERE id=$1', [req.params.id]);
    if (r.rowCount === 0) return res.json({ success: false, error: 'Position not found' });
    CacheService.clear(['POSITIONS_LIST']);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
