// The hand + jar: a pendulum pulled forward by gravity and back by a weak,
// slightly delayed "muscle". This file only moves the container; the
// sprinkles inside are simulated grain by grain in grains.js, so when and how
// fast they pour comes out of the pile itself.

export const D = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function toWorld(jar, lx, ly) {
  const c = Math.cos(jar.theta);
  const s = Math.sin(jar.theta);
  return [jar.x + lx * c + ly * s, jar.y - lx * s + ly * c];
}

export function toLocal(jar, wx, wy) {
  const c = Math.cos(jar.theta);
  const s = Math.sin(jar.theta);
  const dx = wx - jar.x;
  const dy = wy - jar.y;
  return [dx * c - dy * s, dx * s + dy * c];
}

// Velocity of a world point rigidly attached to the jar (clockwise-positive ω).
export function pointVel(jar, wx, wy) {
  return [jar.vx + jar.omega * (wy - jar.y), jar.vy - jar.omega * (wx - jar.x)];
}

export function speedAt(level, x) {
  const prof = level.hand.speedProfile;
  if (!prof || !prof.length) return level.hand.speed;
  if (x <= prof[0][0]) return prof[0][1];
  for (let i = 1; i < prof.length; i++) {
    const [x1, s1] = prof[i];
    const [x0, s0] = prof[i - 1];
    if (x <= x1) return s0 + ((s1 - s0) * (x - x0)) / (x1 - x0);
  }
  return prof[prof.length - 1][1];
}

export function createJar(P, level) {
  const theta = (level.jar?.initialAngle ?? P.jar.initialAngle) * D;
  return {
    x: level.hand.startX,
    y: level.hand.y,
    baseY: level.hand.y,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    theta,
    omega: 0,
    alpha: 0,
    act: 0,
    held: false,
    fill: 1, // share of a full jar, kept current by the game from the grains
    flow: 0, // measured mass per second leaving the jar
  };
}

// travel=false keeps the hand in place (behind the result card).
export function stepJar(jar, dt, held, P, level, travel = true) {
  const J = P.jar;
  jar.held = held;
  const tau = Math.max(1e-3, held ? J.muscleAttack : J.muscleRelease);
  jar.act += ((held ? 1 : 0) - jar.act) * (1 - Math.exp(-dt / tau));

  const fill = clamp(jar.fill, 0, 1);
  const I = J.jarInertia + J.contentInertia * fill;
  const m = J.jarMass + J.contentMass * fill;
  const tip = J.tipBias + (1 - J.tipBias) * Math.sin(clamp(jar.theta, 0, Math.PI));
  const torque =
    J.gravityTorque * m * tip -
    J.liftTorque * jar.act -
    J.damping * jar.omega -
    J.dragQuad * jar.omega * Math.abs(jar.omega);
  const prevOmega = jar.omega;
  jar.omega += (torque / I) * dt;
  jar.theta += jar.omega * dt;

  const lo = J.minAngle * D;
  const hi = J.maxAngle * D;
  if (jar.theta < lo) {
    jar.theta = lo;
    if (jar.omega < 0) jar.omega = -jar.omega * J.limitBounce;
  } else if (jar.theta > hi) {
    jar.theta = hi;
    if (jar.omega > 0) jar.omega = -jar.omega * J.limitBounce;
  }
  jar.alpha = (jar.omega - prevOmega) / dt;

  // Hand travel. Optional coupling: holding also raises the hand.
  const speed = travel ? speedAt(level, jar.x) : 0;
  jar.ax = (speed - jar.vx) / dt;
  jar.vx = speed;
  jar.x += speed * dt;
  const targetY = jar.baseY + (level.hand.heightCoupling || 0) * jar.act;
  const ny = jar.y + (targetY - jar.y) * (1 - Math.exp(-dt / 0.12));
  const vy = (ny - jar.y) / dt;
  jar.ay = (vy - jar.vy) / dt;
  jar.vy = vy;
  jar.y = ny;
}

// ---- pour-start estimate (gauge, readouts, autopilot) ----------------------
// Tilt at which a level surface through the pouring lip would just hold the
// grains' volume, plus an allowance for the pile's angle of repose. Only an
// estimate: the real onset comes from the simulated pile.
const h = (p, tilt) => p[1] * Math.cos(tilt) - p[0] * Math.sin(tilt);

function clipBelow(poly, tilt, level) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ha = h(a, tilt) - level;
    const hb = h(b, tilt) - level;
    if (ha <= 0) out.push(a);
    if ((ha < 0 && hb > 0) || (ha > 0 && hb < 0)) {
      const t = ha / (ha - hb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

export function pourStartEstimate(shape, grainArea, friction) {
  const rect = [
    [-shape.ihw, shape.ibottom],
    [shape.ihw, shape.ibottom],
    [shape.ihw, shape.itop],
    [-shape.ihw, shape.itop],
  ];
  const target = grainArea / 0.84; // loose random packing
  if (target <= 0.01) return 180;
  const lip = [shape.nhw, shape.itop];
  let lo = 0;
  let hi = Math.PI;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (area(clipBelow(rect, mid, h(lip, mid))) > target) lo = mid;
    else hi = mid;
  }
  return Math.min(180, lo / D + 2 * Math.atan(friction) / D);
}
