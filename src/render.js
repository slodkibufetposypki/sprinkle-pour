// Canvas renderer. World units are cm with y up; the renderer owns the camera.
// Cakes, table and jar draw in a world transform; particles draw in screen
// space from cached sprites so thousands stay cheap.
import { D, toWorld } from './jar.js';
import { TYPE_IDS } from './params.js';

// Sweet Buffet style mix: pastel pink, mint/teal, lilac, cream and white,
// with metallic gold. Eight looks per piece type; a piece keeps its look
// from the jar to the cake. `metal` = shiny gold, `disc` = flat sequin,
// `heart` = sugar heart.
const V = (base, extra = {}) => ({ base, ...extra });
export const LOOKS = {
  bead: [V('#F3B6C7'), V('#BFAEDD'), V('#8FD9CB'), V('#FBF8F3'), V('#F2E6CC'), V('#D9B45F', { metal: true }), V('#EFA0B7'), V('#6CCBBE')],
  rod: [V('#F2B3C4'), V('#86D5C7'), V('#BCA9DC'), V('#FAF6F0'), V('#63C4B7'), V('#F1E5CB'), V('#F6C9D5'), V('#AFA7C4')],
  heart: [
    V('#8ED8CB', { disc: true }),
    V('#ADA6C4', { disc: true }),
    V('#F2B3C4', { disc: true }),
    V('#F7F4EF', { disc: true }),
    V('#63C7BA', { disc: true }),
    V('#F3EAD3', { heart: true }),
    V('#F7F1E4', { heart: true }),
    V('#F0A9BD', { heart: true }),
  ],
  pearl: [V('#F1A8C4'), V('#F8F4EE'), V('#F1E6CF'), V('#C3B2E0'), V('#D9B45F', { metal: true }), V('#6FCABE'), V('#EBA0BE'), V('#E0BD6A', { metal: true })],
};

function shade(hex, k) {
  // k > 0 lightens toward white, k < 0 darkens toward plum
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const t = k > 0 ? [255, 255, 255] : [60, 30, 50];
  const f = Math.abs(k);
  return `rgb(${ch.map((c, i) => Math.round(c + (t[i] - c) * f)).join(',')})`;
}

// Sugar sparkle: tiny light and dark specks inside a clip path.
function specks(g, rnd, w, h, count, size) {
  for (let i = 0; i < count; i++) {
    const light = rnd() < 0.7;
    g.fillStyle = light ? 'rgba(255,255,255,0.75)' : 'rgba(90,60,80,0.18)';
    const r = size * (0.5 + rnd());
    g.beginPath();
    g.arc((rnd() - 0.5) * w, (rnd() - 0.5) * h, r, 0, Math.PI * 2);
    g.fill();
  }
}

function sphere(g, r, v) {
  const grd = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.05);
  if (v.metal) {
    grd.addColorStop(0, '#FFF6D2');
    grd.addColorStop(0.35, '#E9C877');
    grd.addColorStop(0.75, '#B48A3C');
    grd.addColorStop(1, '#7A5A22');
  } else {
    grd.addColorStop(0, shade(v.base, 0.55));
    grd.addColorStop(0.45, v.base);
    grd.addColorStop(1, shade(v.base, -0.28));
  }
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  if (!v.metal) {
    // pearlescent sheen: a faint lilac/mint wash on the shadow side
    const sheen = g.createRadialGradient(r * 0.45, r * 0.45, 0, r * 0.45, r * 0.45, r);
    sheen.addColorStop(0, 'rgba(200,230,255,0.22)');
    sheen.addColorStop(1, 'rgba(200,230,255,0)');
    g.fillStyle = sheen;
    g.fill();
  }
  g.fillStyle = v.metal ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.ellipse(-r * 0.36, -r * 0.42, r * (v.metal ? 0.26 : 0.22), r * (v.metal ? 0.16 : 0.14), -0.6, 0, Math.PI * 2);
  g.fill();
}

// The build script (tools/build-artifact.mjs) swaps this path for a data URI.
const LOGO_SRC = 'assets/sweet-buffet-logo.png';

const INK = '#2B1E2A';
const SKIN = '#EBC6AE';
const SKIN_LINE = '#C79880';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function heartPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.95);
  ctx.bezierCurveTo(-r * 1.25, r * 0.1, -r * 0.9, -r * 1.05, 0, -r * 0.45);
  ctx.bezierCurveTo(r * 0.9, -r * 1.05, r * 1.25, r * 0.1, 0, r * 0.95);
  ctx.closePath();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.s = 10;
    this.camX = 0;
    this.oy = 0;
    this.shake = 0;
    this.fx = [];
    this.spriteKey = '';
    this.sprites = null;
    this.stickerKey = '';
    this.logo = new Image();
    this.logo.decoding = 'async';
    this.logo.onload = () => (this.stickerKey = '');
    this.logo.src = LOGO_SRC;
  }

  resize(cssW, cssH) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = cssW;
    this.h = cssH;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    // Frame the useful band of the world (table to just above the hand)
    // in the space under the HUD. Wide screens show ~58 cm across; a portrait
    // phone zooms in to ~32 cm so the jar and sprinkles stay a readable size.
    const hud = 56;
    const yMin = -4;
    const yMax = 38;
    const avail = Math.max(1, cssH - hud);
    const band = yMax - yMin;
    const visW = Math.max(32, Math.min(58, (cssW / avail) * band * 1.25));
    // s0 = base zoom; `s` eases out from it to show the next cake (updateZoom).
    this.s0 = Math.max(4, Math.min(cssW / visW, avail / band));
    this.s = this.s0;
    this.oy = hud + yMax * this.s0 + (avail - band * this.s0) / 2;
    this.anchor = cssW < avail ? 0.14 : 0.3; // hand position across the screen
    this.spriteKey = '';
  }

  get viewW0() {
    return this.w / this.s0;
  }

  // Look-ahead: while the next cake is still beyond the base view, ease out
  // a little (at most 1.35×) so it comes into view about when the player has
  // to let go (~35–40 cm before the cake); back to the base zoom once it is
  // in view. Zooms around the table line so the cakes stay put vertically.
  // Wide screens already see far enough ahead and never zoom.
  updateZoom(game, dt, snap = false) {
    const hand = Math.min(game.jar.x, game.endX - 6);
    const left = hand - this.viewW0 * this.anchor;
    let front = Infinity;
    for (const c of game.cakes) {
      const f = c.pos.x + c.aabb[0];
      if (f > game.jar.x && f < front) front = f;
    }
    const need = front < Infinity ? front + 6 - left : 0;
    const width = Math.min(this.viewW0 * 1.35, Math.max(this.viewW0, need));
    const target = this.w / width;
    this.s = snap ? target : this.s + (target - this.s) * (1 - Math.exp(-dt * 2.2));
  }

  get viewW() {
    return this.w / this.s;
  }

  sx(x) {
    return (x - this.camX) * this.s;
  }

  sy(y) {
    return this.oy - y * this.s;
  }

  snapCamera(game) {
    this.updateZoom(game, 0, true);
    this.camX = this.cameraTarget(game);
  }

  cameraTarget(game) {
    const x = Math.min(game.jar.x, game.endX - 6);
    return x - this.viewW0 * (this.anchor ?? 0.3);
  }

  worldTransform(ox = 0, oy = 0) {
    const { dpr, s } = this;
    this.ctx.setTransform(dpr * s, 0, 0, -dpr * s, dpr * (-this.camX * s + ox), dpr * (this.oy + oy));
  }

  screenTransform(ox = 0, oy = 0) {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, this.dpr * ox, this.dpr * oy);
  }

  // ---- sprites --------------------------------------------------------------
  ensureSprites(P) {
    // Built at the base zoom and scaled while drawing, so zooming is free.
    const key = `${this.s0.toFixed(3)}|${this.dpr}|${TYPE_IDS.map((t) => P.types[t].radius).join(',')}`;
    if (key === this.spriteKey) return;
    this.spriteKey = key;
    const s = this.s0;
    const dpr = this.dpr;
    this.sprites = {};
    for (const t of TYPE_IDS) {
      const r = Math.max(1.3, P.types[t].radius * s);
      const ext = t === 'rod' ? r * 3.3 : r * 1.25;
      const size = Math.ceil((ext * 2 + 4) * dpr);
      this.sprites[t] = LOOKS[t].map((v, ci) => {
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, size / 2, size / 2);
        let seed = 17 + ci * 131 + t.length * 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        if (t === 'bead' || t === 'pearl') {
          sphere(g, r, v);
        } else if (t === 'rod') {
          // sugar-coated jimmy: rounded bar, lit top edge, glitter specks
          const L = r * 2.2;
          g.lineCap = 'round';
          g.strokeStyle = shade(v.base, -0.3);
          g.lineWidth = r * 2 + 0.8;
          g.beginPath();
          g.moveTo(-L, 0);
          g.lineTo(L, 0);
          g.stroke();
          g.strokeStyle = v.base;
          g.lineWidth = r * 2;
          g.stroke();
          g.strokeStyle = shade(v.base, 0.45);
          g.lineWidth = r * 0.7;
          g.beginPath();
          g.moveTo(-L * 0.85, -r * 0.45);
          g.lineTo(L * 0.85, -r * 0.45);
          g.stroke();
          g.save();
          g.beginPath();
          g.rect(-L - r, -r, (L + r) * 2, r * 2);
          g.clip();
          specks(g, rnd, L * 2, r * 1.6, 9, Math.max(0.35, r * 0.12));
          g.restore();
        } else if (v.disc) {
          // flat sequin: matte sugar face, darker rim, speckled
          g.fillStyle = shade(v.base, -0.25);
          g.beginPath();
          g.arc(0, 0, r, 0, Math.PI * 2);
          g.fill();
          const face = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
          face.addColorStop(0, shade(v.base, 0.35));
          face.addColorStop(1, v.base);
          g.fillStyle = face;
          g.beginPath();
          g.arc(0, 0, r * 0.86, 0, Math.PI * 2);
          g.fill();
          g.save();
          g.clip();
          specks(g, rnd, r * 2, r * 2, 14, Math.max(0.35, r * 0.07));
          g.restore();
        } else {
          // sugar heart
          heartPath(g, r);
          const face = g.createLinearGradient(0, -r, 0, r);
          face.addColorStop(0, shade(v.base, 0.4));
          face.addColorStop(1, shade(v.base, -0.12));
          g.fillStyle = face;
          g.fill();
          g.strokeStyle = shade(v.base, -0.3);
          g.lineWidth = Math.max(0.6, r * 0.08);
          g.stroke();
          g.save();
          g.clip();
          specks(g, rnd, r * 2, r * 2, 12, Math.max(0.35, r * 0.07));
          g.restore();
        }
        return { c, size: size / dpr };
      });
    }
  }

  // Round white sticker with the logo, pre-rendered at the current zoom.
  // Placed like the retail jar: big and centred on the body. The strips of
  // glass either side and above it still show the fill level.
  stickerFor(shape) {
    const r = Math.min(2.35, shape.ihw * 0.67);
    const cx = shape.ihw * 0.05;
    const cy = (shape.ibottom + shape.neckY - shape.shoulder) / 2;
    const key = `${this.s0.toFixed(3)}|${this.dpr}|${r}|${this.logo.complete && this.logo.naturalWidth > 0}`;
    if (key !== this.stickerKey) {
      this.stickerKey = key;
      const px = r * this.s0;
      const size = Math.ceil((px * 2 + 4) * this.dpr);
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      g.setTransform(this.dpr, 0, 0, this.dpr, size / 2, size / 2);
      g.beginPath();
      g.arc(0, 0, px, 0, Math.PI * 2);
      g.fillStyle = '#FFFFFF';
      g.fill();
      if (this.logo.complete && this.logo.naturalWidth > 0) {
        g.save();
        g.clip();
        const d = px * 2 * 1.04;
        g.drawImage(this.logo, -d / 2, -d / 2, d, d);
        g.restore();
      }
      // a thin edge and a soft sheen so it reads as a sticker on glass
      g.strokeStyle = 'rgba(120,90,110,0.25)';
      g.lineWidth = Math.max(0.6, px * 0.03);
      g.beginPath();
      g.arc(0, 0, px - g.lineWidth / 2, 0, Math.PI * 2);
      g.stroke();
      const sheen = g.createLinearGradient(-px, -px, px * 0.3, px * 0.3);
      sheen.addColorStop(0, 'rgba(255,255,255,0.35)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = sheen;
      g.beginPath();
      g.arc(0, 0, px, 0, Math.PI * 2);
      g.fill();
      this.sticker = { c, size: size / this.dpr };
    }
    return { ...this.sticker, cx, cy };
  }

  addFx(kind, x, y, extra = {}) {
    if (this.fx.length > 80) this.fx.shift();
    this.fx.push({ kind, x, y, t: 0, ...extra });
  }

  // ---- frame ------------------------------------------------------------------
  render(game, dt, opts) {
    const { ctx } = this;
    const P = game.P;
    this.ensureSprites(P);
    this.updateZoom(game, dt);
    this.zoomK = this.s / this.s0;
    const target = this.cameraTarget(game);
    this.camX += (target - this.camX) * (1 - Math.exp(-dt * 5));
    this.shake *= Math.exp(-dt * 14);
    const shx = (Math.random() - 0.5) * this.shake;
    const shy = (Math.random() - 0.5) * this.shake;

    this.screenTransform();
    this.drawBackdrop();
    this.worldTransform(shx, shy);
    this.drawTable(game);
    for (const c of game.cakes) this.drawCake(c, game);
    this.drawStuck(game, shx, shy);
    this.worldTransform(shx, shy);
    this.drawArmAndJar(game, 'back');
    this.drawGrains(game, shx, shy);
    this.worldTransform(shx, shy);
    this.drawArmAndJar(game, 'front');
    if (opts.gauge) this.drawGauge(game);
    this.drawParticles(game, shx, shy);
    this.drawFx(dt, shx, shy);
    if (opts.meters) this.drawMeters(game);
  }

  drawBackdrop() {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#EFDDE8');
    g.addColorStop(0.55, '#F8EEF1');
    g.addColorStop(1, '#FBF5F2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = ctx.createRadialGradient(w * 0.5, h * 0.05, 10, w * 0.5, h * 0.1, Math.max(w, h) * 0.7);
    r.addColorStop(0, 'rgba(255,255,255,0.75)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, w, h);
  }

  drawTable(game) {
    const { ctx } = this;
    const x0 = this.camX - 10;
    const x1 = this.camX + this.viewW + 10;
    const bottom = (this.oy - this.h) / this.s - 5;
    // Silicone baking mat on a counter: a light lip, then the counter face.
    const g = ctx.createLinearGradient(0, 0, 0, bottom);
    g.addColorStop(0, '#E8DADB');
    g.addColorStop(1, '#D6C3C6');
    ctx.fillStyle = g;
    ctx.fillRect(x0, bottom, x1 - x0, -bottom);
    ctx.fillStyle = '#F3EAE8';
    ctx.fillRect(x0, -1.3, x1 - x0, 1.3);
    ctx.fillStyle = 'rgba(120,80,100,0.18)';
    ctx.fillRect(x0, -1.36, x1 - x0, 0.08);
    // Centimetre ticks along the mat edge: the scale reference for everything.
    ctx.fillStyle = 'rgba(120,80,100,0.28)';
    for (let x = Math.floor(x0); x <= x1; x++) {
      const len = x % 10 === 0 ? 0.75 : x % 5 === 0 ? 0.5 : 0.25;
      ctx.fillRect(x - 0.03, -len, 0.06, len);
    }
    if (game.level.conveyor) {
      ctx.fillStyle = 'rgba(80,60,80,0.10)';
      ctx.fillRect(x0, -0.9, x1 - x0, 0.35);
    }
  }

  drawCake(c, game) {
    const { ctx } = this;
    const ox = c.pos.x;
    const oy = c.pos.y;
    ctx.save();
    ctx.translate(ox, oy);
    // soft contact shadow
    ctx.fillStyle = 'rgba(90,40,70,0.10)';
    ctx.beginPath();
    ctx.ellipse(c.spec.w / 2, 0.05, c.spec.w / 2 + 3.5, 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const v of c.visuals) {
      switch (v.op) {
        case 'plate': {
          const w = v.w;
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(-2.4, 0.8);
          ctx.lineTo(w + 2.4, 0.8);
          ctx.quadraticCurveTo(w + 2.2, 0.1, w + 1.2, 0);
          ctx.lineTo(-1.2, 0);
          ctx.quadraticCurveTo(-2.2, 0.1, -2.4, 0.8);
          ctx.fill();
          ctx.strokeStyle = '#E4D5DC';
          ctx.lineWidth = 0.1;
          ctx.stroke();
          break;
        }
        case 'poly': {
          ctx.fillStyle = v.fill;
          ctx.beginPath();
          v.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'line': {
          ctx.strokeStyle = v.color;
          ctx.lineWidth = v.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const oyv = v.offsetY || 0;
          ctx.beginPath();
          if (v.smooth && v.pts.length > 2) {
            ctx.moveTo(v.pts[0][0], v.pts[0][1] + oyv);
            for (let i = 1; i < v.pts.length - 1; i++) {
              const [x, y] = v.pts[i];
              const [nx, ny] = v.pts[i + 1];
              ctx.quadraticCurveTo(x, y + oyv, (x + nx) / 2, (y + ny) / 2 + oyv);
            }
            const last = v.pts[v.pts.length - 1];
            ctx.lineTo(last[0], last[1] + oyv);
          } else {
            v.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + oyv) : ctx.moveTo(x, y + oyv)));
          }
          ctx.stroke();
          break;
        }
        case 'layer': {
          ctx.fillStyle = v.color;
          ctx.fillRect(v.x0, v.y - v.width / 2, v.x1 - v.x0, v.width);
          break;
        }
        case 'dots': {
          ctx.fillStyle = v.color;
          const step = v.r * 2.3;
          for (let x = v.x0; x <= v.x1; x += step) {
            ctx.beginPath();
            ctx.arc(x, v.y, v.r, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
      }
    }
    for (const d of c.dents) {
      ctx.fillStyle = 'rgba(80,30,50,0.16)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSprite(t, ci, x, y, a, sx = 1, sy = 1, k = 1) {
    const spr = this.sprites[t][ci & 7];
    const { ctx } = this;
    const size = spr.size * k * (this.zoomK || 1);
    if (!a && sx === 1 && sy === 1) {
      ctx.drawImage(spr.c, x - size / 2, y - size / 2, size, size);
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    // Our angles are clockwise-positive in a y-up world; the canvas is y-down,
    // where clockwise is also positive, so the sign carries over.
    ctx.rotate(a);
    ctx.scale(sx, sy);
    ctx.drawImage(spr.c, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  drawStuck(game, ox, oy) {
    this.screenTransform(ox, oy);
    const P = game.P;
    const minX = this.camX - 3;
    const maxX = this.camX + this.viewW + 3;
    for (const st of game.stuck) {
      const wx = (st.body ? st.body.pos.x : 0) + st.lx;
      if (wx < minX || wx > maxX) continue;
      const wy = (st.body ? st.body.pos.y : 0) + st.ly;
      const r = st.r;
      const k = r / P.types[st.t].radius;
      // Big pieces sink a little into soft frosting.
      const sink = st.large ? st.sink * 0.35 * r : 0;
      const x = this.sx(wx);
      const y = this.sy(wy - sink);
      if (st.t === 'bead') this.drawSprite('bead', st.c, x, y, 0, 1, 1, k);
      else if (st.t === 'pearl') this.drawSprite('pearl', st.c, x, y, 0, 1 + st.sink * 0.1, 1 - st.sink * 0.1, k);
      else this.drawSprite(st.t, st.c, x, y, st.a, st.t === 'heart' ? Math.max(0.35, Math.abs(Math.cos(st.flip))) : 1, 1, k);
    }
  }

  drawParticles(game, ox, oy) {
    this.screenTransform(ox, oy);
    const P = game.P;
    for (const p of game.particles) {
      const x = this.sx(p.x);
      const y = this.sy(p.y);
      if (x < -20 || x > this.w + 20) continue;
      const k = p.r / P.types[p.t].radius;
      if (p.t === 'bead') this.drawSprite('bead', p.c, x, y, 0, 1, 1, k);
      else if (p.t === 'pearl') this.drawSprite('pearl', p.c, x, y, 0, 1 + p.squash, 1 - p.squash, k);
      else if (p.t === 'heart') {
        // flat pieces flutter while falling: the face turns edge-on and back
        const flip = p.hasContact ? Math.abs(Math.cos(p.flip)) : Math.cos(p.flip + p.age * 7);
        this.drawSprite('heart', p.c, x, y, p.a, Math.max(0.2, Math.abs(flip)), 1, k);
      } else this.drawSprite(p.t, p.c, x, y, p.a, 1, 1, k);
    }
  }

  // Every sprinkle still in the jar, drawn where the grain solver has it.
  drawGrains(game, ox, oy) {
    this.screenTransform(ox, oy);
    const g = game.grains;
    const jar = game.jar;
    const P = game.P;
    const c = Math.cos(jar.theta);
    const s = Math.sin(jar.theta);
    const T = ['bead', 'rod', 'heart', 'pearl'];
    for (let i = 0; i < g.n; i++) {
      const lx = g.x[i];
      const ly = g.y[i];
      const x = this.sx(jar.x + lx * c + ly * s);
      const y = this.sy(jar.y - lx * s + ly * c);
      const t = T[g.t[i]];
      const k = g.r[i] / P.types[t].radius;
      if (t === 'bead') this.drawSprite('bead', g.c[i], x, y, 0, 1, 1, k);
      else if (t === 'pearl') this.drawSprite('pearl', g.c[i], x, y, 0, 1, 1, k);
      else this.drawSprite(t, g.c[i], x, y, g.a[i] + jar.theta, t === 'heart' ? 0.75 : 1, 1, k);
    }
  }

  // Two passes around the grains: arm, palm and the back of the glass first;
  // then the glass front, lid and the fingers wrapped over it.
  drawArmAndJar(game, pass) {
    const { ctx } = this;
    const jar = game.jar;
    const S = game.shape;
    const { hw, bottom, top } = S;
    const grip = jar.act;
    if (pass === 'back') {
      const [wx, wy] = toWorld(jar, -hw - 1, -0.3);
      // Forearm from an off-screen shoulder; the shoulder shifts a little
      // with effort, so catches read as the hand working, not a sprite.
      const shX = jar.x - 21 + jar.act * 1.5;
      const shY = jar.y + 40 - jar.act * 1.2;
      const dx = wx - shX;
      const dy = wy - shY;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const wW = 1.5;
      const wS = 2.4;
      const cuff = 0.58;
      const lerp = (a, b, t) => a + (b - a) * t;
      const cx = lerp(shX, wx, cuff);
      const cy = lerp(shY, wy, cuff);
      const wc = lerp(wS, wW, cuff);
      ctx.fillStyle = SKIN;
      ctx.strokeStyle = SKIN_LINE;
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.moveTo(cx + nx * wc, cy + ny * wc);
      ctx.lineTo(wx + nx * wW, wy + ny * wW);
      ctx.lineTo(wx - nx * wW, wy - ny * wW);
      ctx.lineTo(cx - nx * wc, cy - ny * wc);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Chef's sleeve with a piped stripe.
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#E3D2DA';
      ctx.beginPath();
      ctx.moveTo(shX + nx * (wS + 0.5), shY + ny * (wS + 0.5));
      ctx.lineTo(cx + nx * (wc + 0.45), cy + ny * (wc + 0.45));
      ctx.lineTo(cx - nx * (wc + 0.45), cy - ny * (wc + 0.45));
      ctx.lineTo(shX - nx * (wS + 0.5), shY - ny * (wS + 0.5));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#F29BB6';
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      const sx2 = lerp(shX, wx, cuff - 0.05);
      const sy2 = lerp(shY, wy, cuff - 0.05);
      ctx.moveTo(sx2 + nx * (wc + 0.4), sy2 + ny * (wc + 0.4));
      ctx.lineTo(sx2 - nx * (wc + 0.4), sy2 - ny * (wc + 0.4));
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(jar.x, jar.y);
    ctx.rotate(-jar.theta); // y-up world: clockwise is negative here
    if (pass === 'back') {
      ctx.fillStyle = SKIN;
      ctx.strokeStyle = SKIN_LINE;
      ctx.lineWidth = 0.12;
      roundRect(ctx, -hw - 1.6, -2.3, 2.3, 4.6, 1);
      ctx.fill();
      ctx.stroke();
      // clear PET body behind the grains
      ctx.fillStyle = 'rgba(236,242,246,0.45)';
      jarPath(ctx, S);
      ctx.closePath();
      ctx.fill();
    } else {
      const nx = hw - S.inset;
      // clear body: outline, thick base, vertical light streaks
      ctx.strokeStyle = 'rgba(140,155,168,0.75)';
      ctx.lineWidth = 0.14;
      jarPath(ctx, S);
      ctx.stroke();
      ctx.fillStyle = 'rgba(214,224,232,0.55)';
      roundRect(ctx, -hw + 0.12, bottom + 0.06, hw * 2 - 0.24, S.base, 0.3);
      ctx.fill();
      const body = S.neckY - S.shoulder - bottom;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-hw + 0.35, bottom + 0.9, 0.38, body - 1.4);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(-hw + 0.95, bottom + 1.4, 0.14, body - 2.4);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(hw - 0.62, bottom + 1.2, 0.22, body - 2);

      // threaded neck where the lid would screw on, open at the rim
      ctx.fillStyle = 'rgba(226,233,239,0.6)';
      ctx.fillRect(-nx, S.neckY, nx * 2, top - S.neckY);
      ctx.strokeStyle = 'rgba(140,155,168,0.6)';
      ctx.lineWidth = 0.08;
      for (const ty of [0.2, 0.46]) {
        ctx.beginPath();
        ctx.moveTo(-nx, S.neckY + ty);
        ctx.lineTo(nx, S.neckY + ty + 0.14);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 0.07;
      for (const ty of [0.28, 0.54]) {
        ctx.beginPath();
        ctx.moveTo(-nx + 0.1, S.neckY + ty);
        ctx.lineTo(nx - 0.1, S.neckY + ty + 0.14);
        ctx.stroke();
      }
      // rim: the mouth seen edge-on
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(140,155,168,0.75)';
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.moveTo(-nx, top);
      ctx.lineTo(nx, top);
      ctx.stroke();

      // round white logo sticker, centred on the front like the retail jar
      const st = this.stickerFor(S);
      ctx.save();
      ctx.translate(st.cx, st.cy);
      ctx.scale(1 / this.s0, -1 / this.s0); // sticker bitmap is at base zoom
      ctx.drawImage(st.c, -st.size / 2, -st.size / 2, st.size, st.size);
      ctx.restore();

      // fingertips curl round the jar's edge, clear of the sticker; they
      // tighten while the screen is held
      const reach = 1.1 + grip * 0.18;
      const fingers = [
        [1.55, reach - 0.15],
        [0.5, reach + 0.1],
        [-0.55, reach],
        [-1.55, reach - 0.2],
      ];
      ctx.lineCap = 'round';
      for (const [fy, flen] of fingers) {
        ctx.strokeStyle = SKIN_LINE;
        ctx.lineWidth = 1.02;
        ctx.beginPath();
        ctx.moveTo(-hw - 0.4, fy);
        ctx.lineTo(-hw - 0.4 + flen, fy - grip * 0.08);
        ctx.stroke();
        ctx.strokeStyle = grip > 0.5 ? '#E6BBA2' : SKIN;
        ctx.lineWidth = 0.82;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Pour-zone ring around the wrist pivot: grey until the estimated pour
  // start, pink while pouring, red past the danger angle. Black tick = jar.
  drawGauge(game) {
    const { ctx } = this;
    const jar = game.jar;
    const P = game.P;
    const start = Math.min(179, game.pourStart);
    const danger = P.jar.dangerAngle;
    const R = game.shape.top + 2.6;
    const bands = [
      [0, start, 'rgba(43,30,42,0.12)'],
      [start, danger, 'rgba(232,69,111,0.45)'],
      [danger, 180, 'rgba(180,20,40,0.85)'],
    ];
    ctx.lineWidth = 0.55;
    ctx.lineCap = 'butt';
    for (const [a0, a1, col] of bands) {
      if (a1 <= a0) continue;
      ctx.strokeStyle = col;
      ctx.beginPath();
      // angle measured clockwise from up; canvas arc in y-up frame is CCW from +x
      ctx.arc(jar.x, jar.y, R, Math.PI / 2 - a0 * D, Math.PI / 2 - a1 * D, true);
      ctx.stroke();
    }
    const a = jar.theta;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(jar.x + Math.sin(a) * (R - 1.1), jar.y + Math.cos(a) * (R - 1.1));
    ctx.lineTo(jar.x + Math.sin(a) * (R + 1.1), jar.y + Math.cos(a) * (R + 1.1));
    ctx.stroke();
  }

  drawFx(dt, ox, oy) {
    const { ctx } = this;
    this.screenTransform(ox, oy);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const life = f.kind === 'ring' ? 0.28 : 0.5;
      if (f.t > life) {
        this.fx.splice(i, 1);
        continue;
      }
      const k = f.t / life;
      const x = this.sx(f.x);
      const y = this.sy(f.y);
      if (f.kind === 'sparkle') {
        const r = (3 + 7 * Math.sin(k * Math.PI)) * (this.s / 12);
        ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
        ctx.beginPath();
        for (let j = 0; j < 8; j++) {
          const a = (j * Math.PI) / 4 + k;
          const rr = j % 2 ? r * 0.28 : r;
          ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      } else if (f.kind === 'ring') {
        ctx.strokeStyle = `rgba(232,69,111,${0.55 * (1 - k)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, (0.7 + k * 1.3) * this.s * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // Tiny per-cake progress pill: amount toward the requirement.
  drawMeters(game) {
    const { ctx } = this;
    this.screenTransform();
    for (const c of game.cakes) {
      const tg = c.target;
      if (!tg.required) continue;
      const cxw = c.pos.x + (tg.x0 + tg.x1) / 2;
      const x = this.sx(cxw);
      if (x < -60 || x > this.w + 60) continue;
      const y = this.sy(c.pos.y + c.top) - Math.max(18, this.s * 2.2);
      const w = clamp(this.s * 5, 36, 64);
      const h = 6;
      const k = tg.received / tg.required;
      const met = k >= 1;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      pill(ctx, x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(43,30,42,0.12)';
      pill(ctx, x - w / 2, y - h / 2, w, h);
      ctx.fill();
      ctx.fillStyle = met ? '#3FAE86' : '#E8456F';
      pill(ctx, x - w / 2, y - h / 2, Math.max(h, w * Math.min(1, k)), h);
      ctx.fill();
      if (met) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x - 1, y + 2);
        ctx.lineTo(x + 3, y - 2);
        ctx.stroke();
      }
      if (k > 1.02) {
        ctx.fillStyle = INK;
        ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`×${k.toFixed(1)}`, x + w / 2 + 5, y + 0.5);
      }
    }
  }
}

// Jar silhouette in jar-local cm, open at the rim: rounded base, straight
// body, a short shoulder in to the threaded neck.
function jarPath(ctx, S) {
  const { hw, bottom, top, neckY, shoulder } = S;
  const nx = hw - S.inset;
  const r = 0.8;
  ctx.beginPath();
  ctx.moveTo(-nx, top);
  ctx.lineTo(-nx, neckY);
  ctx.quadraticCurveTo(-hw, neckY - shoulder * 0.15, -hw, neckY - shoulder);
  ctx.lineTo(-hw, bottom + r);
  ctx.quadraticCurveTo(-hw, bottom, -hw + r, bottom);
  ctx.lineTo(hw - r, bottom);
  ctx.quadraticCurveTo(hw, bottom, hw, bottom + r);
  ctx.lineTo(hw, neckY - shoulder);
  ctx.quadraticCurveTo(hw, neckY - shoulder * 0.15, nx, neckY);
  ctx.lineTo(nx, top);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function pill(ctx, x, y, w, h) {
  roundRect(ctx, x, y, w, h, Math.min(h / 2, w / 2));
}

