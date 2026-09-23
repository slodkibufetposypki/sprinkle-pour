// Autopilot: a simple predictive player. Used by the panel's Autopilot toggle
// (watch a level play itself with the current tuning) and by tools/bot.mjs
// (headless level checks). Like a player, it rides just under the estimated
// pour threshold while a cake that still needs sprinkles approaches, tilts in
// over it, backs off over gaps, and lifts when the stream gets too heavy.
import { D, toWorld } from './jar.js';

export function botHold(game, { depth = 30, edge = -2, safe = 14, lead = 0.12, margin = 1, approach = 0.7, flowCap = 90 } = {}) {
  if (game.state === 'ready') return true; // press to start
  const { jar, P, shape } = game;
  const [mx, my] = toWorld(jar, shape.ihw - 0.3, shape.top);
  const vx = jar.vx + 8; // grains leave the lip moving a little faster than the hand
  let mode = -safe;
  for (const c of game.cakes) {
    const tg = c.target;
    if (tg.received >= tg.required * 1.08) continue;
    const drop = Math.max(0.5, my - (c.pos.y + c.top));
    const t = Math.sqrt((2 * drop) / P.world.gravity);
    const lx = mx + (vx - c.vel.x) * t; // landing x in the cake's moving frame
    const x0 = c.pos.x + tg.x0 + margin;
    const x1 = c.pos.x + tg.x1 - margin;
    if (lx >= x0 && lx <= x1) mode = Math.max(mode, depth);
    else if (lx < x0 && lx > x0 - (vx - c.vel.x) * approach) mode = Math.max(mode, -edge);
  }
  // Like a player watching the stream: lift when it gets heavier than wanted.
  const cap = mode > 0 ? flowCap : 4;
  return jar.flow > cap || jar.theta / D + (jar.omega / D) * lead > game.pourStart + mode;
}
