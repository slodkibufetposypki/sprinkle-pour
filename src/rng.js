// Small seeded RNG so a run can be replayed exactly (debug "fixed seed").
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + (b - a) * next();
  next.sym = (a) => (next() * 2 - 1) * a;
  next.int = (n) => Math.floor(next() * n);
  return next;
}
