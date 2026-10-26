const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [w, h, name] of [[375, 667, 'se'], [1440, 900, 'desk']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 600 ? 2 : 1, isMobile: w < 600, hasTouch: w < 600 });
    const p = await ctx.newPage(); await p.goto(process.argv[2] + 'local.html'); await p.waitForTimeout(1500);
    await p.screenshot({ path: process.argv[3] + '/s-room-' + name + '.png' });
    await p.click('#enterBtn'); await p.waitForTimeout(2400);
    await p.screenshot({ path: process.argv[3] + '/s-menu-' + name + '.png' });
    console.log(name, await p.evaluate(() => { const c = document.querySelector('.bpage .cards').getBoundingClientRect(), d = document.getElementById('boardDots').getBoundingClientRect(); return { cardsBottom: Math.round(c.bottom), dotsTop: Math.round(d.top) }; }));
    await ctx.close();
  }
  await b.close();
})();
