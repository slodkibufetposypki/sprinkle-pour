// Plays levels with the bot and prints how each went: cleared, stars, time against the clock, breaks, wrong piles,
// grains that fell off. node zen-grain/tools/sim/calibrate.mjs 10 60 [seeds] [--clean]
// --clean: wrong grains never creep in, so no row breaks; stands in for a player who never lets one in, to see
// whether the stars a level asks for can be reached at all.
import { GS, LAYOUT } from './load.mjs';
const args = process.argv.slice(2), clean = args.includes('--clean');
const [from = 10, to = 60, seeds = 2] = args.filter((a) => !a.startsWith('--')).map(Number);
const ST = GS.ST;
for (let i = from; i < to; i++) {
  const L0 = GS.levelFor(i), out = [];
  const L = clean ? Object.assign({}, L0, { tune: Object.assign({}, L0.tune, { creepSpeed: 0 }) }) : L0;
  for (let seed = 1; seed <= seeds; seed++) {
    const sim = GS.create({}, L, LAYOUT, seed), bot = GS.makeBot(sim, seed * 13 + 1);
    const max = 900 * sim.cfg.stepHz;
    let k = 0;
    for (; k < max && !(sim.done && sim.sticks.phase === 'away'); k++) { sim.step(bot()); sim.drainEvents(); }
    const r = sim.result;
    out.push(sim.done ? `${r.stars}★ ${Math.round(r.time)}/${r.par}s b${r.breaks} s${sim.stats.spills} l${sim.stats.lost}` : `STUCK ${Math.round(sim.clock)}s left ${sim.remaining()} jar ${sim.inJar()} ph ${sim.sticks.phase}`);
  }
  const f = [L.manual && 'carry', L.order === 'any' && 'any', L.jar && 'jar', L.tilt && 'tilt'].filter(Boolean).join('+');
  console.log(String(i + 1).padStart(3), (L.news || '').padEnd(9), L.types.join('+').padEnd(24), f.padEnd(18), out.join(' | '));
}
