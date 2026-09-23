// Sprinkle physics. Cheap on purpose: every piece is a circle integrated
// against static/moving polygons. Only "large" pieces (hearts, pearls) collide
// with each other and with settled large pieces, so piles and pearl-on-pearl
// bounces happen while thousands of beads stay cheap. Nothing freezes on
// first touch: frosting grabs velocity through adhesion, and a piece becomes
// static only once it has actually come to rest.
import { nearestEdge, pointInPoly } from './cakes.js';
const PILE = { friction: 0.7, bounce: 0.25, stick: 0.5 };
const CELL = 3;
const tmp = { d2: 0, qx: 0, qy: 0, e: 0 };

const stuckX = (s) => (s.body ? s.body.pos.x : 0) + s.lx;
const stuckY = (s) => (s.body ? s.body.pos.y : 0) + s.ly;
const key = (ix, iy) => ix * 100003 + iy;

function buildGrid(world) {
  const grid = world.grid;
  grid.clear();
  const add = (x, y, ref) => {
    const k = key(Math.floor(x / CELL), Math.floor(y / CELL));
    let a = grid.get(k);
    if (!a) grid.set(k, (a = []));
    a.push(ref);
  };
  for (const p of world.particles) if (p.large) add(p.x, p.y, p);
  for (const s of world.stuckLarge) add(stuckX(s), stuckY(s), s);
}

function collide(world, p, T, nx, ny, pen, mat, body, zone) {
  const bvx = body ? body.vel.x : 0;
  const bvy = body ? body.vel.y : 0;
  p.x += nx * pen;
  p.y += ny * pen;
  let rvx = p.vx - bvx;
  let rvy = p.vy - bvy;
  const vn = rvx * nx + rvy * ny;
  const stickC = T.stick * mat.stick;
  if (vn < 0) {
    const impact = -vn;
    let e = Math.sqrt(T.bounce * mat.bounce) * (1 - 0.7 * stickC);
    if (impact < 12) e = 0;
    let tx = rvx - vn * nx;
    let ty = rvy - vn * ny;
    const vt = Math.hypot(tx, ty);
    const mu = T.friction * mat.friction;
    if (vt > 1e-6) {
      const s = Math.max(0, vt - mu * (1 + e) * impact) / vt;
      tx *= s;
      ty *= s;
    }
    rvx = tx - e * vn * nx;
    rvy = ty - e * vn * ny;
    p.vx = rvx + bvx;
    p.vy = rvy + bvy;
    if (impact > p.maxImpact) p.maxImpact = impact;
    if (impact > 25) p.squash = Math.min(0.4, Math.max(p.squash, impact / 450));
    if (p.large && impact > 45 && world.t - p.lastHit > 0.06) {
      p.lastHit = world.t;
      world.events.push({ type: 'hit', t: p.t, speed: impact, x: p.x, y: p.y, zone });
    }
  }
  // Visual spin: round pieces roll, flat pieces settle flat on the surface.
  if (p.flat) {
    let d = Math.atan2(nx, ny) - p.a;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (d > Math.PI / 2) d -= Math.PI;
    if (d < -Math.PI / 2) d += Math.PI;
    p.a += d * 0.25;
    p.av *= 0.7;
  } else {
    p.av = (rvx * ny - rvy * nx) / p.r;
  }
  p.hasContact = true;
  p.cMat = mat;
  p.cBody = body;
  p.cZone = zone;
  p.cStick = stickC;
}

function collideLarge(world, p, T, r) {
  const ix = Math.floor(p.x / CELL);
  const iy = Math.floor(p.y / CELL);
  const P = world.P;
  for (let gx = ix - 1; gx <= ix + 1; gx++) {
    for (let gy = iy - 1; gy <= iy + 1; gy++) {
      const cell = world.grid.get(key(gx, gy));
      if (!cell) continue;
      for (const q of cell) {
        if (q === p) continue;
        const dynamic = q.vx !== undefined;
        const qx = dynamic ? q.x : stuckX(q);
        const qy = dynamic ? q.y : stuckY(q);
        const qr = q.r;
        const dx = p.x - qx;
        const dy = p.y - qy;
        const rr = r + qr;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? dx / d : 0;
        const ny = d > 1e-6 ? dy / d : 1;
        const overlap = rr - d;
        if (!dynamic) {
          collide(world, p, T, nx, ny, overlap, PILE, q.body, q.zone);
        } else if (!p.large) {
          // Beads get shoved by moving large pieces, never the reverse.
          p.x += nx * overlap;
          p.y += ny * overlap;
          const vn = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
          if (vn < 0) {
            p.vx -= vn * nx * 1.2;
            p.vy -= vn * ny * 1.2;
          }
        } else if (p.id < q.id) {
          const ip = 1 / T.mass;
          const iq = 1 / P.types[q.t].mass;
          const k = overlap / (ip + iq);
          p.x += nx * k * ip;
          p.y += ny * k * ip;
          q.x -= nx * k * iq;
          q.y -= ny * k * iq;
          const vn = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
          if (vn < 0) {
            const j = (-(1 + 0.3) * vn) / (ip + iq);
            p.vx += j * ip * nx;
            p.vy += j * ip * ny;
            q.vx -= j * iq * nx;
            q.vy -= j * iq * ny;
            q.rest = 0;
          }
        }
      }
    }
  }
}

function removeAt(arr, i) {
  const last = arr.pop();
  if (i < arr.length) arr[i] = last;
}

function stick(world, i) {
  const p = world.particles[i];
  const T = world.P.types[p.t];
  const body = p.cBody;
  const s = {
    t: p.t,
    r: p.r,
    c: p.c,
    a: p.a,
    flip: p.flip,
    body,
    lx: p.x - (body ? body.pos.x : 0),
    ly: p.y - (body ? body.pos.y : 0),
    zone: p.cZone,
    sink: p.cStick,
    large: p.large,
    born: world.t,
  };
  world.stuck.push(s);
  if (s.large) world.stuckLarge.push(s);
  const m = T.mass;
  if (s.zone === 'target' && body) {
    const tg = body.target;
    tg.received += m;
    const n = tg.bins.length;
    const b = Math.floor(((s.lx - tg.x0) / Math.max(1e-6, tg.x1 - tg.x0)) * n);
    tg.bins[Math.max(0, Math.min(n - 1, b))] += m;
    world.stats.onTarget += m;
  } else {
    world.stats.wasted += m;
  }
  world.events.push({ type: 'land', t: p.t, zone: s.zone, impact: p.maxImpact, x: p.x, y: p.y, cake: body ? body.i : -1 });
  removeAt(world.particles, i);
}

export function stepParticles(world, dt) {
  const { P, particles, cakes } = world;
  const g = P.world.gravity;
  const W = P.world;
  buildGrid(world);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const T = P.types[p.t];
    const r = p.r;
    p.vy -= g * T.gravityScale * dt;
    const damp = Math.exp(-T.drag * dt);
    p.vx *= damp;
    p.vy *= damp;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.a += p.av * dt;
    p.squash *= Math.exp(-dt * 14);
    p.age += dt;
    p.hasContact = false;

    if (p.y < r) collide(world, p, T, 0, 1, r - p.y, P.materials.table, null, 'waste');

    for (const c of cakes) {
      let lx = p.x - c.pos.x;
      let ly = p.y - c.pos.y;
      const bb = c.aabb;
      if (lx < bb[0] - r || lx > bb[2] + r || ly < bb[1] - r || ly > bb[3] + r) continue;
      for (const poly of c.polys) {
        const pb = poly.aabb;
        if (lx < pb[0] - r || lx > pb[2] + r || ly < pb[1] - r || ly > pb[3] + r) continue;
        const inside = pointInPoly(lx, ly, poly.pts);
        nearestEdge(lx, ly, poly.pts, tmp);
        const d = Math.sqrt(tmp.d2);
        if (!inside && d >= r) continue;
        const e = poly.edges[tmp.e];
        let nx = e.nx;
        let ny = e.ny;
        if (d > 1e-6) {
          nx = (lx - tmp.qx) / d;
          ny = (ly - tmp.qy) / d;
          if (inside) {
            nx = -nx;
            ny = -ny;
          }
        }
        collide(world, p, T, nx, ny, inside ? d + r : r - d, P.materials[e.mat], c, e.zone);
        lx = p.x - c.pos.x;
        ly = p.y - c.pos.y;
      }
    }

    collideLarge(world, p, T, r);

    if (p.hasContact) {
      const bvx = p.cBody ? p.cBody.vel.x : 0;
      const bvy = p.cBody ? p.cBody.vel.y : 0;
      if (p.cStick > 0) {
        const f = Math.exp(-W.adhesionRate * p.cStick * dt);
        p.vx = bvx + (p.vx - bvx) * f;
        p.vy = bvy + (p.vy - bvy) * f;
      }
      const sp = Math.hypot(p.vx - bvx, p.vy - bvy);
      const thr = W.settleSpeed + W.stickySettleSpeed * p.cStick;
      const need = p.cStick > 0.05 ? W.settleTime : W.restTime;
      if (sp < thr) {
        p.rest += dt;
        if (p.rest >= need) {
          stick(world, i);
          continue;
        }
      } else {
        p.rest = Math.max(0, p.rest - 2 * dt);
      }
    } else {
      p.rest = Math.max(0, p.rest - dt);
    }

    if (p.y < -30 || p.x < world.minX || p.x > world.maxX) {
      world.stats.wasted += T.mass;
      world.stats.lost += T.mass;
      removeAt(particles, i);
    }
  }
}
