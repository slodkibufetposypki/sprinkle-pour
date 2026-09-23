// The sprinkles inside the jar, simulated one by one. Grains live in the
// jar's own (rotating) frame, so the walls are a fixed box. The jar's motion
// shows up as rotated gravity plus the inertial forces of a turning frame.
// Contacts are solved position-based with Coulomb friction, which gives the
// pile a real angle of repose: it holds, then avalanches out over the rim.
// A grain whose centre crosses the mouth plane leaves the jar and becomes a
// world particle.
//
// Hot loop on purpose: flat typed arrays, a linked-list grid for small grains,
// and a brute-force list for the few large ones.
import { TYPE_IDS } from './params.js';

export const LARGE_R = 0.45;

// Jar geometry in jar-local cm. The wrist pivot is the origin and +y points
// out of the mouth. No lid: the body steps in at a short shoulder to the
// threaded neck (where a lid would screw on), and the whole mouth is open.
export function jarShape(P) {
  const S = P.shape;
  const hw = S.width / 2;
  const bottom = -S.pivot;
  const top = S.height - S.pivot;
  const wall = 0.3;
  const ihw = hw - wall;
  const inset = Math.min(0.35, ihw * 0.2);
  return {
    hw,
    bottom,
    top,
    wall,
    base: 0.5,
    ihw,
    ibottom: bottom + 0.5,
    itop: top, // mouth plane
    neckY: top - 0.8, // threaded neck runs from here to the rim
    shoulder: 0.35, // the body narrows to the neck over this height
    inset,
    nhw: ihw - inset, // inner half-width of the neck
  };
}

// Initial packing: drop each grain into the lowest of a few candidate spots
// on a skyline (dense, like settling sugar), then let the solver settle it.
function pack(g, shape, rng) {
  const bins = 160;
  const x0 = -shape.ihw;
  const bw = (2 * shape.ihw) / bins;
  const sky = new Float32Array(bins).fill(shape.ibottom);
  for (let i = 0; i < g.n; i++) {
    const r = g.r[i];
    let best = null;
    for (let k = 0; k < 14; k++) {
      const x = x0 + r + rng() * Math.max(0.001, 2 * shape.ihw - 2 * r);
      const b0 = Math.max(0, Math.floor((x - r - x0) / bw));
      const b1 = Math.min(bins - 1, Math.floor((x + r - x0) / bw));
      let h = shape.ibottom;
      for (let b = b0; b <= b1; b++) {
        // circle resting on the skyline, not a box: edges sit lower
        const u = (x0 + (b + 0.5) * bw - x) / r;
        h = Math.max(h, sky[b] - r * (1 - Math.sqrt(Math.max(0, 1 - u * u))));
      }
      if (!best || h < best.h) best = { x, h, b0, b1 };
    }
    const y = Math.min(best.h + r, shape.itop - r);
    for (let b = best.b0; b <= best.b1; b++) {
      const u = (x0 + (b + 0.5) * bw - best.x) / r;
      sky[b] = Math.max(sky[b], y + r * Math.sqrt(Math.max(0, 1 - u * u)));
    }
    g.x[i] = best.x;
    g.y[i] = y;
  }
}

export function createGrains(P, level, rng) {
  const order = [];
  for (let ti = 0; ti < TYPE_IDS.length; ti++) {
    for (let k = 0; k < (level.mix[TYPE_IDS[ti]] || 0); k++) order.push(ti);
  }
  // Shuffle so the mix is mixed; heavy pieces then sink a little as it settles.
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const n = order.length;
  const g = {
    n,
    t: new Uint8Array(n),
    c: new Uint8Array(n),
    x: new Float32Array(n),
    y: new Float32Array(n),
    px: new Float32Array(n),
    py: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    r: new Float32Array(n),
    w: new Float32Array(n),
    sw: new Float64Array(n),
    a: new Float32Array(n),
    large: [],
    head: null,
    next: new Int32Array(n),
    pairs: new Int32Array(Math.max(64, n * 8)),
    seed: 1 + rng.int(1e9),
  };
  for (let i = 0; i < n; i++) {
    const T = P.types[TYPE_IDS[order[i]]];
    g.t[i] = order[i];
    g.c[i] = rng.int(8);
    // Real sprinkles vary in size; equal discs would crystallise into a
    // rigid lattice that refuses to avalanche.
    const k = 1 + rng.sym(P.grains.sizeVariation);
    g.r[i] = T.radius * k;
    g.w[i] = 1 / Math.max(0.05, T.mass * k * k);
    g.a[i] = rng() * Math.PI * 2;
  }
  pack(g, jarShape(P), rng);
  return g;
}

function removeGrain(g, i) {
  const last = g.n - 1;
  if (i !== last) {
    g.t[i] = g.t[last];
    g.c[i] = g.c[last];
    g.x[i] = g.x[last];
    g.y[i] = g.y[last];
    g.px[i] = g.px[last];
    g.py[i] = g.py[last];
    g.vx[i] = g.vx[last];
    g.vy[i] = g.vy[last];
    g.r[i] = g.r[last];
    g.w[i] = g.w[last];
    g.a[i] = g.a[last];
  }
  g.n = last;
}

// frame: { theta, omega, alpha, ax, ay, closed } where ax/ay is the hand's
// world acceleration and `closed` holds grains in (before the level starts,
// like an invisible lid). onExit(i) is called before grain i is removed.
export function stepGrains(g, dt, P, shape, frame, onExit) {
  const n0 = g.n;
  if (!n0) return;
  const G = P.grains;
  const { x, y, px, py, vx, vy, r, w } = g;
  const s = Math.sin(frame.theta);
  const c = Math.cos(frame.theta);
  const om = frame.omega;
  const al = frame.alpha;
  // Gravity and hand acceleration, rotated into the jar frame.
  const wgx = -frame.ax;
  const wgy = -P.world.gravity - frame.ay;
  const gx = wgx * c - wgy * s;
  const gy = wgx * s + wgy * c;
  const damp = Math.exp(-G.damping * dt);
  const om2 = om * om;
  // A hand is never perfectly still: a faint tremor keeps the pile from
  // freezing into walls that real sugar could never hold.
  const shake = G.tremor * dt;
  let seed = (g.seed = (g.seed * 1664525 + 1013904223) >>> 0);
  const noise = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967296) * 2 - 1;
  };
  // "Up" against the local gravity: used to make lower grains act heavier
  // while solving contacts (mass scaling), so deep piles don't squash.
  const gl = Math.hypot(gx, gy) || 1;
  const ux = -gx / gl;
  const uy = -gy / gl;
  const stack = G.stacking;

  const sw = g.sw;
  let hmin = Infinity;
  for (let i = 0; i < n0; i++) hmin = Math.min(hmin, x[i] * ux + y[i] * uy);
  for (let i = 0; i < n0; i++) {
    const xi = x[i];
    const yi = y[i];
    // Contact weight grows with height: grains above yield to grains below.
    sw[i] = w[i] * Math.exp(Math.min(30, stack * (xi * ux + yi * uy - hmin)));
    // + centrifugal, + Euler, + Coriolis (clockwise-positive rotation)
    const ax = gx + om2 * xi - al * yi - 2 * om * vy[i];
    const ay = gy + om2 * yi + al * xi + 2 * om * vx[i];
    vx[i] = (vx[i] + ax * dt + (shake ? noise() * shake : 0)) * damp;
    vy[i] = (vy[i] + ay * dt + (shake ? noise() * shake : 0)) * damp;
    px[i] = xi;
    py[i] = yi;
    x[i] = xi + vx[i] * dt;
    y[i] = yi + vy[i] * dt;
  }

  // Grid over the jar interior for small grains; large ones kept aside.
  let rs = 0.05;
  const large = g.large;
  large.length = 0;
  for (let i = 0; i < n0; i++) {
    if (r[i] >= LARGE_R) large.push(i);
    else if (r[i] > rs) rs = r[i];
  }
  const cs = rs * 2.05;
  const gx0 = -shape.ihw - cs;
  const gy0 = shape.ibottom - cs;
  const nx = Math.ceil((2 * shape.ihw + 2 * cs) / cs);
  const ny = Math.ceil((shape.itop - shape.ibottom + 4 * cs) / cs);
  if (!g.head || g.head.length < nx * ny) g.head = new Int32Array(nx * ny);
  const head = g.head;
  const next = g.next;
  const cellOf = (xx, yy) => {
    let ix = Math.floor((xx - gx0) / cs);
    let iy = Math.floor((yy - gy0) / cs);
    ix = ix < 0 ? 0 : ix >= nx ? nx - 1 : ix;
    iy = iy < 0 ? 0 : iy >= ny ? ny - 1 : iy;
    return iy * nx + ix;
  };
  head.fill(-1, 0, nx * ny);
  for (let i = 0; i < n0; i++) {
    // A blown-up grain must never reach the grid (NaN cells loop forever).
    if (!Number.isFinite(x[i] + y[i])) {
      x[i] = px[i] = 0;
      y[i] = py[i] = shape.ibottom + r[i];
      vx[i] = vy[i] = 0;
    }
    if (r[i] >= LARGE_R) continue;
    const ci = cellOf(x[i], y[i]);
    next[i] = head[ci];
    head[ci] = i;
  }

  const mus = G.friction;
  const muk = G.friction * 0.75;
  const muw = G.wallFriction;

  const solve = (i, j) => {
    const dx = x[j] - x[i];
    const dy = y[j] - y[i];
    const rr = r[i] + r[j];
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    // Coincident grains (e.g. both clamped into a corner) still need a push.
    const d = Math.sqrt(d2);
    const pen = rr - d;
    const nxv = d > 1e-6 ? dx / d : (i & 1 ? 0.6 : -0.6);
    const nyv = d > 1e-6 ? dy / d : 0.8;
    const wi = sw[i];
    const wj = sw[j];
    const ws = wi + wj;
    const ki = wi / ws;
    const kj = wj / ws;
    x[i] -= nxv * pen * ki;
    y[i] -= nyv * pen * ki;
    x[j] += nxv * pen * kj;
    y[j] += nyv * pen * kj;
    // Friction: undo relative sliding this step, fully while it is small.
    const rdx = x[i] - px[i] - (x[j] - px[j]);
    const rdy = y[i] - py[i] - (y[j] - py[j]);
    const dn = rdx * nxv + rdy * nyv;
    const tx = rdx - dn * nxv;
    const ty = rdy - dn * nyv;
    const tl = Math.sqrt(tx * tx + ty * ty);
    if (tl > 1e-9) {
      const k = tl < mus * pen ? 1 : Math.min(1, (muk * pen) / tl);
      x[i] -= tx * k * ki;
      y[i] -= ty * k * ki;
      x[j] += tx * k * kj;
      y[j] += ty * k * kj;
    }
  };

  const wallFric = (i, pen, alongX) => {
    if (alongX) {
      const d = x[i] - px[i];
      if (Math.abs(d) < muw * pen) x[i] = px[i];
      else x[i] -= Math.sign(d) * muw * pen;
    } else {
      const d = y[i] - py[i];
      if (Math.abs(d) < muw * pen) y[i] = py[i];
      else y[i] -= Math.sign(d) * muw * pen;
    }
  };

  const { ihw, ibottom, itop, neckY, shoulder, inset } = shape;
  const sy0 = neckY - shoulder;
  // Candidate contact pairs, found once per step and re-solved every
  // iteration (much cheaper than re-walking the grid each pass).
  let np = 0;
  let pairs = g.pairs;
  const margin = G.margin ?? rs * 0.6;
  const addPair = (i, j) => {
    const dx = x[j] - x[i];
    const dy = y[j] - y[i];
    const rr = r[i] + r[j] + margin;
    if (dx * dx + dy * dy >= rr * rr) return;
    if (np * 2 + 2 > pairs.length) {
      const grown = new Int32Array(pairs.length * 2);
      grown.set(pairs);
      pairs = g.pairs = grown;
    }
    pairs[np * 2] = i;
    pairs[np * 2 + 1] = j;
    np++;
  };
  for (let i = 0; i < n0; i++) {
    if (r[i] >= LARGE_R) continue;
    const ix = Math.floor((x[i] - gx0) / cs);
    const iy = Math.floor((y[i] - gy0) / cs);
    for (let oy = -1; oy <= 1; oy++) {
      const cy = iy + oy;
      if (cy < 0 || cy >= ny) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const cx = ix + ox;
        if (cx < 0 || cx >= nx) continue;
        for (let j = head[cy * nx + cx]; j !== -1; j = next[j]) if (j < i) addPair(i, j);
      }
    }
  }
  for (const i of large) {
    const reach = r[i] + rs + margin;
    const ax0 = Math.max(0, Math.floor((x[i] - reach - gx0) / cs));
    const ax1 = Math.min(nx - 1, Math.floor((x[i] + reach - gx0) / cs));
    const ay0 = Math.max(0, Math.floor((y[i] - reach - gy0) / cs));
    const ay1 = Math.min(ny - 1, Math.floor((y[i] + reach - gy0) / cs));
    for (let cy = ay0; cy <= ay1; cy++) {
      for (let cx = ax0; cx <= ax1; cx++) {
        for (let j = head[cy * nx + cx]; j !== -1; j = next[j]) addPair(i, j);
      }
    }
  }
  for (let a = 0; a < large.length; a++) for (let b = a + 1; b < large.length; b++) addPair(large[a], large[b]);

  const iters = Math.max(1, Math.round(G.iterations));
  for (let it = 0; it < iters; it++) {
    for (let k = 0; k < np; k++) solve(pairs[k * 2], pairs[k * 2 + 1]);

    // walls and bottom (last, so containment always wins)
    for (let i = 0; i < n0; i++) {
      const ri = r[i];
      if (y[i] < ibottom + ri) {
        const pen = ibottom + ri - y[i];
        y[i] = ibottom + ri;
        wallFric(i, pen, true);
      }
      // side walls, stepping in over the shoulder to the neck
      const yi = y[i];
      const half = yi <= sy0 ? ihw : yi >= neckY ? ihw - inset : ihw - (inset * (yi - sy0)) / shoulder;
      if (x[i] < -half + ri) {
        const pen = -half + ri - x[i];
        x[i] = -half + ri;
        wallFric(i, pen, false);
      } else if (x[i] > half - ri) {
        const pen = x[i] - (half - ri);
        x[i] = half - ri;
        wallFric(i, pen, false);
      }
      if (frame.closed && y[i] > itop - ri) {
        const pen = y[i] - (itop - ri);
        y[i] = itop - ri;
        wallFric(i, pen, true);
      }
    }
  }

  const inv = 1 / dt;
  const vmax = 300;
  for (let i = 0; i < n0; i++) {
    let ux = (x[i] - px[i]) * inv;
    let uy = (y[i] - py[i]) * inv;
    const sp = Math.hypot(ux, uy);
    if (sp > vmax) {
      ux *= vmax / sp;
      uy *= vmax / sp;
    }
    vx[i] = ux;
    vy[i] = uy;
  }

  // Leaving over the rim.
  if (frame.closed) return;
  for (let i = g.n - 1; i >= 0; i--) {
    if (y[i] > itop) {
      onExit(i);
      removeGrain(g, i);
    }
  }
}
