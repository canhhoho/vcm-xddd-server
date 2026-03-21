/**
 * VCM XDDD - Server Entry Point
 */
const app = require('./app');
const { testConnection } = require('./config/database');

const PORT = process.env.PORT || 3001;

async function start() {
  // Test DB connection
  const dbOk = await testConnection();

  if (!dbOk) {
    console.error('❌ Cannot connect to PostgreSQL. Please check your .env settings.');
    console.error('   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
    // Still start server so you can test non-DB routes
    console.log('⚠️  Starting without DB connection...');
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 VCM XDDD Server running on http://localhost:${PORT}`);
    console.log(`📡 API available at http://localhost:${PORT}/api`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/ping`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

start();
