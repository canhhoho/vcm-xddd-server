/**
 * User Routes — CRUD /users (ADMIN)
 * Port of getUsers, createUser, updateUser, deleteUser from Code.gs
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const SecurityService = require('../services/securityService');
const CacheService = require('../services/cacheService');

async function logActivity(email, action, description) {
  try {
    await query('INSERT INTO activities (id, email, action, description) VALUES ($1, $2, $3, $4)',
      [uuidv4(), email, action, description]);
  } catch (e) { console.error('logActivity:', e.message); }
}

function toUser(r) {
  return {
    id: r.id, email: r.email, name: r.name,
    positionId: r.position_id, positionCode: r.position_code,
    positionName: r.position_name, category: r.category,
    description: r.description || '', role: r.role,
    branches: r.branches, contracts: r.contracts,
    projects: r.projects, targets: r.targets,
    business: r.business, plans: r.plans, createdAt: r.created_at,
  };
}

// GET /users
router.get('/', async (req, res) => {
  try {
    const data = await CacheService.getOrSet('USERS_LIST', async () => {
      const result = await query(`
        SELECT u.id, u.email, u.name, u.position_id,
          COALESCE(p.code, u.position_code) as position_code,
          CASE
            WHEN p.name IS NOT NULL AND p.name != '' AND p.name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-' THEN p.name
            WHEN u.position_name IS NOT NULL AND u.position_name != '' THEN u.position_name
            ELSE COALESCE(p.name, '')
          END as position_name,
          COALESCE(NULLIF(p.category, ''), u.category) as category,
          u.description, u.role, u.branches, u.contracts, u.projects, u.targets, u.business, u.plans, u.created_at
        FROM users u
        LEFT JOIN positions p ON u.position_id = p.id
        ORDER BY u.created_at DESC
      `);
      return { success: true, data: result.rows.map(toUser) };
    }, CacheService.TTL.MEDIUM);

    res.json(data);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /users
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const id = 'u_' + uuidv4().substring(0, 8);
    const hashedPassword = SecurityService.hashPassword(d.password || 'vcm123');

    // Resolve position name from DB
    let posCode = d.positionCode || '';
    let posName = d.positionName || '';
    if (d.positionId) {
      try {
        const pRes = await query('SELECT code, name FROM positions WHERE id = $1', [d.positionId]);
        if (pRes.rows.length > 0) {
          posCode = pRes.rows[0].code;
          posName = pRes.rows[0].name;
        }
      } catch (e) { console.error('Error resolving position:', e.message); }
    }

    await query(`
      INSERT INTO users (id, email, password, name, position_id, position_code, position_name, category, description, role, branches, contracts, projects, targets, business, plans)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [
      id, d.email, hashedPassword, d.name || '',
      d.positionId || '', posCode, posName,
      d.category || '', d.description || '',
      d.role || 'VIEW',
      'VIEW', 'VIEW', 'VIEW', 'VIEW', 'VIEW', 'VIEW'
    ]);

    await logActivity(req.user?.email || 'ADMIN', 'CREATE_USER', `Created user ${d.email}`);
    CacheService.clear(['USERS_LIST']);

    res.json({ success: true, data: { id, email: d.email, name: d.name, role: d.role || 'VIEW' } });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /users/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const fields = []; const values = []; let idx = 1;

    const mapping = {
      email: 'email', name: 'name',
      positionId: 'position_id', positionCode: 'position_code',
      positionName: 'position_name', category: 'category',
      description: 'description', role: 'role',
      branches: 'branches', contracts: 'contracts',
      projects: 'projects', targets: 'targets', business: 'business', plans: 'plans'
    };

    // Resolve position name from DB if positionId is being updated
    let localPosCode = d.positionCode;
    let localPosName = d.positionName;
    if (d.positionId) {
       try {
         const pRes = await query('SELECT code, name FROM positions WHERE id = $1', [d.positionId]);
         if (pRes.rows.length > 0) {
           localPosCode = pRes.rows[0].code;
           localPosName = pRes.rows[0].name;
         }
       } catch (e) { console.error('Error resolving position on update:', e.message); }
    }

    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (d[jsKey] !== undefined) {
        let val = d[jsKey];
        if (jsKey === 'positionCode' && localPosCode !== undefined) val = localPosCode;
        if (jsKey === 'positionName' && localPosName !== undefined) val = localPosName;
        fields.push(`${dbCol} = $${idx}`); values.push(val); idx++;
      }
    }

    // Hash password if updating
    if (d.password) {
      fields.push(`password = $${idx}`);
      values.push(SecurityService.hashPassword(d.password));
      idx++;
    }

    if (fields.length === 0) return res.json({ success: false, error: 'No fields to update' });

    values.push(id);
    await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values);

    await logActivity(req.user?.email || 'ADMIN', 'UPDATE_USER', `Updated user ${id}`);
    CacheService.clear(['USERS_LIST']);

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /users/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING email', [req.params.id]);
    if (result.rowCount === 0) return res.json({ success: false, error: 'User not found' });
    await logActivity(req.user?.email || 'ADMIN', 'DELETE_USER', `Deleted user ${result.rows[0].email}`);
    CacheService.clear(['USERS_LIST']);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
