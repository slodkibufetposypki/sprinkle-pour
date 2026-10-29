// Headless tests for the Chopstick Catch simulation.
// Extracts the exact code between the CHOPSTICK-SIM markers in ../index.html and runs it in a bare VM context
// (no window/document), so any accidental DOM or Math.random/Date dependency in the sim fails loudly.
//
// Run: node --test prototypes/chopstick-catch/test/sim.test.mjs   (Node 18+)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const htmlPath = fileURLToPath(new URL('../index.html', import.meta.url));
const html = readFileSync(htmlPath, 'utf8');
const BEGIN = '// ===== CHOPSTICK-SIM BEGIN =====';
const END = '// ===== CHOPSTICK-SIM END =====';
const i0 = html.indexOf(BEGIN), i1 = html.indexOf(END);
assert.ok(i0 > 0 && i1 > i0, 'sim markers not found in index.html');
const simSource = html.slice(i0, i1);

function loadSim() {
  // Poison non-deterministic globals: the sim must never touch them.
  const poisonedMath = Object.create(Math);
  poisonedMath.random = () => { throw new Error('sim used Math.random'); };
  const ctx = vm.createContext({ Math: poisonedMath, Date: undefined, console });
  vm.runInContext(simSource + '\nthis.ChopSim = ChopSim;', ctx, { filename: 'chopstick-sim.js' });
  return ctx.ChopSim;
}
const ChopSim = loadSim();
const cfgWith = (o) => Object.assign({}, ChopSim.DEFAULTS, o || {});

// Deterministic input script: a seeded "player" that chases target grains, sometimes jerks, and banks.
function makeBot(sim, seed, opts) {
  opts = Object.assign({ bankAt: 6, jitter: 0, ignoreWrong: false }, opts);
  const rnd = ChopSim.mulberry32(seed ^ 0x9e3779b9);
  return function nextInput() {
    const s = sim.s, c = sim.cfg;
    if (s.state !== 'playing') return {};
    const top = sim.columnTop();
    let best = null;
    for (const g of s.grains) {
      if (g.type !== s.target || g.bounced || g.missed) continue;
      const disc = g.vy * g.vy + 2 * c.gravity * (top.y - g.y);
      if (disc < 0) continue;
      const t = (-g.vy + Math.sqrt(disc)) / c.gravity;
      if (t <= 0) continue;
      if (!best || t < best.t) best = { t, x: g.x + g.vx * t };
    }
    const input = {};
    if (best) input.targetX = best.x - (top.x - s.stick.x) + (rnd() - 0.5) * opts.jitter;
    if (s.column.length >= opts.bankAt) input.flick = true;
    return input;
  };
}

function numericFieldsFinite(obj, path, out) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && !Number.isFinite(v)) out.push(`${path}.${k}=${v}`);
    else if (v && typeof v === 'object') numericFieldsFinite(v, `${path}.${k}`, out);
  }
  return out;
}

// Runs a sim with an input source, checking invariants every step. Returns { sim, events, inputs }.
function run({ seed = 1, cfg = {}, steps = 120 * 120, input = null, recordInputs = false, worldH = 1700 }) {
  const sim = ChopSim.create(cfgWith(cfg), seed, { worldH });
  const next = input ? input(sim) : () => ({});
  const events = sim.drainEvents();
  const inputs = [];
  let lastScore = 0;
  for (let i = 0; i < steps; i++) {
    const inp = next(i);
    if (recordInputs) inputs.push(inp);
    sim.step(inp);
    const evs = sim.drainEvents();
    events.push(...evs);
    const s = sim.s;
    assert.ok(s.column.length >= 0, 'column count negative');
    assert.ok(s.misses >= 0, 'misses negative');
    assert.ok(s.score >= lastScore, `score decreased at step ${i}: ${lastScore} -> ${s.score}`);
    lastScore = s.score;
    if (evs.some((e) => e.type === 'bank')) assert.equal(s.column.length, 0, 'bank did not empty the column');
    if (i % 60 === 0 || evs.length) {
      const bad = numericFieldsFinite(s, 's', []);
      assert.equal(bad.length, 0, `non-finite state at step ${i}: ${bad.join(', ')}`);
    }
  }
  return { sim, events, inputs };
}

test('default config validates cleanly', () => {
  assert.equal(JSON.stringify(ChopSim.validateConfig(cfgWith())), '[]');   // arrays from the VM realm: compare as JSON
});

test('validator catches impossible / unstable configs', () => {
  assert.ok(ChopSim.validateConfig(cfgWith({ landMaxX: 990, stickMaxX: 890 })).some((m) => m.includes('reachable')));
  assert.ok(ChopSim.validateConfig(cfgWith({ arcTimeMin: 2, arcTimeMax: 1 })).length > 0);
  assert.ok(ChopSim.validateConfig(cfgWith({ gravity: NaN })).length > 0);
  assert.ok(ChopSim.validateConfig(cfgWith({ wrongRule: 'explode' })).length > 0);
  assert.ok(ChopSim.validateConfig(cfgWith({ stickFollow: 1000 })).some((m) => m.includes('stable')));
});

test('score = round(base * length ^ exponent)', () => {
  const c = cfgWith();
  assert.equal(ChopSim.scoreFor(0, c), 0);
  assert.equal(ChopSim.scoreFor(1, c), 1);
  assert.equal(ChopSim.scoreFor(10, c), 100);
  assert.equal(ChopSim.scoreFor(10, cfgWith({ scoreExponent: 1.5 })), 32);
});

test('seeded bot runs: invariants hold across many seeds', () => {
  for (let seed = 1; seed <= 25; seed++) {
    run({ seed, steps: 120 * 90, input: (sim) => makeBot(sim, seed, { bankAt: 4 + (seed % 9), jitter: seed % 3 ? 20 : 120 }) });
  }
});

test('random flailing input never produces NaN or negative counts', () => {
  for (let seed = 100; seed < 110; seed++) {
    const rnd = ChopSim.mulberry32(seed);
    run({ seed, steps: 120 * 60, input: () => () => ({ targetX: rnd() * 1400 - 200, flick: rnd() < 0.01 }) });
  }
});

test('deterministic replay: same seed + same inputs => identical state and events', () => {
  const a = run({ seed: 4242, steps: 120 * 45, recordInputs: true, input: (sim) => makeBot(sim, 7, { bankAt: 7, jitter: 60 }) });
  const replay = a.inputs.slice();
  const b = run({ seed: 4242, steps: replay.length, input: () => (i) => replay[i] });
  assert.equal(b.sim.hash(), a.sim.hash());
  assert.deepEqual(JSON.parse(JSON.stringify(b.events)), JSON.parse(JSON.stringify(a.events)));
  const c = run({ seed: 4243, steps: replay.length, input: () => (i) => replay[i] });
  assert.notEqual(c.sim.hash(), a.sim.hash(), 'different seed should diverge');
});

test('the game is playable: a simple bot catches and banks on most seeds', () => {
  let banked = 0, catches = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = run({ seed, steps: 120 * 60, input: (sim) => makeBot(sim, seed, { bankAt: 5, jitter: 10 }) });
    if (r.sim.s.banks > 0) banked++;
    catches += r.sim.s.catches;
  }
  assert.ok(banked >= 16, `bot banked on only ${banked}/20 seeds`);
  assert.ok(catches > 100, `bot caught only ${catches} grains`);
});

test('idle player: run ends by misses with reason "misses"', () => {
  const r = run({ seed: 9, steps: 120 * 120 });
  const end = r.events.find((e) => e.type === 'run_end');
  assert.ok(end, 'run never ended');
  assert.equal(end.reason, 'misses');
  assert.equal(r.sim.s.state, 'over');
  assert.equal(r.events.filter((e) => e.type === 'run_end').length, 1);
});

test('timer mode ends at runSeconds with reason "timer"', () => {
  const r = run({ seed: 3, cfg: { runMode: 'timer', runSeconds: 20 }, steps: 120 * 25 });
  const end = r.events.find((e) => e.type === 'run_end');
  assert.equal(end.reason, 'timer');
  assert.ok(Math.abs(end.duration - 20) < 0.02);
});

test('Zen mode never ends, never fails, and bounces wrong grains', () => {
  const r = run({ seed: 11, cfg: { zen: true }, steps: 120 * 240, input: (sim) => makeBot(sim, 11, { bankAt: 30, jitter: 80 }) });
  assert.equal(r.sim.s.state, 'playing');
  assert.equal(r.sim.s.misses, 0);
  assert.ok(!r.events.some((e) => e.type === 'run_end' || e.type === 'wrong_grain' || e.type === 'spill'));
});

// --- targeted scenarios built with debug hooks ---
function freshSim(cfg, seed = 5) {
  const sim = ChopSim.create(cfgWith(Object.assign({ spawnInterval: 99, spawnIntervalMin: 99 }, cfg)), seed, { worldH: 1700 });
  sim.s.nextSpawn = 1e9;  // no random spawns
  sim.drainEvents();
  return sim;
}
function dropOnto(sim, type, dx = 0) {
  const top = sim.columnTop();
  sim.debugSpawn(type, top.x + dx, top.y - 40, 0, 600);
  for (let i = 0; i < 30; i++) sim.step({});
  return sim.drainEvents();
}

test('a centred target grain is caught as a perfect catch and snaps into the column', () => {
  const sim = freshSim();
  const ev = dropOnto(sim, sim.s.target, 0);
  assert.ok(ev.some((e) => e.type === 'catch' && e.perfect));
  assert.ok(ev.some((e) => e.type === 'perfect_catch'));
  assert.equal(sim.s.column.length, 1);
  assert.equal(sim.s.chain, 1);
});

test('edge catch is flagged as near miss; outside the window is a miss', () => {
  const sim = freshSim();
  const halfW = sim.cfg.stickGap / 2 + sim.cfg.catchTolerance;
  let ev = dropOnto(sim, sim.s.target, halfW - 1);
  assert.ok(ev.some((e) => e.type === 'catch' && e.nearMiss && !e.perfect));
  ev = dropOnto(sim, sim.s.target, halfW + 30);
  assert.ok(ev.some((e) => e.type === 'miss'));
  assert.equal(sim.s.misses, 1);
  assert.equal(sim.s.chain, 0);
});

test('snap uses a spring with overshoot, not a teleport', () => {
  const sim = freshSim();
  const top = sim.columnTop();
  sim.debugSpawn(sim.s.target, top.x + 20, top.y - 40, 0, 600);
  const offsets = [];
  for (let i = 0; i < 60; i++) { sim.step({}); if (sim.s.column[0]) offsets.push(sim.s.column[0].ox); }
  assert.ok(offsets[0] > 15, 'grain should start at its catch offset');
  assert.ok(Math.min(...offsets) < -0.5, 'spring should overshoot past centre');
  assert.ok(Math.abs(offsets[offsets.length - 1]) < 2, 'spring should settle');
});

test('wrong grain with lose_column cracks the whole column', () => {
  const sim = freshSim({ wrongRule: 'lose_column' });
  sim.debugFillColumn(sim.s.target, 6);
  const wrong = sim.s.target === 'lentil' ? 'rice' : 'lentil';
  const ev = dropOnto(sim, wrong, 0);
  const w = ev.find((e) => e.type === 'wrong_grain');
  assert.ok(w);
  assert.equal(w.lost, 6);
  assert.equal(sim.s.column.length, 0);
  assert.equal(sim.s.misses, 1);
});

test('wrong grain with lose_top N removes only the top N', () => {
  const sim = freshSim({ wrongRule: 'lose_top', wrongTopN: 3 });
  sim.debugFillColumn(sim.s.target, 7);
  const wrong = sim.s.target === 'lentil' ? 'rice' : 'lentil';
  const ev = dropOnto(sim, wrong, 0);
  assert.equal(ev.find((e) => e.type === 'wrong_grain').lost, 3);
  assert.equal(sim.s.column.length, 4);
});

test('bank empties the column, scores length^2, pours every grain and switches target', () => {
  const sim = freshSim();
  const target = sim.s.target;
  sim.debugFillColumn(target, 9);
  sim.step({ flick: true });
  const ev = sim.drainEvents();
  const b = ev.find((e) => e.type === 'bank');
  assert.deepEqual([b.length, b.score], [9, 81]);
  assert.equal(sim.s.column.length, 0);
  assert.equal(sim.s.score, 81);
  assert.ok(ev.some((e) => e.type === 'target_change'));
  assert.notEqual(sim.s.target, target);
  const ticks = [];
  for (let i = 0; i < 240; i++) { sim.step({}); ticks.push(...sim.drainEvents().filter((e) => e.type === 'pour_tick')); }
  assert.equal(ticks.length, 9, 'every banked grain should land in the bowl');
  assert.equal(sim.s.pours.length, 0);
});

test('violent movement with a tall column spills it; smooth movement with a short one does not', () => {
  const tall = freshSim();
  tall.debugFillColumn(tall.s.target, 18);
  let spilled = false;
  for (let i = 0; i < 240 && !spilled; i++) {
    tall.step({ targetX: (Math.floor(i / 40) % 2) ? 850 : 150 });   // full-width slams, ~3 per second
    spilled = tall.drainEvents().some((e) => e.type === 'spill');
  }
  assert.ok(spilled, 'tall column should spill under violent back-and-forth');

  const short = freshSim();
  short.debugFillColumn(short.s.target, 5);
  for (let i = 0; i < 240; i++) {
    short.step({ targetX: 500 + Math.sin(i / 60) * 200 });   // gentle sweep
    assert.ok(!short.drainEvents().some((e) => e.type === 'spill'), 'gentle sweep should not spill a short column');
  }
});

test('the sim does not depend on worldH except through layout', () => {
  for (const worldH of [1450, 1800, 2200]) run({ seed: 2, worldH, steps: 120 * 30, input: (sim) => makeBot(sim, 2) });
});
