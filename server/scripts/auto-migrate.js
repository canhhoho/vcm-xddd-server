/**
 * VCM XDDD — Auto Data Migration
 * 
 * Downloads data directly from Google Sheets CSV export URLs
 * and imports into PostgreSQL. No manual steps needed.
 * 
 * Usage: node scripts/auto-migrate.js
 * 
 * Requires: Google Sheet must be shared as "Anyone with the link can view"
 */
require('dotenv').config();
const https = require('https');
const http = require('http');
const { Pool } = require('pg');

const SHEET_ID = '1ZOvkEJFPjP9NFCvhWx_enOQjzdeKnxMsFMf-7180Edc';

// Sheet names from Config.gs
const SHEETS = {
  Users: 'Users',
  Contracts: 'Contracts',
  Invoices: 'Invoices',
  Projects: 'Projects',
  Tasks: 'Tasks',
  Targets: 'Targets',
  Staff: 'Staff',
  Branches: 'Branches',
  Positions: 'Positions',
  Activities: 'Activities',
  ProjectMembers: 'ProjectMembers',
  ProjectItems: 'ProjectItems',
};

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'vcm_xddd',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Download CSV from Google Sheets
function downloadCSV(sheetName) {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    console.log(`  📥 Downloading ${sheetName}...`);
    
    const makeRequest = (reqUrl, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error('Too many redirects'));
      
      const protocol = reqUrl.startsWith('https') ? https : http;
      protocol.get(reqUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
          return makeRequest(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${sheetName}`));
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    };

    makeRequest(url);
  });
}

// Parse CSV (handles quoted fields with commas and newlines)
function parseCSV(csv) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f !== '')) rows.push(currentRow);
        currentRow = [];
        currentField = '';
        if (char === '\r') i++; // skip \n after \r
      } else {
        currentField += char;
      }
    }
  }
  // Last row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f !== '')) rows.push(currentRow);
  }
  
  return rows;
}

// Convert CSV rows to objects using headers
function csvToObjects(csv) {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];
  
  const headers = rows[0];
  return rows.slice(1).filter(row => row[0]).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (row[i] !== undefined && row[i] !== '') ? row[i] : null;
    });
    return obj;
  });
}

function toDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function toNum(val) { return parseFloat(val) || 0; }
function toStr(val) { return val ? String(val) : ''; }

async function migrate() {
  console.log('🚀 VCM XDDD — Auto Data Migration');
  console.log(`📊 Sheet ID: ${SHEET_ID}\n`);
  
  const client = await pool.connect();
  
  try {
    // Test download first
    console.log('📡 Testing Google Sheets access...');
    const testCSV = await downloadCSV('Branches');
    const testRows = csvToObjects(testCSV);
    if (testRows.length === 0) {
      console.error('❌ Cannot read Google Sheet. Make sure it is shared as "Anyone with the link can view"');
      console.error('📋 Open this URL and set sharing:');
      console.error(`   https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`);
      process.exit(1);
    }
    console.log(`✅ Sheet accessible! Branches: ${testRows.length} rows\n`);
    
    await client.query('BEGIN');
    
    // 1. Branches
    await client.query('DELETE FROM activities');
    await client.query('DELETE FROM staff');
    await client.query('DELETE FROM targets');
    await client.query('DELETE FROM tasks');
    await client.query('DELETE FROM invoices');
    await client.query('DELETE FROM contracts');
    await client.query('DELETE FROM projects');
    await client.query('DELETE FROM users');
    await client.query('DELETE FROM positions');
    await client.query('DELETE FROM branches');
    console.log('🗑️  Cleared existing data\n');
    
    // Import Branches
    let count = 0;
    for (const b of testRows) {
      await client.query(
        `INSERT INTO branches (id, name, code, address, phone, email, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [toStr(b.id), toStr(b.name), toStr(b.code), toStr(b.address), toStr(b.phone), toStr(b.email), toDate(b.createdAt) || 'now()']
      );
      count++;
    }
    console.log(`✅ Branches: ${count}`);

    // 2. Positions
    try {
      const csv = await downloadCSV('Positions');
      const rows = csvToObjects(csv); count = 0;
      for (const p of rows) {
        await client.query(
          `INSERT INTO positions (id, name, code, default_role, category, description, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
          [toStr(p.id), toStr(p.name), toStr(p.code), toStr(p.defaultRole || p.default_role || 'VIEW'), toStr(p.category), toStr(p.description), toDate(p.createdAt) || 'now()']
        );
        count++;
      }
      console.log(`✅ Positions: ${count}`);
    } catch (e) { console.warn(`⚠️ Positions: ${e.message}`); }

    // 3. Users
    try {
      const csv = await downloadCSV('Users');
      const rows = csvToObjects(csv); count = 0;
      for (const u of rows) {
        await client.query(
          `INSERT INTO users (id, email, password, name, role, position_id, position_code, position_name, category, description, branches, contracts, projects, targets, business, created_at) 
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (id) DO NOTHING`,
          [toStr(u.id), toStr(u.email), toStr(u.password), toStr(u.name), toStr(u.role||'VIEW'),
           toStr(u.positionId), toStr(u.positionCode), toStr(u.positionName), toStr(u.category),
           toStr(u.description), toStr(u.branches), toStr(u.contracts), toStr(u.projects),
           toStr(u.targets), toStr(u.business), toDate(u.createdAt) || 'now()']
        );
        count++;
      }
      console.log(`✅ Users: ${count}`);
    } catch (e) { console.warn(`⚠️ Users: ${e.message}`); }

    // 4. Contracts
    try {
      const csv = await downloadCSV('Contracts');
      const rows = csvToObjects(csv); count = 0;
      for (const c of rows) {
        await client.query(
          `INSERT INTO contracts (id, code, name, branch_id, business_field, value, status, start_date, end_date, note, file_urls, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
          [toStr(c.id), toStr(c.code||c.contractCode), toStr(c.name||c.contractName),
           toStr(c.branchId||c.provinceId||c.branch_id), toStr(c.businessField||c.business_field||''),
           toNum(c.value), toStr(c.status||'TODO'),
           toDate(c.startDate||c.start_date), toDate(c.endDate||c.end_date),
           toStr(c.note||''), toStr(c.fileUrls||c.file_urls||''),
           toDate(c.createdAt||c.created_at) || 'now()']
        );
        count++;
      }
      console.log(`✅ Contracts: ${count}`);
    } catch (e) { console.warn(`⚠️ Contracts: ${e.message}`); }

    // 5. Invoices
    try {
      const csv = await downloadCSV('Invoices');
      const rows = csvToObjects(csv); count = 0;
      for (const inv of rows) {
        try {
          await client.query(
            `INSERT INTO invoices (id, contract_id, invoice_number, value, payment, issued_date, note, status, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
            [toStr(inv.id), toStr(inv.contractId||inv.contract_id),
             toStr(inv.invoiceNumber||inv.invoice_number||''),
             toNum(inv.value), toNum(inv.payment||inv.paidAmount),
             toDate(inv.issuedDate||inv.issued_date), toStr(inv.note||''), toStr(inv.status||''),
             toDate(inv.createdAt||inv.created_at) || 'now()']
          );
          count++;
        } catch (e2) { /* skip FK errors */ }
      }
      console.log(`✅ Invoices: ${count}`);
    } catch (e) { console.warn(`⚠️ Invoices: ${e.message}`); }

    // 6. Projects
    try {
      const csv = await downloadCSV('Projects');
      const rows = csvToObjects(csv); count = 0;
      for (const p of rows) {
        const members = p.members || p.memberIds || '[]';
        await client.query(
          `INSERT INTO projects (id, code, name, status, start_date, end_date, manager_id, description, members, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
          [toStr(p.id), toStr(p.code), toStr(p.name), toStr(p.status||'TODO'),
           toDate(p.startDate||p.start_date), toDate(p.endDate||p.end_date),
           toStr(p.managerId||p.manager_id||''), toStr(p.description||''),
           typeof members === 'string' ? members : JSON.stringify(members),
           toDate(p.createdAt||p.created_at) || 'now()']
        );
        count++;
      }
      console.log(`✅ Projects: ${count}`);
    } catch (e) { console.warn(`⚠️ Projects: ${e.message}`); }

    // 7. Tasks
    try {
      const csv = await downloadCSV('Tasks');
      const rows = csvToObjects(csv); count = 0;
      for (const t of rows) {
        try {
          await client.query(
            `INSERT INTO tasks (id, project_id, item_type, item_name, name, assignee_id, status, priority, due_date, description, "order", created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
            [toStr(t.id), toStr(t.projectId||t.project_id),
             toStr(t.itemType||t.item_type||''), toStr(t.itemName||t.item_name||''),
             toStr(t.name), toStr(t.assigneeId||t.assignee_id||''),
             toStr(t.status||'TODO'), toStr(t.priority||'NORMAL'),
             toDate(t.dueDate||t.due_date), toStr(t.description||''),
             parseInt(t.order)||0, toDate(t.createdAt||t.created_at) || 'now()']
          );
          count++;
        } catch (e2) { /* skip FK errors */ }
      }
      console.log(`✅ Tasks: ${count}`);
    } catch (e) { console.warn(`⚠️ Tasks: ${e.message}`); }

    // 8. Targets
    try {
      const csv = await downloadCSV('Targets');
      const rows = csvToObjects(csv); count = 0;
      for (const tgt of rows) {
        await client.query(
          `INSERT INTO targets (id, type, period_type, period, unit_type, unit_id, target_value, note, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
          [toStr(tgt.id), toStr(tgt.type), toStr(tgt.periodType||tgt.period_type),
           toStr(tgt.period), toStr(tgt.unitType||tgt.unit_type||''),
           toStr(tgt.unitId||tgt.unit_id||''), toNum(tgt.targetValue||tgt.target_value),
           toStr(tgt.note||''), toDate(tgt.createdAt||tgt.created_at) || 'now()']
        );
        count++;
      }
      console.log(`✅ Targets: ${count}`);
    } catch (e) { console.warn(`⚠️ Targets: ${e.message}`); }

    // 9. Staff
    try {
      const csv = await downloadCSV('Staff');
      const rows = csvToObjects(csv); count = 0;
      for (const s of rows) {
        await client.query(
          `INSERT INTO staff (id, branch_id, name, position, phone, email, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
          [toStr(s.id), toStr(s.branchId||s.branch_id||''), toStr(s.name),
           toStr(s.position||''), toStr(s.phone||''), toStr(s.email||''),
           toDate(s.createdAt||s.created_at) || 'now()']
        );
        count++;
      }
      console.log(`✅ Staff: ${count}`);
    } catch (e) { console.warn(`⚠️ Staff: ${e.message}`); }

    // 10. Activities (last 200)
    try {
      const csv = await downloadCSV('Activities');
      const rows = csvToObjects(csv); count = 0;
      const recent = rows.slice(-200);
      for (const a of recent) {
        await client.query(
          `INSERT INTO activities (id, email, action, description, created_at)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
          [toStr(a.id), toStr(a.email||a.userId||''), toStr(a.action),
           toStr(a.description||''), toDate(a.createdAt||a.created_at||a.timestamp) || 'now()']
        );
        count++;
      }
      console.log(`✅ Activities: ${count}`);
    } catch (e) { console.warn(`⚠️ Activities: ${e.message}`); }

    await client.query('COMMIT');
    
    // Summary
    console.log('\n🎉 Migration complete!\n');
    console.log('📊 Database Summary:');
    const tables = ['branches', 'positions', 'users', 'contracts', 'invoices', 'projects', 'tasks', 'targets', 'staff', 'activities'];
    for (const t of tables) {
      const res = await client.query(`SELECT COUNT(*) as c FROM ${t}`);
      console.log(`   ${t}: ${res.rows[0].c} rows`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', err.message);
    if (err.message.includes('403') || err.message.includes('401')) {
      console.error('\n📋 Sheet is not publicly accessible. Please:');
      console.error(`   1. Open: https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`);
      console.error('   2. Click "Share" → "Anyone with the link" → "Viewer"');
      console.error('   3. Run this script again');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
