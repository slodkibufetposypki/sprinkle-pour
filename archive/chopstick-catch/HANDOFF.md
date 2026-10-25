# Chopstick Catch — Handoff (25 Oct 2026)

Branch: `claude/chopstick-catch-prototype` (from `main`; not merged; no PR). Read [BRIEF.md](BRIEF.md) for the idea and what it should teach us.

## TL;DR

A playable, self-contained feel prototype is in [`index.html`](index.html) (~80 KB, no external files, no build step). The simulation is deterministic and covered by 18 passing Node tests. Nothing has been tried on a real phone: **feel, audio, haptics and touch are untested on device.** Tomorrow's first job is to tune it in your hand.

## What is built

- **Game:** drag left/right to slide the chopsticks under grains arcing in from the lentil heap (top-left) and the rice heap (bottom-right).
  - Target-type grains snap into a single-file column with a spring overshoot.
  - The column leans with stick acceleration; taller columns are driven harder, and past the spill angle they spill.
  - Flick up to bank into the bowl for `length²`.
  - A wrong grain cracks the column. By default it loses the whole column; "lose top N" is a toggle.
  - The target alternates after each bank.
  - A run ends after 5 misses; spills and wrong grains count as misses.
  - Tap to replay: about 0.3 s guard, then instantly playing.
- **Zen mode:** ZEN button (top right) or `Z`. Endless, no fail, wrong grains bounce off, the column never spills (toggle).
- **Juice:**
  - WebAudio clicks that rise a semitone per catch in an unbroken chain (capped at +24, wrap optional).
  - A brighter click on a perfect (centre) catch.
  - The bank whooshes, then each grain clicks into the bowl in a descending cascade.
  - Dull thud on a wrong grain; scattered clicks on a spill; soft tick on a miss.
  - Audio unlocks on the first touch (iOS).
  - `navigator.vibrate` ticks per catch, stronger on perfect, a pattern on bank. It's feature-detected, so iPhone silently no-ops.
  - Slow-mo (0.35× for 250 ms) on near-miss edge catches.
  - Dust on catch; screen shake on bank only. Shake, slow-mo and whip ghosts are disabled under `prefers-reduced-motion`.
  - The bowl fills visibly and persists across runs. A "13 → 169" bank preview sits next to the column and turns warm as the lean approaches spilling. A one-time "flick ↑ to bank" hint shows until your first bank.
- **Look:** dark slate with streaks and speckle, vignette, edge heaps drawn from the same grain sprites, gradient wooden chopsticks with lacquered ends and shadows, ceramic bowl. Grains have a highlight and contact shadow. Lentil = disc, rice = pointed grain, so the shapes differ beyond colour.
- **Tuning panel:** ⚙ button, three-finger tap, or `G`. It pauses the run.
  - Every feel number from the single `DEFAULTS` object in the sim block has a slider, toggle or select, applied live.
  - **Save** (localStorage), **Reset**, **Copy JSON** (full config; falls back to a selectable text box if clipboard access is blocked), **Restart run**.
  - Shows FPS, sim steps/s, live grain count, and the in-memory analytics log.
  - "Show catch zones" draws the catch window and the perfect zone.
- **Architecture:**
  - The simulation sits between `// ===== CHOPSTICK-SIM BEGIN/END =====` markers: pure, seeded (mulberry32), no DOM / `Math.random` / `Date`, fixed 120 Hz step. Rendering interpolates between steps.
  - Host code (input, audio, haptics, rendering, panel, storage) is a separate `<script>`.
  - Canvas is devicePixelRatio-aware (capped at 3), with safe-area insets, `touch-action:none`, and no scroll or zoom.
  - The world is 1000 units wide with a height that adapts to the screen (1450–2200).
- **Save:** `cakehero.chopstickCatch.save` = `{saveVersion: 1, bowl{lentil,rice}, best{score,column,zenColumn}, runs, banksEver, zen}`. Tuning lives separately in `cakehero.chopstickCatch.tuning` (`saveVersion: 1`, only the values that differ from defaults). Every storage access is in try/catch, and the game runs with storage blocked (verified).
- **Analytics (in memory, no network):** `session_started`, `run_start`, `catch`, `perfect_catch`, `wrong_grain`, `spill`, `miss`, `bank{length,score,total}`, `run_end{reason,...}`, `voluntary_replay`, `target_change`, `mode_toggle`.
- **Debug:** `window.__chop.sim` in the console, e.g. `__chop.sim.debugFillColumn('rice', 12)`.
- **Keyboard (desktop):** ←/→ or A/D to move, ↑/Space/W to bank, R to restart, Z for Zen, G or Esc for the panel.

## How to run it on your phone

Easiest: serve the folder on your Mac and open it from the phone on the same Wi-Fi.

```bash
cd prototypes/chopstick-catch
python3 -m http.server 8000
# Find the Mac's LAN IP:  ipconfig getifaddr en0
# On the phone: http://<that-ip>:8000/
```

- Double-click `index.html` on the Mac to try it with mouse/keyboard.
- On iPhone, Add to Home Screen gives a fullscreen feel.
- Plain `http://` on a LAN IP works for everything here. Clipboard "Copy JSON" may fall back to the manual text box on non-HTTPS origins; that's expected.
- AirDropping the file to iOS Files and opening it there also works, but Safari's sandbox for `file://` can disable storage. The game still runs, but the bowl won't persist.

**Tuning workflow:** play → ⚙ → move sliders (live) → **Save** keeps them on that phone → **Copy JSON** → paste into a message/notes → paste the values back into `DEFAULTS` in `index.html` and commit.

## Current default tuning and why

All numbers are illustrative starting points, not tuned product values (AGENTS.md).

| Group | Values | Reasoning |
|---|---|---|
| Physics | gravity 2600 u/s², flight time 1.0–1.5 s | Arcs readable for about a second, so the player sees where each grain is heading; apex is clamped on-screen |
| Spawns | every 0.9 s → 0.5 s (−0.005 s per s), ±25 % jitter, 65 % target | About one grain per second at start; the ramp reaches the floor after ~80 s; wrong grains are frequent enough to matter |
| Catching | gap 42, tolerance 16 → catch half-width 37 u (≈14 css px on a 390 px phone); perfect = inner 30 %, near-miss = outer 14 % | Generous enough for a thumb; perfects happen roughly every third catch, so the bright click stays special but frequent |
| Sticks | relative drag ×1.25, critically damped follow ω 55 | Thumb can be anywhere and doesn't cover the sticks; slight lag smooths jitter but stays responsive |
| Snap | k 900, c 24 (ζ ≈ 0.4) | About 25 % overshoot: "click and settle", never a teleport |
| Sway | k 30, c 3.2, drive 0.00025, lenFactor (n/8)^1.3, spill 0.42 rad, min length 3 | Headless measurements: a smooth 300-unit move leans ~0.02 rad at 5 grains and ~0.14 rad at 20. Full-width slams spill an 18-grain column within ~1 s but not a 10-grain one |
| Score | length² | A bot sweep (simple bot, 30 seeds) peaks at banking around 12–16 grains, then collapses at 25 (spills). So the bank-or-one-more curve exists. The bot ignores wrong grains and jerks the sticks, so real-player numbers will differ |
| Run | 5 misses; spill and wrong grain each cost a miss | Fail-to-playing under 1 s |
| Juice | slow-mo 0.35× / 250 ms, shake 9, pitch +1 semitone capped at +24 from 880 Hz | As specified in the request |
| Haptics | catch 8 ms, perfect 16 ms, bank 45-30-27 ms, wrong 35 ms | Light ticks; Android only |

## What I verified, and how

- **Node tests:** `node --test prototypes/chopstick-catch/test/sim.test.mjs` → **18/18 pass** (Node 22). The test pulls the exact sim block out of `index.html` and runs it in a bare VM with `Math.random` poisoned and no `Date`/DOM. Coverage:
  - Invariants across 25 bot seeds and 10 random-flailing seeds: no NaN, no negative counts, score never decreases, bank always empties the column.
  - Deterministic replay: same seed + recorded inputs → identical state hash and event list; a different seed diverges.
  - The game is playable: a bot banks on ≥16/20 seeds.
  - Run end by misses and by timer.
  - Zen never ends or fails.
  - Perfect, near-miss and miss classification.
  - Spring overshoot.
  - Wrong-grain `lose_column` vs `lose_top`.
  - Bank scoring (9 → 81), all grains landing in the bowl, target switch.
  - Violent movement spills a tall column; a gentle sweep doesn't spill a short one.
  - Config validator (unreachable landing range, unstable springs, bad enums).
- **Syntax check:** both inline scripts extracted and run through `node --check`. OK.
- **Headless Chromium (Playwright), iPhone-sized viewport 390×844 @3×, touch enabled:**
  - No console errors or page errors through title → play → drag → flick → panel → run over → replay.
  - Banking pours into the bowl, and the bowl count survives a reload.
  - The game boots and plays with `localStorage` throwing on access.
  - Replay tap goes straight to playing and logs `voluntary_replay`.
  - A landscape + reduced-motion context renders without errors.
  - I looked at screenshots of the title screen, play, a 13-grain column, and the bank moment.
- **Release build:** `scripts/build_release.sh <scratch dir>` runs and produces the ZIP and consolidated MD. Outputs were not committed (the script writes outside the repo by design).

## What I could NOT verify

- **Feel on a real device: untested.** I have no phone, no real touch, no speakers and no vibration motor. Whether the drag gain, flick threshold, sway and catch width feel right in a thumb is the open question.
- **Audio:** the synth code runs without errors headlessly, but I never heard it. The click timbre, the pitch ladder and the cascade may sound thin or harsh.
- **iOS specifics:** audio unlock on the first touch, safe-area behaviour on a notched iPhone, Safari's three-finger gesture conflicts, and frame rate on older phones.
- **Haptics:** the Android patterns have never been felt.
- **Performance on low-end Android:** the panel shows FPS; check it.

## Known issues / rough edges

- **Flick detection** uses upward speed > 1500 world u/s plus > 45 u of travel within ~100 ms. That's a guess: it may be too strict or too easy, and a sideways-then-up swipe could nudge the sticks before the flick registers. Tune `flickSpeed` / `flickMinDist`. Consider a bank button as an accessibility alternative.
- **The panel has no left-handed layout yet.** HUD buttons are on the right.
- **Banked grains wait in place** for their cascade turn (top grain leaves first), so a long column briefly hovers after the flick. That reads as "pouring from the top" in screenshots, but check it on device.
- **The bowl body is drawn as a shallow dish;** fine, but not polished.
- **No collisions between flying grains and the sticks.** Grains pass "through" the stick tips into the channel. That's intentional for readability.
- **`pitchWrap` wraps at the cap** with a hard jump; may sound abrupt.
- **Repo tooling, pre-existing and not changed here:**
  - `scripts/build_release.sh` zips the whole folder including `.git/`.
  - The consolidated export lists only the core docs, so `prototypes/` (and its BRIEF) is in the ZIP but not in `CAKE_HERO_CONSOLIDATED.md`.
  - Decide whether to add prototype briefs to the script's file list.

## Next steps for tomorrow (prioritised)

1. **Tune on device.** Play 10+ runs on your phone (and one Android for haptics). Adjust in this order: drag gain/mode → catch tolerance → flick thresholds → sway drive/spill angle → spawn pacing → audio pitch/volume. Save → Copy JSON → commit the new `DEFAULTS`. Then hand it to 3–5 people cold and watch: do they restart unprompted, and can they say why they lost the column?
2. **Recorded sounds:** record real sprinkles dropping on a wooden board (single clicks at a few pitches, a pour, a scatter, a dull knock) and swap them for the synth voices behind the same `Sound` calls. Keep the pitch ladder by playback-rate shifting.
3. **Sprinkles skin:** nonpareils (tiny, bouncy, fast), jimmies/rods (long slot height, roll), sugar pearls (heavy, shiny), dragées (heavy and slippery: higher sway drive). Make grain types data records (shape, slot height, mass/sway factor, colour set, sound) instead of the hard-coded two. Bank into a jar so it links to Sprinkle Designer / mixing (I-070, I-072).
4. **Daily seeded challenge:** the sim is already deterministic per seed. Add a date-derived seed, one attempt counted for score with free practice runs, and a local best-of-day. No rewards beyond score (no loot, no timers).
5. **Replay export as a vertical clip:** record the input stream (the deterministic replay test already proves inputs + seed reproduce a run), re-simulate offline, and render to a 9:16 canvas → `MediaRecorder` WebM/MP4. That's spectator/acquisition evidence per the Arcade strategy.

After that: decide with evidence whether this is core, contextual, Arcade or spin-out (update I-098 and CH-2026-001; get product approval before anything is promoted).

## Commits on this branch

See `git log main..claude/chopstick-catch-prototype`:

1. Prototype (`index.html`) + Node tests
2. Docs: BRIEF, backlog I-098, catalog entry, decision record CH-2026-001, README map row
3. This handoff
