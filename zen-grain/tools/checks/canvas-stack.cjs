// The canvas state stack must not grow. Every save() needs its restore(): a leak of a few states a frame is harmless in
// Chrome and freezes the board in Safari once its limit is reached (28 Oct: one chopstick drawn, the rest gone).
// Counts save() against restore() on every screen and in Pełnia's special states, and exits 1 on a leak.
//
//   node zen-grain/build.mjs --local && (cd zen-grain && python3 -m http.server 8767 &)
//   node zen-grain/tools/checks/canvas-stack.cjs http://localhost:8767/
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2];
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, locale: 'pl-PL' });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => {
    window.__depth = 0; const P = CanvasRenderingContext2D.prototype, sv = P.save, rs = P.restore;
    P.save = function () { window.__depth++; return sv.call(this); };
    P.restore = function () { window.__depth--; return rs.call(this); };
    localStorage.setItem('grainline.save', JSON.stringify({ saveVersion: 4, levels: { 'first-row': { stars: 5, best: 900, plays: 1 }, 'two-heaps': { stars: 4, best: 900, plays: 1 }, 'touching': { stars: 3, best: 900, plays: 1 } }, reached: 3, seen: ['slate'], lang: 'pl', tutorial: true, zen: { best: 30000, plays: 2, rules: true, tips: { zone: true, bowl: true, stone: true, stonelife: true } } }));
  });
  const T0 = Date.now(); await p.clock.install({ time: T0 }); await p.clock.pauseAt(T0 + 500);
  const run = (ms) => p.clock.runFor(ms), depth = () => p.evaluate(() => window.__depth);
  const out = [];
  const watch = async (name, ms) => { const a = await depth(); await run(ms); const z = await depth(); out.push(name + ': ' + a + ' -> ' + z + (z - a > 2 ? '  LEAK' : '')); };
  await p.goto(base + 'local.html'); await run(1500);
  await watch('title room', 3000);
  await p.click('#enterBtn'); await run(900); await watch('menu', 3000);
  await p.click('#menuLevels', { force: true }); await run(2500); await watch('boards', 3000);
  await p.click('#menuZen', { force: true }).catch(() => {});
  await p.evaluate(() => __grainLine.startLevel(4)); await run(2500);
  await p.evaluate(() => __grainLine.autoplay(true)); await watch('Droga level, bot', 6000);
  await p.goto(base + 'local.html'); await run(1500); await p.click('#enterBtn'); await run(900);
  await p.click('#menuZen', { force: true }); await run(3000);
  await p.evaluate(() => __grainLine.autoplay(true)); await watch('Pełnia, bot', 8000);
  await p.evaluate(() => { const s = __grainLine.sim, B = s.bounds(); s.cat = { wall: 1, at: 600, t: 0, stirred: false }; }); await watch('Pełnia, cat at the edge', 3000);
  await p.evaluate(() => { const s = __grainLine.sim; s.cat = { wall: 0, at: 600, x: 300, y: 600, ids: [], t: 0, stirred: false }; }); await watch('Pełnia, cat in the open', 3000);
  await p.evaluate(() => { const s = __grainLine.sim; s.zone = 1; }); await watch('Pełnia, Zen Zone', 4000);
  await p.evaluate(() => { __grainLine.sim.debugGift('onsen'); }); await watch('Pełnia, a big gift traced in the sand', 3000);
  await p.evaluate(() => { __grainLine.autoplay(false); const s = __grainLine.sim, B = s.bounds(); let k = 0; while (s.crowd < 1.02 && k < 300) { s.debugPut(['lentil', 'rice'][k % 2], B.x0 + 30 + (k * 37) % (B.x1 - B.x0 - 60), B.y0 + 60 + ((k * 53) % 600)); k++; s.step({ down: false, x: 300, y: 1200 }); } });
  await watch('Pełnia, full board', 2500);
  await p.evaluate(() => { const s = __grainLine.sim; s.clock = 1230; }); await watch('Pełnia, blood moon', 3000);
  console.log(out.join('\n'));
  await ctx.close(); await b.close();
  if (out.some((l) => l.endsWith('LEAK'))) process.exit(1);
})();
