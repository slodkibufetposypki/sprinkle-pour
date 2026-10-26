const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2];
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const errors = [];
  const watch = (p, tag) => { p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(tag + ' console: ' + m.text()); }); p.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message)); };
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  const page = await ctx.newPage(); watch(page, 'phone');
  await page.goto('file://' + dir + '/local.html');
  await page.waitForTimeout(2500);
  console.log('fonts', await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).join(', ')));
  await page.screenshot({ path: dir + '/shots/v5-01-title.png' });
  await page.tap('#enterBtn'); await page.waitForTimeout(350); await page.tap('#menuLevels'); await page.waitForTimeout(1600);
  await page.tap('.lcard.next');
  await page.waitForTimeout(800);
  await page.screenshot({ path: dir + '/shots/v5-02-spill.png' });
  await page.waitForTimeout(900);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const c = await page.evaluate(() => { const s = __grainLine.sim; const gs = s.grains; let x = 0, y = 0; for (const g of gs) { x += g.x; y += g.y; } x /= gs.length; y /= gs.length; return { x, y, off: s.cfg.fingerOffset, scale: innerWidth / 600 }; });
  await touch('touchStart', c.x * c.scale, (c.y + c.off + 60) * c.scale);
  await page.waitForTimeout(420);
  await page.screenshot({ path: dir + '/shots/v5-03-filling.png' });
  await page.waitForTimeout(500);
  await touch('touchEnd');
  await page.waitForTimeout(450);
  await page.screenshot({ path: dir + '/shots/v5-04-note.png' });
  // a level further in with a hot multiplier: the tips glow
  await page.evaluate(() => { __grainLine.startLevel(9); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const s = __grainLine.sim; s.mult = 4.6; s.combo = 7; __grainLine.autoplay(true); });
  await page.waitForTimeout(1500);
  for (let i = 0; i < 40; i++) { const ph = await page.evaluate(() => __grainLine.sim.sticks.phase); if (ph === 'open') break; await page.waitForTimeout(50); }
  await page.waitForTimeout(150);
  await page.screenshot({ path: dir + '/shots/v5-05-hot.png' });
  await page.evaluate(() => __grainLine.autoplay(false));
  await page.waitForTimeout(600);
  // force a break with the sticks hot: the quench
  const br = await page.evaluate(() => {
    const s = __grainLine.sim; s.mult = 5; const t = s.target; const g = s.grains.find((q) => q.st === 0 && q.type === t);
    return { x: g.x, y: g.y, off: s.cfg.fingerOffset, scale: innerWidth / 600, wrong: s.level.types.find((k) => k !== t) };
  });
  await touch('touchStart', br.x * br.scale, (br.y + br.off + 40) * br.scale);
  await page.waitForTimeout(300);
  await page.evaluate((w) => { const s = __grainLine.sim; const G = s.geom(); s.debugPut(w, G.mx + 40, G.my - 10); }, br.wrong);
  let broke = false;
  for (let i = 0; i < 60 && !broke; i++) { await page.waitForTimeout(30); broke = await page.evaluate(() => __grainLine.Analytics.log.some((e) => e.name === 'row_broken')); }
  await page.waitForTimeout(160);
  await page.screenshot({ path: dir + '/shots/v5-06-break.png' });
  await touch('touchEnd');
  console.log('broke', broke);
  // play it out and catch the end screen mid count and at rest
  await page.evaluate(() => __grainLine.autoplay(true));
  await page.waitForFunction(() => __grainLine.screen === 'done', null, { timeout: 120000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: dir + '/shots/v5-07-done-counting.png' });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: dir + '/shots/v5-08-done.png' });
  console.log('done text', await page.evaluate(() => document.querySelector('#doneSlab').innerText.replace(/\n+/g, ' | ')));
  await page.tap('#doneLevelsBtn'); await page.waitForTimeout(700);
  await page.screenshot({ path: dir + '/shots/v5-09-levels.png' });
  await page.tap('#sticksRest'); await page.waitForTimeout(400);
  await page.screenshot({ path: dir + '/shots/v5-10-sticks.png' });
  await page.tap('#sticksBackBtn'); await page.waitForTimeout(500);
  await page.tap('.lcard.next'); await page.waitForTimeout(1400);
  await page.tap('#menuBtn'); await page.waitForTimeout(400);
  await page.screenshot({ path: dir + '/shots/v5-11-pause.png' });
  await ctx.close();

  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const p2 = await ctx2.newPage(); watch(p2, 'desktop');
  await p2.goto('file://' + dir + '/local.html');
  await p2.waitForTimeout(2000);
  await p2.screenshot({ path: dir + '/shots/v5-12-desktop-title.png' });
  await p2.click('#enterBtn'); await p2.waitForTimeout(350); await p2.click('#menuLevels'); await p2.waitForTimeout(1600);
  await p2.evaluate(() => { __grainLine.startLevel(4); });
  await p2.waitForTimeout(1000);
  await p2.evaluate(() => { __grainLine.sim.mult = 2.6; __grainLine.sim.combo = 3; __grainLine.autoplay(true); });
  await p2.waitForTimeout(3500);
  await p2.screenshot({ path: dir + '/shots/v5-13-desktop-play.png' });
  await ctx2.close();

  const ctx3 = await browser.newContext({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
  await ctx3.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  const p3 = await ctx3.newPage(); watch(p3, 'reduced+nostorage');
  await p3.goto('file://' + dir + '/local.html');
  await p3.waitForTimeout(1500);
  await p3.click('#enterBtn'); await p3.waitForTimeout(350); await p3.click('#menuLevels'); await p3.waitForTimeout(600); await p3.click('.lcard.next'); await p3.waitForTimeout(600);
  await p3.evaluate(() => __grainLine.autoplay(true));
  await p3.waitForFunction(() => __grainLine.screen === 'done', null, { timeout: 60000 });
  await p3.waitForTimeout(200);
  await p3.screenshot({ path: dir + '/shots/v5-14-reduced-done.png' });
  console.log('reduced done', await p3.evaluate(() => document.querySelector('#doneTotal').innerText + ' stars on: ' + document.querySelectorAll('#doneStars svg.on').length));
  await ctx3.close();
  await browser.close();
  console.log('errors', JSON.stringify(errors));
})();
