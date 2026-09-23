// One level run: owns the jar, the grains inside it, the cakes and the
// falling particles; steps them at a fixed rate and turns the outcome into a
// result. DOM-free so tools/bot.mjs can run levels headlessly.
//
// States: 'ready' (waiting for the first press, jar still, pile settling)
//      → 'play' → 'settle' (hand past the last cake, jar lifts itself)
//      → 'result'.
import { TYPE_IDS } from './params.js';
import { makeRng } from './rng.js';
import { buildCake, cakeCoverage, pointInPoly, nearestEdge } from './cakes.js';
import { levelEndX, END_MARGIN } from './levels.js';
import { stepParticles } from './physics.js';
import { D, createJar, stepJar, toWorld, toLocal, pointVel, pourStartEstimate } from './jar.js';
import { LARGE_R, jarShape, createGrains, stepGrains } from './grains.js';

const HISTORY = 420; // samples kept for the debug graph (7 s at 60 Hz)
// Score out of 100 and the points needed for stars 2–5 (the first star is
// decorating every cake).
export const POINTS = { decorated: 30, spread: 20, clean: 25, portion: 25 };
export const STAR_POINTS = [65, 76, 86, 94];
const tmp = { d2: 0, qx: 0, qy: 0, e: 0 };

// Points on the jar outline used for jar-vs-cake contact.
function jarSamples({ hw, bottom, top }) {
  const pts = [];
  const step = 1.1;
  const ny = Math.ceil((top - bottom) / step);
  for (let k = 0; k <= ny; k++) {
    const y = bottom + ((top - bottom) * k) / ny;
    pts.push([-hw, y], [hw, y]);
  }
  const nx = Math.ceil((2 * hw) / step);
  for (let k = 1; k < nx; k++) {
    const x = -hw + (2 * hw * k) / nx;
    pts.push([x, bottom], [x, top]);
  }
  return pts;
}

export class Game {
  constructor(P) {
    this.P = P;
    this.frameState = { theta: 0, omega: 0, alpha: 0, ax: 0, ay: 0, closed: true };
  }

  load(level, seed = 1) {
    const P = this.P;
    this.level = level;
    this.seed = seed;
    this.rng = makeRng(seed);
    this.cakes = level.cakes.map((c, i) => buildCake(c, i));
    this.shape = jarShape(P);
    this.samples = jarSamples(this.shape);
    this.jar = createJar(P, level);
    this.grains = createGrains(P, level, this.rng);
    this.endX = levelEndX(level);
    this.minX = level.hand.startX - 60;
    this.maxX = this.endX + 80;
    this.particles = [];
    this.stuck = [];
    this.stuckLarge = [];
    this.grid = new Map();
    this.events = [];
    this.t = 0;
    this.acc = 0;
    this.state = 'ready';
    this.settleT = 0;
    this.nextId = 1;
    this.bumpCooldown = 0;
    this.quietT = 1;
    this.wasDanger = false;
    this.exitMass = 0;
    this.result = null;
    this.startMass = TYPE_IDS.reduce((m, t) => m + (level.mix[t] || 0) * P.types[t].mass, 0);
    this.stats = { onTarget: 0, wasted: 0, lost: 0, bumps: 0, poured: 0 };
    this.hist = {
      i: 0,
      n: 0,
      theta: new Float32Array(HISTORY),
      start: new Float32Array(HISTORY),
      flow: new Float32Array(HISTORY),
      held: new Uint8Array(HISTORY),
    };
    this.histAcc = 0;
    // Let the pile settle before anyone sees it.
    for (let i = 0; i < 150; i++) this.stepGrains(1 / 240, true);
    this.refreshContents();
    return this;
  }

  // Mass, count and volume of what is still in the jar.
  refreshContents() {
    const g = this.grains;
    const P = this.P;
    let mass = 0;
    let areaSum = 0;
    for (let i = 0; i < g.n; i++) {
      mass += P.types[TYPE_IDS[g.t[i]]].mass;
      areaSum += g.r[i] * g.r[i];
    }
    this.jarMass = mass;
    this.grainArea = areaSum * Math.PI;
    this.jar.fill = mass / Math.max(1, P.jar.capacity);
  }

  get count() {
    return this.grains.n;
  }

  get pourStart() {
    return pourStartEstimate(this.shape, this.grainArea, this.P.grains.friction);
  }

  // Advance by real elapsed time using fixed physics steps.
  update(realDt, held) {
    const W = this.P.world;
    const dt = 1 / W.physicsHz;
    this.acc += Math.min(realDt, 0.1) * W.timeScale;
    let n = 0;
    while (this.acc >= dt && n++ < 64) {
      const was = this.state;
      this.step(dt, held);
      this.acc -= dt;
      if (this.state === 'result' && was !== 'result') {
        this.acc = 0;
        break;
      }
    }
  }

  stepGrains(dt, closed) {
    const j = this.jar;
    const f = this.frameState;
    f.theta = j.theta;
    f.omega = j.omega;
    f.alpha = j.alpha;
    f.ax = j.ax;
    f.ay = j.ay;
    f.closed = closed;
    stepGrains(this.grains, dt, this.P, this.shape, f, (i) => this.spawnFromGrain(i));
  }

  step(dt, heldInput) {
    const P = this.P;
    const jar = this.jar;
    if (this.state === 'result') {
      // Behind the result card the hand stops and the pile settles.
      stepJar(jar, dt, true, P, this.level, false);
      this.stepGrains(dt, true);
      return;
    }
    if (this.state === 'ready') {
      if (!heldInput) return; // nothing moves until the first press
      this.state = 'play';
      this.events.push({ type: 'start' });
    }
    this.t += dt;
    const playing = this.state === 'play';
    // Once the hand passes the last cake it lifts the jar by itself.
    const held = playing ? heldInput : true;
    if (held && !jar.held && jar.omega > 1.2 && playing) {
      this.events.push({ type: 'catch', speed: jar.omega });
    }

    stepJar(jar, dt, held, P, this.level);

    for (const c of this.cakes) {
      c.vel.x = c.baseVx + (c.vel.x - c.baseVx) * Math.exp(-5 * dt);
      c.pos.x += c.vel.x * dt;
    }
    this.bumpCooldown -= dt;
    this.collideJar();

    this.exitMass = 0;
    this.stepGrains(dt, !playing);
    if (this.exitMass > 0) {
      this.refreshContents();
      if (this.quietT > 0.4) this.events.push({ type: 'threshold' });
      this.quietT = 0;
    } else {
      this.quietT += dt;
    }
    // Measured flow (mass/s), smoothed: drives the pour sound and the graph.
    jar.flow += (this.exitMass / dt - jar.flow) * (1 - Math.exp(-dt / 0.12));

    const danger = jar.theta / D > P.jar.dangerAngle;
    if (danger && !this.wasDanger) this.events.push({ type: 'danger' });
    this.wasDanger = danger;

    stepParticles(this, dt);

    this.histAcc += dt;
    if (this.histAcc >= 1 / 60) {
      this.histAcc -= 1 / 60;
      const h = this.hist;
      h.theta[h.i] = jar.theta / D;
      h.start[h.i] = this.pourStart;
      h.flow[h.i] = jar.flow;
      h.held[h.i] = held ? 1 : 0;
      h.i = (h.i + 1) % HISTORY;
      h.n = Math.min(HISTORY, h.n + 1);
    }

    // Done once the hand is past every cake (nothing poured can land on one
    // any more) or the jar is empty; then the jar lifts and the pile settles.
    const pastCakes = this.cakes.every((c) => jar.x > c.pos.x + c.aabb[2] + END_MARGIN);
    if (playing && (pastCakes || this.grains.n === 0 || jar.x >= this.endX + 40)) {
      this.state = 'settle';
      this.events.push({ type: 'end' });
    }
    if (this.state === 'settle') {
      this.settleT += dt;
      if ((this.particles.length === 0 && this.settleT > 0.5) || this.settleT > 4) this.finish();
    }
  }

  // A grain crossed the rim: it becomes a falling particle carrying
  // the jar's motion plus its own slide out of the pile.
  spawnFromGrain(i) {
    const g = this.grains;
    const jar = this.jar;
    const t = TYPE_IDS[g.t[i]];
    const T = this.P.types[t];
    const [x, y] = toWorld(jar, g.x[i], g.y[i]);
    const [pvx, pvy] = pointVel(jar, x, y);
    const c = Math.cos(jar.theta);
    const s = Math.sin(jar.theta);
    const lvx = g.vx[i];
    const lvy = g.vy[i];
    const r = g.r[i];
    const flat = t === 'rod' || t === 'heart';
    this.particles.push({
      id: this.nextId++,
      t,
      r,
      x,
      y,
      vx: pvx + lvx * c + lvy * s,
      vy: pvy - lvx * s + lvy * c,
      a: g.a[i] + jar.theta,
      av: flat ? this.rng.sym(t === 'rod' ? 12 : 8) : 0,
      c: g.c[i],
      flip: this.rng() * Math.PI * 2,
      large: r >= LARGE_R,
      flat,
      rest: 0,
      squash: 0,
      age: 0,
      maxImpact: 0,
      lastHit: -1,
      hasContact: false,
      cMat: null,
      cBody: null,
      cZone: 'waste',
      cStick: 0,
    });
    this.exitMass += T.mass;
    this.stats.poured += T.mass;
    if (r >= LARGE_R) this.events.push({ type: 'plop', t, x, y });
  }

  // The hand is kinematic, so a jar that meets a cake gets rotated out of it
  // (and knocked, which jolts the grains). Whatever the rotation cannot fix
  // shoves the cake along the table.
  collideJar() {
    const jar = this.jar;
    const W = this.P.world;
    const S = this.shape;
    let best = null;
    const reach = Math.hypot(S.hw, Math.max(S.top, -S.bottom)) + 0.5;
    for (const c of this.cakes) {
      const bb = c.aabb;
      if (jar.x + reach < c.pos.x + bb[0] || jar.x - reach > c.pos.x + bb[2] || jar.y - reach > c.pos.y + bb[3]) continue;
      for (const [lx, ly] of this.samples) {
        const [wx, wy] = toWorld(jar, lx, ly);
        const cx = wx - c.pos.x;
        const cy = wy - c.pos.y;
        for (const poly of c.polys) {
          const pb = poly.aabb;
          if (cx < pb[0] || cx > pb[2] || cy < pb[1] || cy > pb[3]) continue;
          if (!pointInPoly(cx, cy, poly.pts)) continue;
          nearestEdge(cx, cy, poly.pts, tmp);
          const d = Math.sqrt(tmp.d2);
          if (!best || d > best.depth) {
            const e = poly.edges[tmp.e];
            let nx = e.nx;
            let ny = e.ny;
            if (d > 1e-6) {
              nx = (tmp.qx - cx) / d;
              ny = (tmp.qy - cy) / d;
            }
            best = { depth: d, nx, ny, wx, wy, cake: c, lx: tmp.qx, ly: tmp.qy };
          }
        }
      }
      // Sharp cake corners poking into the jar's side.
      for (const poly of c.polys) {
        for (const [px, py] of poly.pts) {
          const wx = px + c.pos.x;
          const wy = py + c.pos.y;
          const [jx, jy] = toLocal(jar, wx, wy);
          if (Math.abs(jx) >= S.hw || jy <= S.bottom || jy >= S.top) continue;
          const opts = [
            [S.hw - jx, 1, 0],
            [jx + S.hw, -1, 0],
            [S.top - jy, 0, 1],
            [jy - S.bottom, 0, -1],
          ].sort((a, b) => a[0] - b[0]);
          const [d, sx, sy] = opts[0];
          if (!best || d > best.depth) {
            // Local side normal → world, flipped to point from cake into jar.
            const cth = Math.cos(jar.theta);
            const sth = Math.sin(jar.theta);
            const nx = -(sx * cth + sy * sth);
            const ny = -(-sx * sth + sy * cth);
            best = { depth: d, nx, ny, wx, wy, cake: c, lx: px, ly: py };
          }
        }
      }
    }
    if (!best) return;

    const { depth, nx, ny, wx, wy, cake } = best;
    const rx = wx - jar.x;
    const ry = wy - jar.y;
    const k = ry * nx - rx * ny; // how much +θ moves the contact along n
    const [pvx, pvy] = pointVel(jar, wx, wy);
    const vn = (pvx - cake.vel.x) * nx + (pvy - cake.vel.y) * ny;
    if (Math.abs(k) > 0.4) {
      jar.theta += Math.max(-0.2, Math.min(0.2, depth / k));
      if (vn < 0) jar.omega += Math.max(-12, Math.min(12, (-(1 + W.jarBounce) * vn) / k));
    }
    // The part rotation can't absorb pushes the cake (horizontally only).
    const shove = W.cakePush * (Math.abs(k) > 0.4 ? 0.35 : 1);
    cake.pos.x -= nx * depth * shove;
    if (vn < 0) cake.vel.x -= nx * -vn * 0.25 * shove;

    const severity = Math.max(0, -vn) + depth * 20;
    if (severity > 6 && this.bumpCooldown <= 0) {
      this.bumpCooldown = 0.35;
      this.stats.bumps++;
      // Jolt the pile: every grain gets a kick in the jar frame.
      const g = this.grains;
      const kick = Math.min(60, severity);
      for (let i = 0; i < g.n; i++) {
        g.vx[i] += this.rng.sym(kick * 0.5);
        g.vy[i] += kick * 0.4 + this.rng.sym(kick * 0.3);
      }
      cake.dents.push({ x: best.lx, y: best.ly, r: Math.min(2.2, 0.8 + severity / 40) });
      this.events.push({ type: 'bump', severity, x: wx, y: wy });
    }
  }

  // Scoring: 100 points turned into 0–5 stars. Decorating every cake earns
  // the first star; the rest come from how cleanly and evenly it was done.
  finish() {
    const lv = this.level;
    const NAMES = { sheet: 'Sheet cake', round: 'Layer cake', cupcake: 'Cupcake', dome: 'Dome cake', bundt: 'Bundt', tiered: 'Tiered cake', donut: 'Donut', eclair: 'Éclair' };
    const sameKind = (c) => this.cakes.filter((o) => o.kind === c.kind);
    const cakes = this.cakes.map((c) => {
      const tg = c.target;
      const ratio = tg.required ? tg.received / tg.required : 1;
      return {
        name: sameKind(c).length > 1 ? `${NAMES[c.kind]} ${sameKind(c).indexOf(c) + 1}` : NAMES[c.kind],
        received: tg.received,
        required: tg.required,
        ratio,
        met: ratio >= 1 - 1e-6,
        coverage: cakeCoverage(c),
      };
    });
    const start = Math.max(1, this.startMass);
    // Waste = spilled on the table/plates, plus anything piled on a cake
    // beyond twice what it needed (that is product thrown away too).
    const buried = cakes.reduce((s, c) => s + Math.max(0, c.received - 2 * c.required), 0);
    const waste = (this.stats.wasted + buried) / start;
    const left = this.jarMass;
    const n = Math.max(1, cakes.length);
    const mean = (f) => cakes.reduce((s, c) => s + f(c), 0) / n;
    const allowed = lv.allowedWaste ?? 0.35;
    const coverage = mean((c) => c.coverage);
    // Up to 1.5× the requirement is a generous, fair helping; beyond that a
    // cake is getting buried and portion points reach zero at 2.5×.
    const portion = (k) => (k <= 1.5 ? Math.min(1, k) : Math.max(0, 1 - (k - 1.5)));
    const parts = {
      decorated: POINTS.decorated * mean((c) => Math.min(1, c.ratio)),
      spread: POINTS.spread * coverage,
      clean: POINTS.clean * Math.max(0, Math.min(1, 1 - waste / (allowed * 1.5))),
      portion: POINTS.portion * mean((c) => portion(c.ratio)),
    };
    const bumpPenalty = Math.min(24, 8 * this.stats.bumps);
    const raw = parts.decorated + parts.spread + parts.clean + parts.portion - bumpPenalty;
    const score = Math.max(0, Math.round(raw));
    const pass = cakes.every((c) => c.met);
    let stars = 0;
    if (pass) {
      stars = 1;
      for (const at of STAR_POINTS) if (score >= at) stars++;
    }

    // Plain-language reasons, so a run reads as "I know what to do better".
    const notes = [];
    for (const c of cakes.filter((c) => !c.met)) {
      notes.push(`${c.name} was ${Math.round(100 - 100 * c.ratio)}% short`);
    }
    if (!pass && left < 1) notes.push('The jar ran dry before the end');
    if (pass && stars < 5) {
      const next = STAR_POINTS[stars - 1];
      const gaps = [
        ['spread', POINTS.spread - parts.spread, 'Pour along the whole cake to cover it evenly'],
        ['clean', POINTS.clean - parts.clean, 'Waste less: catch the jar before the stream reaches the table'],
        ['portion', POINTS.portion - parts.portion, (() => {
          const worst = cakes.reduce((a, c) => (c.ratio > a.ratio ? c : a), cakes[0]);
          return worst ? `Don't bury the cakes: ${worst.name.toLowerCase()} got ${worst.ratio.toFixed(1)}× what it needed` : '';
        })()],
        ['bumps', bumpPenalty, 'Keep the jar off the cakes'],
      ].sort((a, b) => b[1] - a[1]);
      notes.push(`${gaps[0][2]}. ${next - score} more points for ${stars + 1} stars.`);
    }

    this.result = {
      pass,
      stars,
      score,
      parts,
      bumpPenalty,
      coverage,
      waste,
      left: left / start,
      leftCount: this.grains.n,
      onTarget: this.stats.onTarget / start,
      bumps: this.stats.bumps,
      cakes,
      notes,
    };
    this.state = 'result';
    this.events.push({ type: 'result', result: this.result });
  }
}
