/**
 * Auth Routes — POST /auth/login, PUT /auth/change-password
 * Port of handleLogin() and changePassword() from Code.gs
 */
const router = require('express').Router();
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const SecurityService = require('../services/securityService');

async function logActivity(email, action, description) {
  try {
    await query('INSERT INTO activities (id, email, action, description) VALUES ($1, $2, $3, $4)',
      [uuidv4(), email, action, description]);
  } catch (e) { console.error('logActivity:', e.message); }
}
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.json({ success: false, error: 'Email và mật khẩu không được để trống' });
    }

    // Find user by email
    const result = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);

    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Email hoặc mật khẩu không đúng' });
    }

    const user = result.rows[0];
    const hashedInput = SecurityService.hashPassword(password);

    // Check password: try hash first, then plain text (GAS compatibility)
    let isValid = false;
    let needsMigration = false;

    if (hashedInput === user.password) {
      isValid = true;
    } else if (password === user.password) {
      // Plain text fallback (for data migrated from Google Sheets)
      isValid = true;
      needsMigration = true;
    }

    if (!isValid) {
      return res.json({ success: false, error: 'Email hoặc mật khẩu không đúng' });
    }

    // Auto-migrate plain text password to hash
    if (needsMigration) {
      await query('UPDATE users SET password = $1 WHERE id = $2', [hashedInput, user.id]);
      console.log(`🔒 Auto-migrated password for user ${user.email}`);
    }

    // Generate JWT token
    const token = SecurityService.generateToken(user);

    // Log login activity
    await logActivity(user.email, 'LOGIN', `User logged in`);

    // Response (never return password)
    const { password: _, ...safeUser } = user;

    res.json({
      success: true,
      user: {
        id: safeUser.id,
        email: safeUser.email,
        name: safeUser.name,
        role: safeUser.role,
        positionCode: safeUser.position_code,
        positionName: safeUser.position_name,
        category: safeUser.category,
        branches: safeUser.branches,
        contracts: safeUser.contracts,
        projects: safeUser.projects,
        targets: safeUser.targets,
        business: safeUser.business,
        plans: safeUser.plans,
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.json({ success: false, error: 'Lỗi đăng nhập: ' + err.message });
  }
});

// PUT /auth/change-password
router.put('/change-password', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!oldPassword || !newPassword) {
      return res.json({ success: false, error: 'Cần nhập mật khẩu cũ và mới' });
    }

    const result = await query('SELECT password FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.json({ success: false, error: 'Không tìm thấy user' });
    }

    const currentHash = result.rows[0].password;
    if (SecurityService.hashPassword(oldPassword) !== currentHash) {
      return res.json({ success: false, error: 'Mật khẩu cũ không đúng' });
    }

    const newHash = SecurityService.hashPassword(newPassword);
    await query('UPDATE users SET password = $1 WHERE id = $2', [newHash, userId]);

    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    console.error('Change password error:', err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
