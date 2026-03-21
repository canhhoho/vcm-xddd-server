/**
 * VCM XDDD — Import Data from Google Sheets Export
 * 
 * Usage: node scripts/import-data.js [path-to-json-file]
 * Default: scripts/exported-data.json
 * 
 * This script reads the JSON exported by gas-export.gs and inserts into PostgreSQL.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vcm_xddd',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Helper: convert GAS date to ISO string
function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') {
    // GAS dates can be "Mon Dec 25 2023 00:00:00 GMT+0630" or "2023-12-25" etc
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function toNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function toStr(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

async function importData() {
  const jsonPath = process.argv[2] || path.join(__dirname, 'exported-data.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ File not found: ${jsonPath}`);
    console.error('📋 Please run gas-export.gs first, then save the JSON to this path.');
    process.exit(1);
  }

  console.log(`📂 Reading: ${jsonPath}`);
  const rawData = fs.readFileSync(jsonPath, 'utf-8');
  const data = JSON.parse(rawData);
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('🔄 Starting import...\n');

    // 1. Branches
    if (data.branches && data.branches.length > 0) {
      // Clear existing seed data
      await client.query('DELETE FROM branches');
      let count = 0;
      for (const b of data.branches) {
        await client.query(
          `INSERT INTO branches (id, name, code, address, phone, email, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET name=$2, code=$3, address=$4, phone=$5, email=$6`,
          [toStr(b.id), toStr(b.name), toStr(b.code), toStr(b.address), toStr(b.phone), toStr(b.email), toDate(b.createdAt) || new Date().toISOString()]
        );
        count++;
      }
      console.log(`✅ Branches: ${count} imported`);
    }

    // 2. Positions
    if (data.positions && data.positions.length > 0) {
      await client.query('DELETE FROM positions');
      let count = 0;
      for (const p of data.positions) {
        await client.query(
          `INSERT INTO positions (id, name, code, default_role, category, description, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET name=$2, code=$3, default_role=$4, category=$5, description=$6`,
          [toStr(p.id), toStr(p.name), toStr(p.code), toStr(p.defaultRole || p.default_role || 'VIEW'), toStr(p.category), toStr(p.description), toDate(p.createdAt) || new Date().toISOString()]
        );
        count++;
      }
      console.log(`✅ Positions: ${count} imported`);
    }

    // 3. Users (must come before contracts/projects for FK references)
    if (data.users && data.users.length > 0) {
      await client.query('DELETE FROM users');
      let count = 0;
      for (const u of data.users) {
        await client.query(
          `INSERT INTO users (id, email, password, name, role, position_id, position_code, position_name, category, description, branches, contracts, projects, targets, business, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO UPDATE SET email=$2, password=$3, name=$4, role=$5, position_code=$7, position_name=$8`,
          [
            toStr(u.id), toStr(u.email), toStr(u.password), toStr(u.name),
            toStr(u.role || 'VIEW'), toStr(u.positionId), toStr(u.positionCode),
            toStr(u.positionName), toStr(u.category), toStr(u.description),
            toStr(u.branches), toStr(u.contracts), toStr(u.projects),
            toStr(u.targets), toStr(u.business),
            toDate(u.createdAt) || new Date().toISOString()
          ]
        );
        count++;
      }
      console.log(`✅ Users: ${count} imported`);
    }

    // 4. Contracts
    if (data.contracts && data.contracts.length > 0) {
      await client.query('DELETE FROM invoices'); // FK constraint
      await client.query('DELETE FROM contracts');
      let count = 0;
      for (const c of data.contracts) {
        await client.query(
          `INSERT INTO contracts (id, code, name, branch_id, business_field, value, status, start_date, end_date, note, file_urls, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (id) DO NOTHING`,
          [
            toStr(c.id), toStr(c.code || c.contractCode), toStr(c.name || c.contractName),
            toStr(c.branchId || c.provinceId || c.branch_id), toStr(c.businessField || c.business_field || ''),
            toNum(c.value), toStr(c.status || 'TODO'),
            toDate(c.startDate || c.start_date), toDate(c.endDate || c.end_date),
            toStr(c.note || ''), toStr(c.fileUrls || c.file_urls || ''),
            toDate(c.createdAt || c.created_at) || new Date().toISOString()
          ]
        );
        count++;
      }
      console.log(`✅ Contracts: ${count} imported`);
    }

    // 5. Invoices
    if (data.invoices && data.invoices.length > 0) {
      let count = 0;
      for (const inv of data.invoices) {
        try {
          await client.query(
            `INSERT INTO invoices (id, contract_id, invoice_number, value, payment, issued_date, note, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO NOTHING`,
            [
              toStr(inv.id), toStr(inv.contractId || inv.contract_id),
              toStr(inv.invoiceNumber || inv.invoice_number || ''),
              toNum(inv.value), toNum(inv.payment || inv.paidAmount),
              toDate(inv.issuedDate || inv.issued_date),
              toStr(inv.note || ''), toStr(inv.status || ''),
              toDate(inv.createdAt || inv.created_at) || new Date().toISOString()
            ]
          );
          count++;
        } catch (e) {
          console.warn(`  ⚠️ Invoice ${inv.id}: ${e.message.substring(0, 80)}`);
        }
      }
      console.log(`✅ Invoices: ${count} imported`);
    }

    // 6. Projects
    if (data.projects && data.projects.length > 0) {
      await client.query('DELETE FROM tasks'); // FK
      await client.query('DELETE FROM projects');
      let count = 0;
      for (const p of data.projects) {
        const members = p.members || p.memberIds;
        await client.query(
          `INSERT INTO projects (id, code, name, status, start_date, end_date, manager_id, description, members, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
            toStr(p.id), toStr(p.code), toStr(p.name),
            toStr(p.status || 'TODO'),
            toDate(p.startDate || p.start_date), toDate(p.endDate || p.end_date),
            toStr(p.managerId || p.manager_id || ''), toStr(p.description || ''),
            typeof members === 'string' ? members : JSON.stringify(members || []),
            toDate(p.createdAt || p.created_at) || new Date().toISOString()
          ]
        );
        count++;
      }
      console.log(`✅ Projects: ${count} imported`);
    }

    // 7. Tasks
    if (data.tasks && data.tasks.length > 0) {
      let count = 0;
      for (const t of data.tasks) {
        try {
          await client.query(
            `INSERT INTO tasks (id, project_id, item_type, item_name, name, assignee_id, status, priority, due_date, description, "order", created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (id) DO NOTHING`,
            [
              toStr(t.id), toStr(t.projectId || t.project_id),
              toStr(t.itemType || t.item_type || ''), toStr(t.itemName || t.item_name || ''),
              toStr(t.name), toStr(t.assigneeId || t.assignee_id || ''),
              toStr(t.status || 'TODO'), toStr(t.priority || 'NORMAL'),
              toDate(t.dueDate || t.due_date), toStr(t.description || ''),
              parseInt(t.order) || 0,
              toDate(t.createdAt || t.created_at) || new Date().toISOString()
            ]
          );
          count++;
        } catch (e) {
          console.warn(`  ⚠️ Task ${t.id}: ${e.message.substring(0, 80)}`);
        }
      }
      console.log(`✅ Tasks: ${count} imported`);
    }

    // 8. Targets
    if (data.targets && data.targets.length > 0) {
      await client.query('DELETE FROM targets');
      let count = 0;
      for (const tgt of data.targets) {
        await client.query(
          `INSERT INTO targets (id, type, period_type, period, unit_type, unit_id, target_value, note, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            toStr(tgt.id), toStr(tgt.type), toStr(tgt.periodType || tgt.period_type),
            toStr(tgt.period), toStr(tgt.unitType || tgt.unit_type || ''),
            toStr(tgt.unitId || tgt.unit_id || ''),
            toNum(tgt.targetValue || tgt.target_value),
            toStr(tgt.note || ''),
            toDate(tgt.createdAt || tgt.created_at) || new Date().toISOString()
          ]
        );
        count++;
      }
      console.log(`✅ Targets: ${count} imported`);
    }

    // 9. Staff
    if (data.staff && data.staff.length > 0) {
      await client.query('DELETE FROM staff');
      let count = 0;
      for (const s of data.staff) {
        await client.query(
          `INSERT INTO staff (id, branch_id, name, position, phone, email, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [
            toStr(s.id), toStr(s.branchId || s.branch_id || ''),
            toStr(s.name), toStr(s.position || ''),
            toStr(s.phone || ''), toStr(s.email || ''),
            toDate(s.createdAt || s.created_at) || new Date().toISOString()
          ]
        );
        count++;
      }
      console.log(`✅ Staff: ${count} imported`);
    }

    // 10. Activities (last 500 only)
    if (data.activities && data.activities.length > 0) {
      await client.query('DELETE FROM activities');
      const recent = data.activities.slice(-500);
      let count = 0;
      for (const a of recent) {
        await client.query(
          `INSERT INTO activities (id, email, action, description, created_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO NOTHING`,
          [
            toStr(a.id), toStr(a.email || a.userId || ''),
            toStr(a.action), toStr(a.description || ''),
            toDate(a.createdAt || a.created_at || a.timestamp) || new Date().toISOString()
          ]
        );
        count++;
      }
      console.log(`✅ Activities: ${count} imported`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 Import complete! All data migrated successfully.');

    // Summary
    const tables = ['branches', 'positions', 'users', 'contracts', 'invoices', 'projects', 'tasks', 'targets', 'staff', 'activities'];
    console.log('\n📊 Database Summary:');
    for (const t of tables) {
      const res = await client.query(`SELECT COUNT(*) as c FROM ${t}`);
      console.log(`   ${t}: ${res.rows[0].c} rows`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Import failed:', err.message);
    console.error(err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

importData();
