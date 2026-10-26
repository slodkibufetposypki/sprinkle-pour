const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); await p.goto(process.argv[2] + (process.argv[3] || 'local.html')); await p.waitForTimeout(2500);
  const st = () => p.evaluate(() => { const v = __grainLine.film; return v ? { src: v.currentSrc.split('/').pop(), ready: v.readyState, paused: v.paused, t: +v.currentTime.toFixed(2), failed: !!v.failed } : null; });
  console.log('room, before any tap:', await st());
  await p.tap('#enterBtn'); await p.waitForTimeout(350); await p.tap('#menuLevels'); await p.waitForTimeout(2500);
  console.log('at the table:', await st(), '| night sound loaded:', await p.evaluate(() => !!__grainLine.Night.buf && +__grainLine.Night.buf.duration.toFixed(2)), '| gain', await p.evaluate(() => __grainLine.Night.gain && +__grainLine.Night.gain.gain.value.toFixed(2)));
  await p.tap('#tableBack'); await p.waitForTimeout(2000);
  console.log('back in the room:', await st(), '| gain', await p.evaluate(() => +__grainLine.Night.gain.gain.value.toFixed(2)));
  await b.close();
})();
