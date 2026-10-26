const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  await p.goto('file://' + __dirname + '/icon.html');
  for (const n of [512, 192, 180]) {
    await p.setViewportSize({ width: n, height: n });
    await p.evaluate((n) => { const s = document.getElementById('ic'); s.setAttribute('width', n); s.setAttribute('height', n); }, n);
    await p.screenshot({ path: __dirname + '/icon-' + n + '.png', clip: { x: 0, y: 0, width: n, height: n } });
  }
  await b.close();
})();
