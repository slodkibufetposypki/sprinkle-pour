// Level data. Everything a designer tweaks per level lives here; physics feel
// lives in params.js. Units: cm and cm/s. Cakes sit on the table (y = 0) with
// their left plate edge near `x`. `required` is in score-mass units
// (bead = 1, rod = 2, heart = 3, pearl = 8 by default).
//
// hand.speedProfile: optional [[x, speed], ...] for dynamic-speed levels.
// hand.heightCoupling: cm the hand rises while held (brief §37 experiment).

// The retail "house" look: small pearls, sugar rods and sequins/hearts.
// Big pearls arrive in level 7, as the brief's progression asks.
const HOUSE_MIX = { bead: 200, rod: 40, heart: 14 };

export const LEVELS = [
  {
    id: 0,
    name: 'Sandbox',
    blurb: 'Free pour with every piece type. Tune anything.',
    hand: { speed: 14, y: 30, startX: -16, heightCoupling: 0 },
    mix: { bead: 160, rod: 30, heart: 12, pearl: 6 },
    cakes: [
      { kind: 'sheet', x: 0, w: 44, h: 8, required: 60 },
      { kind: 'cupcake', x: 62, w: 13, h: 11, required: 20, frost: 'mint' },
      { kind: 'dome', x: 90, w: 22, h: 10, required: 20 },
      { kind: 'donut', x: 128, w: 13, h: 5, required: 10 },
    ],
    allowedWaste: 0.5,
  },
  {
    id: 1,
    name: 'Big Sheet Cake',
    blurb: 'Learn to pour. Lots of room.',
    hint: 'Hold to lift',
    hand: { speed: 14, y: 30, startX: -19 },
    mix: HOUSE_MIX,
    cakes: [{ kind: 'sheet', x: 0, w: 80, h: 7, required: 100 }],
    allowedWaste: 0.4,
  },
  {
    id: 2,
    name: 'Layer Cake',
    blurb: 'Smaller target, same jar.',
    hand: { speed: 14, y: 30, startX: -11 },
    mix: { bead: 190, rod: 36, heart: 12 },
    cakes: [{ kind: 'round', x: 8, w: 38, h: 12, required: 110, frost: 'white', drip: 'pink' }],
    allowedWaste: 0.35,
  },
  {
    id: 3,
    name: 'One Cupcake',
    blurb: 'A small target passes quickly.',
    hand: { speed: 13, y: 30, startX: -7 },
    mix: { bead: 170, rod: 34, heart: 12 },
    cakes: [{ kind: 'cupcake', x: 12, w: 13, h: 11, required: 28 }],
    allowedWaste: 0.55,
  },
  {
    id: 4,
    name: 'Two Cupcakes',
    blurb: 'Pour, catch, pour again.',
    hand: { speed: 14, y: 30, startX: -9 },
    mix: { bead: 170, rod: 34, heart: 12 },
    cakes: [
      { kind: 'cupcake', x: 10, w: 13, h: 11, required: 26 },
      { kind: 'cupcake', x: 55, w: 13, h: 11, required: 26, frost: 'mint' },
    ],
    allowedWaste: 0.5,
  },
  {
    id: 5,
    name: 'Three Cupcakes',
    blurb: 'Not a full jar. Make it last.',
    hand: { speed: 14, y: 30, startX: -9 },
    mix: { bead: 150, rod: 30, heart: 10 },
    cakes: [
      { kind: 'cupcake', x: 10, w: 13, h: 11, required: 20 },
      { kind: 'cupcake', x: 44, w: 13, h: 11, required: 20, frost: 'lilac' },
      { kind: 'cupcake', x: 78, w: 13, h: 11, required: 20, frost: 'mint' },
    ],
    allowedWaste: 0.3,
  },
  {
    id: 6,
    name: 'Mind the Gap',
    blurb: 'Stop the stream over the table.',
    hand: { speed: 15, y: 30, startX: -11 },
    mix: { bead: 190, rod: 36, heart: 12 },
    cakes: [
      { kind: 'sheet', x: 8, w: 28, h: 8, required: 68, filling: 'mint' },
      { kind: 'sheet', x: 78, w: 28, h: 8, required: 68, frost: 'pink', filling: 'lemon' },
    ],
    allowedWaste: 0.3,
  },
  {
    id: 7,
    name: 'Big Pearls',
    blurb: 'Big pieces leave late and bounce.',
    hand: { speed: 14, y: 30, startX: -11 },
    mix: { bead: 130, rod: 20, heart: 6, pearl: 12 },
    cakes: [{ kind: 'round', x: 8, w: 42, h: 11, required: 100, frost: 'lemon', drip: 'choc' }],
    allowedWaste: 0.35,
  },
  {
    id: 8,
    name: 'Bundt',
    blurb: 'The hole in the middle eats sprinkles.',
    hand: { speed: 13, y: 30, startX: -9 },
    mix: { bead: 170, rod: 40, heart: 10 },
    cakes: [{ kind: 'bundt', x: 10, w: 42, h: 11, hole: 11, required: 58, sidesValid: true }],
    allowedWaste: 0.4,
  },
  {
    id: 9,
    name: 'Conveyor',
    blurb: 'The cupcakes move too.',
    hand: { speed: 15, y: 30, startX: -9 },
    mix: { bead: 170, rod: 34, heart: 12 },
    conveyor: true,
    // One cupcake drifts away (hand catches up slowly), then one comes to meet
    // the hand (passes fast), with ~2 s between them.
    cakes: [
      { kind: 'cupcake', x: 10, w: 13, h: 11, required: 30, vx: 6, frost: 'lilac' },
      { kind: 'cupcake', x: 104, w: 13, h: 11, required: 26, vx: -4, frost: 'mint' },
    ],
    allowedWaste: 0.5,
  },
  {
    id: 10,
    name: 'Tall Tiers',
    blurb: 'Tip too deep and the jar hits the cake.',
    hand: { speed: 13, y: 30, startX: -9 },
    mix: { bead: 170, rod: 24, heart: 8, pearl: 6 },
    cakes: [{ kind: 'tiered', x: 10, w: 44, h: 24, h1: 12.5, w2: 26, required: 100, drip: 'pink' }],
    allowedWaste: 0.4,
  },
];

// Where the hand has just passed every cake (moving cakes included). Past
// this point nothing poured can land on a cake, so the level ends. The game
// also checks this live, in case a bumped cake slid along the table.
export const END_MARGIN = 3;

export function levelEndX(level) {
  if (level.endX != null) return level.endX;
  const { speed, startX } = level.hand;
  let x = startX;
  for (const c of level.cakes) {
    const right = c.x + c.w + END_MARGIN;
    const vx = c.vx || 0;
    const t = speed > vx ? Math.max(0, (right - startX) / (speed - vx)) : 0;
    x = Math.max(x, startX + speed * t);
  }
  return x;
}
