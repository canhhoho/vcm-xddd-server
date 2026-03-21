/**
 * VCM XDDD — Data Export Script
 * 
 * Chạy function exportAllData() trong GAS Script Editor
 * → Copy JSON output từ Logger → Paste vào file JSON
 * → Chạy Node.js import script
 * 
 * CÁCH DÙNG:
 * 1. Mở Google Apps Script Editor
 * 2. Paste toàn bộ code này vào cuối file Code.gs (hoặc tạo file Export.gs mới)
 * 3. Chạy function: exportAllDataToSheets()
 * 4. Mở Google Sheets → thấy sheet "EXPORT_JSON" chứa data
 * 5. Copy nội dung cell A1 → paste vào file exported-data.json
 */

function exportAllDataToSheets() {
  const ss = getSS();
  
  // Collect all data
  const exportData = {};
  
  // 1. Users
  try {
    const usersSheet = ss.getSheetByName('Users');
    if (usersSheet) {
      const data = usersSheet.getDataRange().getValues();
      const headers = data[0];
      exportData.users = data.slice(1).filter(r => r[0]).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
      });
      Logger.log('✅ Users: ' + exportData.users.length);
    }
  } catch(e) { Logger.log('❌ Users: ' + e); }

  // 2. Contracts  
  try {
    const sheet = ss.getSheetByName('Contracts');
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      exportData.contracts = data.slice(1).filter(r => r[0]).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] !== '' ? row[i] : null; });
        return obj;
      });
      Logger.log('✅ Contracts: ' + exportData.contracts.length);
    }
  } catch(e) { Logger.log('❌ Contracts: ' + e); }

  // 3. Invoices
  try {
    const sheet = ss.getSheetByName('Invoices');
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      exportData.invoices = data.slice(1).filter(r => r[0]).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] !== '' ? row[i] : null; });
        return obj;
      });
      Logger.log('✅ Invoices: ' + exportData.invoices.length);
    }
  } catch(e) { Logger.log('❌ Invoices: ' + e); }

  // 4. Projects
  try {
    const sheet = ss.getSheetByName('Projects');
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      exportData.projects = data.slice(1).filter(r => r[0]).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] !== '' ? row[i] : null; });
        return obj;
      });
      Logger.log('✅ Projects: ' + exportData.projects.length);
    }
  } catch(e) { Logger.log('❌ Projects: ' + e); }

  // 5. Tasks
  try {
    const sheet = ss.getSheetByName('Tasks');
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      exportData.tasks = data.slice(1).filter(r => r[0]).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] !== '' ? row[i] : null; });
        return obj;
      });
      Logger.log('✅ Tasks: ' + exportData.tasks.length);
    }
  } catch(e) { Logger.log('❌ Tasks: ' + e); }

  // 6. Targets
  try {
    const sheet = ss.getSheetByName('Targets');
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      exportData.targets = data.slice(1).filter(r => r[0]).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] !== '' ? row[i] : null; });
        return obj;
      });
      Logger.log('✅ Targets: ' + exportData.targets.length);
    }
  } catch(e) { Logger.log('❌ Targets: ' + e); }

  // 7. Staff
  try {
    const sheet = ss.getSheetByName('Staff');
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      exportData.staff = data.slice(1).filter(r => r[0]).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] !== '' ? row[i] : null; });
        return obj;
      });
      Logger.log('✅ Staff: ' + exportData.staff.length);
    }
  } catch(e) { Logger.log('❌ Staff: ' + e); }

  // 8. Branches
  try {
    const sheet = ss.getSheetByName('Branches');
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      exportData.branches = data.slice(1).filter(r => r[0]).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] !== '' ? row[i] : null; });
        return obj;
      });
      Logger.log('✅ Branches: ' + exportData.branches.length);
    }
  } catch(e) { Logger.log('❌ Branches: ' + e); }

  // 9. Positions
  try {
    const sheet = ss.getSheetByName('Positions');
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      exportData.positions = data.slice(1).filter(r => r[0]).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] !== '' ? row[i] : null; });
        return obj;
      });
      Logger.log('✅ Positions: ' + exportData.positions.length);
    }
  } catch(e) { Logger.log('❌ Positions: ' + e); }

  // 10. Activities
  try {
    const sheet = ss.getSheetByName('Activities');
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      exportData.activities = data.slice(1).filter(r => r[0]).map(row => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] !== '' ? row[i] : null; });
        return obj;
      });
      Logger.log('✅ Activities: ' + exportData.activities.length);
    }
  } catch(e) { Logger.log('❌ Activities: ' + e); }

  // Write to a special sheet for easy copy
  const jsonStr = JSON.stringify(exportData);
  let exportSheet = ss.getSheetByName('EXPORT_JSON');
  if (!exportSheet) {
    exportSheet = ss.insertSheet('EXPORT_JSON');
  }
  exportSheet.clear();
  
  // Split JSON into chunks of 50000 chars (Google Sheets cell limit)
  const CHUNK_SIZE = 49000;
  const chunks = [];
  for (let i = 0; i < jsonStr.length; i += CHUNK_SIZE) {
    chunks.push(jsonStr.substring(i, i + CHUNK_SIZE));
  }
  
  chunks.forEach((chunk, i) => {
    exportSheet.getRange(i + 1, 1).setValue(chunk);
  });
  
  Logger.log('========================================');
  Logger.log('✅ Export complete!');
  Logger.log('📊 Total JSON size: ' + jsonStr.length + ' chars (' + chunks.length + ' chunks)');
  Logger.log('📋 Data written to sheet: EXPORT_JSON');
  Logger.log('');
  Logger.log('NEXT STEPS:');
  Logger.log('1. Open sheet "EXPORT_JSON"');
  Logger.log('2. Copy ALL cell contents (A1:A' + chunks.length + ')');
  Logger.log('3. Paste into file: server/scripts/exported-data.json');
  Logger.log('4. Run: node scripts/import-data.js');
  Logger.log('========================================');
  
  // Also try DriveApp to save as file
  try {
    const file = DriveApp.createFile('vcm-xddd-export.json', jsonStr, 'application/json');
    Logger.log('📁 Also saved as Drive file: ' + file.getUrl());
  } catch(e) {
    Logger.log('⚠️ Could not save to Drive: ' + e);
  }
}
