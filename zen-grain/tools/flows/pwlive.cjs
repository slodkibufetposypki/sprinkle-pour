// The live page: loads with no errors, registers its offline worker, shows all six boards, plays a jar level.
//   node tools/flows/pwlive.cjs https://slodkibufetposypki.github.io/sprinkle-pour/zen-grain/ OUTDIR
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2], out = process.argv[3];
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
  await p.goto(url); await p.waitForTimeout(2500);
  console.log('manifest', await p.evaluate(() => !!document.querySelector('link[rel=manifest]')), '| worker', await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r; }));
  await p.tap('#enterBtn'); await p.waitForTimeout(2300);
  console.log('boards', await p.evaluate(() => [...document.querySelectorAll('.bhead b')].map((e) => e.textContent).join(', ')));
  await p.evaluate(() => __grainLine.startLevel(30)); await p.waitForTimeout(1200);
  await p.evaluate(() => __grainLine.autoplay(true)); await p.waitForTimeout(6000);
  console.log('jar level', await p.evaluate(() => { const s = __grainLine.sim; return { level: s.level.id, rows: s.stats.rows, inJar: s.inJar() }; }));
  await p.screenshot({ path: out + '/live-jar.png' });
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
