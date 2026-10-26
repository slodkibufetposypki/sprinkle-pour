// Offline: load the public build once with its worker, cut the network, reload, and play.
//   node tools/flows/pwoffline.cjs http://localhost:8765/zen-grain/ OUTDIR   (serve docs/ for this one)
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2], out = process.argv[3];
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base); await p.waitForTimeout(1500);
  // the page registers its worker only on https; on localhost register it here
  await p.evaluate(() => navigator.serviceWorker.register('sw.js'));
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.waitForTimeout(1500);
  const kept = await p.evaluate(async () => { const k = await caches.keys(); const c = await caches.open(k[0]); return [k, (await c.keys()).map((r) => new URL(r.url).pathname.split('/').pop() || '/')]; });
  console.log('cache', JSON.stringify(kept));
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(2000);
  console.log('offline: screen', await p.evaluate(() => window.__grainLine && __grainLine.screen), '| title', await p.title());
  await p.tap('#enterBtn'); await p.waitForTimeout(2200);
  await p.evaluate(() => __grainLine.startLevel(0)); await p.waitForTimeout(800);
  await p.evaluate(() => __grainLine.autoplay(true)); await p.waitForTimeout(3000);
  console.log('offline play: rows', await p.evaluate(() => __grainLine.sim.stats.rows));
  await p.screenshot({ path: out + '/offline-play.png' });
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
