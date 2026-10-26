// Plays levels with the bot and prints how each went: cleared, stars, time against the clock, breaks, wrong piles,
// grains that fell off. node zen-grain/tools/sim/calibrate.mjs 10 60 [seeds]
import { GS, LAYOUT } from './load.mjs';
const [from = 10, to = 60, seeds = 2] = process.argv.slice(2).map(Number);
const ST = GS.ST;
for (let i = from; i < to; i++) {
  const L = GS.levelFor(i), out = [];
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
