const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const LIBS = process.env.LIBS_DIR || (__dirname + '/node_modules/');
const PAGES = __dirname + '/../';
const SB = 'bkfsjhhclbqrhaolvhmz.supabase.co';
const ANON = fs.readFileSync(PAGES + 'dashboard.html', 'utf8').match(/SUPABASE_KEY = '([^']+)'/)[1];
const lib = {
  'react@18/umd/react.production.min.js': 'react/umd/react.production.min.js',
  'react-dom@18/umd/react-dom.production.min.js': 'react-dom/umd/react-dom.production.min.js',
  '@babel/standalone/babel.min.js': '@babel/standalone/babel.min.js',
  'xlsx@0.18.5/dist/xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js',
  '@supabase/supabase-js@2.45.4': '@supabase/supabase-js/dist/umd/supabase.js',
  '@supabase/supabase-js@2': '@supabase/supabase-js/dist/umd/supabase.js',   // would only match the UNPATCHED tag
  'ajax/libs/Chart.js/4.4.1/chart.umd.min.js': 'chart.js/dist/chart.umd.js',
};
const results = []; let failed = 0;
const check = (name, ok, extra='') => { results.push(`${ok?'PASS':'FAIL'}  ${name}${extra?'  — '+extra:''}`); if(!ok) failed++; };

(async () => {
  const browser = await chromium.launch();
  for (const target of ['Lowes-KPI.html', 'dashboard.html']) {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    const rest = [];            // every data request the page makes
    const unmatched = [];
    await page.route('**/*', async (route) => {
      const req = route.request(); const url = new URL(req.url());
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': req.headers()['access-control-request-headers'] || '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (url.hostname === 'hscs.test') {
        const f = url.pathname.slice(1);
        return route.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(PAGES + f, 'utf8') });
      }
      for (const [k, v] of Object.entries(lib)) if (req.url().includes(k)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(LIBS + v) });
      if (url.hostname === SB) {
        const auth = req.headers()['authorization'] || '';
        if (url.pathname === '/auth/v1/token') {
          const b = JSON.parse(req.postData() || '{}');
          if (b.email === 'staff@example.test' && b.password === 'right-password' || b.email === 'norole@example.test' && b.password === 'right-password') {
            const user = { id: b.email === 'staff@example.test' ? '00000000-0000-0000-0000-0000000000a1' : '00000000-0000-0000-0000-0000000000a9', aud: 'authenticated', role: 'authenticated', email: b.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
            return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ access_token: b.email.startsWith('staff') ? 'staff-token' : 'norole-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, refresh_token: 'r', user }) });
          }
          return route.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: JSON.stringify({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }) });
        }
        if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
        if (url.pathname.startsWith('/rest/v1/')) {
          rest.push({ method: req.method(), table: url.pathname.split('/').pop(), auth, profile: req.headers()['accept-profile'] || '' });
          if (auth === `Bearer ${ANON}` || auth === 'Bearer ' || auth === '') return route.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'permission denied' }) });
          if (auth === 'Bearer norole-token') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '[]' });
          const rows = url.pathname.endsWith('/ltr_data') ? [{ id: 1, store_number: '0001', store_name: 'Mock Store 1', ltr_score: 9, market: 'Mock Market', carrier: 'Mock Carrier', contractor_carrier: 'Mock Carrier', detractor: 'N' }]
                     : url.pathname.endsWith('/kpi_spe_weekly') ? [{ id: 1, week_ending: '2026-01-04', carrier: 'Mock Carrier', spe_name: 'Mock Driver', routes: 3, completion_pct: 99, on_time_pct: 98 }]
                     : url.pathname.endsWith('/kpi_sp_weekly') ? [{ id: 1, week_ending: '2026-01-04', carrier: 'Mock Carrier', routes: 5, completion_pct: 99, on_time_pct: 98 }] : [];
          return route.fulfill({ status: 200, headers: { ...cors, 'content-range': `0-${rows.length-1}/${rows.length}` }, contentType: 'application/json', body: JSON.stringify(rows) });
        }
      }
      if (/fonts\.(googleapis|gstatic)/.test(url.hostname)) return route.fulfill({ status: 200, body: '' });
      unmatched.push(req.url()); return route.abort();
    });
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    const T = (s) => `[${target}] ${s}`;
    const fill = async (em, pw) => {
      if (target === 'dashboard.html') { await page.fill('#authEmail', em); await page.fill('#authPassword', pw); await page.click('#authSubmit'); }
      else { await page.fill('input[type=email]', em); await page.fill('input[type=password]', pw); await page.click('button[type=submit]'); }
    };
    const gateVisible = () => target === 'dashboard.html' ? page.locator('#authGate').isVisible() : page.getByText('Sign in with your Herman Supply Chain Solutions staff account.').isVisible();

    await page.goto('https://hscs.test/' + target); await page.waitForTimeout(2500);
    check(T('signed out: login form is shown'), await gateVisible());
    check(T('signed out: ZERO data requests made'), rest.length === 0, `${rest.length} requests`);

    await fill('staff@example.test', 'wrong'); await page.waitForTimeout(800);
    check(T('wrong password: friendly error shown'), await page.getByText('Email or password not recognised.').isVisible());
    check(T('wrong password: still zero data requests'), rest.length === 0, `${rest.length} requests`);

    await fill('staff@example.test', 'right-password'); await page.waitForTimeout(3000);
    check(T('correct password: login form gone'), !(await gateVisible()));
    check(T('signed in: sign-out button shows the account'), await page.getByText('Sign out (staff@example.test)').isVisible());
    check(T('signed in: data requests were made'), rest.length > 0, `${rest.length} requests`);
    check(T('signed in: EVERY data request carries the user token, none the public key'), rest.every(r => r.auth === 'Bearer staff-token'), [...new Set(rest.map(r => r.auth.slice(0, 20)))].join(' | '));
    if (target === 'dashboard.html') check(T('signed in: requests still use the dpi schema'), rest.every(r => r.profile === 'dpi'));
    else check(T('signed in: dashboard shows the mock data'), (await page.content()).includes('Mock') || (await page.locator('text=Executive Summary').count()) > 0);

    await page.reload(); await page.waitForTimeout(3000);
    check(T('reload: session persists, no login form'), !(await gateVisible()));

    const before = rest.length;
    await page.getByText('Sign out (staff@example.test)').click(); await page.waitForTimeout(2500);
    check(T('sign out: login form returns'), await gateVisible());
    if (target === 'Lowes-KPI.html') check(T('sign out: loaded data is gone from the page'), !(await page.content()).includes('Mock Store 1'));
    check(T('sign out: no further data requests'), rest.length === before, `${rest.length - before} extra`);

    await fill('norole@example.test', 'right-password'); await page.waitForTimeout(3000);
    check(T('signed in WITHOUT a staff role: page does not crash'), errors.length === 0 && !(await gateVisible()), errors.join(' ; ').slice(0, 120));
    check(T('no unexpected network requests'), unmatched.length === 0, unmatched.slice(0, 3).join(', '));
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n')); console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
