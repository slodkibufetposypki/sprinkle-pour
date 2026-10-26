// Plays a level of each new kind with the bot for a few seconds and saves a screenshot of each, checking for errors.
//   node tools/flows/pwmech.cjs http://localhost:8767/ OUTDIR
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2], out = process.argv[3], page = process.argv[4] || 'local.html';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push(m.text()); });
  await p.goto(base + page); await p.waitForTimeout(1200);
  const shots = [[14, 'chickpea', 9], [21, 'carry', 7], [24, 'piles', 9], [27, 'sesame', 8], [31, 'jar', 10], [37, 'kidney', 8], [41, 'tilt', 12]];
  for (const [lv, name, secs] of shots) {
    await p.evaluate((i) => { __grainLine.startLevel(i); }, lv - 1);
    await p.waitForTimeout(1500);
    await p.evaluate(() => __grainLine.autoplay(true));
    await p.waitForTimeout(secs * 1000);
    const info = await p.evaluate(() => { const s = __grainLine.sim; return { phase: s.sticks.phase, rows: s.stats.rows, jar: s.inJar(), lost: s.stats.lost, board: s.level.board || 'slate' }; });
    console.log(lv, name, JSON.stringify(info));
    await p.screenshot({ path: `${out}/mech-${lv}-${name}.png` });
    await p.evaluate(() => __grainLine.autoplay(false));
  }
  // the boards screen with every board
  await p.evaluate(() => { const s = __grainLine.save; for (let i = 0; i < 60; i++) s.levels[__grainLine.levelId(i)] = { stars: 3, best: 900, plays: 1 }; });
  await p.evaluate(() => __grainLine.startLevel(0)); await p.waitForTimeout(300);
  await p.tap('#leaveBtn'); await p.waitForTimeout(900);
  for (let k = 0; k < 6; k++) {
    await p.evaluate((k) => { const r = document.getElementById('boardRail'); r.scrollTo({ left: r.clientWidth * k, behavior: 'instant' }); }, k);
    await p.waitForTimeout(450); await p.screenshot({ path: `${out}/boards-${k}.png` });
  }
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
