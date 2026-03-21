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

// Normalize header: "BranchID" → "branchid", "CreatedAt" → "createdat", "ID" → "id"
function normalizeKey(key) {
  return key.trim().toLowerCase();
}

// Convert CSV rows to objects using normalized lowercase headers
function csvToObjects(csv) {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];
  
  const headers = rows[0].map(h => normalizeKey(h));
  return rows.slice(1).filter(row => row[0]).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (row[i] !== undefined && row[i] !== '') ? row[i] : null;
    });
    return obj;
  });
}

// Helper to get value from object with normalized keys
function g(obj, ...keys) {
  for (const k of keys) {
    const val = obj[normalizeKey(k)];
    if (val !== null && val !== undefined) return val;
  }
  return null;
}

function toDate(val) {
  if (!val) return null;
  // Try to parse as date string directly (YYYY-MM-DD or MM/DD/YYYY etc.)
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  // Extract local date components to avoid UTC timezone shift
  // This preserves the original date without subtracting timezone offset
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
    
    // Clear existing data (in correct FK order)
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
    
    // === Import each table independently ===

    // 1. Branches
    let count = 0;
    for (const b of testRows) {
      try {
        await client.query(
          `INSERT INTO branches (id, name, code, address, phone, email, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
          [toStr(g(b,'id')), toStr(g(b,'name')), toStr(g(b,'code')), toStr(g(b,'address')), toStr(g(b,'phone')), toStr(g(b,'email')), toDate(g(b,'createdat','createdAt')) || new Date().toISOString()]
        );
        count++;
      } catch (e) { console.warn(`  ⚠️ Branch ${g(b,'id')}: ${e.message}`); }
    }
    console.log(`✅ Branches: ${count}`);

    // 2. Positions
    try {
      const csv = await downloadCSV('Positions');
      const rows = csvToObjects(csv); count = 0;
      if (rows.length > 0) console.log(`  📋 Columns: ${Object.keys(rows[0]).join(', ')}`);
      for (const p of rows) {
        try {
          await client.query(
            `INSERT INTO positions (id, name, code, default_role, category, description, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
            [toStr(g(p,'id')), toStr(g(p,'name')), toStr(g(p,'code')), toStr(g(p,'defaultrole','default_role') || 'VIEW'), toStr(g(p,'category')), toStr(g(p,'description')), toDate(g(p,'createdat','createdAt')) || new Date().toISOString()]
          );
          count++;
        } catch (e) { console.warn(`  ⚠️ Position ${g(p,'id')}: ${e.message}`); }
      }
      console.log(`✅ Positions: ${count}`);
    } catch (e) { console.warn(`⚠️ Positions: ${e.message}`); }

    // 3. Users
    try {
      const csv = await downloadCSV('Users');
      const rows = csvToObjects(csv); count = 0;
      if (rows.length > 0) console.log(`  📋 Columns: ${Object.keys(rows[0]).join(', ')}`);
      for (const u of rows) {
        try {
          await client.query(
            `INSERT INTO users (id, email, password, name, role, position_id, position_code, position_name, category, description, branches, contracts, projects, targets, business, created_at) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (id) DO NOTHING`,
            [toStr(g(u,'id')), toStr(g(u,'email')), toStr(g(u,'password')), toStr(g(u,'name')), toStr(g(u,'role')||'VIEW'),
             toStr(g(u,'positionid','position_id')), toStr(g(u,'positioncode','position_code')), toStr(g(u,'positionname','position_name')), toStr(g(u,'category')),
             toStr(g(u,'description')), toStr(g(u,'branches')), toStr(g(u,'contracts')), toStr(g(u,'projects')),
             toStr(g(u,'targets')), toStr(g(u,'business')), toDate(g(u,'createdat','createdAt')) || new Date().toISOString()]
          );
          count++;
        } catch (e) { console.warn(`  ⚠️ User ${g(u,'email')}: ${e.message}`); }
      }
      console.log(`✅ Users: ${count}`);
    } catch (e) { console.warn(`⚠️ Users: ${e.message}`); }

    // 4. Contracts (columns: ID, Code, Name, BranchID, BusinessField, Value, StartDate, EndDate, Status, FileURL, Note, Progress, CreatedAt, CreatedBy)
    try {
      const csv = await downloadCSV('Contracts');
      const rows = csvToObjects(csv); count = 0;
      if (rows.length > 0) console.log(`  📋 Columns: ${Object.keys(rows[0]).join(', ')}`);
      for (const c of rows) {
        try {
          await client.query(
            `INSERT INTO contracts (id, code, name, branch_id, business_field, value, status, start_date, end_date, note, file_urls, progress, created_at, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
            [toStr(g(c,'id')), toStr(g(c,'code','contractcode')), toStr(g(c,'name','contractname')),
             toStr(g(c,'branchid','branch_id','provinceid')), toStr(g(c,'businessfield','business_field')),
             toNum(g(c,'value')), toStr(g(c,'status')||'TODO'),
             toDate(g(c,'startdate','start_date')), toDate(g(c,'enddate','end_date')),
             toStr(g(c,'note')), toStr(g(c,'fileurl','fileurls','file_urls')),
             parseInt(g(c,'progress'))||0, toDate(g(c,'createdat','created_at')) || new Date().toISOString(),
             toStr(g(c,'createdby','created_by'))]
          );
          count++;
        } catch (e) { console.warn(`  ⚠️ Contract ${g(c,'id')}: ${e.message}`); }
      }
      console.log(`✅ Contracts: ${count}`);
    } catch (e) { console.warn(`⚠️ Contracts: ${e.message}`); }

    // 5. Invoices (columns: id, contractId, invoiceNumber, installment, value, issuedDate, payment, createdAt, files)
    // DB schema: id, contract_id, invoice_number, installment, value, issued_date, payment, created_at, files
    try {
      const csv = await downloadCSV('Invoices');
      const rows = csvToObjects(csv); count = 0;
      if (rows.length > 0) console.log(`  📋 Columns: ${Object.keys(rows[0]).join(', ')}`);
      for (const inv of rows) {
        try {
          await client.query(
            `INSERT INTO invoices (id, contract_id, invoice_number, installment, value, issued_date, payment, created_at, files)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
            [toStr(g(inv,'id')), toStr(g(inv,'contractid','contract_id')),
             toStr(g(inv,'invoicenumber','invoice_number')),
             toStr(g(inv,'installment')),
             toNum(g(inv,'value')), toDate(g(inv,'issueddate','issued_date')),
             toNum(g(inv,'payment','paidamount')),
             toDate(g(inv,'createdat','created_at')) || new Date().toISOString(),
             toStr(g(inv,'files'))]
          );
          count++;
        } catch (e) { console.warn(`  ⚠️ Invoice ${g(inv,'id')}: ${e.message}`); }
      }
      console.log(`✅ Invoices: ${count}`);
    } catch (e) { console.warn(`⚠️ Invoices: ${e.message}`); }

    // 6. Projects (columns: id, code, name, status, managerId, contractId, location, investor, startDate, endDate, budget, description, members, createdAt)
    try {
      const csv = await downloadCSV('Projects');
      const rows = csvToObjects(csv); count = 0;
      if (rows.length > 0) console.log(`  📋 Columns: ${Object.keys(rows[0]).join(', ')}`);
      for (const p of rows) {
        try {
          const members = g(p,'members','memberids') || '[]';
          await client.query(
            `INSERT INTO projects (id, code, name, status, start_date, end_date, manager_id, contract_id, location, investor, budget, description, members, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
            [toStr(g(p,'id')), toStr(g(p,'code')), toStr(g(p,'name')), toStr(g(p,'status')||'TODO'),
             toDate(g(p,'startdate','start_date')), toDate(g(p,'enddate','end_date')),
             toStr(g(p,'managerid','manager_id')), toStr(g(p,'contractid','contract_id')),
             toStr(g(p,'location')), toStr(g(p,'investor')),
             toNum(g(p,'budget')), toStr(g(p,'description')),
             typeof members === 'string' ? members : JSON.stringify(members),
             toDate(g(p,'createdat','created_at')) || new Date().toISOString()]
          );
          count++;
        } catch (e) { console.warn(`  ⚠️ Project ${g(p,'id')}: ${e.message}`); }
      }
      console.log(`✅ Projects: ${count}`);
    } catch (e) { console.warn(`⚠️ Projects: ${e.message}`); }

    // 7. Tasks
    // DB schema: id, project_id, item_type, item_name, name, assignee_id, status, progress, start_date, end_date, description, priority, sort_order, created_at
    try {
      const csv = await downloadCSV('Tasks');
      const rows = csvToObjects(csv); count = 0;
      if (rows.length > 0) console.log(`  📋 Columns: ${Object.keys(rows[0]).join(', ')}`);
      for (const t of rows) {
        try {
          await client.query(
            `INSERT INTO tasks (id, project_id, item_type, item_name, name, assignee_id, status, progress, start_date, end_date, description, priority, sort_order, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
            [toStr(g(t,'id')), toStr(g(t,'projectid','project_id')),
             toStr(g(t,'itemtype','item_type')), toStr(g(t,'itemname','item_name')),
             toStr(g(t,'name')), toStr(g(t,'assigneeid','assignee_id')),
             toStr(g(t,'status')||'TODO'), parseInt(g(t,'progress'))||0,
             toDate(g(t,'startdate','start_date')), toDate(g(t,'enddate','end_date','duedate','due_date')),
             toStr(g(t,'description')), toStr(g(t,'priority')||'MEDIUM'),
             parseInt(g(t,'sortorder','sort_order','order'))||0,
             toDate(g(t,'createdat','created_at')) || new Date().toISOString()]
          );
          count++;
        } catch (e) { console.warn(`  ⚠️ Task ${g(t,'id')}: ${e.message}`); }
      }
      console.log(`✅ Tasks: ${count}`);
    } catch (e) { console.warn(`⚠️ Tasks: ${e.message}`); }

    // 8. Targets (columns: id, name, type, periodType, period, unitType, unitId, targetValue, createdAt)
    // DB schema: id, name, type, period_type, period, unit_type, unit_id, target_value, created_at (NO note column)
    try {
      const csv = await downloadCSV('Targets');
      const rows = csvToObjects(csv); count = 0;
      if (rows.length > 0) console.log(`  📋 Columns: ${Object.keys(rows[0]).join(', ')}`);
      for (const tgt of rows) {
        try {
          // Normalize Type
          let type = toStr(g(tgt,'type')).toUpperCase().trim();
          if (type.includes('NGUON') || type.includes('NGUỒN')) type = 'NGUON_VIEC';
          else if (type.includes('DOANH')) type = 'DOANH_THU';
          else if (type.includes('THU')) type = 'THU_TIEN';

          // Normalize Period Type
          let pType = toStr(g(tgt,'periodtype','period_type')).toUpperCase().trim();
          if (pType.includes('YEAR') || pType.includes('NĂM') || pType.includes('NAM')) pType = 'YEAR';
          else if (pType.includes('QUARTER') || pType.includes('QUÝ') || pType.includes('QUY')) pType = 'QUARTER';
          else if (pType.includes('MONTH') || pType.includes('THÁNG') || pType.includes('THANG')) pType = 'MONTH';

          // Normalize Period Value
          let period = toStr(g(tgt,'period')).trim().toUpperCase();
          if (period.endsWith('.0')) period = period.replace('.0', '');
          
          if (pType === 'YEAR') {
            if (period.includes('NĂM') || period.includes('NAM')) period = period.replace(/[^\d]/g, '');
          } else if (pType === 'QUARTER') {
            if (!period.includes('-')) {
              const q = period.replace(/[^\d]/g, '') || '1';
              period = `2026-Q${q}`; // Default to 2026 if year missing
            }
          } else if (pType === 'MONTH') {
            if (!period.includes('-')) {
              const m = period.replace(/[^\d]/g, '').padStart(2, '0') || '01';
              period = `2026-${m}`; // Default to 2026 if year missing
            }
          }

          await client.query(
            `INSERT INTO targets (id, name, type, period_type, period, unit_type, unit_id, target_value, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
            [toStr(g(tgt,'id')), toStr(g(tgt,'name')), type,
             pType, period,
             toStr(g(tgt,'unittype','unit_type')||'GENERAL'), toStr(g(tgt,'unitid','unit_id')),
             toNum(g(tgt,'targetvalue','target_value')),
             toDate(g(tgt,'createdat','created_at')) || new Date().toISOString()]
          );
          count++;
        } catch (e) { console.warn(`  ⚠️ Target ${g(tgt,'id')}: ${e.message}`); }
      }
      console.log(`✅ Targets: ${count}`);
    } catch (e) { console.warn(`⚠️ Targets: ${e.message}`); }

    // 9. Staff
    try {
      const csv = await downloadCSV('Staff');
      const rows = csvToObjects(csv); count = 0;
      for (const s of rows) {
        try {
          await client.query(
            `INSERT INTO staff (id, branch_id, name, position, phone, email, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
            [toStr(g(s,'id')), toStr(g(s,'branchid','branch_id')), toStr(g(s,'name')),
             toStr(g(s,'position')), toStr(g(s,'phone')), toStr(g(s,'email')),
             toDate(g(s,'createdat','created_at')) || new Date().toISOString()]
          );
          count++;
        } catch (e) { console.warn(`  ⚠️ Staff ${g(s,'id')}: ${e.message}`); }
      }
      console.log(`✅ Staff: ${count}`);
    } catch (e) { console.warn(`⚠️ Staff: ${e.message}`); }

    // 10. Activities (last 200)
    try {
      const csv = await downloadCSV('Activities');
      const rows = csvToObjects(csv); count = 0;
      const recent = rows.slice(-200);
      for (const a of recent) {
        try {
          await client.query(
            `INSERT INTO activities (id, email, action, description, created_at)
             VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
            [toStr(g(a,'id')), toStr(g(a,'email','userid')), toStr(g(a,'action')),
             toStr(g(a,'description')), toDate(g(a,'createdat','created_at','timestamp')) || new Date().toISOString()]
          );
          count++;
        } catch (e) { console.warn(`  ⚠️ Activity ${g(a,'id')}: ${e.message}`); }
      }
      console.log(`✅ Activities: ${count}`);
    } catch (e) { console.warn(`⚠️ Activities: ${e.message}`); }
    
    // Summary
    console.log('\n🎉 Migration complete!\n');
    console.log('📊 Database Summary:');
    const tables = ['branches', 'positions', 'users', 'contracts', 'invoices', 'projects', 'tasks', 'targets', 'staff', 'activities'];
    for (const t of tables) {
      const res = await client.query(`SELECT COUNT(*) as c FROM ${t}`);
      console.log(`   ${t}: ${res.rows[0].c} rows`);
    }

  } catch (err) {
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
