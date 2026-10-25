# Chopstick Catch — Prototype Brief

**Status:** PROPOSAL / mechanic candidate (backlog [I-098](../../IDEA_BACKLOG.md)). **Not** the chosen core. It doesn't replace Sprinkle Pour (CH-P002, I-018) or any other authored mechanic.
**Classification:** OPEN. Could become core, contextual, Arcade-replayable, or a spin-out candidate. This prototype exists to produce the evidence for that choice.
**Owner/approver:** Sławek (product).
**Prototype:** [`index.html`](index.html) · tests [`test/sim.test.mjs`](test/sim.test.mjs) · handoff [`HANDOFF.md`](HANDOFF.md)

## Source

**Origin:** user request, 25 Oct 2026. Sławek described a viral ASMR livestream (about 7K concurrent viewers). The video itself wasn't available to the agent, so everything below comes from his description, not from the footage.

> Top-down view of a dark slate board. A pile of red/orange lentils at the top and left edge, a pile of white rice at the bottom right. Two wooden chopsticks lie in a narrow V / near-parallel channel. Grains fly in from the piles and click, one by one, into a perfect single-file column wedged between the two sticks. The sticks whip (motion blur), the column releases and scatters, and the cycle repeats, sometimes with the other grain type.

### Why it hooks people (source-explicit, per the description)

1. **Chaos to order:** a scattered heap becomes a perfect line.
2. **Precision:** each grain looks like it might miss, then fits exactly.
3. **Build then release:** the line grows, then the flick lets it go.
4. **Texture:** tiny clicks, two strong colours on black.

The rest of this document is **synthesis / proposal**. It turns a watched ASMR loop into something a player does.

## Mechanic (proposal)

- **Verb family:** Sort + Control, with a catch-and-stack twist. It reuses the "identify attribute → route correctly" language of shipment sorting (I-014, I-029). It adds a physical stability layer (I-015).
- **Input:** one thumb. Drag horizontally to slide the chopstick pair under incoming grains. Flick up to bank.
- **Catch:** grains arc in from the edge piles. A target-type grain that reaches the top of the column inside the catch window snaps into place with a spring overshoot and a click.
- **Sway:** the column leans like a damped spring driven by stick acceleration. Taller columns are driven harder and swing slower. Leaning past the spill angle spills the whole unbanked column.
- **Bank:** flick up to pour the column into a bowl. Score = `scoreBase × length^scoreExponent`, default `length²`. The **bank-now-or-one-more-grain** choice is the core tension.
- **Two grain types:** lentil (orange disc) and rice (white elongated grain). Each has a distinct **shape** as well as colour, so the types stay readable without colour (accessibility). One type is the target. Catching the wrong one cracks the column: lose all of it, or lose the top N (configurable). The target alternates per bank, on a timer, or never.
- **Run end:** after N misses (spills and wrong grains count by default), on a timer, or both. Restart takes under a second.
- **Zen mode:** no fail, endless, wrong grains bounce off, and (by default) the column never spills.

## What the prototype is meant to learn

These are the questions for Stage A (feel sandbox) in [VERTICAL_SLICE.md](../../production/VERTICAL_SLICE.md):

1. **Does catching 10 in a row feel good with minimal art?** The rising pitch, snap overshoot, near-miss slow-mo and bank cascade should carry it without content.
2. **Does bank-or-one-more create voluntary replay?** Do testers restart without being asked, and do they talk about "I should have banked"?
3. **Is failure legible?** Can a tester say *why* the column was lost (wrong grain, spill, miss) without being told?
4. **Does the sway feel fair?** Do players blame themselves ("I jerked it") or the game ("random wobble")?
5. **Does it have a Cake Hero skin?** Would sprinkles (nonpareils, jimmies, sugar pearls, dragées) with different physics be the same game with more meaning, connecting to the sprinkle business (I-061, I-070)?
6. **Is it spectator-clear?** The source is a livestream. Does a 10-second recording read instantly (Arcade/acquisition-creative evidence, per [ARCADE_STANDALONE_STRATEGY.md](../../design/ARCADE_STANDALONE_STRATEGY.md))?

## Entry, success, failure, retry, reward, exit

| | Prototype behaviour |
|---|---|
| Entry | Title card with three lines of instruction; tap to start. |
| Success | Catch target grains; bank a column for `length²`. |
| Failure | Miss a target grain, catch a wrong grain, or spill. Each costs one miss pip (configurable). The unbanked column is lost. |
| Retry | Tap after the run-over card (≈0.3 s guard against stray taps). |
| Reward | Score, best score, and a **persistent bowl** that fills with every banked grain across runs. No random rewards, loot, prizes, monetisation, lives or energy. |
| Exit | Close the tab; the save flushes on hide. |

## Analytics (in-memory only)

`run_start`, `catch`, `perfect_catch`, `wrong_grain`, `spill`, `miss`, `bank{length,score}`, `run_end{reason}`, `voluntary_replay`, `target_change`, `mode_toggle`, `session_started`. They map onto the repo vocabulary in [ANALYTICS_EXPERIMENTS.md](../../design/ANALYTICS_EXPERIMENTS.md) as follows: `run_start` ≈ `challenge_started`, `run_end` ≈ `challenge_completed/failed` with the failure reason, and `voluntary_replay` ≈ `retry_started`/`arcade_voluntary_started`. Nothing leaves the device. Events are viewable in the tuning panel.

## Out of scope

Meta/economy hooks, levels, progression currency, monetisation, loot, leaderboards, recorded audio, sprinkle skin, daily challenge, replay export. Those are next steps, listed in HANDOFF.md.

## Rollback

The whole experiment lives in `prototypes/chopstick-catch/`, plus one backlog row, one catalog entry and one decision record. To remove it, delete the folder and mark I-098 superseded/rejected (never delete the row).
