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

test('generated levels get harder one step at a time, without end, easing off where something new comes in', () => {
  const at = (i) => Object.assign({}, GS.DEFAULTS, GS.levelFor(i).tune);
  const sorted = (L) => L.piles.filter((p) => p.type !== 'stone' && p.type !== 'sesame').reduce((n, p) => n + p.count, 0);
  const pressure = (i) => { const t = at(i); return t.creepSpeed * t.creepR / t.zoneR; };   // how fast and far wrong grains come
  const eased = (i) => !!(GS.newsAt(i) || GS.newsAt(i - 1));
  let prevD = 0, three = false, last = -1;
  for (let i = AUTHORED.length; i < AUTHORED.length + 100; i++) {
    const d = GS.difficulty(i);
    assert.ok(d > prevD && d < 1, 'difficulty keeps climbing and never reaches 1');
    prevD = d;
    const L = GS.levelFor(i), mix = GS.mixOf(L.piles, L.seed), want = L.mix;
    if (!L.jar) assert.equal(want, GS.mixTarget(L.difficulty));
    assert.ok(Math.abs(mix - want) < Math.max(0.6, want * 0.25), 'level ' + (i + 1) + ' is as mixed as the climb asks: ' + mix.toFixed(2) + ' for ' + want.toFixed(2));
    if (GS.newsAt(i) && i > AUTHORED.length) assert.ok(L.difficulty < GS.levelFor(i - 1).difficulty && pressure(i) <= pressure(i - 1) + 1, 'a level that brings something in is a breather, level ' + (i + 1));
    if (!eased(i)) {
      // the climb, measured between levels that bring nothing new and do not follow one that did
      if (last >= 0) {
        assert.ok(pressure(i) >= pressure(last) * 0.995, 'creep pressure never drops, level ' + (i + 1));   // 0.5%: rounding
        assert.ok(at(i).paceK <= at(last).paceK + 1e-9, 'the pace never loosens, level ' + (i + 1));
      }
      last = i;
    }
    const n = L.types.length;
    if (three && !GS.newsAt(i)) assert.equal(n, 3, 'three kinds stay, level ' + (i + 1));
    three = three || n === 3;
  }
  for (let i = AUTHORED.length + 5; i < AUTHORED.length + 100; i += 5) assert.ok(pressure(i + 5) >= pressure(i) * 0.995 || eased(i + 5), 'and never falls back, level ' + (i + 6));
  assert.ok(three, 'three kinds arrive');
  // wrong grains pull about as on the first board through every board with an idea of its own, and only grow hard deep
  // into the endless one; the boards get harder through mixing instead
  const deep = GS.BOARDS[GS.BOARDS.length - 1].first, slate = 55 * 100 / 160;
  for (let i = AUTHORED.length; i < deep; i++) assert.ok(pressure(i) <= slate * 1.45, 'gentle pull on level ' + (i + 1) + ': ' + pressure(i).toFixed(0));
  assert.ok(pressure(deep + 40) >= slate * 2.5, 'and strong deep in the endless board: ' + pressure(deep + 40).toFixed(0));
  assert.ok(GS.creepPull(deep - 1) <= 0.1 && GS.creepPull(deep + 30) > 0.5);
  const L20 = GS.levelFor(19);
  assert.ok(GS.mixOf(L20.piles, L20.seed) > 1.9, 'level 20 is well mixed');
  assert.ok(sorted(GS.levelFor(19)) >= sorted(GS.levelFor(10)), 'more grains by the end of walnut');
  const rules = new Set();
  for (let i = AUTHORED.length; i < AUTHORED.length + 12; i++) rules.add(GS.levelFor(i).rule);
  for (const r of ['Restless grains', 'Short reach', 'Narrow reach']) assert.ok(rules.has(r), r + ' appears');
});

test('levels generate the same board every time, inside the board and off the sorted piles', () => {
  for (const i of [...Array(AUTHORED.length + 12).keys(), 23, 26, 30, 36, 40, 44, 55]) {
    const L = GS.levelFor(i);
    const a = GS.create({}, L, LAYOUT, 1), b = GS.create({}, L, LAYOUT, 2);
    assert.equal(a.hash(), b.hash(), L.id + ' layout depends only on the level seed');
    for (const g of a.grains) {
      if (g.st === ST.JAR) { assert.ok(L.jar, 'only a level with a jar keeps grains in one'); continue; }
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
  const levels = AUTHORED.map((L, i) => i).concat([10, 11, 12, 13, 14, 15, 20, 23, 26, 30, 33, 36, 40, 45, 70]);
  for (const i of levels) {
    const L = GS.levelFor(i);
    for (const seed of i < AUTHORED.length ? [1, 2, 3] : [1]) {
      const { sim } = playWithBot(L, seed);
      assert.ok(sim.done, `level ${i + 1} (${L.name}) seed ${seed} cleared (rows ${sim.stats.rows}, left ${sim.remaining()})`);
      for (const g of sim.grains) {
        if (TYPES[g.type].stone) { assert.notEqual(g.st, ST.GONE, 'stones stay on the board'); continue; }
        if (g.st === ST.LOST) { assert.ok(L.tilt, 'grains only fall off a tilted tray'); continue; }
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
  for (let k = 1; k < B.length; k++) {
    assert.equal(B[k].first, B[k - 1].first + B[k - 1].count); assert.ok(B[k].stars > B[k - 1].stars);
    assert.equal(B[k].stars, Math.round(B[k].first * 5 * 0.7), B[k].id + ' opens with 70% of the stars before it');
  }
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

test('a full row closes by itself, grows the combo and multiplier, and the sticks come back while you hold', () => {
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
  const ins = ev.filter((e) => e.type === 'sticks_in');
  assert.ok(ins.length >= 2, 'the finger stayed down: the sticks came back for the next row');
  assert.ok(ins[1].t - close.t >= sim.cfg.rearmTime - 1e-9, 'after a breath, not at once');
  sim.step({ down: false, x: 300, y: 1000 });
  sim.step({ down: true, x: 300, y: 1000 });
  assert.equal(sim.rearm, 0, 'a new touch never waits');
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

test('a wrong grain reaching the tips breaks the row and drops the multiplier to ×1; past the first board it costs points', () => {
  const breakOn = (L) => {
    const sim = GS.create({}, L, LAYOUT, 10);
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
    assert.equal(sim.mult, 1); assert.equal(sim.combo, 0);
    assert.equal(sim.stats.breaks, 1);
    return { sim, br };
  };
  const first = breakOn(byId('touching'));
  assert.equal(first.br.penalty, 0, 'the first board teaches: no points taken');
  assert.equal(first.sim.score, 1000);
  const later = breakOn(Object.assign({}, byId('touching'), { generated: true }));
  assert.equal(later.br.penalty, 150, 'penalty grows with the multiplier you had');
  assert.equal(later.sim.score, 850);
  release(later.sim, 2);
  assert.ok(later.sim.grains.every((g) => g.st === ST.REST), 'scattered grains come to rest');
});

test('letting go just before a wrong grain gets in saves the row, and says so', () => {
  const sim = GS.create({}, byId('touching'), LAYOUT, 10);
  const lentil = sim.grains.find((g) => g.type === 'lentil'), hold = { down: true, x: lentil.x, y: lentil.y + 60 + sim.cfg.fingerOffset };
  holdAt(sim, lentil.x, lentil.y + 60, 0.4);
  assert.ok(sim.sticks.row.length > 0, 'a few lentils are in');
  const G = sim.geom();
  sim.debugPut('rice', G.mx + G.ux * 70, G.my + G.uy * 70);
  let ev = [];
  for (let i = 0; i < 120 && !ev.some((e) => e.type === 'break'); i++) {
    sim.step(hold); ev.push(...sim.drainEvents());
    if (sim.sticks.danger > 0.6) break;
  }
  assert.ok(!ev.some((e) => e.type === 'break') && sim.sticks.danger > 0.6, 'the rice is close');
  ev = release(sim, 1);
  const close = ev.find((e) => e.type === 'close');
  assert.ok(close && close.saved && close.kind === 'short', 'saved in time');
  assert.equal(sim.stats.saved, 1);
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

// ---------- the later beans and ways of playing ----------
const level = (over) => Object.assign({ id: 't', name: 'T', seed: 7, types: ['lentil', 'rice'], piles: [
  { type: 'lentil', kind: 'blob', cx: 0.3, cy: 0.3, r: 0.1, count: 14 }, { type: 'rice', kind: 'blob', cx: 0.7, cy: 0.3, r: 0.1, count: 12 }] }, over);
const run = (sim, inp, seconds) => { const ev = []; for (let i = 0; i < seconds * sim.cfg.stepHz; i++) { sim.step(typeof inp === 'function' ? inp(i) : inp); ev.push(...sim.drainEvents()); } return ev; };

test('each new bean moves its own way: chickpeas roll on, sesame is light and comes in long rows, kidney beans are long and heavy', () => {
  // the same flick: a chickpea rolls several times as far as a lentil
  const slide = (type) => {
    const sim = GS.create({}, level({ types: [type], piles: [{ type, kind: 'blob', cx: 0.5, cy: 0.5, r: 0.01, count: 1 }] }), LAYOUT, 1);
    for (const g of sim.grains) g.st = ST.GONE;
    const g = sim.debugPut(type, 200, 600); g.st = ST.SLIDE; g.vx = 600; g.vy = 0;
    for (let i = 0; i < 120 * 3; i++) sim.step({ down: false });
    return g.x - 200;
  };
  assert.ok(slide('chickpea') > slide('lentil') * 2.5, 'chickpea ' + slide('chickpea').toFixed(0) + ' vs lentil ' + slide('lentil').toFixed(0));
  assert.ok(slide('kidney') < slide('lentil'), 'a kidney bean stops sooner');
  const cfg = GS.DEFAULTS;
  assert.ok(GS.capacity('sesame', cfg) >= GS.capacity('lentil', cfg) * 1.6, 'sesame rows are long');
  assert.ok(GS.capacity('kidney', cfg) < GS.capacity('lentil', cfg), 'kidney rows are short');
  assert.ok(TYPES.sesame.mass < 0.5 && TYPES.kidney.mass > 2 && TYPES.chickpea.mass > 1.5);
  // a kidney bean pushed by the side of a stick swings round to lie along it, like rice
  const sim = pushBoard(4);
  const k = sim.debugPut('kidney', 320, 760); k.rot = 0;
  sweepRight(sim, 760, 260, 160);
  const G = sim.geom(), along = Math.atan2(G.uy, G.ux);
  let d = (k.rot - along) % Math.PI; if (d > Math.PI / 2) d -= Math.PI; if (d < -Math.PI / 2) d += Math.PI;
  assert.ok(k.x > 320 + 15, 'the stick pushed it: x ' + k.x.toFixed(0));
  assert.ok(Math.abs(d) < 0.35, 'lies along the stick: off by ' + d.toFixed(2) + ' rad');
});

test('carrying rows yourself: let go over its pile and it pours there; away from the piles it waits; over another pile that pile spills back', () => {
  const L = level({ manual: true, generated: true });      // carrying comes after the first board, where mistakes cost points
  const sim = GS.create({}, L, LAYOUT, 3);
  const lentils = sim.grains.filter((g) => g.type === 'lentil'), c = centroid(lentils);
  // gather until the row is full: the sticks close and stay on the finger
  let ev = run(sim, { down: true, x: c.x, y: c.y + 60 + sim.cfg.fingerOffset }, 2);
  assert.ok(ev.some((e) => e.type === 'close'), 'the row closed');
  assert.equal(sim.sticks.phase, 'hold', 'and stays in the hand');
  const n = sim.sticks.row.length;
  // let go in the middle of the board: nothing is poured, the row waits
  ev = run(sim, { down: false, x: 300, y: 900 }, 0.5);
  assert.equal(sim.sticks.phase, 'parked'); assert.equal(sim.sticks.row.length, n);
  assert.ok(!ev.some((e) => e.type === 'row_taken'));
  // touch again and carry it over the lentil pile (bottom left), then let go
  const st = sim.stores.lentil, to = { down: true, x: st.x + 80, y: LAYOUT.H };
  ev = run(sim, to, 1.2);
  assert.equal(sim.sticks.phase, 'hold'); assert.equal(sim.sticks.drop, st, 'over the lentil pile');
  ev = run(sim, { down: false, x: st.x + 80, y: LAYOUT.H }, 1.2);
  const taken = ev.find((e) => e.type === 'row_taken');
  assert.ok(taken && taken.n === n && taken.grain === 'lentil', 'poured onto its own pile');
  assert.equal(st.n, n);
  // now a rice row, let go over the lentil pile: the lentils and the rice fly back onto the board
  const rice = centroid(sim.grains.filter((g) => g.type === 'rice' && g.st === ST.REST));
  assert.equal(sim.target, 'rice');
  run(sim, { down: true, x: rice.x, y: rice.y + 60 + sim.cfg.fingerOffset }, 2);
  assert.equal(sim.sticks.phase, 'hold');
  const scoreBefore = sim.score;
  run(sim, to, 1.2);
  ev = run(sim, { down: false, x: st.x + 80, y: LAYOUT.H }, 2);
  const sp = ev.find((e) => e.type === 'spill_pile');
  assert.ok(sp && sp.pile === 'lentil' && sp.grain === 'rice' && sp.back === n, 'the lentil pile spilled');
  assert.equal(st.n, 0); assert.equal(st.ids.length, 0);
  assert.equal(sim.stats.taken.lentil, 0, 'nothing counts as sorted any more');
  assert.equal(sim.mult, 1); assert.ok(sim.score < scoreBefore, 'and it costs points');
  const B = sim.bounds();
  for (const g of sim.grains) if (g.type === 'lentil') { assert.notEqual(g.st, ST.GONE); assert.ok(g.y <= B.y1 + 0.01 && g.y >= B.y0 - 0.01, 'back on the board'); }
});

test('moving piles: a level can put the kinds in other corners, the same way every time', () => {
  const L = level({ manual: true, shuffle: 'moved', types: ['lentil', 'rice', 'mung'], piles: level().piles.concat([{ type: 'mung', kind: 'blob', cx: 0.5, cy: 0.6, r: 0.1, count: 10 }]) });
  const a = GS.create({}, L, LAYOUT, 1), b = GS.create({}, L, LAYOUT, 2), plain = GS.create({}, Object.assign({}, L, { shuffle: false }), LAYOUT, 1);
  const spots = (s) => L.types.map((t) => s.stores[t].kind).join();
  assert.equal(spots(a), spots(b));
  assert.notEqual(spots(a), spots(plain), 'the first level with moving piles always moves them');
});

test('the jar: its grains are not on the board at first, pour a full row of one kind at a time, and come at once when the board is clear', () => {
  const L = level({ jar: { every: 30 }, piles: level().piles.concat([{ type: 'lentil', kind: 'scatter', x0: 0, x1: 1, y0: 0, y1: 1, count: 13, jar: true }, { type: 'rice', kind: 'scatter', x0: 0, x1: 1, y0: 0, y1: 1, count: 9, jar: true }]) });
  assert.deepEqual(Array.from(GS.validateLevel(L)), []);
  const sim = GS.create({}, L, LAYOUT, 4);
  assert.equal(sim.inJar(), 22);
  assert.equal(sim.remaining('lentil'), 27, 'what is in the jar still counts as to sort');
  assert.equal(sim.available('lentil'), 14, 'but the sticks cannot get at it');
  run(sim, { down: false }, 4);
  assert.equal(sim.inJar(), 22, 'nothing pours before the first touch');
  run(sim, { down: true, x: 300, y: LAYOUT.H }, 0.2);                       // the first touch starts the clock
  let ev = run(sim, { down: false }, 3);
  const first = ev.find((e) => e.type === 'jar');
  assert.ok(first && first.n === sim.caps[first.grain], 'a scoop is a full row: ' + (first && first.n));
  const landed = sim.grains.filter((g) => g.st === ST.SLIDE || g.st === ST.REST).filter((g) => g.type === first.grain).length;
  assert.equal(landed, (first.grain === 'lentil' ? 14 : 12) + first.n, 'all of one kind');
  // clear the board as a quick player would: the next scoop does not wait for the jar's own clock
  for (const g of sim.grains) if (g.st === ST.REST || g.st === ST.SLIDE) g.st = ST.GONE;
  const t0 = sim.clock;
  ev = run(sim, { down: false }, 1.5);
  assert.ok(ev.some((e) => e.type === 'jar' && e.early), 'poured as soon as the board was clear');
  assert.ok(sim.clock - t0 < 2 && sim.jar.next > 20, 'long before its own clock');
  assert.equal(sim.inJar(), 0);
});

test('jar levels: every kind on the board and in the jar comes in whole rows, so a perfect run can fill every row', () => {
  let n = 0;
  for (let i = 30; i < 60; i++) {
    const L = GS.levelFor(i);
    if (!L.jar) continue;
    n++;
    const sim = GS.create({}, L, LAYOUT, 1), board = {}, jar = {};
    for (const p of L.piles) if (p.type !== 'stone') (p.jar ? jar : board)[p.type] = ((p.jar ? jar : board)[p.type] || 0) + p.count;
    for (const t of L.types) {
      assert.ok(board[t] >= sim.caps[t] && board[t] % sim.caps[t] === 0, `level ${i + 1}: ${board[t]} ${t} on the board, rows of ${sim.caps[t]}`);
      assert.equal((jar[t] || 0) % sim.caps[t], 0, `level ${i + 1}: the jar holds whole rows of ${t}`);
    }
    for (const sc of sim.jar.scoops) { assert.equal(sc.length, sim.caps[sim.grains[sc[0]].type]); assert.ok(sc.every((id) => sim.grains[id].type === sim.grains[sc[0]].type)); }
  }
  assert.ok(n >= 15, n + ' jar levels checked');
});

test('a tilted tray: loose grains slide down it, the ones nobody catches fall off, and the level still ends', () => {
  const L = level({ tilt: 30 });
  const sim = GS.create({}, L, LAYOUT, 5);
  const g = sim.grains[0], y0 = g.y;
  run(sim, { down: false }, 1);
  assert.ok(g.y > y0 + 20, 'slid down: ' + (g.y - y0).toFixed(0));
  const ev = run(sim, { down: false }, 60);
  assert.ok(ev.some((e) => e.type === 'lost'), 'grains fell off the edge');
  assert.ok(sim.grains.every((x) => x.st === ST.LOST), 'all of them, left alone');
  run(sim, { down: true, x: 300, y: LAYOUT.H }, 0.1); run(sim, { down: false }, 0.5);
  assert.ok(sim.done, 'with nothing left to sort the level ends');
  assert.equal(sim.result.score, 0, 'and pays nothing: no time bonus for letting everything fall'); assert.equal(sim.stats.lost, 26);
  // chickpeas run down faster than lentils
  assert.ok(TYPES.chickpea.tiltK > 1 && !(TYPES.lentil.tiltK > 1));
});

test('any order: the sticks ask for the kinds by chance, the same way for the same level', () => {
  const L = level({ order: 'any', types: ['lentil', 'rice', 'mung'], piles: [
    { type: 'lentil', kind: 'blob', cx: 0.25, cy: 0.25, r: 0.1, count: 40 }, { type: 'rice', kind: 'blob', cx: 0.75, cy: 0.25, r: 0.1, count: 40 }, { type: 'mung', kind: 'blob', cx: 0.5, cy: 0.6, r: 0.1, count: 40 }] });
  const order = (seed) => {
    const sim = GS.create({}, L, LAYOUT, seed), bot = GS.makeBot(sim, 3), seen = [sim.target];
    for (let i = 0; i < 120 * 120 && seen.length < 12; i++) { sim.step(bot()); for (const e of sim.drainEvents()) if (e.type === 'target') seen.push(e.grain); }
    return seen;
  };
  const a = order(1);
  assert.ok(a.length >= 8, 'rows were taken');
  const turns = a.every((t, i) => i === 0 || L.types.indexOf(t) === (L.types.indexOf(a[i - 1]) + 1) % 3);
  assert.ok(!turns, 'not simply in turn: ' + a.join(' '));
});

test('progression: every board opens with its own idea, the new things come one at a time, never more than one on a level', () => {
  const B = GS.BOARDS;
  for (const b of B) if (b.adds) assert.equal(GS.newsAt(b.first).feature, b.adds, b.id + ' opens with ' + b.adds);
  const news = [];
  // up to the tray, something new every three or four levels; the tray's board and paper then mix what came before
  const lastIdea = B.find((b) => b.adds === 'tilt').first;
  for (let i = AUTHORED.length; i < 60; i++) if (GS.newsAt(i)) news.push(i);
  const ideas = news.filter((i) => i <= lastIdea);
  for (let k = 1; k < ideas.length; k++) assert.ok(ideas[k] - ideas[k - 1] >= 3 && ideas[k] - ideas[k - 1] <= 4, 'something new every three or four levels: ' + (ideas[k - 1] + 1) + ' then ' + (ideas[k] + 1));
  const paper = B.find((b) => b.remix);
  for (let i = paper.first + 1; i < paper.first + paper.count; i++) {
    const L = GS.levelFor(i), on = [L.manual, L.jar, L.tilt, L.order === 'any'].filter(Boolean).length - (L.tilt ? 1 : 0);   // a tilted tray brings its jar
    assert.ok(on >= 1 && on <= 2, 'paper pairs earlier ideas, level ' + (i + 1) + ': ' + on);
  }
  assert.ok(news.length >= 10, news.length + ' new things before the endless board');
  // a new bean comes in with one kind you already know, and is in the next levels too
  for (const t of ['chickpea', 'sesame', 'kidney']) {
    const at = GS.KIND_FROM[t];
    assert.deepEqual(Array.from(GS.levelFor(at).types).sort(), [t, GS.levelFor(at).types.find((x) => x !== t)].sort());
    assert.equal(GS.levelFor(at).types.length, 2);
    for (let i = at + 1; i <= at + 3; i++) assert.ok(GS.levelFor(i).types.includes(t), t + ' stays in the mix, level ' + (i + 1));
    for (let i = 0; i < at; i++) assert.ok(!GS.levelFor(i).types.includes(t), 'no ' + t + ' before level ' + (at + 1));
  }
  // each way of playing: never before its board or its level, always on its own board
  const has = (i, f) => { const L = GS.levelFor(i); return f === 'manual' ? !!L.manual : f === 'jar' ? !!L.jar : f === 'tilt' ? !!L.tilt : f === 'any' ? L.order === 'any' : !!L.shuffle; };
  for (const [f, from] of [['manual', 20], ['shuffle', 23], ['jar', 30], ['any', 33], ['tilt', 40]]) {
    for (let i = 0; i < from; i++) assert.ok(!has(i, f), f + ' not before level ' + (from + 1) + ' (found on ' + (i + 1) + ')');
    assert.ok(has(from, f), f + ' on level ' + (from + 1));
  }
  for (let i = 20; i < 30; i++) assert.ok(has(i, 'manual'), 'bamboo: carry it yourself, level ' + (i + 1));
  for (let i = 30; i < 40; i++) assert.ok(has(i, 'jar'), 'clay: the jar, level ' + (i + 1));
  for (let i = 40; i < 50; i++) assert.ok(has(i, 'tilt'), 'lacquer: the tilted tray, level ' + (i + 1));
  // on a level that brings something in, nothing else from an earlier board is switched on besides that board's own idea
  for (const i of news) {
    const L = GS.levelFor(i), b = GS.boardOf(i), n = GS.newsAt(i);
    if (b.id !== 'bamboo' && n.feature !== 'manual') assert.ok(!L.manual || b.id === 'bamboo', 'no carrying on level ' + (i + 1));
    if (n.feature !== 'any') assert.ok(L.order !== 'any', 'no any-order on level ' + (i + 1));
    assert.ok(!L.tune.drift && !(L.tune.fieldCone < 180) && !(L.tune.zoneR < 100), 'no twist on level ' + (i + 1));
  }
});

test('every board has a material of its own; the endless board changes material every ten levels, round and round', () => {
  const ids = GS.BOARDS.filter((b) => !b.endless).map((b) => b.id), E = GS.BOARDS.find((b) => b.endless);
  const chapters = GS.CHAPTERS.map((c) => c.id);
  assert.equal(new Set(ids.concat(chapters)).size, ids.length + chapters.length, 'no two alike');
  for (let i = 0; i < E.first; i++) assert.equal(GS.surfaceOf(i), GS.boardOf(i).id);
  for (let k = 0; k < chapters.length * 2; k++) {
    for (let j = 0; j < 10; j++) assert.equal(GS.surfaceOf(E.first + k * 10 + j), chapters[k % chapters.length], 'level ' + (E.first + k * 10 + j + 1));
    assert.equal(GS.chapterOf(E.first + k * 10 + 3).first, E.first + k * 10);
  }
});

test('the chopsticks in hand change the feel on top of the level: reach, wrong grains, stones and pace', () => {
  const L = GS.levelFor(14);
  const plain = GS.create({}, L, LAYOUT, 3);
  const jade = GS.create({ perks: { reach: 1.1 } }, L, LAYOUT, 3);
  const ebony = GS.create({ perks: { creep: 0.8 } }, L, LAYOUT, 3);
  const gold = GS.create({ perks: { pace: 1.2 } }, L, LAYOUT, 3);
  assert.ok(Math.abs(jade.cfg.zoneR - plain.cfg.zoneR * 1.1) < 1e-9, 'jade reaches further');
  assert.ok(Math.abs(ebony.cfg.creepSpeed - plain.cfg.creepSpeed * 0.8) < 1e-9, 'ebony slows wrong grains');
  assert.ok(Math.abs(gold.cfg.paceK - plain.cfg.paceK * 1.2) < 1e-9, 'gold eases the pace');
  assert.equal(plain.ideal, gold.ideal, 'the stars ask the same of every pair');
  // a stone in front of open tips comes in slower with steel
  const creep = (perks) => {
    const sim = GS.create({ perks }, L, LAYOUT, 3);
    for (const g of sim.grains) g.st = ST.GONE;
    const lentil = sim.debugPut(L.types[0], 300, 700);
    sim.target = L.types[0];
    holdAt(sim, 300, 760, 0.25);
    const G = sim.geom();
    const st = sim.debugPut('stone', G.mx + G.ux * 80, G.my + G.uy * 80);
    const x0 = st.x, y0 = st.y;
    holdAt(sim, 300, 760, 0.3);
    return Math.hypot(st.x - x0, st.y - y0);
  };
  const a = creep(null), b = creep({ stone: 0.6 });
  assert.ok(a > 0 && b < a * 0.75, 'steel keeps stones back: ' + a.toFixed(1) + ' vs ' + b.toFixed(1));
});

test('the time limit: a few times par, more on the first levels; when it runs out the level stops until time is added', () => {
  for (let i = 0; i < 3; i++) { const s = GS.create({}, GS.levelFor(i), LAYOUT, 1); assert.equal(s.limit, Math.round(s.par * 3)); }
  for (const i of [5, 15, 25, 45, 75]) { const s = GS.create({}, GS.levelFor(i), LAYOUT, 1); assert.ok(s.limit >= s.par * 1.7 - 1 && s.limit <= s.par * 2.2 + 1, 'level ' + i); }
  assert.equal(GS.create({ limitK: 0 }, GS.levelFor(5), LAYOUT, 1).limit, Infinity, 'no limit when switched off');
  const more = GS.create({ extraTime: 0.24 }, GS.levelFor(5), LAYOUT, 1), base = GS.create({}, GS.levelFor(5), LAYOUT, 1);
  assert.ok(more.limit > base.limit * 1.2, 'a level failed on time before gives a little more');
  const sim = GS.create({}, GS.levelFor(5), LAYOUT, 1);
  const lentil = sim.grains.find((g) => g.type === sim.target);
  holdAt(sim, lentil.x, lentil.y + 60, 0.2);
  sim.clock = sim.limit - 0.05;
  const ev = holdAt(sim, lentil.x, lentil.y + 60, 0.5);
  assert.ok(ev.some((e) => e.type === 'time_up') && sim.timeUp, 'time is up');
  assert.equal(sim.clock, sim.limit, 'the clock stops at the limit');
  assert.ok(!sim.done);
  release(sim, 1.5);
  const before = sim.grains.map((g) => g.st).join();
  holdAt(sim, lentil.x, lentil.y + 60, 0.5);
  assert.equal(sim.sticks.phase === 'away' || sim.sticks.phase === 'retract', true, 'touching does nothing while time is up');
  sim.extend(15);
  assert.ok(!sim.timeUp && sim.limit > sim.clock + 14);
  const ev2 = holdAt(sim, sim.grains.find((g) => g.type === sim.target && g.st === ST.REST).x, 700, 0.5);
  assert.ok(ev2.some((e) => e.type === 'sticks_in'), 'with time added, play goes on');
  assert.ok(before.length > 0);
});

test('a helper can carry stones off the board; they count for nothing and never come back', () => {
  const L = GS.levelFor(15), sim = GS.create({}, L, LAYOUT, 2);
  const stones = sim.grains.filter((g) => TYPES[g.type].stone);
  assert.ok(stones.length >= 2);
  const left = sim.remaining();
  for (const g of stones) assert.ok(sim.takeStone(g.id));
  assert.equal(sim.takeStone(stones[0].id), false, 'once only');
  assert.equal(sim.remaining(), left, 'nothing to sort changed');
  release(sim, 0.5);
  assert.ok(stones.every((g) => g.st === ST.LOST));
  invariants(sim);
});

test('zen mode: the jar never stops, full piles are packed away, a full board costs a life, the last one ends it', () => {
  const sim = GS.create({}, GS.ZEN, LAYOUT, 4);
  assert.equal(sim.limit, Infinity, 'no clock to beat');
  assert.equal(sim.lives, 3);
  // played by the bot for a while: grains keep coming and piles get packed
  const bot = GS.makeBot(sim, 9);
  const ev = [];
  for (let i = 0; i < 240 * 120 && !sim.done; i++) { sim.step(bot()); ev.push(...sim.drainEvents()); }
  assert.ok(ev.filter((e) => e.type === 'jar').length >= 10, 'the jar keeps pouring');
  assert.ok(ev.some((e) => e.type === 'pile_packed'), 'full piles are packed away');
  assert.ok(sim.stats.sorted > 120, 'sorted ' + sim.stats.sorted);
  assert.ok(sim.grains.length < 400, 'packed grains are poured again, the board does not grow without end: ' + sim.grains.length);
  for (const t in sim.stores) assert.ok(sim.stores[t].n <= GS.ZEN_PILE + 30);
  // an idle board fills up: a life goes, the jar waits, and with no lives left the game is over
  const idle = GS.create({}, GS.ZEN, LAYOUT, 5);
  idle.started = true;
  const ev2 = [];
  for (let i = 0; i < 400 * 120 && !idle.done; i++) { idle.step({ down: false }); ev2.push(...idle.drainEvents()); }
  const lost = ev2.filter((e) => e.type === 'life_lost');
  assert.equal(lost.length, 3); assert.ok(lost.every((e) => e.why === 'full'));
  const over = ev2.find((e) => e.type === 'zen_over');
  assert.ok(over && idle.done && over.time > 30, 'over after ' + (over && over.time.toFixed(0)) + ' s');
  // a broken row costs no life, but takes some of the Zen Zone back
  const b = GS.create({}, GS.ZEN, LAYOUT, 6);
  b.zone = 0.5;
  const l = b.grains.find((g) => g.type === 'lentil');
  holdAt(b, l.x, l.y + 60, 0.3);
  const G = b.geom();
  b.debugPut('rice', G.mx + G.ux * 25, G.my + G.uy * 25);
  const ev3 = holdAt(b, l.x, l.y + 60, 1);
  assert.ok(ev3.some((e) => e.type === 'break'), 'the row broke');
  assert.ok(!ev3.some((e) => e.type === 'life_lost'));
  assert.equal(b.lives, 3);
  assert.ok(Math.abs(b.zone - (0.5 - GS.ZEN_ZONE.broken)) < 1e-9, 'zone ' + b.zone);
});

test('zen: the night goes on in stages, the kinds change and get grander, worth more, and the jar never stops speeding up', () => {
  assert.ok(GS.zenPour(1800) > GS.zenPour(600) * 1.8 && GS.zenPour(600) > GS.zenPour(0), 'the pour keeps rising');
  const sim = GS.create({ limitK: 0 }, GS.ZEN, LAYOUT, 11);
  const bot = GS.makeBot(sim, 5), ev = [];
  const play = (s, until) => {
    for (let i = 0; i < s * 120 && !sim.done && !(until && until()); i++) {
      sim.step(bot()); ev.push(...sim.drainEvents());
      if (sim.lives < 2) sim.lives = 3;        // keep it going long enough to see the stages turn
    }
  };
  // the clock is moved on to each stage's edge rather than played through
  const fullRow = (t) => ev.some((e) => e.type === 'row_taken' && e.grain === t && e.kind === 'full');
  play(25, () => fullRow('lentil'));
  sim.clock = GS.ZEN_STAGE_S - 0.01; play(1);
  sim.clock = 2 * GS.ZEN_STAGE_S - 0.01; play(70, () => fullRow('chickpea'));
  sim.clock = 3 * GS.ZEN_STAGE_S - 0.01; play(1);
  const stages = ev.filter((e) => e.type === 'stage').map((e) => e.id);
  assert.deepEqual(stages.slice(0, 3), ['night', 'deep', 'moon'], 'stages ' + stages.join(','));
  const fresh = ev.filter((e) => e.type === 'new_kind').map((e) => e.grain);
  assert.ok(fresh.includes('chickpea') && fresh.includes('sesame'), 'new kinds came in: ' + fresh.join(','));
  assert.ok(sim.level.types.length === 3 && new Set(sim.level.types).size === 3, 'three corners, three kinds');
  assert.equal(GS.ZEN.types.join(), 'lentil,rice,mung', 'the shared zen level is not changed by a run');
  const rows = ev.filter((e) => e.type === 'row_taken');
  const per = (t) => { const r = rows.filter((e) => e.grain === t && e.kind === 'full'); return r.length ? r.reduce((a, e) => a + e.points / e.n / e.mult, 0) / r.length : 0; };
  assert.ok(per('chickpea') > per('lentil') * 1.6, 'grander kinds pay more: ' + per('lentil').toFixed(1) + ' vs ' + per('chickpea').toFixed(1));
  for (const t in sim.stores) assert.ok(sim.level.types.includes(t), 'every corner belongs to a kind in play');
  assert.ok(sim.level.types.includes(sim.target), 'the sticks are after a kind in play');
});

test('zen: when a kind is packed away before the new one has reached the board, the sticks go after the new one', () => {
  const sim = GS.create({}, GS.ZEN, LAYOUT, 3);
  sim.started = true; sim.target = 'lentil';
  for (const g of sim.grains) g.st = ST.LOST;          // an empty board: nothing of any kind in play to switch to
  sim.clock = 2 * GS.ZEN_STAGE_S - 0.01; sim.jar.next = 1e9;            // and the jar holds still
  for (let i = 0; i < 240; i++) sim.step({ down: i > 20, x: 300, y: 500 });
  assert.ok(sim.level.types.includes(sim.target), 'target ' + sim.target + ' in ' + sim.level.types.join());
  assert.ok(sim.stores[sim.target], 'and it has a corner');
});

test('zen: the golden bean hops and leaps off if nobody catches it; open sticks catch it whatever they are after', () => {
  const sim = GS.create({}, GS.ZEN, LAYOUT, 12);
  sim.started = true; sim.goldT = 0.01;
  let ev = release(sim, 0.2);
  const drop = ev.find((e) => e.type === 'gold');
  assert.ok(drop, 'a golden bean dropped in');
  const g = sim.grains[drop.id];
  ev = release(sim, 9);
  assert.ok(ev.some((e) => e.type === 'gold_hop'), 'it hops');
  assert.ok(ev.some((e) => e.type === 'gold_escaped') && g.st === ST.LOST, 'and leaps off');
  const before = sim.remaining();
  // now one right in front of the open sticks while they gather lentils
  sim.goldT = 0.01; release(sim, 0.05);
  const g2 = sim.grains.find((q) => q.type === 'gold' && q.st !== ST.LOST);
  const l = sim.grains.find((q) => q.type === sim.target && q.st === ST.REST);
  holdAt(sim, l.x, l.y + 60, 0.2);
  const G = sim.geom(); g2.x = G.mx + G.ux * 40; g2.y = G.my + G.uy * 40; g2.st = ST.REST;
  ev = holdAt(sim, l.x, l.y + 60, 0.3);
  const caught = ev.find((e) => e.type === 'gold_caught');
  assert.ok(caught && caught.bonus > 0, 'caught, with a bonus');
  assert.ok(!ev.some((e) => e.type === 'break'), 'it never breaks the row');
  assert.equal(sim.remaining(), before, 'and is never counted as something to sort');
});

test('zen: an ember bean glows, then bursts and scatters what lies round it, and goes cold', () => {
  const sim = GS.create({}, GS.ZEN, LAYOUT, 13);
  sim.started = true;
  const e = sim.debugPut('ember', 300, 600), near = sim.debugPut('lentil', 330, 600);
  sim.emberT = 0.01;
  let ev = release(sim, 0.2);
  assert.ok(ev.some((x) => x.type === 'ember_warn' && x.id === e.id), 'it warns first');
  ev = release(sim, 2);
  assert.ok(ev.some((x) => x.type === 'ember_burst' && x.id === e.id), 'then bursts');
  assert.ok(near.x > 360, 'the lentil beside it was thrown off: ' + near.x.toFixed(0));
  assert.ok(e.cool, 'and the ember is cold now');
});

test('zen: every few bowls the Zen Capybara gives a life back; at the end she can give one more to carry on', () => {
  const sim = GS.create({}, GS.ZEN, LAYOUT, 14);
  sim.started = true; sim.lives = 1;
  const st = sim.stores.lentil;
  const ev = [];
  for (let b = 0; b < GS.ZEN_THANKS; b++) {
    for (let i = 0; i < GS.ZEN_PILE; i++) { const g = sim.debugPut('lentil', 300, 300); g.st = ST.GONE; st.ids.push(g.id); st.n++; }
    sim.stats.taken.lentil = st.n;
    sim.packs = [{ type: 'lentil', at: 0 }];
    sim.step({ down: false }); ev.push(...sim.drainEvents());
  }
  assert.equal(sim.bowls, GS.ZEN_THANKS);
  assert.ok(ev.some((e) => e.type === 'capybara' && e.gave === 'life'), 'a life back');
  assert.equal(sim.lives, 2);
  // a full board for three seconds takes the last life
  sim.lives = 1; sim.overT = 0;
  for (let i = 0; i < GS.ZEN_FULL + 10; i++) sim.debugPut('rice', 80 + (i % 12) * 26, 200 + Math.floor(i / 12) * 26);
  for (let i = 0; i < 4 * 120 && !sim.done; i++) sim.step({ down: false });
  assert.ok(sim.done && sim.result.zen, 'over');
  assert.ok(sim.revive(), 'carried on');
  assert.ok(!sim.done && sim.lives === 1 && sim.continues === 1);
  assert.equal(sim.revive(), false, 'only when the run is over');
});

test('zen: a kind hands its corner on only once none of it is left in the jar either, so no grain lies without a bowl', () => {
  const sim = GS.create({}, GS.ZEN, LAYOUT, 12);
  sim.started = true;
  for (const g of sim.grains) g.st = ST.LOST;
  // a scoop of lentils still waiting in the jar when the stage turns and lentils leave
  const ids = [];
  for (let i = 0; i < 8; i++) { const g = sim.debugPut('lentil', 300, 400); g.st = ST.JAR; ids.push(g.id); }
  sim.jar.scoops = [ids]; sim.jar.pour = []; sim.jar.next = 1e9;
  sim.clock = 2 * GS.ZEN_STAGE_S - 0.01;
  for (let i = 0; i < 3 * 120; i++) {
    sim.step({ down: false });
    for (const g of sim.grains) {
      if ((g.st === ST.REST || g.st === ST.SLIDE) && !GS.TYPES[g.type].stone && !GS.TYPES[g.type].gold) assert.ok(sim.stores[g.type], g.type + ' lies on the board without a bowl');
    }
  }
  assert.ok(sim.grains.some((g) => g.type === 'lentil' && g.st === ST.REST), 'the lentils were poured');
  assert.ok(sim.stores.lentil, 'and their corner waits for them');
});

test('zen: full rows charge the Zen Zone; in it the jar pours more, a wrong grain breaks the row and ends it', () => {
  const sim = GS.create({}, GS.ZEN, LAYOUT, 13);
  const bot = GS.makeBot(sim, 9), ev = [];
  sim.clock = GS.ZEN_ZONE.from + 1; sim.flow.next = 1e9;
  sim.zone = 0.995;
  for (let i = 0; i < 60 * 120 && !ev.some((e) => e.type === 'zone'); i++) { sim.step(bot()); ev.push(...sim.drainEvents()); }
  const on = ev.find((e) => e.type === 'zone');
  assert.ok(on && on.on, 'the zone came on with a full row');
  assert.ok(sim.zoneT > GS.ZEN_ZONE.secs - 1 && sim.zone === 0);
  // what the jar pours now is the zone's: marked, and not counted toward a full board
  release(sim, 3);
  const extra = sim.grains.filter((g) => g.frenzy && (g.st === ST.REST || g.st === ST.SLIDE));
  assert.ok(extra.length > 0, 'the jar poured in the zone');
  // in the zone wrong grains and stones lie still: one near the tips does not creep in
  const l = sim.grains.find((g) => g.type === sim.target && g.st === ST.REST && !g.frenzy) || sim.debugPut(sim.target, 300, 700);
  holdAt(sim, l.x, l.y + 60, 0.3);
  let G = sim.geom();
  const near = sim.debugPut('stone', G.mx + G.ux * 40, G.my + G.uy * 40), tips = () => { const g2 = sim.geom(); return Math.hypot(near.x - g2.mx, near.y - g2.my); };
  const d0 = tips(), evS = holdAt(sim, l.x, l.y + 60, 0.6);
  assert.ok(!evS.some((e) => e.type === 'break') && tips() > d0 - 4, 'a wrong grain near the tips did not creep in: ' + d0.toFixed(1) + ' then ' + tips().toFixed(1));
  // driving the tips onto one: the row breaks and the zone is over; what it poured sinks
  const ev2 = [], inp = { down: true, x: l.x, y: l.y + 60 + sim.cfg.fingerOffset };
  let put = false;
  for (let i = 0; i < 4 * sim.cfg.stepHz && !ev2.some((e) => e.type === 'zone'); i++) {
    if (!put && sim.sticks.phase === 'open' && sim.sticks.pt > 0.25) { G = sim.geom(); sim.debugPut('stone', G.mx, G.my); put = true; }
    sim.step(inp); ev2.push(...sim.drainEvents());
    if (put && sim.sticks.phase !== 'open' && !ev2.some((e) => e.type === 'break')) put = false;
  }
  assert.ok(ev2.some((e) => e.type === 'break'), 'the row broke');
  const off = ev2.find((e) => e.type === 'zone' && !e.on);
  assert.ok(off && off.broken && sim.zoneT === 0 && sim.zone === 0, 'and the zone ended');
  assert.ok(off.sunk.length > 0 && !sim.grains.some((g) => g.frenzy), 'what it poured sank: ' + off.sunk.length);
  invariants(sim);
});

test('zen: the Zen Zone meter opens after a while, fills with full rows, and drains with none', () => {
  // before it opens, full rows put nothing in it
  const a = GS.create({}, GS.ZEN, LAYOUT, 21), botA = GS.makeBot(a, 7);
  a.flow.next = 1e9;
  let rows = 0;
  for (let i = 0; i < 40 * 120 && a.clock < GS.ZEN_ZONE.from - 1; i++) { a.step(botA()); for (const e of a.drainEvents()) if (e.type === 'row_taken' && e.full) rows++; }
  assert.ok(rows > 3 && a.zone === 0, rows + ' full rows before it opened, meter ' + a.zone);
  // after it opens they do, a quick row more than a slow one
  const b = GS.create({}, GS.ZEN, LAYOUT, 21), botB = GS.makeBot(b, 7);
  b.clock = GS.ZEN_ZONE.from + 1; b.flow.next = 1e9;
  let seen = null;
  for (let i = 0; i < 40 * 120 && !seen; i++) { b.step(botB()); seen = b.drainEvents().find((e) => e.type === 'row_taken' && e.full); }
  assert.ok(seen && Math.abs(b.zone - GS.ZEN_ZONE.speed[seen.speed]) < 1e-9, seen && seen.speed + ' row put ' + b.zone);
  assert.ok(GS.ZEN_ZONE.speed.Lightning > GS.ZEN_ZONE.speed.Quick && GS.ZEN_ZONE.speed.Quick > GS.ZEN_ZONE.speed.Steady && GS.ZEN_ZONE.speed.Steady > GS.ZEN_ZONE.speed.Slow);
  // with no row for a while it drains
  const c = GS.create({}, GS.ZEN, LAYOUT, 3);
  c.started = true; c.clock = GS.ZEN_ZONE.from + 1; c.flow.next = 1e9; c.zone = 0.5; c.lastPull = c.clock - 10;
  release(c, 1);
  assert.ok(c.zone < 0.5 && c.zone > 0.5 - 2 * GS.ZEN_ZONE.drain, 'drained to ' + c.zone);
});

test('zen: in the Zen Zone a closed row flies to its bowl by itself and the sticks stay on the board', () => {
  const sim = GS.create({}, GS.ZEN, LAYOUT, 5);
  sim.zoneT = GS.ZEN_ZONE.secs;
  const ls = sim.grains.filter((g) => g.type === sim.target && g.st === ST.REST), c = centroid(ls);
  // a finger held still under the heap, as a player keeps it down while the rows close by themselves
  const inp = { down: true, x: c.x, y: c.y + 60 + sim.cfg.fingerOffset };
  let carried = false, rows = 0, quick = 0, pour = 0;
  for (let i = 0; i < 3 * sim.cfg.stepHz; i++) {
    sim.step(inp);
    if (sim.sticks.phase === 'carry') carried = true;
    for (const e of sim.drainEvents()) { if (e.type === 'row_taken') rows++; if (e.type === 'sticks_in' && e.quick) quick++; }
    pour = Math.max(pour, sim.grains.filter((g) => g.st === ST.POUR).length);
  }
  assert.ok(rows >= 1, 'a row was taken: ' + rows);
  assert.ok(pour >= 1, 'its grains flew to the bowl');
  assert.ok(!carried, 'no trip to the bowl and back');
  assert.ok(quick >= 1, 'the sticks opened again where they were');
  invariants(sim);
});

test('zen: a thumb kept down gathers grains that came after the sticks did', () => {
  const sim = GS.create({}, GS.ZEN, LAYOUT, 9);
  for (const g of sim.grains) if (g.st === ST.REST) g.st = ST.LOST;          // an empty board
  sim.flow.next = 1e9;
  const inp = { down: true, x: 300, y: 760 + sim.cfg.fingerOffset };
  for (let i = 0; i < sim.cfg.stepHz && sim.sticks.phase !== 'open'; i++) { sim.step(inp); sim.drainEvents(); }
  assert.equal(sim.sticks.phase, 'open', 'the sticks came in over an empty board');
  // grains of the row's kind land in front of the tips only now; the thumb has not moved
  const G = sim.geom(), type = sim.sticks.rowType;
  for (let i = 0; i < 6; i++) sim.debugPut(type, G.mx + (i - 2.5) * 16, G.my - 60 - (i % 2) * 14);
  let closed = 0;
  for (let i = 0; i < 1.5 * sim.cfg.stepHz && !closed; i++) { sim.step(inp); for (const e of sim.drainEvents()) if (e.type === 'close') closed++; }
  assert.ok(closed > 0 || sim.sticks.row.length >= 2, 'the new grains were gathered: row ' + sim.sticks.row.length);
  invariants(sim);
});

test('zen: a stone in a row costs a life; a wrong grain only breaks it', () => {
  const run = (bad) => {
    const sim = GS.create({}, GS.ZEN, LAYOUT, 9);
    sim.flow.next = 1e9;
    const l = sim.grains.find((g) => g.type === sim.target && g.st === ST.REST);
    const inp = { down: true, x: l.x, y: l.y + 60 + sim.cfg.fingerOffset }, ev = [];
    let put = false;
    for (let i = 0; i < 4 * sim.cfg.stepHz && !ev.some((e) => e.type === 'break'); i++) {
      if (!put && sim.sticks.phase === 'open' && sim.sticks.pt > 0.25) { const G = sim.geom(); sim.debugPut(bad(sim), G.mx, G.my); put = true; }
      sim.step(inp); ev.push(...sim.drainEvents());
    }
    return { sim, ev };
  };
  const a = run(() => 'stone');
  assert.ok(a.ev.some((e) => e.type === 'break'), 'the stone broke the row');
  assert.ok(a.ev.some((e) => e.type === 'life_lost' && e.why === 'stone') && a.sim.lives === 2, 'and took a life');
  const b = run((sim) => sim.level.types.find((t) => t !== sim.sticks.rowType));
  assert.ok(b.ev.some((e) => e.type === 'break'), 'the wrong grain broke the row');
  assert.ok(!b.ev.some((e) => e.type === 'life_lost') && b.sim.lives === 3, 'but took no life');
});

test('zen: a stone sinks into the sand after a while', () => {
  const sim = GS.create({}, GS.ZEN, LAYOUT, 14);
  sim.started = true;
  const st = sim.debugPut('stone', 300, 700);
  const ev = release(sim, GS.ZEN_STONE_S + 0.5);
  assert.equal(st.st, ST.LOST);
  assert.ok(ev.some((e) => e.type === 'stone_sunk' && e.id === st.id));
});

test('zen: the jar keeps a rhythm: waves with a calm after, spills, orders, never the same twice running', () => {
  const sim = GS.create({}, GS.ZEN, LAYOUT, 15), bot = GS.makeBot(sim, 9), ev = [];
  for (let i = 0; i < 240 * 120 && !sim.done; i++) { sim.step(bot()); ev.push(...sim.drainEvents()); if (sim.lives < 2) sim.lives = 3; }
  const picks = ev.filter((e) => e.type === 'order' || (e.type === 'flow' && (e.kind === 'warn' || e.kind === 'spill')))
    .map((e) => (e.type === 'order' ? 'order' : e.kind === 'warn' ? 'rush' : 'spill'));
  assert.ok(picks.length >= 5, 'events: ' + picks.join(','));
  for (let i = 1; i < picks.length; i++) assert.notEqual(picks[i], picks[i - 1], 'never the same twice running: ' + picks.join(','));
  assert.ok(new Set(picks).size === 3, 'all three came: ' + picks.join(','));
  const flow = ev.filter((e) => e.type === 'flow').map((e) => e.kind);
  flow.forEach((k, i) => { if (k === 'warn') assert.equal(flow[i + 1] || 'rush', 'rush'); if (k === 'rush' || k === 'spill') assert.equal(flow[i + 1] || 'calm', 'calm'); });
});

test('zen: an order counts rows of its kind; filled in time it pays and charges the Zen Zone, missed it takes some back', () => {
  const sim = GS.create({}, GS.ZEN, LAYOUT, 16), bot = GS.makeBot(sim, 9), ev = [];
  sim.flow.next = 1e9; sim.clock = GS.ZEN_ZONE.from + 1;
  sim.order = { type: 'lentil', need: 5, got: 0, until: sim.clock + 22, secs: 22 };
  for (let i = 0; i < 25 * 120 && !ev.some((e) => e.type.startsWith('order_')); i++) { sim.step(bot()); ev.push(...sim.drainEvents()); }
  const done = ev.find((e) => e.type === 'order_done');
  assert.ok(done && done.bonus > 0, 'the order was filled');
  assert.ok(sim.zone >= GS.ZEN_FLOW.orderGain || sim.zoneT > 0, 'and charged the zone');
  assert.equal(sim.order, null);
  sim.zone = 0.5; sim.flow.next = 1e9; sim.lastPull = sim.clock;
  sim.order = { type: 'rice', need: 999, got: 0, until: sim.clock + 1, secs: 1 };
  const ev2 = release(sim, 1.5);
  assert.ok(ev2.some((e) => e.type === 'order_failed'));
  assert.ok(Math.abs(sim.zone - (0.5 - GS.ZEN_FLOW.orderLoss)) < 1e-9);
});
