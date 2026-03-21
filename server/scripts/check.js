require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');
const pool = new Pool();
async function run() {
  const p = await pool.query('SELECT * FROM positions');
  console.log('POS:', p.rows);
  const u = await pool.query('SELECT name, position_id, position_name FROM users');
  console.log('USR:', u.rows);
  const t = await pool.query('SELECT period, target_value FROM targets');
  console.log('TGT:', t.rows.slice(0, 10));
  process.exit();
}
run();
