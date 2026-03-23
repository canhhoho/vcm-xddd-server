/**
 * Quick API test — verifies positions and targets endpoints
 */
require('dotenv').config();
const http = require('http');

function request(path, token, body) {
  return new Promise((resolve, reject) => {
    const isPost = !!body;
    const options = {
      hostname: 'localhost', port: 3001,
      path: '/api' + path,
      method: isPost ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } 
        catch(e) { reject(new Error('Invalid JSON: ' + data.substring(0, 100))); }
      });
    });
    req.on('error', reject);
    if (isPost) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  // Login
  console.log('🔑 Logging in...');
  const login = await request('/auth/login', null, { email: 'admin@vcm.com', password: 'vcm123' });
  if (!login.success) { console.error('❌ Login failed:', login.error); return; }
  const token = login.token || login.user?.token || login.data?.token;
  if (!token) { console.error('❌ No token! Keys:', JSON.stringify(login).substring(0, 200)); return; }
  console.log('✅ Login OK\n');

  // Test Positions
  console.log('📋 === POSITIONS ===');
  const pos = await request('/positions', token);
  if (!pos.success) { console.error('❌ Positions error:', pos.error); }
  else {
    pos.data.forEach(p => console.log(`  ✅ "${p.name || '(EMPTY!)'}" [${p.code || '-'}]`));
    const bad = pos.data.filter(p => !p.name || p.name === p.id);
    console.log(bad.length === 0
      ? `\n  🎯 All ${pos.data.length} positions have proper names!`
      : `\n  ❌ ${bad.length} positions have EMPTY names`);
  }

  // Test Targets
  console.log('\n📋 === TARGETS ===');
  const tgt = await request('/targets', token);
  if (!tgt.success) { console.error('❌ Targets error:', tgt.error); }
  else {
    tgt.data.forEach(t => {
      const ok = t.period && t.period !== '0' && t.name;
      console.log(`  ${ok ? '✅' : '❌'} "${t.name}" | period=${t.period} | type=${t.type} | unit=${t.unitName} | value=${t.targetValue}`);
    });
    const badP = tgt.data.filter(t => !t.period || t.period === '0');
    const badN = tgt.data.filter(t => !t.name);
    console.log(`\n  Period: ${badP.length === 0 ? '✅ All OK' : '❌ ' + badP.length + ' bad'}`);
    console.log(`  Names:  ${badN.length === 0 ? '✅ All OK' : '❌ ' + badN.length + ' missing'}`);
  }

  // Test Users
  console.log('\n📋 === USERS ===');
  const usr = await request('/users', token);
  if (!usr.success) { console.error('❌ Users error:', usr.error); }
  else {
    usr.data.forEach(u => {
      const ok = u.positionName && u.positionName !== u.positionId;
      console.log(`  ${ok ? '✅' : '⚠️'} ${u.name} | position="${u.positionName || '(empty)'}" [${u.positionCode || '-'}]`);
    });
  }

  console.log('\n🎉 API test complete!');
}

test().catch(e => console.error('Fatal:', e));
