// The same screens in the new faces and in the chalk ones (?font=chalk): boards, play with a note, pause, result.
//   node tools/flows/pwfonts.cjs http://localhost:8767/ OUTDIR [en|pl]
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2], out = process.argv[3], lang = process.argv[4] || 'en';
  const b = await chromium.launch(); const errs = [];
  for (const q of ['', '?font=chalk']) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: lang === 'pl' ? 'pl-PL' : 'en-US' });
    await ctx.addInitScript(() => {
      const levels = {}; for (let i = 0; i < 24; i++) levels[i < 10 ? ['first-row', 'two-heaps', 'touching', 'strays', 'the-slate', 'short-reach', 'mixed-heap', 'mung-beans', 'restless', 'pantry-spill'][i] : 'gen-' + (i + 1)] = { stars: 3 + (i % 3), best: 1200 + i * 37, plays: 1 };
      localStorage.setItem('grainline.save', JSON.stringify({ saveVersion: 4, levels, reached: 24, seen: ['slate', 'walnut', 'bamboo'] }));
    });
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    const tag = q ? 'chalk' : 'brush';
    await p.goto(base + 'local.html' + q); await p.waitForTimeout(3000);
    await p.screenshot({ path: `${out}/${tag}-room.png` });
    await p.tap('#enterBtn'); await p.waitForTimeout(350); await p.tap('#menuLevels'); await p.waitForTimeout(2300);
    await p.screenshot({ path: `${out}/${tag}-boards.png` });
    await p.evaluate(() => __grainLine.startLevel(13)); await p.waitForTimeout(400);
    await p.evaluate(() => __grainLine.autoplay(true)); await p.waitForTimeout(5200);
    await p.screenshot({ path: `${out}/${tag}-play.png` });
    await p.evaluate(() => __grainLine.autoplay(false));
    await p.tap('#menuBtn'); await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/${tag}-pause.png` });
    await p.tap('#resumeBtn'); await p.evaluate(() => __grainLine.autoplay(true));
    for (let k = 0; k < 90 && (await p.evaluate(() => __grainLine.screen)) !== 'done'; k++) await p.waitForTimeout(1000);
    await p.waitForTimeout(3500);
    await p.screenshot({ path: `${out}/${tag}-done.png` });
    await ctx.close();
  }
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
