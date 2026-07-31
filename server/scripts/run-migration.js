const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vcm_xddd',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Tên file migration truyền qua CLI, mặc định giữ nguyên hành vi cũ.
// VD: node scripts/run-migration.js migrate-plan-constraints.sql
const fileName = process.argv[2] || 'migrate-add-project-logs.sql';

async function run() {
  let failed = false;
  try {
    const sqlPath = path.join(__dirname, fileName);
    console.log('Reading migration file:', sqlPath);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing migration...');
    await pool.query(sql);
    console.log('✅ Migration executed successfully!');
  } catch (error) {
    failed = true;
    console.error('❌ Migration failed:', error.message || error);
  } finally {
    await pool.end();
    // Thoát khác 0 khi lỗi để script deploy không đi tiếp và restart app
    if (failed) process.exitCode = 1;
  }
}

run();
