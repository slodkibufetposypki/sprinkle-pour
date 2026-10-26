// Builds the standalone page from game.html (the artifact source, which has no <html>/<head>/<body>).
//   node zen-grain/build.mjs          -> docs/zen-grain/index.html (the public page)
//   node zen-grain/build.mjs --local  -> zen-grain/local.html, served next to the media for tests
import { readFileSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';

const here = new URL('./', import.meta.url);
const src = readFileSync(new URL('game.html', here), 'utf8');
const head = readFileSync(new URL('head.html', here), 'utf8').trimEnd();
const cut = src.indexOf('<canvas id="game"');
if (cut < 0) throw new Error('game.html: no <canvas id="game"> to split the head from the body');
const page = head + '\n' + src.slice(0, cut).trimEnd() + '\n</head>\n<body>\n' + src.slice(cut).trimEnd() + '\n</body>\n</html>\n';
const local = process.argv.includes('--local');
const out = local ? new URL('local.html', here) : new URL('../docs/zen-grain/index.html', here);
writeFileSync(out, page);
if (local) {
  const pub = new URL('../docs/zen-grain/', here);
  for (const f of readdirSync(pub)) if (f !== 'index.html') copyFileSync(new URL(f, pub), new URL(f, here));
}
console.log('wrote', out.pathname, (page.length / 1024).toFixed(0) + ' kB');
