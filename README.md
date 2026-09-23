# Sprinkle Pour — grey-box physics sandbox

A one-finger prototype of the Sweet Buffet Games brief (v0.1). The hand
carries a jar of sprinkles left to right. Hold anywhere and the hand pulls the
jar upright; let go and it tips. Every sprinkle in the jar is simulated, so
what pours out, and when, comes from the pile itself.

The goal of this build is the brief's first question: **is controlling the
pour fun for ten minutes?** Content and art come later.

## Run it

```bash
node tools/serve.mjs
```

Open <http://localhost:5173>. The server also prints a LAN address: open that
on a phone on the same Wi-Fi to play with one finger. There are no
dependencies and no build step. Opening `index.html` straight from disk won't
work, because browsers block ES modules on `file://`.

| Input | Action |
| --- | --- |
| Hold screen / <kbd>Space</kbd> | Lift the jar (the first press also starts the level) |
| <kbd>R</kbd> / <kbd>N</kbd> / <kbd>[</kbd> <kbd>]</kbd> | Retry / next / previous level |
| <kbd>P</kbd> / <kbd>S</kbd> | Pause / slow motion |
| <kbd>G</kbd> | Pour gauge around the wrist |
| <kbd>A</kbd> | Autopilot: watch the level play itself with the current tuning |
| <kbd>T</kbd> / <kbd>M</kbd> | Tuning panel / sound |

For local dev you can add `?level=7&autopilot=1&gauge=1&panel=0&warp=3` to
the URL. `warp` fast-forwards the sim that many seconds.

## What is simulated

| System | File | Model |
| --- | --- | --- |
| Hand + jar | `src/jar.js` | Pendulum: gravity tips it forward, a weak, slightly delayed "muscle" pulls it back. Mass and inertia fall as the jar empties, so a full jar is harder to catch. |
| Sprinkles in the jar | `src/grains.js` | Every piece is a grain solved in the jar's rotating frame: gravity, centrifugal, Euler and Coriolis terms, then position-based contacts with Coulomb friction. The pile has an angle of repose: it holds, then avalanches out over the rim. |
| Falling sprinkles | `src/physics.js` | Circles against cake polygons. Frosting grabs them through adhesion, and a piece freezes only once it has come to rest, so pearls bounce, roll and settle. |
| Cakes | `src/cakes.js` | Closed polygons. Each edge has a material (buttercream, fondant, glaze…) and a scoring zone (target or waste). |
| Level run + scoring | `src/game.js` | States go ready → play → settle → result. Coverage is measured across the frosting, waste is a share of the jar, and a failed run lists plain-language reasons. |
| Levels | `src/levels.js` | The ten brief levels plus a sandbox, all as data. |

Rendering is Canvas 2D (`src/render.js`). The look follows the Sweet Buffet
retail jar and mixes: a clear, squat jar with the lid off (just the open,
threaded neck) and the round logo sticker (`assets/sweet-buffet-logo.png`).
The sprinkles come in pastel pink, mint, lilac, cream and white with metallic
gold: small pearls, sugar rods with glitter, flat sequins and hearts, and big
shimmer pearls. The look palettes are `LOOKS` in `render.js`. Levels use a
"house mix" of pearls, rods and sequins, and big pearls arrive in level 7.
The sound is synthesized (`src/audio.js`), and haptics work on Android only,
since iOS Safari has no vibration API.

## Tuning

Every value lives in `src/params.js` and appears as a slider in the **Tune**
panel. The panel is generated from `SCHEMA`, so a new value needs only a
default and one schema row.

- **Jar feel**: tip torque, lift torque, damping and grip delays set how
  "unruly" the jar is. The defaults were tuned numerically: a full jar
  overshoots about 12° after a catch, an almost-empty one about 5°.
- **Grains in the jar**: grain friction sets the angle of repose, so it
  controls when a pile lets go and how bursty the trickle is. Size variation
  stops equal discs from locking into a crystal. Solver passes and pile
  firmness trade CPU for stiffer piles.
- **Jar shape** (restarts the level): a shorter jar is fuller and pours
  sooner. A lower wrist pivot makes the mouth swing down harder on deep tilts.
- **Pieces and surfaces**: bounce, grip, stickiness and air drag per sprinkle
  type and per frosting.

To share a feel, use **Copy tuning JSON**. It copies only the values changed
from the defaults; paste it back with **Paste JSON…**. Presets are defined in
`PRESETS` in `params.js`. Tuning and best stars persist in `localStorage`.

**This level** in the panel edits a working copy of the current level: hand
speed and height, the jar mix, requirements, and the §37 "holding raises the
hand" experiment. **Copy level JSON** exports it for `levels.js`.

## Public build

```bash
node tools/build.mjs
```

This writes `docs/index.html`, a single self-contained page with no tuning
panel or debug keys that always plays the default physics. GitHub Pages
serves it from the `docs/` folder. It also writes `dist/sprinkle-pour.html`, the
full sandbox as a bare HTML body for hosting inside another page (not
committed). Rebuild and commit `docs/` whenever you change the game.

## Checking levels headlessly

```bash
node tools/bot.mjs          # every level, 3 seeds, plus never-hold / always-hold baselines
node tools/bot.mjs 5 10     # just levels 5 and 10
```

This uses the same autopilot as the panel. Run it after changing defaults or
level data to confirm levels are still completable and the sim stays stable.
It also reports the per-step cost.

## Deliberate departures from the brief

- **Real grains instead of a virtual inventory (§45).** This was requested
  after the first build. Because of it, the brief's explicit pour-start and
  flow-curve sliders are gone. Those behaviours now emerge from jar shape
  and grain friction. With the defaults, a full jar starts trickling at about
  55–60°, streams around 80–90° and dumps past 100°. A near-empty jar needs
  over 100°. The gauge (<kbd>G</kbd>) shows an estimate.
- **No scripted pearl clogs (§12).** Big pearls leave when the pile carries
  them over the rim of the open neck; nothing holds them back on purpose.
  *Hand tremor* adds jiggle if you want looser piles.
- **Levels wait for the first press.** Retry resets to that ready state.

## Known gaps / next steps

- Rods collide as circles and are only drawn long. Hearts are not aerodynamic.
- Level requirements were calibrated with the autopilot. They need human
  playtests, especially level 5, which is deliberately tight.
- A jar bump shoves and dents the cake, but tiers don't tip over yet (§19).
- On low-end phones, lower *Physics rate* (World group) if the frame rate
  drops. Grains solve at that rate too.
- Not built yet, as the brief asks: menus, progression, a full art pass,
  and a catalogue of the real product mixes (one house mix for now).
