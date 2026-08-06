/**
 * VCM XDDD - PostgreSQL Database Connection
 */
const pg = require('pg');
const { Pool } = pg;

// OID 1082 = DATE. Mặc định node-pg dựng thành Date lúc nửa đêm giờ SERVER, rồi
// res.json() gọi toISOString() — ngày 2026-07-05 đi qua dây thành
// "2026-07-04T17:30:00.000Z". Trình duyệt khác múi giờ server render lệch một ngày,
// và file Excel xuất ra cũng lệch theo. Cột DATE là ngày lịch thuần: trả nguyên
// chuỗi 'YYYY-MM-DD' để không múi giờ nào chen vào được.
//
// KHÔNG đụng 1114 (timestamp) / 1184 (timestamptz): đó là mốc thời gian thật,
// cần giữ nguyên hành vi chuyển đổi múi giờ.
pg.types.setTypeParser(1082, v => v);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'vcm_xddd',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ Unexpected DB pool error:', err);
});

/**
 * Query helper with logging
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 100));
    }
    return result;
  } catch (err) {
    console.error('[DB] Query error:', err.message);
    console.error('[DB] Query:', text.substring(0, 200));
    throw err;
  }
}

/**
 * Get a single client for transactions
 */
async function getClient() {
  return pool.connect();
}

/**
 * Test DB connection
 */
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected:', result.rows[0].now);
    return true;
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    return false;
  }
}

module.exports = { pool, query, getClient, testConnection };
