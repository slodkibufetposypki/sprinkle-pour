// The game on a phone set to Polish: room, boards, a level with its rule, pause, the result; then switched to English.
//   node tools/flows/pwlang.cjs http://localhost:8767/ OUTDIR
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2], out = process.argv[3], page = process.argv[4] || 'local.html';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pl-PL' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push(m.text()); });
  await p.goto(base + page); await p.waitForTimeout(1500);
  console.log('lang', await p.evaluate(() => document.documentElement.lang), '|', await p.textContent('#enterHint'));
  await p.tap('#enterBtn'); await p.waitForTimeout(350); await p.tap('#menuLevels'); await p.waitForTimeout(2200);
  await p.screenshot({ path: `${out}/pl-boards.png` });
  console.log('boards:', await p.evaluate(() => [...document.querySelectorAll('.bhead b')].map((e) => e.textContent).join(', ')), '|', await p.textContent('#tNext'));
  await p.evaluate(() => __grainLine.startLevel(20)); await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/pl-rule.png` });
  console.log('banner:', await p.textContent('#banner b'), '/', await p.textContent('#banner span'), '| chip:', await p.textContent('#chip'));
  await p.evaluate(() => __grainLine.autoplay(true)); await p.waitForTimeout(6000);
  await p.screenshot({ path: `${out}/pl-play.png` });
  await p.evaluate(() => __grainLine.autoplay(false));
  await p.tap('#menuBtn'); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/pl-pause.png` });
  console.log('pause:', await p.evaluate(() => [...document.querySelectorAll('#pause button')].filter((x) => !x.hidden).map((x) => x.textContent.trim()).join(' | ')));
  await p.tap('#langBtn'); await p.waitForTimeout(300);
  console.log('after switch:', await p.evaluate(() => [...document.querySelectorAll('#pause button')].filter((x) => !x.hidden).map((x) => x.textContent.trim()).join(' | ')), '| saved', await p.evaluate(() => __grainLine.save.lang));
  await p.tap('#langBtn'); await p.waitForTimeout(200);
  await p.tap('#resumeBtn'); await p.waitForTimeout(200);
  // finish the level by the bot, to see the result in Polish
  await p.evaluate(() => __grainLine.autoplay(true));
  for (let k = 0; k < 120 && (await p.evaluate(() => __grainLine.screen)) !== 'done'; k++) await p.waitForTimeout(1000);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/pl-done.png` });
  console.log('done:', await p.evaluate(() => [document.getElementById('doneLevel').textContent, document.getElementById('doneName').textContent, ...[...document.querySelectorAll('#doneTally li')].map((l) => l.textContent), document.getElementById('nextBtn').textContent].join(' | ')));
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
