// Cake builders. A cake is a moving body made of closed polygons (cake-local
// cm, y up, sitting on the table at y=0). Every edge carries a surface
// material and a scoring zone: 'target' (counts toward the cake) or 'waste'.
// Upward-facing frosting edges are targets; sides count only if sidesValid.
import { makeRng } from './rng.js';

export const PLATE_H = 0.8;

export const SPONGE = {
  vanilla: '#EFCF98',
  chocolate: '#7B4B34',
  strawberry: '#F3B7C3',
  red: '#C2474F',
};
export const FROST = {
  white: '#FFF9F2',
  pink: '#F8C8D6',
  mint: '#CFEBDD',
  lilac: '#DDD0F2',
  choc: '#5E3526',
  lemon: '#FBE9A6',
  berry: '#E26A8D',
};

// ---- geometry helpers (shared with physics) --------------------------------
export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Nearest point on the polygon outline to (x, y). Writes into `out` to avoid
// allocations in the hot loop: out = {d2, qx, qy, e}.
export function nearestEdge(x, y, pts, out) {
  out.d2 = Infinity;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const l2 = ex * ex + ey * ey || 1e-9;
    let t = ((x - a[0]) * ex + (y - a[1]) * ey) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = a[0] + ex * t;
    const qy = a[1] + ey * t;
    const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
    if (d2 < out.d2) {
      out.d2 = d2;
      out.qx = qx;
      out.qy = qy;
      out.e = i;
    }
  }
  return out;
}

function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

function makePoly(pts, classify) {
  if (signedArea(pts) < 0) pts.reverse();
  const n = pts.length;
  const edges = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len;
    const ny = -dx / len;
    edges.push({ nx, ny, ...classify(nx, ny, a, b) });
    x0 = Math.min(x0, a[0]);
    y0 = Math.min(y0, a[1]);
    x1 = Math.max(x1, a[0]);
    y1 = Math.max(y1, a[1]);
  }
  return { pts, edges, aabb: [x0, y0, x1, y1] };
}

function arc(cx, cy, r, a0, a1, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

// Frosting band hanging from a top profile, with a drippy lower edge.
function dripBand(topPts, thick, rng, dripiness = 1) {
  const xs0 = topPts[0][0];
  const xs1 = topPts[topPts.length - 1][0];
  const drips = [];
  const count = Math.max(2, Math.round(((xs1 - xs0) / 5) * dripiness));
  for (let i = 0; i < count; i++) {
    drips.push({
      x: xs0 + (xs1 - xs0) * ((i + 0.5 + rng.sym(0.35)) / count),
      len: rng.range(0.4, 2.6) * dripiness,
      w: rng.range(0.6, 1.3),
    });
  }
  const topAt = (x) => {
    for (let i = 1; i < topPts.length; i++) {
      const [ax, ay] = topPts[i - 1];
      const [bx, by] = topPts[i];
      if (x <= bx || i === topPts.length - 1) {
        const t = bx === ax ? 0 : (x - ax) / (bx - ax);
        return ay + (by - ay) * Math.max(0, Math.min(1, t));
      }
    }
    return topPts[0][1];
  };
  const lower = [];
  const steps = Math.max(8, Math.round((xs1 - xs0) / 0.35));
  for (let i = steps; i >= 0; i--) {
    const x = xs0 + ((xs1 - xs0) * i) / steps;
    let d = 0;
    for (const k of drips) {
      const u = (x - k.x) / k.w;
      if (Math.abs(u) < 1) d = Math.max(d, k.len * Math.sqrt(1 - u * u));
    }
    lower.push([x, topAt(x) - thick - d]);
  }
  return [...topPts.map((p) => [p[0], p[1] + 0.15]), ...lower];
}

// A frosting layer. `top` (render-only) is its upper edge, left→right: the
// renderer puts a flat shine on it and a flat shadow under it.
function frosting(pts, top, fill) {
  return { op: 'poly', pts, fill, top };
}

// ---- builders ---------------------------------------------------------------
const cls = (spec) => (nx, ny) =>
  ny > 0.4
    ? { mat: spec.material || 'buttercream', zone: 'target' }
    : { mat: spec.side || 'sponge', zone: spec.sidesValid ? 'target' : 'waste' };
const wasteCls = (mat) => () => ({ mat, zone: 'waste' });

function plate(w) {
  const pts = [
    [-1.8, 0],
    [w + 1.8, 0],
    [w + 2.2, PLATE_H],
    [-2.2, PLATE_H],
  ];
  return makePoly(pts, wasteCls('plate'));
}

function topOf(pts, minNy = 0.4) {
  // Upward-facing chain of a CCW polygon, returned left→right.
  const n = pts.length;
  const up = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    if (-dx / len > minNy) up.push(a, b);
  }
  up.sort((p, q) => p[0] - q[0]);
  return up.filter((p, i) => i === 0 || Math.abs(p[0] - up[i - 1][0]) > 1e-6);
}

const BUILDERS = {
  sheet(spec, rng) {
    const { w, h } = spec;
    const y0 = PLATE_H;
    const y1 = y0 + h;
    const c = 0.7;
    const body = makePoly(
      [
        [0, y0],
        [w, y0],
        [w, y1 - c],
        [w - c, y1],
        [c, y1],
        [0, y1 - c],
      ],
      cls(spec),
    );
    const top = topOf(body.pts);
    return {
      polys: [body],
      visuals: [
        { op: 'poly', pts: body.pts, fill: SPONGE[spec.sponge || 'vanilla'] },
        { op: 'layer', y: y0 + h * 0.45, x0: 0.2, x1: w - 0.2, color: FROST[spec.filling || 'pink'], width: 0.9 },
        frosting(dripBand(top, 1.3, rng, 0.6), top, FROST[spec.frost || 'white']),
      ],
    };
  },

  round(spec, rng) {
    const { w, h } = spec;
    const y0 = PLATE_H;
    const y1 = y0 + h;
    const R = Math.min(2.2, h * 0.3);
    const pts = [
      [0, y0],
      [w, y0],
      ...arc(w - R, y1 - R, R, 0, Math.PI / 2, 4),
      ...arc(R, y1 - R, R, Math.PI / 2, Math.PI, 4),
    ];
    const body = makePoly(pts, cls(spec));
    const top = topOf(body.pts, 0.2);
    return {
      polys: [body],
      visuals: [
        { op: 'poly', pts: body.pts, fill: FROST[spec.frost || 'white'] },
        frosting(dripBand(top, 1.1, rng, 1.2), top, FROST[spec.drip || 'pink']),
      ],
    };
  },

  cupcake(spec, rng) {
    const { w, h } = spec;
    const y0 = PLATE_H;
    const wh = h * 0.45;
    const wrapper = makePoly(
      [
        [w * 0.17, y0],
        [w * 0.83, y0],
        [w * 0.95, y0 + wh],
        [w * 0.05, y0 + wh],
      ],
      wasteCls('sponge'),
    );
    const base = y0 + wh - 0.15;
    const x0 = w * 0.01;
    const x1 = w * 0.99;
    const H = h * 0.55;
    const phase = rng.range(0, Math.PI);
    const prof = [];
    const N = 22;
    for (let i = N; i >= 0; i--) {
      const u = (i / N) * 2 - 1;
      const x = x0 + ((u + 1) / 2) * (x1 - x0);
      const dome = Math.pow(Math.max(0, 1 - u * u), 0.45);
      const swirl = 0.85 + 0.15 * Math.cos(3 * Math.PI * u + phase);
      const tip = 0.9 * Math.max(0, 1 - Math.abs(u) * 5);
      prof.push([x, base + H * dome * swirl + tip]);
    }
    const cream = makePoly([[x0, base], [x1, base], ...prof.slice(1, -1)], (nx, ny) =>
      ny > -0.2 ? { mat: spec.material || 'buttercream', zone: 'target' } : { mat: 'sponge', zone: 'waste' },
    );
    const stripes = [];
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      stripes.push({
        op: 'line',
        pts: [
          [w * (0.17 + 0.66 * t), y0 + 0.1],
          [w * (0.05 + 0.9 * t), y0 + wh - 0.1],
        ],
        color: '#8CC3DA',
        width: 0.25,
      });
    }
    const swirls = [];
    for (let k = 1; k <= 2; k++) {
      const yy = base + H * (0.33 * k);
      const half = (x1 - x0) * 0.5 * Math.sqrt(1 - Math.pow((0.33 * k) / 1.05, 2));
      const cx = (x0 + x1) / 2;
      swirls.push({
        op: 'line',
        pts: [
          [cx - half * 0.9, yy - 0.2],
          [cx, yy + 0.35],
          [cx + half * 0.9, yy - 0.2],
        ],
        color: 'rgba(120,70,90,0.18)',
        width: 0.3,
        smooth: true,
      });
    }
    return {
      polys: [wrapper, cream],
      visuals: [
        { op: 'poly', pts: wrapper.pts, fill: '#A9D8EA' },
        ...stripes,
        frosting(cream.pts, prof.slice().reverse(), FROST[spec.frost || 'pink']),
        ...swirls,
      ],
    };
  },

  dome(spec) {
    const { w, h } = spec;
    const y0 = PLATE_H;
    const prof = [];
    const N = 24;
    for (let i = N; i >= 0; i--) {
      const u = (i / N) * 2 - 1;
      prof.push([((u + 1) / 2) * w, y0 + h * Math.sqrt(Math.max(0, 1 - u * u))]);
    }
    const body = makePoly([[0, y0], [w, y0], ...prof.slice(1, -1)], (nx, ny) =>
      ny > 0.15 ? { mat: spec.material || 'fondant', zone: 'target' } : { mat: spec.material || 'fondant', zone: spec.sidesValid ? 'target' : 'waste' },
    );
    return {
      polys: [body],
      visuals: [
        { op: 'poly', pts: body.pts, fill: FROST[spec.frost || 'lilac'] },
        { op: 'line', pts: prof.slice(4, -4), color: 'rgba(255,255,255,0.55)', width: 0.35, offsetY: -0.9, smooth: true },
      ],
    };
  },

  bundt(spec, rng) {
    const { w, h } = spec;
    const y0 = PLATE_H;
    const hole = spec.hole ?? w * 0.24;
    const halves = [
      [0, (w - hole) / 2],
      [(w + hole) / 2, w],
    ];
    const polys = [];
    const visuals = [];
    for (const [a, b] of halves) {
      const prof = [];
      const N = 16;
      for (let i = N; i >= 0; i--) {
        const v = i / N;
        const flute = 0.18 * Math.sin(v * Math.PI * 5);
        prof.push([a + (b - a) * v, y0 + h * (0.7 + 0.3 * Math.sin(Math.PI * v)) + flute]);
      }
      const body = makePoly([[a, y0], [b, y0], ...prof], cls({ ...spec, material: spec.material || 'glaze' }));
      polys.push(body);
      visuals.push({ op: 'poly', pts: body.pts, fill: SPONGE[spec.sponge || 'chocolate'] });
      const top = topOf(body.pts, 0.2);
      visuals.push(frosting(dripBand(top, 0.9, rng, 1.3), top, FROST[spec.frost || 'white']));
    }
    return { polys, visuals };
  },

  tiered(spec, rng) {
    const { w, h } = spec;
    const h1 = spec.h1 ?? h * 0.55;
    const h2 = h - h1;
    const w2 = spec.w2 ?? w * 0.6;
    const y0 = PLATE_H;
    const xl = (w - w2) / 2;
    const xr = (w + w2) / 2;
    const ya = y0 + h1;
    const yb = ya + h2;
    const c = 0.6;
    const body = makePoly(
      [
        [0, y0],
        [w, y0],
        [w, ya - c],
        [w - c, ya],
        [xr, ya],
        [xr, yb - c],
        [xr - c, yb],
        [xl + c, yb],
        [xl, yb - c],
        [xl, ya],
        [c, ya],
        [0, ya - c],
      ],
      cls({ ...spec, material: spec.material || 'fondant' }),
    );
    const visuals = [
      { op: 'poly', pts: body.pts, fill: FROST[spec.frost || 'white'] },
      frosting(
        dripBand(
          [
            [0, ya],
            [w, ya],
          ],
          0.8,
          rng,
          0.5,
        ).map(([x, y]) => [Math.max(0, Math.min(w, x)), y]),
        [
          [0, ya],
          [xl, ya],
        ],
        FROST[spec.drip || 'pink'],
      ),
      frosting(
        dripBand(
          [
            [xl, yb],
            [xr, yb],
          ],
          0.8,
          rng,
          0.6,
        ),
        [
          [xl, yb],
          [xr, yb],
        ],
        FROST[spec.drip || 'pink'],
      ),
      { op: 'dots', y: y0 + 0.5, x0: 0.4, x1: w - 0.4, r: 0.32, color: '#F2E6C9' },
      { op: 'dots', y: ya + 0.4, x0: xl + 0.4, x1: xr - 0.4, r: 0.28, color: '#F2E6C9' },
    ];
    return { polys: [body], visuals };
  },

  donut(spec, rng) {
    const { w, h } = spec;
    const y0 = PLATE_H;
    const R = h / 2;
    const pts = [...arc(w - R, y0 + R, R, -Math.PI / 2, Math.PI / 2, 8), ...arc(R, y0 + R, R, Math.PI / 2, Math.PI * 1.5, 8)];
    const body = makePoly(pts, cls({ ...spec, material: spec.material || 'glaze' }));
    return {
      polys: [body],
      visuals: [
        { op: 'poly', pts: body.pts, fill: SPONGE[spec.sponge || 'vanilla'] },
        frosting(dripBand(topOf(body.pts, 0.3), R * 0.55, rng, 0.8), topOf(body.pts, 0.3), FROST[spec.frost || 'berry']),
      ],
    };
  },
};
BUILDERS.eclair = BUILDERS.donut;

export function buildCake(spec, index) {
  const rng = makeRng(1000 + index * 97 + Math.round(spec.w * 13));
  const built = BUILDERS[spec.kind](spec, rng);
  const polys = [plate(spec.w), ...built.polys];
  let tx0 = Infinity;
  let tx1 = -Infinity;
  let top = 0;
  const aabb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polys) {
    aabb[0] = Math.min(aabb[0], p.aabb[0]);
    aabb[1] = Math.min(aabb[1], p.aabb[1]);
    aabb[2] = Math.max(aabb[2], p.aabb[2]);
    aabb[3] = Math.max(aabb[3], p.aabb[3]);
    top = Math.max(top, p.aabb[3]);
    p.edges.forEach((e, i) => {
      if (e.zone !== 'target') return;
      const a = p.pts[i];
      const b = p.pts[(i + 1) % p.pts.length];
      tx0 = Math.min(tx0, a[0], b[0]);
      tx1 = Math.max(tx1, a[0], b[0]);
    });
  }
  const bins = Math.max(4, Math.round((tx1 - tx0) / 3)); // ~3 cm strips
  return {
    i: index,
    spec,
    kind: spec.kind,
    pos: { x: spec.x, y: 0 },
    vel: { x: spec.vx || 0, y: 0 },
    baseVx: spec.vx || 0,
    polys,
    visuals: [{ op: 'plate', w: spec.w }, ...built.visuals],
    aabb,
    top,
    target: {
      x0: tx0,
      x1: tx1,
      bins: new Float32Array(bins),
      required: spec.required || 0,
      received: 0,
    },
    dents: [],
  };
}

// How much of a strip's frosting is covered, 0–1: full once it holds its
// fair share of the cake's full-cover amount (`required`). Half of each
// neighbour's sprinkles count too, the way the eye reads a cake: a one-strip
// gap between sprinkled patches doesn't look bare, a wider one does.
export function stripCover(cake, i) {
  const t = cake.target;
  if (!t.required) return 1;
  const b = t.bins;
  const n = b.length;
  const here = b[i];
  const left = i > 0 ? b[i - 1] : here;
  const right = i < n - 1 ? b[i + 1] : here;
  const blended = 0.5 * here + 0.25 * (left + right);
  return Math.min(1, blended / (0.5 * (t.required / n)));
}

// How much of the whole frosting is covered, 0–1 (~3 cm strips, partial
// credit), so a pile in one spot covers little and a pour along the whole
// cake covers it all.
export function cakeCoverage(cake) {
  const n = cake.target.bins.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += stripCover(cake, i);
  return sum / n;
}
