// Mock-mode E2E smoke. Run (repo root):  python3 -m http.server -d site 8765 &
//   npm i --no-save playwright-core && npx playwright-core install chromium   (once per machine)
//   node tests/e2e/smoke.cjs <screenshot-dir>
// Not picked up by `node --test` (no .test. in the name).
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const fs = require('fs');
const assert = require('assert');
const S = process.argv[2];
const base = 'http://localhost:8765/';
const FIX = require('path').join(__dirname, '..', 'fixtures') + '/';
const log = [], errs = [];
const hook = p => { p.on('console', m => { if (m.type()==='error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR '+e.message)); };
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\n/g,' | ');
const toast = async p => { await p.waitForSelector('.toast.in'); await p.waitForTimeout(350); return (await p.locator('.toast.in').last().innerText()).replace(/\n/g,' | '); };

async function run(browser, scheme) {
  const L = m => log.push(`[${scheme}] ${m}`);
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, acceptDownloads:true, colorScheme: scheme });
  const page = await ctx.newPage(); hook(page);
  await page.goto(base+'admin.html?api=mock');
  await page.evaluate(()=>localStorage.clear());
  await page.goto(base+'admin.html?api=mock');
  L('mock badge visible='+await page.isVisible('#mode'));
  await page.fill('#key','secret');
  await page.click('#eye'); assert.equal(await page.getAttribute('#key','type'),'text');
  await page.click('#eye'); assert.equal(await page.getAttribute('#key','type'),'password');
  await page.setInputFiles('#fStudents', FIX+'students.csv');
  await page.setInputFiles('#fSups', FIX+'supervisors.csv');
  await page.waitForSelector('#roomsW:not(.hidden)');
  L('dropzone1: '+await txt(page,'#dz1')+' done='+await page.locator('#dz1.done').count());
  L('validation: '+(await txt(page,'#msgs')).slice(0,200)+' setup disabled='+await page.isDisabled('#bSetup'));
  await page.screenshot({path:`${S}/redesign-admin-setup-${scheme}.png`, fullPage:true});
  await page.click('#bSetup');
  await page.waitForSelector('.sheet-back.open .yes'); await page.click('.sheet-back.open .yes');
  await page.waitForSelector('#sec-links:not(.hidden) .sup-card');
  L('setup toast: '+await toast(page,'#toasts'));
  const cards = await page.locator('.sup-card').count();
  await page.fill('#lf','auditorio'); L('links total '+cards+' filtered visible '+await page.locator('.sup-card:visible').count()); await page.fill('#lf','');
  await page.click('.sup-card .btn'); L('copy btn: '+await page.locator('.sup-card .btn').first().innerText());
  L('admin(390) hscroll '+await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
  const link = await page.locator('.sup-card a').first().getAttribute('href');

  await page.goto(link);
  await page.waitForSelector('#app:not(.hidden)');
  L('hdr: '+await txt(page,'.top')+' tab='+await page.evaluate(()=>localStorage.tr_sup_tab));
  const submit = async id => { await page.fill('#idIn', id); await page.click('#bGo'); };
  await submit('202600001');
  L('ok toast: '+await toast(page));
  assert((await page.locator('#flash.go.ok').count())===1);
  await page.waitForTimeout(300);
  await page.screenshot({path:`${S}/redesign-sup-scan-${scheme}.png`});
  await submit('202600281');
  await page.waitForSelector('.sheet-back.open');
  L('wrong sheet: '+await txt(page,'.sheet'));
  await page.waitForTimeout(500);
  await page.screenshot({path:`${S}/redesign-sup-sheet-${scheme}.png`});
  await page.click('.sheet-back.open .yes'); await page.waitForTimeout(400);
  await submit('202600001');
  L('dup toast: '+await toast(page));
  await submit('999999999');
  await page.waitForSelector('.sheet-back.open');
  L('unknown sheet: '+await txt(page,'.sheet'));
  await page.click('.sheet-back.open .yes'); await page.waitForTimeout(500);
  L('sync pill: '+await txt(page,'#sync')+' cnt='+await page.innerText('#cnt')+' of='+await page.innerText('#cntOf'));
  await page.waitForTimeout(1200);
  L('cnt after anim='+await page.innerText('#cnt')+' sync='+await txt(page,'#sync'));
  L('recent: '+await txt(page,'#recent'));

  // Lista tab
  await page.click('#tabs [data-v=list]');
  assert.equal(await page.evaluate(()=>localStorage.tr_sup_tab),'list');
  const all = await page.locator('#roster li .row').count();
  L('roster rows '+all+' others: '+await txt(page,'#others'));
  await page.fill('#q','SOFIA'); const sof = await page.locator('#roster li .row').count();
  L('search SOFIA -> '+sof);
  await page.fill('#q','zzzz'); L('empty: '+await txt(page,'#roster')); await page.fill('#q','');
  await page.click('#flt [data-v=missing]'); const miss = await page.locator('#roster li button.row').count();
  await page.click('#flt [data-v=done]'); const done = await page.locator('#roster li .row').count();
  L(`filters: all=${all} missing=${miss} done=${done}`);
  assert.equal(miss+done, all);
  await page.click('#flt [data-v=missing]');
  await page.waitForTimeout(700);
  await page.screenshot({path:`${S}/redesign-sup-list-${scheme}.png`});
  const first = page.locator('#roster li button.row').first();
  const who = (await first.locator('.nm').innerText());
  await first.click();
  await page.waitForSelector('.sheet-back.open');
  L('register sheet: '+await txt(page,'.sheet'));
  await page.click('.sheet-back.open .yes');
  await page.waitForTimeout(500);
  L(`after register missing=${await page.locator('#roster li button.row').count()} (was ${miss}); ${who} -> `+await txt(page,'.toast.in'));
  assert.equal(await page.locator('#roster li button.row').count(), miss-1);
  await page.click('#flt [data-v=all]');
  await page.screenshot({path:`${S}/redesign-sup-list-all-${scheme}.png`, fullPage:false});

  // QR tab
  await page.click('#tabs [data-v=qr]');
  await page.waitForSelector('#qrBox[data-checkin-url]:not([data-checkin-url=""])');
  const url = await page.getAttribute('#qrBox','data-checkin-url');
  L('checkin url '+url+' | '+await page.innerText('#qrCount'));
  await page.waitForTimeout(3600);
  await page.screenshot({path:`${S}/redesign-sup-qr-${scheme}.png`});
  L('dbg '+await page.evaluate(()=>{const o=[];document.querySelectorAll('body *').forEach(e=>{if(e.scrollWidth>e.clientWidth+0 && e.clientWidth>0)o.push(e.tagName+'.'+e.className+'#'+e.id+' '+e.scrollWidth+'/'+e.clientWidth)});return o.slice(0,8).join(' ; ')}));L('sup hscroll '+await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth&&e.getBoundingClientRect().width>0).slice(0,5).map(e=>e.tagName+'.'+e.className+'#'+e.id+' '+Math.round(e.getBoundingClientRect().right)).join(', ')+' sw='+document.documentElement.scrollWidth));
  // tab restore
  await page.reload(); await page.waitForSelector('#app:not(.hidden)');
  L('restored tab qr visible='+await page.isVisible('#tab-qr'));
  await page.click('#tabs [data-v=scan]');

  // check-in
  const p2 = await ctx.newPage(); hook(p2);
  await p2.goto(url);
  await p2.screenshot({path:`${S}/redesign-checkin-form-${scheme}.png`});
  await p2.fill('#idIn','202600008'); await p2.click('#go');
  await p2.waitForSelector('#result.ok');
  await p2.waitForTimeout(900);
  L('checkin: '+await txt(p2,'#result'));
  await p2.screenshot({path:`${S}/redesign-checkin-ok-${scheme}.png`});
  await p2.click('#again'); await p2.fill('#idIn','202600008'); await p2.click('#go'); await p2.waitForSelector('#result.info');
  L('checkin dup: '+await txt(p2,'#result'));
  await p2.click('#again'); await p2.fill('#idIn','202600288'); await p2.click('#go'); await p2.waitForSelector('#result.warn'); await p2.waitForTimeout(800);
  L('checkin wrong room: '+await txt(p2,'#result'));
  await p2.screenshot({path:`${S}/redesign-checkin-wrong-${scheme}.png`});
  await p2.goto(base+'checkin.html?api=mock&c=E26%2FP5%2FAuditorio%202&k=bad');
  await p2.fill('#idIn','202600015'); await p2.click('#go'); await p2.waitForSelector('#result.bad'); await p2.waitForTimeout(800);
  L('bad code: '+await txt(p2,'#result'));
  await p2.screenshot({path:`${S}/redesign-checkin-expired-${scheme}.png`});
  await p2.goto(url); await p2.evaluate(()=>{window.__forceOffline=true}); await p2.fill('#idIn','202600015'); await p2.click('#go');
  await p2.waitForTimeout(500); L('offline retry: '+await txt(p2,'#result'));
  await p2.goto(base+'checkin.html?api=mock'); L('bad link: '+await txt(p2,'#result'));

  // error screen + landing
  await p2.goto(base+'supervisor.html?api=mock&t=nope'); await p2.waitForSelector('#err:not(.hidden)');
  L('err screen: '+await txt(p2,'#err'));
  await p2.screenshot({path:`${S}/redesign-sup-error-${scheme}.png`});
  await p2.goto(base+'index.html'); L('index hscroll '+await p2.evaluate(()=>document.documentElement.scrollWidth>innerWidth)+' tiles '+await p2.locator('.tile').count());
  await p2.screenshot({path:`${S}/redesign-index-${scheme}.png`});

  // admin dashboard desktop
  await p2.setViewportSize({width:1280,height:800});
  await p2.goto(base+'admin.html?api=mock');
  L('admin restored tab: '+await p2.evaluate(()=>localStorage.tr_admin_tab));
  await p2.click('#tabs [data-v=dash]');
  await p2.waitForSelector('.crow');
  await p2.waitForTimeout(1200);
  L('kpis: '+await txt(p2,'#kpis')+' upd='+await p2.innerText('#upd'));
  await p2.click('.chead >> nth=0'); await p2.waitForTimeout(600);
  assert(await p2.locator('.crow.open').count()===1);
  L('expanded: '+(await txt(p2,'.crow.open')).slice(0,400));
  await p2.click('#sort [data-v=absent]'); await p2.click('#sort [data-v=pct]');
  L('first room by pct: '+await p2.locator('.crow .cn').first().innerText());
  await p2.fill('#sq','sofía demo 2'); L('search by name: '+(await txt(p2,'#sres')).slice(0,300));
  await p2.fill('#sq','202600281'); L('search wrong-room id: '+(await txt(p2,'#sres')).slice(0,300));
  await p2.fill('#sq','999999999'); L('search unknown id: '+(await txt(p2,'#sres')).slice(0,300));
  await p2.fill('#sq','202600008');
  await p2.mouse.move(0,0); await p2.waitForTimeout(500);
  await p2.screenshot({path:`${S}/redesign-admin-dash-${scheme}.png`});
  await p2.click('.chead >> nth=0');
  await p2.screenshot({path:`${S}/redesign-admin-links-${scheme}.png`});
  await p2.click('#auto'); L('auto checked='+await p2.isChecked('#auto'));
  const [dl] = await Promise.all([p2.waitForEvent('download'), p2.click('#bCsv')]);
  const csv = fs.readFileSync(await dl.path(),'utf8');
  L('csv '+dl.suggestedFilename()+' lines '+csv.split('\n').length);
  await p2.click('#tabs [data-v=links]'); await p2.click('#bLoad'); await p2.waitForSelector('.sup-card');
  await p2.screenshot({path:`${S}/redesign-admin-links-${scheme}.png`});
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args:['--no-sandbox'] });
  for (const scheme of ['light','dark']) await run(browser, scheme);
  log.push('errors: '+JSON.stringify(errs));
  console.log(log.join('\n'));
  await browser.close();
  if (errs.length) process.exit(2);
})().catch(e=>{console.log(log.join('\n'));console.error('FAIL',e);process.exit(1)});
