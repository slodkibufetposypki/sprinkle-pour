// A swipe between boards, mid-drag (no snapping): the board sound and its dot change at the halfway point.
//   node tools/flows/pwswipe.cjs http://localhost:8767/
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); await p.goto(process.argv[2] + 'local.html'); await p.waitForTimeout(1200);
  await p.tap('#enterBtn'); await p.waitForTimeout(350); await p.tap('#menuLevels', { force: true }); await p.waitForTimeout(2300);
  await p.evaluate(() => { window.__swaps = []; const S = __grainLine.Sound, o = S.swap.bind(S); S.swap = () => { window.__swaps.push(document.getElementById('boardRail').scrollLeft / document.getElementById('boardRail').clientWidth); o(); }; });
  await p.evaluate(() => { document.getElementById('boardRail').style.scrollSnapType = 'none'; });   // a finger mid-drag: no snapping yet
  const at = await p.evaluate(() => document.getElementById('boardRail').scrollLeft / document.getElementById('boardRail').clientWidth);
  // a finger drag across the page, in small steps, as a swipe would scroll it
  for (let k = 1; k <= 20; k++) { await p.evaluate((k) => { const r = document.getElementById('boardRail'); r.scrollLeft = r.clientWidth * k / 20; }, k); await p.waitForTimeout(30); }
  await p.waitForTimeout(300);
  console.log('started on page', at.toFixed(2), '| swap sound at page position', JSON.stringify(await p.evaluate(() => window.__swaps.map((x) => +x.toFixed(2)))));
  await b.close();
})();
