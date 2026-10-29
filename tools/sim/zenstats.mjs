// A zen run played by the bot, with a count of what happened and when: how the game feels, in numbers.
//   node tools/sim/zenstats.mjs [bot skill, default 5] [seconds, default 900] [seed]
import { GS, LAYOUT } from './load.mjs';
const skill = +(process.argv[2] || 5), secs = +(process.argv[3] || 900), seed = +(process.argv[4] || 7);
const sim = GS.create({}, GS.ZEN, LAYOUT, seed), bot = GS.makeBot(sim, skill);
const count = {}, at = {}, gaps = [];
let lastJar = null, crowdMax = 0, crowdSum = 0, n = 0, loose = 0;
for (let i = 0; i < secs * 120 && !sim.done; i++) {
  sim.step(bot());
  for (const e of sim.drainEvents()) {
    count[e.type] = (count[e.type] || 0) + 1;
    (at[e.type] = at[e.type] || []).push(Math.round(sim.clock));
    if (e.type === 'jar') { if (lastJar != null) gaps.push(sim.clock - lastJar); lastJar = sim.clock; }
  }
  if (i % 120 === 0) { crowdMax = Math.max(crowdMax, sim.crowd); crowdSum += sim.crowd; n++; }
}
const keys = ['jar', 'row_taken', 'break', 'life_lost', 'pile_packed', 'capybara', 'stage', 'new_kind', 'zone', 'stone_sunk', 'order', 'order_done', 'order_failed', 'flow', 'gold', 'gold_caught', 'gold_escaped', 'ember_burst', 'zen_over'];
console.log('bot', skill, 'seed', seed, '| lasted', Math.round(sim.clock), 's | score', sim.score, '| bowls', sim.bowls, '| lives', sim.lives, sim.done ? '(over: ' + sim.result.why + ')' : '');
for (const k of keys) console.log(k.padEnd(13), String(count[k] || 0).padStart(4), (at[k] || []).slice(0, 14).join(' '));
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
for (const [a, b] of [[0, 120], [120, 300], [300, 600], [600, 900], [900, 1800]]) {
  const g = []; let t = null;
  for (const s of at.jar || []) { if (s >= a && s < b && t != null && t >= a) g.push(s - t); t = s; }
  if (g.length) console.log('jar every', a + '-' + b + 's', avg(g).toFixed(1) + 's');
}
console.log('board fill avg', (100 * crowdSum / Math.max(1, n)).toFixed(0) + '%', 'max', (100 * crowdMax).toFixed(0) + '%', '| caps', JSON.stringify(sim.caps));
