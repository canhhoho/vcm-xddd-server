/**
 * VCM XDDD - Server Entry Point
 */
const app = require('./app');
const { testConnection, query } = require('./config/database');

const PORT = process.env.PORT || 3001;

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
    // Still start server so you can test non-DB routes
    console.log('⚠️  Starting without DB connection...');
  }

  // Run cleanup on startup and every 6 hours
  if (dbOk) {
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
