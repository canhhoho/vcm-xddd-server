/**
 * VCM XDDD - Server Entry Point
 */
const app = require('./app');
const { testConnection, query } = require('./config/database');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;

// Auto-create tables from init-db.sql (safe: uses IF NOT EXISTS)
async function autoCreateTables() {
  try {
    const sqlPath = path.join(__dirname, '..', 'scripts', 'init-db.sql');
    if (!fs.existsSync(sqlPath)) {
      console.log('⚠️  init-db.sql not found, skipping auto-create tables');
      return;
    }
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    await query(sql);
    console.log('✅ Auto-create tables: OK (init-db.sql)');
  } catch (e) {
    console.error('⚠️  Auto-create tables error:', e.message);
  }
}

// Auto-cleanup: delete activities older than 7 days
async function cleanupOldActivities() {
  try {
    const result = await query(
      "DELETE FROM activities WHERE created_at < NOW() - INTERVAL '7 days'"
    );
    if (result.rowCount > 0) {
      console.log(`🧹 Cleaned up ${result.rowCount} old activities (> 7 days)`);
    }
  } catch (e) {
    console.error('Activity cleanup error:', e.message);
  }
}

async function start() {
  // Test DB connection
  const dbOk = await testConnection();

  if (!dbOk) {
    console.error('❌ Cannot connect to PostgreSQL. Please check your .env settings.');
    console.error('   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
    console.log('⚠️  Starting without DB connection...');
  }

  if (dbOk) {
    // Auto-create any missing tables
    await autoCreateTables();

    // Run cleanup on startup and every 6 hours
    cleanupOldActivities();
    setInterval(cleanupOldActivities, 6 * 60 * 60 * 1000);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 VCM XDDD Server running on http://localhost:${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/ping`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

start();

