/**
 * Permission Routes — GET/PUT /permissions
 * Port of getPermissions/savePermissions from Code.gs
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function logActivity(email, action, desc) {
  try { await query('INSERT INTO activities (id, email, action, description) VALUES ($1,$2,$3,$4)', [uuidv4(), email, action, desc]); }
  catch (e) { console.error('logActivity:', e.message); }
}

// GET /permissions
router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, position_name, category, contracts, projects, targets, business, branches, plans, plans_bd, plans_mkt, plans_qs, plans_des, plans_pm FROM users ORDER BY name'
    );
    const data = result.rows.map(r => ({
      userId: r.id, userName: r.name,
      positionName: r.position_name || '', category: r.category || '',
      contracts: r.contracts || 'NO_ACCESS', projects: r.projects || 'NO_ACCESS',
      targets: r.targets || 'NO_ACCESS', business: r.business || 'NO_ACCESS',
      branches: r.branches || 'NO_ACCESS', plans: r.plans || 'NO_ACCESS',
      plans_bd: r.plans_bd || 'NO_ACCESS', plans_mkt: r.plans_mkt || 'NO_ACCESS',
      plans_qs: r.plans_qs || 'NO_ACCESS', plans_des: r.plans_des || 'NO_ACCESS',
      plans_pm: r.plans_pm || 'NO_ACCESS',
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /permissions
router.put('/', async (req, res) => {
  try {
    const { permissions } = req.body;
    if (!permissions || !Array.isArray(permissions)) {
      return res.json({ success: false, error: 'Invalid permissions data' });
    }

    for (const p of permissions) {
      const fields = []; const values = []; let idx = 1;
      if (p.contracts) { fields.push(`contracts = $${idx}`); values.push(p.contracts); idx++; }
      if (p.projects) { fields.push(`projects = $${idx}`); values.push(p.projects); idx++; }
      if (p.targets) { fields.push(`targets = $${idx}`); values.push(p.targets); idx++; }
      if (p.business) { fields.push(`business = $${idx}`); values.push(p.business); idx++; }
      if (p.branches) { fields.push(`branches = $${idx}`); values.push(p.branches); idx++; }
      if (p.plans) { fields.push(`plans = $${idx}`); values.push(p.plans); idx++; }
      if (p.plans_bd) { fields.push(`plans_bd = $${idx}`); values.push(p.plans_bd); idx++; }
      if (p.plans_mkt) { fields.push(`plans_mkt = $${idx}`); values.push(p.plans_mkt); idx++; }
      if (p.plans_qs) { fields.push(`plans_qs = $${idx}`); values.push(p.plans_qs); idx++; }
      if (p.plans_des) { fields.push(`plans_des = $${idx}`); values.push(p.plans_des); idx++; }
      if (p.plans_pm) { fields.push(`plans_pm = $${idx}`); values.push(p.plans_pm); idx++; }

      if (fields.length > 0) {
        values.push(p.userId);
        await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values);
      }
    }

    await logActivity(req.user?.email || 'ADMIN', 'SAVE_PERMISSIONS', 'Updated permissions');
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
