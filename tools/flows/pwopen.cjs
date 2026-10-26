// The board screen with wooden tags, and the moment a board opens: stars just past Bamboo's mark, Bamboo not yet seen.
//   node tools/flows/pwopen.cjs http://localhost:8767/ OUTDIR
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2], out = process.argv[3], page = process.argv[4] || 'local.html';
  const b = await chromium.launch();
  const errs = [];
  for (const [w, h, dark] of [[375, 667, true], [1440, 900, false]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 800, hasTouch: w < 800, colorScheme: dark ? 'dark' : 'light' });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push(m.text()); });
    await p.addInitScript(() => {
      const levels = {};
      for (let i = 0; i < 20; i++) levels[i < 10 ? ['first-row', 'two-heaps', 'touching', 'strays', 'the-slate', 'short-reach', 'mixed-heap', 'mung-beans', 'restless', 'pantry-spill'][i] : 'gen-' + (i + 1)] = { stars: i === 19 ? 2 : 3, best: 900, plays: 1 };
      localStorage.setItem('grainline.save', JSON.stringify({ saveVersion: 4, levels, reached: 20, seen: ['slate', 'walnut'] }));
    });
    await p.goto(base + page); await p.waitForTimeout(1200);
    await p.evaluate(() => __grainLine.startLevel(19)); await p.waitForTimeout(400);
    await p.tap ? null : null;
    await p.click('#leaveBtn'); await p.waitForTimeout(250);
    const t0 = Date.now();
    for (const [ms, name] of [[300, 'a-start'], [1400, 'b-write'], [2300, 'c-written'], [3000, 'd-laid'], [4200, 'e-after']]) {
      await p.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
      await p.screenshot({ path: `${out}/open-${w}-${name}.png` });
    }
    console.log(w, 'seen', await p.evaluate(() => __grainLine.save.seen), 'showing', await p.evaluate(() => Math.round(document.getElementById('boardRail').scrollLeft / document.getElementById('boardRail').clientWidth)));
    await ctx.close();
  }
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
