# Zen Grains — source

The public page is `docs/zen-grain/index.html`, built from this folder. Edit `game.html`, never the built page.

| File | What it is |
| --- | --- |
| `game.html` | The whole game: styles, markup and script in one file, with no `<html>`, `<head>` or `<body>`. The simulation sits between the `GRAIN-SIM BEGIN` / `END` markers, so the tests can run it without a browser. |
| `head.html` | The doctype, meta tags, icons, manifest link and offline-worker registration that the standalone page gets in front of `game.html`. |
| `offline-worker.js` | The service worker that keeps the game on the phone after the first visit. The build writes it to `docs/zen-grain/sw.js` with a version taken from the page. |
| `build.mjs` | `node zen-grain/build.mjs` writes the public page. `--local` writes `zen-grain/local.html` and copies the media beside it for testing. |
| `test/sim.test.mjs` | `node --test zen-grain/test/sim.test.mjs`: runs the simulation in a bare VM, with no DOM and with `Math.random` disabled, and checks every level can be finished and scored. |
| `tools/flows/*.cjs` | Playwright walks through the real page: `node tools/flows/pwmenu.cjs http://localhost:8767/ OUTDIR` after serving this folder with `python3 -m http.server 8767`. Each writes screenshots to OUTDIR and prints what it checked. |
| `tools/media/room_loop.py` | Turns one or more Seedance clips of the room into the title-screen loop (`zen-room.mp4`, `.webm`, `.jpg`, `.mp3`). |
| `tools/media/icon.html`, `icon-render.cjs` | The home-screen icon, drawn as SVG and rendered to `icon-512/192/180.png`. |
| `tools/media/*.py` (others) | One-off steps used to cut the older painting into layers (`?scene=painting`). |
| `tools/sim/levels.mjs`, `calibrate.mjs` | What each generated level brings, and how the bot does on a range of levels. |

The media files (`zen-room.*`, `zen-night.jpg`, the chime, flame and lantern) live in `docs/zen-grain/`; the local
build copies them here, and they are ignored in this folder.

## Making a change

```bash
node --test zen-grain/test/sim.test.mjs      # the simulation
node zen-grain/build.mjs --local              # then serve zen-grain/ and run a flow from tools/flows
node zen-grain/build.mjs                      # the public page, committed with the change
```
