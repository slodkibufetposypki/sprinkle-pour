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
