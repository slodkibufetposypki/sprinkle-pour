// Builds the whole site into one static folder, dist/, from game.html (the artifact source, which has no
// <html>/<head>/<body>), the files in public/ and the test pages in labs/.
//   node build.mjs          -> dist/: index.html, sw.js, everything from public/, labs/ (what Cloudflare Pages serves)
//   node build.mjs --local  -> the same, plus dist/local.html for the test tools (serve dist/ on any port)
// The offline worker (sw.js, from offline-worker.js) carries a version taken from the page and the files, so every
// new build replaces what phones have kept.
import { readFileSync, writeFileSync, copyFileSync, readdirSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = new URL('./', import.meta.url);
const pub = new URL('public/', here), labs = new URL('labs/', here), dist = new URL('dist/', here);
const src = readFileSync(new URL('game.html', here), 'utf8');
const head = readFileSync(new URL('head.html', here), 'utf8').trimEnd();
const cut = src.indexOf('<canvas id="game"');
if (cut < 0) throw new Error('game.html: no <canvas id="game"> to split the head from the body');
const page = head + '\n' + src.slice(0, cut).trimEnd() + '\n</head>\n<body>\n' + src.slice(cut).trimEnd() + '\n</body>\n</html>\n';
const local = process.argv.includes('--local');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const files = readdirSync(pub).filter((f) => statSync(new URL(f, pub)).isFile()).sort();
for (const f of files) copyFileSync(new URL(f, pub), new URL(f, dist));
mkdirSync(new URL('labs/', dist), { recursive: true });
for (const f of readdirSync(labs)) copyFileSync(new URL(f, labs), new URL('labs/' + f, dist));
writeFileSync(new URL('index.html', dist), page);
if (local) writeFileSync(new URL('local.html', dist), page);

const h = createHash('sha1').update(page);
for (const f of files) h.update(f).update(readFileSync(new URL(f, pub)));
const version = h.digest('hex').slice(0, 10);
writeFileSync(new URL('sw.js', dist), readFileSync(new URL('offline-worker.js', here), 'utf8').replace('__VERSION__', version));
console.log('wrote', dist.pathname, files.length + 3, 'files, page', (page.length / 1024).toFixed(0) + ' kB, version', version);
