# Zen Grains

A calm sorting game for the phone: a spilled mess of grains, a pair of chopsticks, one straight row at a time.
Edit `game.html`; the site is built from it. State of the work: `STATUS.md`. Plan and decisions: `ROADMAP.md`.
Look of every picture: `STYLE.md`.

## Build: one static folder

```bash
npm run build            # = node build.mjs, writes dist/
npm test                 # = node --test test/sim.test.mjs, the simulation (74 tests)
```

`dist/` is the whole site and nothing else: `index.html`, `sw.js` (the offline worker, versioned from the page and
the files), everything in `public/` (pictures, sound, room video, icons, `manifest.webmanifest`, `_headers`) and the
test pages in `dist/labs/`. No dependencies, no install step; Node 18 or newer. `dist/` is not committed.

### Cloudflare Pages (zengrains.com)

| Setting | Value |
| --- | --- |
| Repository | `slodkibufetposypki/zen-grains`, branch `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (the repo root) |
| Node | 18 or newer (`NODE_VERSION=20` if the default is older) |

`public/_headers` asks for the page, `sw.js` and the manifest to be revalidated on every visit, so a new build
reaches phones at once. Until the launch the site sits behind Cloudflare Access. The domain, Access and the Pages
project are set up by the Master session; the old page at
https://slodkibufetposypki.github.io/sprinkle-pour/zen-grain/ stays until the new one works.

## Files

| Path | What it is |
| --- | --- |
| `game.html` | The whole game: styles, markup and script in one file, with no `<html>`, `<head>` or `<body>` (it is also the source of the claude.ai artifact). The simulation sits between the `GRAIN-SIM BEGIN` / `END` markers, so the tests run it without a browser. |
| `head.html` | Doctype, meta tags, icons, manifest link and the offline-worker registration put in front of `game.html`. |
| `offline-worker.js` | The service worker that keeps the game on the phone after the first visit. |
| `build.mjs` | Writes `dist/`. `--local` also writes `dist/local.html` for the test tools. |
| `public/` | Every file the page loads, served as is. |
| `labs/` | Test pages that are not the game (the living capybara, the head-scratch frames). |
| `test/sim.test.mjs` | Runs the simulation in a bare VM, with no DOM and with `Math.random` disabled: every level can be finished and scored, and the rules hold. |
| `tools/flows/*.cjs` | Playwright walks through the real page, each writing screenshots to OUTDIR. |
| `tools/checks/canvas-stack.cjs` | Counts the canvas layers on every screen; a number that grows is a leak. |
| `tools/media/` | Steps that made the media: the room loop, the icon, the porcelain, the medallions, the Polish font subsets. |
| `tools/sim/` | What each generated level brings and how the bot does on them. |
| `art/` | Originals and prompts of the generated pictures (`art/wave2/`, the capybara sheet F01, the rabbit medallion). |
| `archive/` | Kept, not built: `zen-grain-przed/` (the game before the painted assets, 28 Oct) and `chopstick-catch/` (the first prototype, from cake-hero). |

## Making a change

```bash
npm test
node build.mjs --local && python3 -m http.server 8767 -d dist     # then, in another shell:
node tools/checks/canvas-stack.cjs http://localhost:8767/          # no LEAK
node tools/flows/pwmenu.cjs http://localhost:8767/ OUTDIR           # or any other flow
npm run build                                                      # what Cloudflare Pages runs
```

The history before 29 Oct comes from `slodkibufetposypki/sprinkle-pour` (`zen-grain/`, `docs/zen-grain/` and the
older `docs/grain-line/`), moved here with every commit; the Chopstick Catch prototype keeps its own three commits.
