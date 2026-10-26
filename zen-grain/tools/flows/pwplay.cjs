const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); await p.goto('file://' + process.argv[2]); await p.waitForTimeout(1200);
  await p.evaluate(() => __grainLine.startLevel(3)); await p.waitForTimeout(2500);
  await p.screenshot({ path: process.argv[3] + '/play-a.png' });
  await p.evaluate(() => { const s = __grainLine.save; [5,4,4,3,3,3,2,2,2,2].forEach((n,i)=>{ s.levels[__grainLine.levelId(i)] = { stars: n, best: 900, plays: 1 }; }); });
  await p.evaluate(() => __grainLine.startLevel(12)); await p.waitForTimeout(2500);
  await p.screenshot({ path: process.argv[3] + '/play-b.png' });
  await b.close();
})();
