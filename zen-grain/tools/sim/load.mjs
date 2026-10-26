// Loads the simulation block from game.html into a bare VM, the same way the tests do.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../../game.html', import.meta.url), 'utf8');
const m = html.match(/\/\/ ===== GRAIN-SIM BEGIN =====([\s\S]*?)\/\/ ===== GRAIN-SIM END =====/);
const ctx = vm.createContext({ Math: Object.assign(Object.create(Math), { random() { throw new Error('Math.random used in sim'); } }) });
vm.runInContext(m[1] + '\nthis.GrainSim = GrainSim;', ctx);
export const GS = ctx.GrainSim;
export const LAYOUT = { H: 1300, top: 150, bottom: 6 };
