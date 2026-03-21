/**
 * VCM XDDD - Security Service
 * Port of SECURITY object from Code.gs
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'VCM_SECURE_SECRET_KEY_2026_CHANGE_ME';
const JWT_EXPIRES_IN = '24h';

const SecurityService = {
  /**
   * Hash password using SHA-256 (compatible with GAS SECURITY.hashPassword)
   */
  hashPassword(password) {
    if (!password) return '';
    return crypto.createHash('sha256').update(String(password)).digest('hex');
  },

  /**
   * Generate JWT token (standard jsonwebtoken)
   */
  generateToken(user) {
    const payload = {
      uid: user.id,
      email: user.email,
      role: user.role,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  },

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    if (!token) return null;
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return null;
    }
  }
};

module.exports = SecurityService;
