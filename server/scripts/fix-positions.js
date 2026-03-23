/**
 * VCM XDDD — Fix Positions Data
 * 
 * Fixes empty position names/codes in the database by:
 * 1. Updating from users table (position_name, position_code)
 * 2. Showing before/after comparison
 * 
 * Usage: node scripts/fix-positions.js
 * 
 * Set DB connection via .env or environment variables:
 *   DB_HOST=10.201.42.65  (remote) or localhost (on server)
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vcm_xddd',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function fixPositions() {
  const client = await pool.connect();

  try {
    console.log('🔍 Connecting to database...');
    console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`   Database: ${process.env.DB_NAME || 'vcm_xddd'}\n`);

    // 1. Show current positions state
    console.log('📋 BEFORE — Current positions data:');
    const before = await client.query('SELECT id, name, code FROM positions ORDER BY id');
    console.table(before.rows.map(r => ({
      id: r.id.substring(0, 16) + '...',
      name: r.name || '(empty)',
      code: r.code || '(empty)',
    })));
    console.log(`   Total: ${before.rows.length} positions\n`);

    // 2. Check users table for position data
    console.log('🔍 Checking users table for position data...');
    const userPositions = await client.query(`
      SELECT DISTINCT position_id, position_name, position_code
      FROM users
      WHERE position_id IS NOT NULL AND position_id != ''
        AND position_name IS NOT NULL AND position_name != ''
      ORDER BY position_name
    `);
    console.log(`   Found ${userPositions.rows.length} distinct positions from users:\n`);
    userPositions.rows.forEach(r => {
      console.log(`   ${r.position_id.substring(0, 16)}... → name: "${r.position_name}", code: "${r.position_code}"`);
    });

    if (userPositions.rows.length === 0) {
      console.log('\n⚠️  No position data found in users table either.');
      console.log('   Will try to match positions with GAS config data...\n');

      // Fallback: check if there are position names in a different format
      const allUsers = await client.query(`
        SELECT DISTINCT position_id, position_name, position_code
        FROM users
        WHERE position_id IS NOT NULL AND position_id != ''
        ORDER BY position_id
      `);
      console.log(`   All user position_ids (${allUsers.rows.length}):`);
      allUsers.rows.forEach(r => {
        console.log(`   ID: ${r.position_id.substring(0, 20)}..., name: "${r.position_name || '(empty)'}", code: "${r.position_code || '(empty)'}"`);
      });
      
      console.log('\n❌ Cannot auto-fix positions. Manual intervention required.');
      console.log('   Options:');
      console.log('   1. Re-export positions from GAS and re-import');
      console.log('   2. Manually update positions in the database');
      return;
    }

    // 3. Fix positions — update name and code from users data
    console.log('\n🔧 Fixing positions...');
    await client.query('BEGIN');

    let updated = 0;
    for (const up of userPositions.rows) {
      const result = await client.query(
        `UPDATE positions
         SET name = $1, code = $2
         WHERE id = $3 AND (name IS NULL OR name = '' OR name = id)`,
        [up.position_name, up.position_code, up.position_id]
      );
      if (result.rowCount > 0) {
        updated++;
        console.log(`   ✅ Updated: ${up.position_id.substring(0, 16)}... → "${up.position_name}" (${up.position_code})`);
      }
    }

    // 4. Handle orphan positions (in positions table but not referenced by any user)
    const orphans = await client.query(`
      SELECT p.id, p.name, p.code
      FROM positions p
      LEFT JOIN users u ON u.position_id = p.id
      WHERE u.id IS NULL AND (p.name IS NULL OR p.name = '' OR p.name = p.id)
    `);
    if (orphans.rows.length > 0) {
      console.log(`\n   ⚠️  ${orphans.rows.length} orphan positions (not used by any user):`);
      orphans.rows.forEach(r => {
        console.log(`      ${r.id.substring(0, 16)}... — name: "${r.name || '(empty)'}"`);
      });
      console.log('   These will be deleted as they have no name or users.');
      
      await client.query(`
        DELETE FROM positions
        WHERE id IN (
          SELECT p.id FROM positions p
          LEFT JOIN users u ON u.position_id = p.id
          WHERE u.id IS NULL AND (p.name IS NULL OR p.name = '' OR p.name = p.id)
        )
      `);
      console.log(`   🗑️  Deleted ${orphans.rows.length} orphan positions.`);
    }

    await client.query('COMMIT');

    // 5. Show final state
    console.log('\n📋 AFTER — Updated positions data:');
    const after = await client.query('SELECT id, name, code FROM positions ORDER BY name');
    console.table(after.rows.map(r => ({
      id: r.id.substring(0, 16) + '...',
      name: r.name || '(empty)',
      code: r.code || '(empty)',
    })));
    console.log(`   Total: ${after.rows.length} positions`);
    console.log(`   Updated: ${updated} positions`);
    console.log('\n🎉 Done! Positions have been fixed.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err.message);
    console.error(err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

fixPositions();
