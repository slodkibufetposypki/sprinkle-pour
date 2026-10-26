// Builds the standalone page from game.html (the artifact source, which has no <html>/<head>/<body>).
//   node zen-grain/build.mjs          -> docs/zen-grain/index.html (the public page)
//   node zen-grain/build.mjs --local  -> zen-grain/local.html, served next to the media for tests
// The public build also writes the offline worker (docs/zen-grain/sw.js from offline-worker.js), versioned by the page.
import { readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = new URL('./', import.meta.url);
const src = readFileSync(new URL('game.html', here), 'utf8');
const head = readFileSync(new URL('head.html', here), 'utf8').trimEnd();
const cut = src.indexOf('<canvas id="game"');
if (cut < 0) throw new Error('game.html: no <canvas id="game"> to split the head from the body');
const page = head + '\n' + src.slice(0, cut).trimEnd() + '\n</head>\n<body>\n' + src.slice(cut).trimEnd() + '\n</body>\n</html>\n';
const local = process.argv.includes('--local');
const out = local ? new URL('local.html', here) : new URL('../docs/zen-grain/index.html', here);
writeFileSync(out, page);
// the offline worker carries a version taken from the page, so every new build replaces what phones have kept
if (!local) {
  // the page and every file next to it: a new room video or sound replaces the kept one too
  const h = createHash('sha1').update(page), pub = new URL('../docs/zen-grain/', here);
  for (const f of readdirSync(pub).sort()) if (f !== 'sw.js' && f !== 'index.html') h.update(f).update(readFileSync(new URL(f, pub)));
  const sw = readFileSync(new URL('offline-worker.js', here), 'utf8').replace('__VERSION__', h.digest('hex').slice(0, 10));
  writeFileSync(new URL('../docs/zen-grain/sw.js', here), sw);
}
if (local) {
  const pub = new URL('../docs/zen-grain/', here);
  for (const f of readdirSync(pub)) if (/\.(jpg|png|mp3|mp4|webm)$/.test(f)) copyFileSync(new URL(f, pub), new URL(f, here));
}
console.log('wrote', out.pathname, (page.length / 1024).toFixed(0) + ' kB');
