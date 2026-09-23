// Headless level check: plays every level with a simple predictive bot and
// with "never hold" / "always hold" baselines. Use it after changing physics
// defaults or level data to confirm levels are still completable and stable.
//
//   node tools/bot.mjs            all levels, 3 seeds
//   node tools/bot.mjs 7 10       only levels 7 and 10
import { LEVELS } from '../src/levels.js';
import { DEFAULT_PARAMS, clone } from '../src/params.js';
import { Game } from '../src/game.js';
import { botHold } from '../src/bot.js';

function run(level, seed, policy) {
  const P = clone(DEFAULT_PARAMS);
  const g = new Game(P).load(level, seed);
  const dt = 1 / P.world.physicsHz;
  let steps = 0;
  let maxFlying = 0;
  const t0 = performance.now();
  while (g.state !== 'result' && steps < 240 * 60) {
    g.step(dt, policy(g));
    maxFlying = Math.max(maxFlying, g.particles.length);
    steps++;
    for (const p of g.particles) {
      if (!Number.isFinite(p.x + p.y + p.vx + p.vy)) throw new Error(`NaN particle in level ${level.id}`);
    }
    if (!Number.isFinite(g.jar.theta)) throw new Error(`NaN jar in level ${level.id}`);
  }
  const ms = (performance.now() - t0) / steps;
  return { r: g.result, time: g.t, maxFlying, ms, stuck: g.stuck.length };
}

const pct = (v) => `${Math.round(v * 100)}%`.padStart(4);
const only = process.argv.slice(2).map(Number);
const levels = only.length ? LEVELS.filter((l) => only.includes(l.id)) : LEVELS;

for (const level of levels) {
  console.log(`\n#${level.id} ${level.name}`);
  for (const [label, policy] of [
    ['bot', (g) => botHold(g)],
    ['never hold', (g) => g.state === 'ready'], // one press to start, then hands off
    ['always hold', () => true],
  ]) {
    const seeds = label === 'bot' ? [1, 2, 3] : [1];
    for (const seed of seeds) {
      const { r, time, maxFlying, ms, stuck } = run(level, seed, policy);
      const cakes = r.cakes.map((c) => `${Math.round(c.received)}/${c.required}${c.met ? '✓' : '✗'} cov${pct(c.coverage)}`).join('  ');
      console.log(
        `  ${label.padEnd(11)} s${seed} ${'★'.repeat(r.stars).padEnd(3, '·')} waste${pct(r.waste)} left${pct(r.left)} bumps ${r.bumps}  ${cakes}  | ${time.toFixed(1)}s peak ${maxFlying} flying, ${stuck} settled, ${ms.toFixed(3)} ms/step`,
      );
    }
  }
}
