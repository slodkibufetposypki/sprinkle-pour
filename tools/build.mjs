// Bundles the game into self-contained single pages (no build tooling):
// inlines styles.css and the logo image, and wraps each ES module in a
// function scope, in import order. Two outputs:
//   docs/index.html          public player (no tuning panel), served by
//                            GitHub Pages from /docs
//   dist/sprinkle-pour.html  the full sandbox as an HTML body, for hosting
//                            inside an existing page skeleton
//
//   node tools/build.mjs
//
// Relies on this repo's module style: single `import { a, b } from './x.js'`
// lines and `export const|let|function|class name` declarations.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w.-]+)';\s*$/gm;
const EXPORT = /^export (?:const|let|function|class) (\w+)/gm;

const modules = [];
const seen = new Set();
async function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = await read(`src/${file}`);
  for (const m of src.matchAll(IMPORT)) await visit(m[2]);
  modules.push({ file, src });
}
await visit('main.js');

const bundled = modules
  .map(({ file, src }) => {
    const names = [...src.matchAll(EXPORT)].map((m) => m[1]);
    const body = src
      .replace(IMPORT, (_, list, dep) => `const {${list.replace(/\s+as\s+/g, ': ')}} = __mods['${dep}'];`)
      .replace(/^export (const|let|function|class) /gm, '$1 ');
    if (/^export\s/m.test(body)) throw new Error(`${file}: unsupported export form`);
    return `__mods['${file}'] = (() => {\n${body}\nreturn { ${names.join(', ')} };\n})();`;
  })
  .join('\n\n');

// Images ship inside the page as data URIs.
const logo = await readFile(new URL('assets/sweet-buffet-logo.png', root));
const bundledWithAssets = bundled.replace("'assets/sweet-buffet-logo.png'", `'data:image/png;base64,${logo.toString('base64')}'`);
if (bundledWithAssets === bundled) throw new Error('logo path not found in render.js');

const html = await read('index.html');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = [...html.matchAll(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts[^>]*>/g)].map((m) => m[0]);
const body = html
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script type="module" src="src\/main\.js"><\/script>\s*/, '');
const css = await read('styles.css');

const script = `<script type="module">
const __mods = {};
${bundledWithAssets}
</script>`;

const sandbox = `${title}
${fonts.join('\n')}
<style>
${css}
</style>
${body.trim()}
${script}
`;

const player = `<!doctype html>
<html lang="en" data-mode="play">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#f8eef1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="description" content="Hold to lift the jar, let go to pour. Decorate every cake without wasting your sprinkles.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%23f3b6c7'/%3E%3Crect x='8' y='12' width='9' height='4' rx='2' fill='%2386d5c7' transform='rotate(-30 12 14)'/%3E%3Ccircle cx='21' cy='19' r='3.2' fill='%23e0bd6a'/%3E%3C/svg%3E">
${title}
${fonts.join('\n')}
<style>
${css}
</style>
</head>
<body>
${body.trim()}
${script}
</body>
</html>
`;

await mkdir(new URL('dist/', root), { recursive: true });
await mkdir(new URL('docs/', root), { recursive: true });
await writeFile(new URL('dist/sprinkle-pour.html', root), sandbox);
await writeFile(new URL('docs/index.html', root), player);
console.log(`${modules.length} modules: ${modules.map((m) => m.file).join(' → ')}`);
console.log(`docs/index.html          ${(player.length / 1024).toFixed(0)} KB  (public player)`);
console.log(`dist/sprinkle-pour.html  ${(sandbox.length / 1024).toFixed(0)} KB  (sandbox with tuning)`);
