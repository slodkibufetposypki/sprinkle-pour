// Sound: the night is loaded before any touch; it starts on its own where the browser allows (here, with autoplay
// allowed) when the hint to sit down appears, coming in slowly; the two volumes act on their own buses.
//   node tools/flows/pwsound.cjs http://localhost:8767/ [autoplay|gesture]
const { chromium } = require('playwright');
(async () => {
  const base = process.argv[2], mode = process.argv[3] || 'autoplay';
  const b = await chromium.launch({ args: mode === 'autoplay' ? ['--autoplay-policy=no-user-gesture-required'] : ['--autoplay-policy=user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(base + 'local.html');
  const probe = () => p.evaluate(() => { const S = __grainLine.Sound, N = __grainLine.Night; return { ctx: S.ctx ? S.ctx.state : null, unlocked: S.unlocked, loaded: !!N.buf, playing: N.playing, gain: N.gain ? +N.gain.gain.value.toFixed(3) : null }; });
  await p.waitForTimeout(1500); console.log(mode, '1.5s', JSON.stringify(await probe()));
  await p.waitForTimeout(1200); console.log(mode, '2.7s (hint shown)', JSON.stringify(await probe()), '| hint', await p.evaluate(() => !document.getElementById('enterHint').classList.contains('off')));
  for (const t of [1, 2.5, 5]) { await p.waitForTimeout(t === 1 ? 1000 : t === 2.5 ? 1500 : 2500); console.log(mode, '+' + t + 's', JSON.stringify(await probe())); }
  if (mode === 'gesture') {
    await p.tap('#enterBtn'); await p.waitForTimeout(350); await p.tap('#menuLevels'); await p.waitForTimeout(400); console.log('after tap', JSON.stringify(await probe()));
    await p.waitForTimeout(3000); console.log('after tap +3.4s', JSON.stringify(await probe()));
  }
  await p.evaluate(() => __grainLine.startLevel(0)); await p.waitForTimeout(300);
  await p.tap('#menuBtn'); await p.waitForTimeout(300);
  const fillRange = async (id, v) => p.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }, [id, v]);
  await fillRange('ambVol', 30); await fillRange('sfxVol', 0); await p.waitForTimeout(400);
  console.log('volumes', JSON.stringify(await p.evaluate(() => { const S = __grainLine.Sound; return { out: +S.out.gain.value.toFixed(3), amb: +S.amb.gain.value.toFixed(3), saved: [__grainLine.save.sfxVol, __grainLine.save.ambVol, __grainLine.save.sound] }; })));
  console.log('errors', errs.length ? errs : 'none');
  await b.close();
})();
