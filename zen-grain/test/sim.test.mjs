// Runs the exact simulation block from game.html in a bare VM: no DOM, no Date, Math.random poisoned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../game.html', import.meta.url), 'utf8');
const m = html.match(/\/\/ ===== GRAIN-SIM BEGIN =====([\s\S]*?)\/\/ ===== GRAIN-SIM END =====/);
assert.ok(m, 'sim block markers present');
const ctx = vm.createContext({ Math: Object.assign(Object.create(Math), { random() { throw new Error('Math.random used in sim'); } }) });
vm.runInContext(m[1] + '\nthis.GrainSim = GrainSim;', ctx);
const GS = ctx.GrainSim;
const { ST, AUTHORED, W, TYPES } = GS;
const LAYOUT = { H: 1300, top: 150, bottom: 6 };           // a 390×844 phone
const byId = (id) => AUTHORED.find((L) => L.id === id);

function invariants(sim) {
  let stored = 0;
  for (const g of sim.grains) {
    assert.ok(Number.isFinite(g.x) && Number.isFinite(g.y), 'finite position');
    if (g.st === ST.GONE || g.st === ST.POUR) stored++;
  }
  const taken = Object.values(sim.stats.taken).reduce((a, b) => a + b, 0);
  assert.equal(stored, taken, 'every stored grain came from a row');
  const S = sim.sticks;
  assert.ok(S.row.length <= sim.caps[S.rowType], 'row within capacity');
  for (const id of S.row) assert.equal(sim.grains[id].type, S.rowType, 'row holds one kind');
  for (const id of S.trail) assert.equal(sim.grains[id].type, S.rowType, 'file holds one kind');
  for (const t in sim.stores) for (const id of sim.stores[t].ids) assert.equal(sim.grains[id].type, t, 'pile holds one kind');
  assert.ok(sim.score >= 0, 'score never negative');
}

function playWithBot(level, seed, maxSeconds = 900) {
  const sim = GS.create({}, level, LAYOUT, seed);
  const bot = GS.makeBot(sim, seed * 13 + 1);
  const max = maxSeconds * sim.cfg.stepHz;
  const events = [];
  for (let i = 0; i < max && !(sim.done && sim.sticks.phase === 'away'); i++) {
    sim.step(bot());
    for (const e of sim.drainEvents()) events.push(e);
    if (i % 60 === 0) invariants(sim);
  }
  for (let i = 0; i < 120; i++) sim.step({ down: false });
  invariants(sim);
  return { sim, events };
}
function holdAt(sim, x, y, seconds) {
  const inp = { down: true, x, y: y + sim.cfg.fingerOffset };
  const ev = [];
  for (let i = 0; i < seconds * sim.cfg.stepHz; i++) { sim.step(inp); ev.push(...sim.drainEvents()); }
  return ev;
}
function release(sim, seconds) {
  const ev = [];
  for (let i = 0; i < seconds * sim.cfg.stepHz; i++) { sim.step({ down: false, x: W / 2, y: 1200 }); ev.push(...sim.drainEvents()); }
  return ev;
}
const centroid = (gs) => gs.reduce((a, g) => ({ x: a.x + g.x / gs.length, y: a.y + g.y / gs.length }), { x: 0, y: 0 });

test('every authored and the first 60 generated levels are valid', () => {
  for (const L of AUTHORED.concat([GS.DEMO])) assert.deepEqual(Array.from(GS.validateLevel(L)), [], L.id);
  for (let i = AUTHORED.length; i < AUTHORED.length + 60; i++) assert.deepEqual(Array.from(GS.validateLevel(GS.levelFor(i))), [], 'level ' + (i + 1));
  const ids = new Set();
  for (let i = 0; i < 80; i++) ids.add(GS.levelFor(i).id);
  assert.equal(ids.size, 80, 'unique level ids');
});

test('validator catches broken levels', () => {
  const bad = { id: 'x', name: 'X', seed: 1, types: ['lentil', 'quinoa'], tune: { warp: 3, zoneR: 90 }, piles: [{ type: 'rice', kind: 'spiral', count: 0 }] };
  const errs = Array.from(GS.validateLevel(bad));
  for (const want of ['unknown type quinoa', 'pile type rice not in types', 'unknown pile kind', 'bad count', 'no grains of lentil', 'bad tune warp', 'creep reaches past the reach']) {
    assert.ok(errs.some((e) => e.includes(want)), want);
  }
});

test('generated levels get harder one step at a time, without end', () => {
  const at = (i) => Object.assign({}, GS.DEFAULTS, GS.levelFor(i).tune);
  const grains = (i) => GS.levelFor(i).piles.reduce((n, p) => n + p.count, 0);
  const pressure = (i) => { const t = at(i); return t.creepSpeed * t.creepR / t.zoneR; };   // how fast and far wrong grains come
  let prevD = 0, three = false;
  for (let i = AUTHORED.length; i < AUTHORED.length + 100; i++) {
    const d = GS.difficulty(i);
    assert.ok(d > prevD && d < 1, 'difficulty keeps climbing and never reaches 1');
    prevD = d;
    if (i > AUTHORED.length) {
      assert.ok(pressure(i) >= pressure(i - 1) * 0.995, 'creep pressure never drops, level ' + (i + 1));   // 0.5%: rounding
      if (i >= AUTHORED.length + 5) assert.ok(pressure(i) > pressure(i - 5), 'and keeps rising, level ' + (i + 1));
      assert.ok(at(i).paceK <= at(i - 1).paceK, 'the pace never loosens, level ' + (i + 1));
      const L = GS.levelFor(i), mix = GS.mixOf(L.piles, L.seed), want = GS.mixTarget(L.difficulty);
      assert.ok(Math.abs(mix - want) < Math.max(0.6, want * 0.25), 'level ' + (i + 1) + ' is as mixed as the climb asks: ' + mix.toFixed(2) + ' for ' + want.toFixed(2));
      assert.ok(grains(i) >= grains(i - 1) - 2, 'no fewer grains, level ' + (i + 1));
    }
    const n = GS.levelFor(i).types.length;
    if (three) assert.equal(n, 3, 'three kinds stay, level ' + (i + 1));
    three = three || n === 3;
  }
  assert.ok(three, 'three kinds arrive');
  // level 26 of the first curve (three kinds, creep pressure 126, mixing 1.9) was the first real challenge; by
  // level 21 the board is now more mixed than that and wrong grains already come hard
  const L21 = GS.levelFor(20);
  assert.ok(GS.mixOf(L21.piles, L21.seed) > 1.9 && pressure(20) >= 100, 'level 21 is past the old level 26');
  const rules = new Set();
  for (let i = AUTHORED.length; i < AUTHORED.length + 12; i++) rules.add(GS.levelFor(i).rule);
  for (const r of ['Restless grains', 'Short reach', 'Narrow reach']) assert.ok(rules.has(r), r + ' appears');
});

test('levels generate the same board every time, inside the board and off the sorted piles', () => {
  for (let i = 0; i < AUTHORED.length + 12; i++) {
    const L = GS.levelFor(i);
    const a = GS.create({}, L, LAYOUT, 1), b = GS.create({}, L, LAYOUT, 2);
    assert.equal(a.hash(), b.hash(), L.id + ' layout depends only on the level seed');
    for (const g of a.grains) {
      const B = a.bounds();
      assert.ok(g.x >= B.x0 && g.x <= B.x1, 'x inside');
      assert.ok(g.y >= B.y0 && g.y <= B.y1, 'y inside');
      for (const t in a.stores) {
        const st = a.stores[t];
        assert.ok(Math.hypot(g.x - st.x, g.y - st.y) >= st.r - 0.01, L.id + ' grain off the ' + t + ' pile');
      }
    }
  }
});

test('each kind gets its own pile: two kinds left and right, three with one in the middle', () => {
  const two = GS.create({}, byId('two-heaps'), LAYOUT, 1), three = GS.create({}, byId('mung-beans'), LAYOUT, 1);
  assert.equal(two.stores.lentil.kind, 'bl'); assert.equal(two.stores.rice.kind, 'br');
  assert.equal(three.stores.mung.kind, 'bc');
});

test('a level can change the feel without touching the shared settings', () => {
  const shared = { zoneR: 175 };
  const sim = GS.create(shared, byId('short-reach'), LAYOUT, 1);
  assert.equal(sim.cfg.zoneR, 105);
  assert.equal(shared.zoneR, 175);
});

test('scoring: rows pay times the multiplier; full rows grow it, faster and longer combos grow it more', () => {
  assert.equal(GS.rowPoints(13, 'full', 1), 230);
  assert.equal(GS.rowPoints(13, 'full', 2.5), 575);
  assert.equal(GS.rowPoints(3, 'clear', 1), 80);
  assert.equal(GS.rowPoints(8, 'short', 3), 240, 'short row: grains times the multiplier, no bonus');
  // speed: under 0.75 of the pace is Lightning, over 2 is Slow, and the growth follows
  assert.equal(GS.speedLabel(0.5), 'Lightning'); assert.equal(GS.speedLabel(1), 'Quick');
  assert.equal(GS.speedLabel(1.5), 'Steady'); assert.equal(GS.speedLabel(3), 'Slow');
  const fast = GS.multGain(1, 0.5, 'full'), quick = GS.multGain(1, 1, 'full'), slow = GS.multGain(1, 3, 'full');
  assert.ok(fast > quick && quick > slow * 3, 'slow full rows barely grow the multiplier');
  assert.ok(GS.multGain(6, 1, 'full') > GS.multGain(1, 1, 'full') * 1.9, 'a longer combo grows it faster');
  assert.equal(GS.multGain(3, 1, 'clear'), GS.multGain(3, 1, 'full') / 2, 'clearing a kind grows it half as much');
  // stars out of five against the perfect run
  assert.equal(GS.starsFor(100, 100), 5); assert.equal(GS.starsFor(63, 100), 4); assert.equal(GS.starsFor(46, 100), 3);
  assert.equal(GS.starsFor(31, 100), 2); assert.equal(GS.starsFor(16, 100), 1); assert.equal(GS.starsFor(10, 100), 0);
});

test('the pace a quick row needs grows with the row and the level setting', () => {
  const cfg = Object.assign({}, GS.DEFAULTS);
  assert.ok(GS.paceFor(13, cfg) > GS.paceFor(5, cfg));
  assert.ok(GS.paceFor(13, Object.assign({}, cfg, { paceK: 2 })) > GS.paceFor(13, cfg) * 1.9);
});

test('a bot clears every authored level and a spread of generated ones; every grain ends on its own pile', () => {
  const levels = AUTHORED.map((L, i) => i).concat([10, 11, 12, 13, 14, 15, 20, 30, 45, 70]);
  for (const i of levels) {
    const L = GS.levelFor(i);
    for (const seed of i < AUTHORED.length ? [1, 2, 3] : [1]) {
      const { sim } = playWithBot(L, seed);
      assert.ok(sim.done, `level ${i + 1} (${L.name}) seed ${seed} cleared (rows ${sim.stats.rows}, left ${sim.remaining()})`);
      for (const g of sim.grains) {
        if (TYPES[g.type].stone) { assert.notEqual(g.st, ST.GONE, 'stones stay on the board'); continue; }
        assert.equal(g.st, ST.GONE, 'stored');
        const st = sim.stores[g.type];
        assert.ok(Math.hypot(g.x - st.x, g.y - st.y) <= st.r, `${L.id}: ${g.type} lies on its pile`);
      }
      assert.ok(sim.result.stars >= 0 && sim.result.stars <= 5);
    }
  }
});

test('the score breaks down exactly into rows, combo bonuses, time, no-break bonus and penalties', () => {
  for (const i of [1, 3, 6, 12]) {
    const { sim, events } = playWithBot(GS.levelFor(i), 2);
    for (let k = 0; k < 240; k++) { sim.step({ down: false }); events.push(...sim.drainEvents()); }   // the last pour lands
    const r = sim.result;
    assert.equal(r.rowPts + r.comboPts + r.timeBonus + r.noBreak - r.penalty, r.score, 'level ' + (i + 1));
    assert.equal(events.filter((e) => e.type === 'land').length, sim.grains.filter((g) => !TYPES[g.type].stone).length, 'every grain lands on a pile once');
  }
});

test('grains are solid: no two loose grains sit inside each other', () => {
  const worst = (sim) => {
    let w = 0;
    const loose = sim.grains.filter((g) => g.st === ST.REST);
    for (let i = 0; i < loose.length; i++) for (let j = i + 1; j < loose.length; j++) w = Math.max(w, GS.overlapOf(loose[i], loose[j]));
    return w;
  };
  for (const i of [0, 2, 8, 20, 40]) {
    const sim = GS.create({}, GS.levelFor(i), LAYOUT, 1);
    assert.ok(worst(sim) < 2.5, 'level ' + (i + 1) + ' starts settled: ' + worst(sim).toFixed(2));
    const bot = GS.makeBot(sim, 5);
    for (let k = 0; k < 120 * 20 && !sim.done; k++) { sim.step(bot()); sim.drainEvents(); }
    for (let k = 0; k < 120; k++) sim.step({ down: false });
    assert.ok(worst(sim) < 2.5, 'level ' + (i + 1) + ' stays settled: ' + worst(sim).toFixed(2));
  }
});

// a board with only the grains a test puts down; one far-off lentil keeps the sticks open and after lentils
function pushBoard(seed) {
  const sim = GS.create({}, GS.levelFor(2), LAYOUT, seed);
  for (const g of sim.grains) g.st = ST.GONE;
  sim.debugPut('lentil', 80, 260);
  sim.target = 'lentil'; sim.sticks.rowType = 'lentil';
  return sim;
}
// the sticks come in with the tips 110 above the grains' row, then sweep right slowly (no flick)
function sweepRight(sim, gy, x0, steps) {
  const y = gy - 110 + sim.cfg.fingerOffset;
  for (let k = 0; k < 40; k++) sim.step({ down: true, x: x0, y });
  for (let k = 0; k < steps; k++) { sim.step({ down: true, x: x0 + k * 0.5, y }); sim.drainEvents(); }
  assert.equal(sim.sticks.phase, 'open', 'the sticks stayed open for the whole sweep');
}

test('the sticks shove one grain into another and both move', () => {
  const sim = pushBoard(2);
  const a = sim.debugPut('rice', 300, 760), b = sim.debugPut('rice', 300 + 22, 760);
  a.rot = b.rot = Math.PI / 2;
  const b0 = b.x;
  sweepRight(sim, 760, 260, 200);
  assert.ok(a.x > 300 + 20, 'the stick pushed a: x ' + a.x.toFixed(0));
  assert.ok(b.x > b0 + 20, 'and a pushed b: moved ' + (b.x - b0).toFixed(0));
  assert.ok(GS.overlapOf(a, b) < 2.5, 'without passing through it');
});

test('a flicked grain hands its speed to the one it hits', () => {
  const sim = GS.create({}, GS.levelFor(0), LAYOUT, 3);
  for (const g of sim.grains) g.st = ST.GONE;
  const a = sim.debugPut('lentil', 200, 700), b = sim.debugPut('lentil', 260, 700);
  a.st = ST.SLIDE; a.vx = 600;
  const ev = [];
  for (let k = 0; k < 120; k++) { sim.step({ down: false }); ev.push(...sim.drainEvents()); }
  assert.ok(b.x > 290, 'b slid away: ' + b.x.toFixed(1));
  assert.ok(a.x < b.x - 15, 'a stayed behind b');
  assert.ok(ev.some((e) => e.type === 'clack'), 'the hit makes a clack');
  assert.equal(a.st, ST.REST); assert.equal(b.st, ST.REST);
});

test('a packed, mixed pile never shields the tips: wrong grains still creep in and break the row', () => {
  // the exploit: sweep everything into a corner, then pull the right grains out of the jam without a break
  for (const parity of [0, 1]) for (const depth of [0, 30, 60]) {
    const sim = GS.create({}, GS.levelFor(2), LAYOUT, 1 + parity), off = sim.cfg.fingerOffset, B = sim.bounds();
    for (const g of sim.grains) g.st = ST.GONE;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
      sim.debugPut((r + c + parity) % 2 ? 'lentil' : 'rice', B.x1 - c * 19 - (r % 2) * 9, B.y1 - 60 - r * 18);
    }
    sim.target = 'lentil'; sim.sticks.rowType = 'lentil';
    for (let i = 0; i < 120; i++) sim.step({ down: false, x: 300, y: 1200 });
    const tx = B.x1 - 130 + depth * 0.6, ty = B.y1 - 40 - depth;
    let broke = false;
    for (let i = 0; i < 120 && !broke; i++) { sim.step({ down: true, x: tx, y: ty + off }); broke = sim.drainEvents().some((e) => e.type === 'break'); }
    assert.ok(broke, 'broke within a second (parity ' + parity + ', depth ' + depth + ')');
  }
});

test('with solid grains switched off, grains pass through each other', () => {
  const sim = GS.create({ solid: 0 }, GS.levelFor(0), LAYOUT, 3);
  for (const g of sim.grains) g.st = ST.GONE;
  const a = sim.debugPut('lentil', 300, 700), b = sim.debugPut('lentil', 305, 700);
  for (let k = 0; k < 60; k++) sim.step({ down: false });
  assert.ok(GS.overlapOf(a, b) > 10, 'still overlapping');
});

test('rice pushed by the side of a stick swings round to lie along it', () => {
  const sim = pushBoard(4);
  const r = sim.debugPut('rice', 320, 760);
  r.rot = 0;                                                     // lying across the stick
  sweepRight(sim, 760, 260, 160);
  const G = sim.geom(), along = Math.atan2(G.uy, G.ux);
  let d = (r.rot - along) % Math.PI; if (d > Math.PI / 2) d -= Math.PI; if (d < -Math.PI / 2) d += Math.PI;
  assert.ok(r.x > 320 + 15, 'the stick pushed it: x ' + r.x.toFixed(0));
  assert.ok(Math.abs(d) < 0.35, 'lies along the stick: off by ' + d.toFixed(2) + ' rad');
});

test('boards: slate holds the hand-made levels, each later board opens with more stars, and stones arrive with walnut', () => {
  const B = GS.BOARDS;
  assert.equal(B[0].first, 0); assert.equal(B[0].count, AUTHORED.length);
  for (let k = 1; k < B.length; k++) { assert.equal(B[k].first, B[k - 1].first + B[k - 1].count); assert.ok(B[k].stars > B[k - 1].stars); }
  const stones = (i) => GS.levelFor(i).piles.filter((p) => p.type === 'stone').reduce((n, p) => n + p.count, 0);
  for (let i = 0; i < 10; i++) assert.equal(stones(i), 0, 'no stones on slate');
  const walnut = B.find((b) => b.adds === 'stones');
  assert.equal(GS.levelFor(walnut.first).rule, 'Stones', 'the first walnut level brings in stones and nothing else');
  for (let i = walnut.first; i < walnut.first + 30; i++) assert.ok(stones(i) >= 2, 'stones from walnut on, level ' + (i + 1));
  assert.ok(stones(walnut.first + walnut.count - 1) > stones(walnut.first), 'more stones as the board goes on');
});

test('stones are never picked, go for the open tips from further out, and a level ends with them still on the board', () => {
  // the sticks held open over an empty patch (the one lentil is out of reach), a grain set down ahead of the tips
  const ahead = (kind) => {
    const sim = GS.create({}, GS.levelFor(2), LAYOUT, 3);
    for (const g of sim.grains) g.st = ST.GONE;
    const lentil = sim.debugPut('lentil', 70, 230);
    sim.target = 'lentil'; sim.sticks.rowType = 'lentil';
    const hold = { down: true, x: 330, y: 1000 + sim.cfg.fingerOffset };
    for (let k = 0; k < 30; k++) sim.step(hold);
    const G = sim.geom(), CRs = sim.cfg.zoneR * TYPES.stone.reachK, at = sim.cfg.fieldAhead * CRs + 0.9 * CRs;
    const g = sim.debugPut(kind, G.mx + G.ux * at, G.my + G.uy * at);
    let broke = null;
    for (let k = 0; k < 120 * 4 && !broke; k++) { sim.step(hold); broke = sim.drainEvents().find((e) => e.type === 'break'); }
    return { sim, g, lentil, broke };
  };
  const rice = ahead('rice');
  assert.equal(rice.broke, undefined, 'a wrong grain that far out stays put');
  const st = ahead('stone');
  assert.ok(st.broke && st.broke.wrong === 'stone', 'a stone that far out creeps in and breaks the row');
  // sorting the lentil ends the level; the stone is still on the board
  const { sim, g: stone, lentil } = st;
  for (let k = 0; k < 120 * 2; k++) sim.step({ down: false, x: 300, y: 1200 });
  stone.x = 520; stone.y = 900; stone.st = ST.REST; stone.vx = stone.vy = 0;
  const R = sim.cfg.zoneR;
  for (let k = 0; k < 120 * 3 && !sim.sticks.row.length; k++) sim.step({ down: true, x: lentil.x + 20, y: lentil.y + R * 0.35 + sim.cfg.fingerOffset });
  for (let k = 0; k < 120 * 2 && !sim.done; k++) sim.step({ down: false, x: 300, y: 1200 });
  assert.ok(sim.done, 'level complete with a stone left');
  assert.equal(sim.remaining(), 0);
  assert.notEqual(stone.st, ST.GONE);
});

test('the same seed and inputs replay identically', () => {
  const run = (i) => {
    const { sim, events } = playWithBot(GS.levelFor(i), 5, 120);
    return [sim.hash(), events.length, sim.stats.rows, sim.stats.breaks, sim.score].join(':');
  };
  assert.equal(run(3), run(3));
  assert.equal(run(8), run(8));
  assert.equal(run(16), run(16));
});

test('hold gathers one kind into a straight row; letting go pours it onto its pile', () => {
  const sim = GS.create({}, AUTHORED[0], LAYOUT, 3);
  const c = centroid(sim.grains);
  const ev = holdAt(sim, c.x, c.y + 60, 0.7);
  assert.equal(sim.sticks.phase, 'open');
  assert.ok(ev.filter((e) => e.type === 'slot').length >= 6, 'grains slotted in');
  const G = sim.geom();
  for (const id of sim.sticks.row) {
    const g = sim.grains[id];
    assert.ok(Math.abs((g.x - G.Tx) * G.nx + (g.y - G.Ty) * G.ny) < 0.5, 'row sits on the stick axis');
  }
  const n = sim.sticks.row.length;
  const ev2 = release(sim, 1.5);
  const taken = ev2.find((e) => e.type === 'row_taken');
  assert.ok(taken, 'row taken');
  assert.equal(taken.n, n);
  assert.equal(taken.kind, n >= sim.caps.lentil ? 'full' : 'short');
  const st = sim.stores.lentil;
  assert.equal(st.n, n);
  for (const id of st.ids) {
    const g = sim.grains[id];
    assert.equal(g.st, ST.GONE);
    assert.ok(g.x < W / 2 && g.y > LAYOUT.H - 320, 'on the bottom-left pile');
  }
  assert.equal(sim.sticks.phase, 'away');
});

test('the sticks pull from in front of the tips, not from under the thumb', () => {
  const sim = GS.create({}, AUTHORED[0], LAYOUT, 4);
  holdAt(sim, 300, 900, 0.3);
  const G = sim.geom(), R = sim.cfg.zoneR;
  const ahead = sim.debugPut('lentil', G.mx + G.ux * R * 1.2, G.my + G.uy * R * 1.2);
  const behind = sim.debugPut('lentil', G.mx - G.ux * R * 0.8, G.my - G.uy * R * 0.8);
  assert.equal(sim.inReach(ahead), true);
  assert.equal(sim.inReach(behind), false);
});

test('a narrow reach only pulls from straight ahead', () => {
  const L = Object.assign({}, AUTHORED[0], { tune: { fieldCone: 40 } });
  const sim = GS.create({}, L, LAYOUT, 4);
  holdAt(sim, 300, 900, 0.3);
  const G = sim.geom();
  const front = sim.debugPut('lentil', G.mx + G.ux * 100, G.my + G.uy * 100);
  const side = sim.debugPut('lentil', G.mx + G.nx * 70 + G.ux * 30, G.my + G.ny * 70 + G.uy * 30);
  assert.equal(sim.inReach(front), true);
  assert.equal(sim.inReach(side), false);
});

test('a full row closes by itself, grows the combo and multiplier, and needs a new touch', () => {
  const sim = GS.create({}, AUTHORED[0], LAYOUT, 5);
  const cap = sim.caps.lentil;
  for (let i = 0; i < cap; i++) sim.debugPut('lentil', 300 + (i % 5) * 4, 760 + i * 3);
  const ev = holdAt(sim, 300, 860, 3);
  const close = ev.find((e) => e.type === 'close');
  assert.ok(close && close.kind === 'full', 'closed full');
  const taken = ev.find((e) => e.type === 'row_taken');
  assert.equal(taken.kind, 'full'); assert.equal(taken.combo, 1);
  assert.ok(taken.mult > 1 && Math.abs(taken.mult - (1 + taken.gain)) < 1e-9);
  assert.equal(taken.points, GS.rowPoints(taken.n, 'full', taken.mult));
  assert.equal(ev.filter((e) => e.type === 'sticks_in').length, 1, 'no new cycle while the finger stays down');
  sim.step({ down: false, x: 300, y: 1000 });
  sim.step({ down: true, x: 300, y: 1000 });
  assert.ok(sim.drainEvents().some((e) => e.type === 'sticks_in'), 'a new touch brings the sticks back');
});

test('the last few grains of a kind count as "cleared", not as a full row', () => {
  const sim = GS.create({}, AUTHORED[0], LAYOUT, 6);
  for (const g of sim.grains.slice(3)) { g.st = ST.GONE; g.slot = 0; }      // leave three lentils on the board
  sim.stats.taken.lentil = sim.grains.length - 3;
  const left = sim.grains.slice(0, 3);
  for (const [i, g] of left.entries()) { g.x = 300 + i * 20; g.y = 700; }
  const ev = holdAt(sim, 300, 800, 2);
  const taken = ev.find((e) => e.type === 'row_taken');
  assert.ok(taken, 'row taken');
  assert.equal(taken.kind, 'clear');
  assert.equal(taken.cleared, true);
  assert.equal(taken.combo, 1, 'clearing keeps the combo going');
  assert.ok(taken.mult > 1, 'and grows the multiplier a little');
});

test('letting go early keeps the multiplier but shrinks it and ends the combo', () => {
  const sim = GS.create({}, AUTHORED[0], LAYOUT, 7);
  sim.mult = 3; sim.combo = 4;
  const c = centroid(sim.grains);
  holdAt(sim, c.x, c.y + 60, 0.3);
  const n = sim.sticks.row.length;
  assert.ok(n > 0 && n < sim.sticks.need, 'a short row');
  const taken = release(sim, 1.5).find((e) => e.type === 'row_taken');
  assert.equal(taken.kind, 'short');
  assert.equal(taken.points, n * 10 * 3, 'grains times the ×3 multiplier, no bonus');
  assert.ok(Math.abs(sim.mult - 3 * GS.SCORE.shortDecay) < 1e-9, 'multiplier shrinks');
  assert.equal(sim.combo, 0, 'combo ends');
  sim.mult = 1.05;
  const c2 = centroid(sim.grains.filter((g) => g.st === ST.REST && g.type === sim.target));
  holdAt(sim, c2.x, c2.y + 60, 0.3);
  assert.ok(release(sim, 1.5).some((e) => e.type === 'row_taken' && e.kind === 'short'), 'a second short row');
  assert.equal(sim.mult, 1, 'never below ×1');
});

test('a fast full row grows the multiplier more than the same row pulled slowly', () => {
  const run = (waitSeconds) => {
    const sim = GS.create({}, AUTHORED[0], LAYOUT, 8);
    const cap = sim.caps.lentil;
    for (let i = 0; i < cap; i++) sim.debugPut('lentil', 300 + (i % 5) * 4, 760 + i * 3);
    holdAt(sim, 60, 1000, 0.05);                      // the first touch starts the clock
    release(sim, waitSeconds);
    return holdAt(sim, 300, 860, 3).find((e) => e.type === 'row_taken');
  };
  const fast = run(0.2), slow = run(12);
  assert.equal(fast.kind, 'full'); assert.equal(slow.kind, 'full');
  assert.equal(slow.speed, 'Slow');
  assert.ok(fast.gain > slow.gain * 3, 'fast ' + fast.gain.toFixed(2) + ' vs slow ' + slow.gain.toFixed(2));
});

test('the level clock starts at the first touch and pays for time left', () => {
  const sim = GS.create({}, AUTHORED[0], LAYOUT, 9);
  release(sim, 2);
  assert.equal(sim.clock, 0, 'no clock before the first touch');
  const { sim: done } = playWithBot(AUTHORED[0], 1);
  assert.ok(done.result.time > 0 && done.result.time < done.par);
  assert.equal(done.result.timeBonus, Math.ceil(done.par - done.result.time) * GS.SCORE.perSecond);
});

test('a wrong grain reaching the tips breaks the row, drops the multiplier to ×1 and costs points', () => {
  const sim = GS.create({}, byId('touching'), LAYOUT, 10);
  sim.score = 1000; sim.mult = 3; sim.combo = 4;
  const lentil = sim.grains.find((g) => g.type === 'lentil');
  holdAt(sim, lentil.x, lentil.y + 60, 0.33);
  const G = sim.geom();
  const rice = sim.debugPut('rice', G.mx + G.ux * 30, G.my + G.uy * 30);
  const ev = holdAt(sim, lentil.x, lentil.y + 60, 2);
  const br = ev.find((e) => e.type === 'break');
  assert.ok(br, 'broke');
  assert.equal(br.id, rice.id);
  assert.equal(br.comboLost, 4); assert.equal(br.multLost, 3);
  assert.equal(br.penalty, 150, 'penalty grows with the multiplier you had');
  assert.equal(sim.score, 850);
  assert.equal(sim.mult, 1); assert.equal(sim.combo, 0);
  assert.equal(sim.stats.breaks, 1);
  release(sim, 2);
  assert.ok(sim.grains.every((g) => g.st === ST.REST), 'scattered grains come to rest');
});

test('the sides of the sticks push loose grains aside', () => {
  const sim = GS.create({}, AUTHORED[0], LAYOUT, 11);
  holdAt(sim, 300, 1000, 0.3);
  const G = sim.geom();
  const g = sim.debugPut('rice', G.Tx - G.ux * 200 + G.nx * 18, G.Ty - G.uy * 200 + G.ny * 18);
  sim.step({ down: true, x: 300, y: 1000 + sim.cfg.fingerOffset });
  const G2 = sim.geom();
  const a = -((g.x - G2.Tx) * G2.ux + (g.y - G2.Ty) * G2.uy), c = (g.x - G2.Tx) * G2.nx + (g.y - G2.Ty) * G2.ny;
  const hw = G2.gap / 2 + G2.spread * a + GS.STICK.tipW + ((GS.STICK.baseW - GS.STICK.tipW) * a) / GS.STICK.len;
  assert.ok(Math.abs(c) >= hw - 0.01, 'pushed clear of the stick');
});

test('restless grains wander on their own; calm ones do not', () => {
  for (const [id, moves] of [['restless', true], ['two-heaps', false]]) {
    const sim = GS.create({}, byId(id), LAYOUT, 12);
    const before = sim.grains.map((g) => [g.x, g.y]);
    release(sim, 3);
    const moved = sim.grains.filter((g, i) => Math.hypot(g.x - before[i][0], g.y - before[i][1]) > 5).length;
    assert.equal(moved > sim.grains.length / 2, moves, id);
  }
});

test('loose grains are kept off the sorted piles and out of the bottom strip', () => {
  const sim = GS.create({}, byId('two-heaps'), LAYOUT, 13);
  const st = sim.stores.rice;
  const g = sim.debugPut('lentil', st.x - 40, st.y - 40);
  const h = sim.debugPut('lentil', W / 2, LAYOUT.H - 20);
  sim.step({ down: false });
  assert.ok(Math.hypot(g.x - st.x, g.y - st.y) >= st.r);
  assert.ok(h.y <= sim.bounds().y1);
});

test('the target alternates between kinds after each row', () => {
  const sim = GS.create({}, byId('two-heaps'), LAYOUT, 14);
  assert.equal(sim.target, 'lentil');
  const c = centroid(sim.grains.filter((g) => g.type === 'lentil'));
  holdAt(sim, c.x, c.y + 60, 0.4);
  const ev = release(sim, 1.5);
  assert.ok(ev.some((e) => e.type === 'row_taken'));
  assert.equal(sim.target, 'rice');
  assert.ok(ev.some((e) => e.type === 'target' && e.grain === 'rice'));
});

test('letting go with an empty row costs nothing', () => {
  const sim = GS.create({}, AUTHORED[0], LAYOUT, 15);
  holdAt(sim, 60, LAYOUT.H - 100, 0.3);
  release(sim, 1);
  assert.equal(sim.stats.rows, 0);
  assert.equal(sim.score, 0);
  assert.equal(sim.sticks.phase, 'away');
});

test('the demo bot stays in its region', () => {
  const sim = GS.create({}, GS.DEMO, LAYOUT, 1);
  const bot = GS.makeBot(sim, 3, { maxY: LAYOUT.H * 0.42 });
  let rows = 0, maxAimY = 0;
  for (let i = 0; i < 120 * 30; i++) {
    const inp = bot();
    if (inp.down) maxAimY = Math.max(maxAimY, inp.y - sim.cfg.fingerOffset);
    sim.step(inp);
    rows += sim.drainEvents().filter((e) => e.type === 'row_taken').length;
  }
  assert.ok(rows >= 4, 'demo takes rows: ' + rows);
  assert.ok(maxAimY < LAYOUT.H * 0.42 + 1, 'aims stay in the top part');
});
