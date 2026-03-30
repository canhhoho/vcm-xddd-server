/**
 * Project Routes — CRUD /projects + members + items
 * Port of project functions from Code.gs
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const CacheService = require('../services/cacheService');
const APP_CONFIG = require('../config');

async function logActivity(email, action, description) {
  try {
    await query('INSERT INTO activities (id, email, action, description) VALUES ($1, $2, $3, $4)',
      [uuidv4(), email, action, description]);
  } catch (e) { console.error('logActivity:', e.message); }
}

function toProject(r) {
  // Calculate time progress
  let timeProgress = 0;
  if (r.start_date && r.end_date) {
    const start = new Date(r.start_date); start.setHours(0,0,0,0);
    const end = new Date(r.end_date); end.setHours(0,0,0,0);
    const now = new Date(); now.setHours(0,0,0,0);
    const totalDays = (end - start) / 86400000 + 1;
    const daysToCurrent = (now - start) / 86400000 + 1;
    const elapsed = Math.max(0, Math.min(daysToCurrent, totalDays));
    timeProgress = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;
  }

  let members = [];
  try { members = typeof r.members === 'string' ? JSON.parse(r.members) : (r.members || []); }
  catch (e) { members = []; }

  return {
    id: r.id, code: r.code, name: r.name, status: r.status,
    managerId: r.manager_id, contractId: r.contract_id,
    location: r.location || '', investor: r.investor || '',
    startDate: r.start_date, endDate: r.end_date,
    budget: parseFloat(r.budget) || 0,
    description: r.description || '',
    fileUrls: r.file_urls || '',
    members, timeProgress,
    progress: r.avg_progress !== undefined ? parseInt(r.avg_progress) || 0 : 0,
    createdAt: r.created_at,
  };
}

// GET /projects
router.get('/', async (req, res) => {
  try {
    const data = await CacheService.getOrSet('PROJECTS_LIST', async () => {
      const result = await query(`
        SELECT p.*,
          COALESCE((SELECT ROUND(AVG(t.progress)) FROM tasks t WHERE t.project_id = p.id), 0) as avg_progress
        FROM projects p
        ORDER BY p.created_at DESC
      `);

      // Enrich members with user info
      const usersResult = await query('SELECT id, name, email FROM users');
      const usersMap = {};
      usersResult.rows.forEach(u => usersMap[u.id] = u);

      const projects = result.rows.map(r => {
        const proj = toProject(r);
        proj.members = proj.members.map(m => ({
          ...m,
          userName: usersMap[m.userId]?.name || '',
          email: usersMap[m.userId]?.email || '',
        }));
        return proj;
      });

      return { success: true, data: projects };
    }, CacheService.TTL.SHORT);

    res.json(data);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// POST /projects
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const id = uuidv4();

    await query(`
      INSERT INTO projects (id, code, name, status, manager_id, contract_id, location, investor, start_date, end_date, budget, description, file_urls, members)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      id, d.code, d.name, d.status || 'TODO',
      d.managerId || '', d.contractId || '',
      d.location || '', d.investor || '',
      d.startDate || null, d.endDate || null,
      d.budget || 0, d.description || '', d.fileUrls || '', '[]'
    ]);

    await logActivity(req.user?.email || '', 'PROJECT_CREATE', `Created project ${d.code}`);
    CacheService.clear(['PROJECTS_LIST']);

    res.json({ success: true, id });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// PUT /projects/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    const fields = []; const values = []; let idx = 1;

    const mapping = {
      code: 'code', name: 'name', status: 'status',
      managerId: 'manager_id', contractId: 'contract_id',
      location: 'location', investor: 'investor',
      startDate: 'start_date', endDate: 'end_date',
      budget: 'budget', description: 'description',
      fileUrls: 'file_urls',
    };

    for (const [jsKey, dbCol] of Object.entries(mapping)) {
      if (d[jsKey] !== undefined) {
        fields.push(`${dbCol} = $${idx}`); values.push(d[jsKey]); idx++;
      }
    }
    if (fields.length === 0) return res.json({ success: false, error: 'No fields to update' });

    values.push(id);
    await query(`UPDATE projects SET ${fields.join(', ')} WHERE id = $${idx}`, values);

    await logActivity(req.user?.email || '', 'PROJECT_UPDATE', `Updated project ${id}`);
    CacheService.clear(['PROJECTS_LIST']);

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// DELETE /projects/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM projects WHERE id = $1 RETURNING code', [req.params.id]);
    if (result.rowCount === 0) return res.json({ success: false, error: 'Project not found' });
    await logActivity(req.user?.email || '', 'PROJECT_DELETE', `Deleted project ${result.rows[0].code}`);
    CacheService.clear(['PROJECTS_LIST']);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ==================== PROJECT ITEMS (predefined) ====================
router.get('/:projectId/items', (req, res) => {
  res.json({ success: true, data: APP_CONFIG.PROJECT_ITEM_TYPES });
});

// ==================== PROJECT MEMBERS ====================
router.get('/:projectId/members', async (req, res) => {
  try {
    const result = await query('SELECT members FROM projects WHERE id = $1', [req.params.projectId]);
    if (result.rows.length === 0) return res.json({ success: true, data: [] });

    let members = [];
    try { members = JSON.parse(result.rows[0].members || '[]'); } catch (e) { members = []; }

    // Enrich with user info
    const usersResult = await query('SELECT id, name, email FROM users');
    const usersMap = {};
    usersResult.rows.forEach(u => usersMap[u.id] = u);

    members = members.map(m => ({
      ...m,
      userName: usersMap[m.userId]?.name || '',
      email: usersMap[m.userId]?.email || '',
    }));

    res.json({ success: true, data: members });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/:projectId/members', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userId, role } = req.body;

    const result = await query('SELECT members FROM projects WHERE id = $1', [projectId]);
    if (result.rows.length === 0) return res.json({ success: false, error: 'Project not found' });

    let members = [];
    try { members = JSON.parse(result.rows[0].members || '[]'); } catch (e) { members = []; }

    if (members.some(m => m.userId === userId)) {
      return res.json({ success: false, error: 'User is already a member' });
    }

    const newMember = { id: uuidv4(), userId, role: role || 'MEMBER', addedAt: new Date().toISOString() };
    members.push(newMember);

    await query('UPDATE projects SET members = $1 WHERE id = $2', [JSON.stringify(members), projectId]);

    res.json({ success: true, id: newMember.id });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
