// The play HUD and the pause sheet on a small and a tall phone; the corner arrows ask once a row is in.
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2], out = process.argv[3], page = process.argv[4] || 'local.html';
  const b = await chromium.launch();
  const errs = [];
  for (const [w, h] of [[375, 667], [390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(base + page); await p.waitForTimeout(1200);
    await p.evaluate(() => __grainLine.startLevel(12)); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/hud-${w}.png` });
    // nothing sorted yet: restart goes at once
    await p.tap('#againBtn'); await p.waitForTimeout(300);
    console.log(w, 'restart at once ->', await p.evaluate(() => [__grainLine.screen, __grainLine.sim.stats.rows]));
    // pretend a row is in: the first tap asks, the second goes
    await p.evaluate(() => { __grainLine.sim.stats.rows = 1; });
    await p.tap('#leaveBtn'); await p.waitForTimeout(250);
    console.log(w, 'first tap ->', await p.evaluate(() => [__grainLine.screen, document.getElementById('leaveBtn').className, document.getElementById('toast').textContent]));
    await p.screenshot({ path: `${out}/ask-${w}.png` });
    await p.tap('#leaveBtn'); await p.waitForTimeout(400);
    console.log(w, 'second tap ->', await p.evaluate(() => __grainLine.screen));
    await p.evaluate(() => __grainLine.startLevel(12)); await p.waitForTimeout(600);
    await p.tap('#menuBtn'); await p.waitForTimeout(500); await p.screenshot({ path: `${out}/pause-${w}.png` });
    await p.tap('#pauseLevelsBtn'); await p.waitForTimeout(400);
    console.log(w, 'pause back ->', await p.evaluate(() => __grainLine.screen));
    await ctx.close();
  }
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
