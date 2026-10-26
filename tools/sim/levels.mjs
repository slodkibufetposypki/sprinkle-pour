// Prints what every level from FROM to TO brings: board, kinds, ways of playing, grains, difficulty.
//   node zen-grain/tools/sim/levels.mjs 10 60
import { GS } from './load.mjs';
const [from = 10, to = 60] = process.argv.slice(2).map(Number);
for (let i = from; i < to; i++) {
  const L = GS.levelFor(i), B = GS.boardOf(i);
  const board = L.piles.filter((p) => !p.jar && p.type !== 'stone').reduce((n, p) => n + p.count, 0);
  const jar = L.piles.filter((p) => p.jar).reduce((n, p) => n + p.count, 0);
  const stones = L.piles.filter((p) => p.type === 'stone').reduce((n, p) => n + p.count, 0);
  const f = [L.manual && 'carry', L.shuffle && (L.shuffle === 'moved' ? 'piles-moved' : 'piles'), L.order === 'any' && 'any-order', L.jar && `jar(${(L.jar.order || []).length} scoops/${L.jar.every}s)`, L.tilt && `tilt ${L.tilt}`].filter(Boolean).join(' ');
  console.log(String(i + 1).padStart(3), B.id.padEnd(7), (L.news ? '*' + L.news : '').padEnd(10), L.types.join('+').padEnd(24), f.padEnd(38), `board ${board} jar ${jar} st ${stones}`.padEnd(24), 'd ' + L.difficulty.toFixed(2), L.rule ? '| ' + L.rule : '');
}
