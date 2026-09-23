// Every tuning value lives here. Units: cm, seconds, degrees (converted to
// radians inside the sim). The tuning panel is generated from SCHEMA, so a new
// value only needs a default + one schema row to become a live slider.

export const TYPE_IDS = ['bead', 'rod', 'heart', 'pearl'];
export const TYPE_LABELS = {
  bead: 'Micro beads',
  rod: 'Sugar rods',
  heart: 'Sequins & hearts',
  pearl: 'Big pearls',
};
export const MATERIAL_IDS = ['buttercream', 'fondant', 'glaze', 'sponge', 'plate', 'table'];

export const DEFAULT_PARAMS = {
  jar: {
    gravityTorque: 16, // tipping torque at 90° per unit mass
    tipBias: 0.1, // share of tipping torque present even when upright
    liftTorque: 80, // hand torque while the screen is held
    damping: 2, // linear wrist damping
    dragQuad: 4, // speed-squared damping: caps how fast the jar can swing
    jarMass: 1,
    contentMass: 1.3, // extra mass when full: full jars tip harder
    jarInertia: 1,
    contentInertia: 1, // extra inertia when full: full jars are slower to catch
    muscleAttack: 0.05, // s for the grip to reach full strength after press
    muscleRelease: 0.08, // s for the grip to relax after release
    minAngle: -12,
    maxAngle: 165,
    limitBounce: 0.25,
    initialAngle: 6,
    dangerAngle: 105, // subtle buzz when tipping past this
    capacity: 300, // mass units that make a full jar (sets the tipping weight)
  },
  shape: {
    width: 7.6, // outer jar width (squat retail jar)
    height: 8.3, // outer height to the rim of the open, threaded neck
    pivot: 2.8, // wrist pivot height above the jar bottom
  },
  grains: {
    friction: 0.3, // grain-on-grain Coulomb friction: sets the angle of repose
    wallFriction: 0.3, // grain-on-glass friction
    iterations: 3, // contact solver passes per physics step
    stacking: 0.3, // mass scaling by height: firmer deep piles (too high = pile won't flow)
    damping: 0.3, // velocity damping inside the jar
    sizeVariation: 0.2, // ± share of radius per grain; breaks up crystal packing
    tremor: 0, // random jiggle (cm/s²) from a never-quite-still hand
  },
  world: {
    gravity: 700, // cm/s² (real is 981; lower reads better)
    timeScale: 1,
    adhesionRate: 30, // how fast sticky surfaces kill particle velocity
    settleSpeed: 4, // below this a resting particle freezes
    stickySettleSpeed: 22, // extra settle speed on fully sticky frosting
    settleTime: 0.06,
    restTime: 0.35, // time to freeze on non-sticky surfaces
    jarBounce: 0.3, // jar restitution against cakes
    cakePush: 0.6, // how much a jar bump shoves the cake
    physicsHz: 240,
  },
  types: {
    bead: { radius: 0.2, mass: 1, bounce: 0.25, friction: 0.6, stick: 0.9, drag: 0.3, gravityScale: 1 },
    rod: { radius: 0.22, mass: 2, bounce: 0.2, friction: 0.7, stick: 0.75, drag: 0.5, gravityScale: 1 },
    heart: { radius: 0.4, mass: 3, bounce: 0.1, friction: 0.8, stick: 0.8, drag: 3.2, gravityScale: 0.85 },
    pearl: { radius: 0.62, mass: 8, bounce: 0.5, friction: 0.15, stick: 0.25, drag: 0.05, gravityScale: 1 },
  },
  materials: {
    buttercream: { friction: 0.9, bounce: 0.15, stick: 1 },
    fondant: { friction: 0.35, bounce: 0.35, stick: 0.3 },
    glaze: { friction: 0.3, bounce: 0.2, stick: 0.8 },
    sponge: { friction: 0.7, bounce: 0.25, stick: 0.15 },
    plate: { friction: 0.3, bounce: 0.5, stick: 0 },
    table: { friction: 0.5, bounce: 0.35, stick: 0 },
  },
};

// [path, label, min, max, step, unit, help]
const JAR_ROWS = [
  ['jar.gravityTorque', 'Tip torque', 2, 40, 0.5, '', 'How hard the jar wants to tip forward (peaks at 90°).'],
  ['jar.tipBias', 'Upright tip bias', 0, 0.5, 0.01, '', 'Share of tip torque present even when upright.'],
  ['jar.liftTorque', 'Lift torque', 10, 200, 1, '', 'Hand torque while held. Must beat tip torque, not by too much.'],
  ['jar.damping', 'Wrist damping', 0, 12, 0.1, '', 'Linear damping on the jar rotation.'],
  ['jar.dragQuad', 'Speed drag', 0, 12, 0.1, '', 'Speed² damping: limits swing speed, so less overshoot.'],
  ['jar.muscleAttack', 'Grip reaction', 0.005, 0.3, 0.005, 's', 'Delay before the hand pulls at full strength.'],
  ['jar.muscleRelease', 'Grip relax', 0.005, 0.3, 0.005, 's', 'Delay before the hand fully lets go.'],
  ['jar.jarInertia', 'Jar inertia', 0.2, 4, 0.05, '', ''],
  ['jar.contentInertia', 'Contents inertia', 0, 4, 0.05, '', 'Added inertia when the jar is full.'],
  ['jar.jarMass', 'Jar mass', 0.2, 4, 0.05, '', ''],
  ['jar.contentMass', 'Contents mass', 0, 4, 0.05, '', 'Added tipping mass when full.'],
  ['jar.minAngle', 'Lift-back limit', -40, 10, 1, '°', ''],
  ['jar.maxAngle', 'Max tilt', 100, 180, 1, '°', ''],
  ['jar.limitBounce', 'Limit bounce', 0, 0.9, 0.01, '', ''],
  ['jar.initialAngle', 'Start angle', -10, 60, 1, '°', ''],
  ['jar.dangerAngle', 'Danger buzz angle', 60, 170, 1, '°', 'Subtle haptic when tipping past this.'],
  ['jar.capacity', 'Full-jar mass', 50, 800, 5, '', 'Contents mass that counts as a full jar for the tipping weight.'],
];
const SHAPE_ROWS = [
  ['shape.width', 'Jar width', 4, 10, 0.1, 'cm', ''],
  ['shape.height', 'Jar height', 6, 16, 0.1, 'cm', 'Shorter jar = fuller = pours at a smaller tilt.'],
  ['shape.pivot', 'Wrist height on jar', 0.5, 6, 0.1, 'cm', 'Low pivot = the mouth swings down harder on deep tilts.'],
];
const GRAIN_ROWS = [
  ['grains.friction', 'Grain friction', 0, 1.2, 0.01, '', 'Angle of repose: higher holds longer, then avalanches.'],
  ['grains.wallFriction', 'Glass friction', 0, 1.2, 0.01, '', ''],
  ['grains.sizeVariation', 'Size variation', 0, 0.45, 0.01, '±', 'Mixed sizes flow like sugar; equal sizes lock up.'],
  ['grains.damping', 'Damping in jar', 0, 6, 0.05, '/s', ''],
  ['grains.iterations', 'Solver passes', 1, 8, 1, '', 'More = firmer piles, more CPU.'],
  ['grains.stacking', 'Pile firmness', 0, 2, 0.05, '', 'Mass scaling by height. Too high and the pile will not flow.'],
  ['grains.tremor', 'Hand tremor', 0, 1500, 10, 'cm/s²', 'Random jiggle: loosens stuck grains and stubborn pearls.'],
];
const WORLD_ROWS = [
  ['world.gravity', 'Gravity', 100, 1500, 10, 'cm/s²', ''],
  ['world.timeScale', 'Time scale', 0.05, 2, 0.05, '×', ''],
  ['world.adhesionRate', 'Frosting grab', 0, 120, 1, '/s', 'How fast sticky surfaces stop particles.'],
  ['world.settleSpeed', 'Settle speed', 0.5, 20, 0.5, 'cm/s', ''],
  ['world.stickySettleSpeed', 'Sticky settle bonus', 0, 80, 1, 'cm/s', ''],
  ['world.settleTime', 'Settle time (sticky)', 0.01, 0.5, 0.01, 's', ''],
  ['world.restTime', 'Settle time (slick)', 0.05, 2, 0.05, 's', ''],
  ['world.jarBounce', 'Jar bounce off cake', 0, 1, 0.01, '', ''],
  ['world.cakePush', 'Cake shove', 0, 2, 0.05, '', ''],
  ['world.physicsHz', 'Physics rate', 60, 480, 30, 'Hz', 'Grains solve at this rate too. Lower it if a phone struggles.'],
];
const TYPE_ROWS = (t) => [
  [`types.${t}.radius`, 'Radius', 0.1, 1.2, 0.01, 'cm', 'Applies on restart (grains are packed at level start).'],
  [`types.${t}.mass`, 'Score mass', 0.25, 20, 0.25, '', 'Scoring and flow weight of one piece.'],
  [`types.${t}.bounce`, 'Bounce', 0, 1, 0.01, '', ''],
  [`types.${t}.friction`, 'Grip', 0, 1.5, 0.01, '', 'Low = rolls and slides.'],
  [`types.${t}.stick`, 'Stickiness', 0, 1, 0.01, '', ''],
  [`types.${t}.drag`, 'Air drag', 0, 8, 0.05, '/s', 'High = floaty.'],
  [`types.${t}.gravityScale`, 'Gravity scale (falling)', 0.2, 2, 0.01, '×', ''],
];
const MAT_ROWS = (m) => [
  [`materials.${m}.friction`, 'Grip', 0, 1.5, 0.01, '', ''],
  [`materials.${m}.bounce`, 'Bounce', 0, 1, 0.01, '', ''],
  [`materials.${m}.stick`, 'Stickiness', 0, 1, 0.01, '', ''],
];

const cap = (s) => s[0].toUpperCase() + s.slice(1);
export const SCHEMA = [
  { id: 'jar', title: 'Jar feel', open: true, rows: JAR_ROWS },
  { id: 'grains', title: 'Grains in the jar', open: true, rows: GRAIN_ROWS },
  { id: 'shape', title: 'Jar shape', restart: true, rows: SHAPE_ROWS },
  { id: 'world', title: 'World', rows: WORLD_ROWS },
  ...TYPE_IDS.map((t) => ({ id: `type-${t}`, title: TYPE_LABELS[t], rows: TYPE_ROWS(t) })),
  ...MATERIAL_IDS.map((m) => ({ id: `mat-${m}`, title: `Surface: ${cap(m)}`, rows: MAT_ROWS(m) })),
];

// Partial overrides layered on top of the defaults.
export const PRESETS = {
  Default: {},
  'Heavy & lazy': {
    jar: { gravityTorque: 12, liftTorque: 55, contentMass: 2, contentInertia: 1.8, muscleAttack: 0.09, dragQuad: 3 },
  },
  Twitchy: {
    jar: { gravityTorque: 22, liftTorque: 120, muscleAttack: 0.02, muscleRelease: 0.03, dragQuad: 2, damping: 1 },
  },
  'Slippery sugar': {
    grains: { friction: 0.12, wallFriction: 0.1 },
  },
  'Clumpy & stubborn': {
    grains: { friction: 0.7, wallFriction: 0.5 },
  },
  'Tall narrow jar': {
    shape: { width: 6, height: 10 },
  },
  'Floaty sprinkles': {
    world: { gravity: 420 },
    types: { bead: { drag: 1.2 }, heart: { drag: 5 } },
  },
};

export function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function deepMerge(target, src) {
  for (const k of Object.keys(src || {})) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== 'object') target[k] = {};
      deepMerge(target[k], v);
    } else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
      target[k] = v;
    }
  }
  return target;
}

export function getPath(o, path) {
  return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
}

export function setPath(o, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((a, k) => a[k], o);
  parent[last] = value;
}

// Only the values that differ from the defaults: what "Copy JSON" exports.
export function diffFromDefaults(p, d = DEFAULT_PARAMS) {
  const out = {};
  for (const k of Object.keys(d)) {
    if (d[k] && typeof d[k] === 'object') {
      const sub = diffFromDefaults(p[k] || {}, d[k]);
      if (Object.keys(sub).length) out[k] = sub;
    } else if (p[k] !== d[k]) out[k] = p[k];
  }
  return out;
}
