// DOM side: the tuning panel (generated from SCHEMA), live readouts + graph,
// the level banner and the result card.
import { SCHEMA, PRESETS, DEFAULT_PARAMS, TYPE_IDS, TYPE_LABELS, getPath, diffFromDefaults } from './params.js';
import { D } from './jar.js';
import { POINTS } from './game.js';

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) if (k) e.append(k);
  return e;
}

function fmt(v, step) {
  const dec = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return Number(v).toFixed(dec);
}

const pct = (v) => `${Math.round(v * 100)}%`;

const TOGGLES = [
  ['gauge', 'Pour gauge', 'G'],
  ['meters', 'Cake meters', ''],
  ['slowmo', 'Slow motion', 'S'],
  ['paused', 'Pause', 'P'],
  ['fixedSeed', 'Fixed seed', ''],
  ['autoRetry', 'Auto-retry', ''],
  ['autopilot', 'Autopilot', 'A'],
  ['sound', 'Sound', 'M'],
  ['haptics', 'Haptics', ''],
];

export class Panel {
  constructor(app) {
    this.app = app;
    this.rows = [];
    this.groups = [];
    this.levelRows = [];
    this.nextUpdate = 0;
    this.graph = $('graph');
    this.gctx = this.graph.getContext('2d');
    this.readouts = {};
    this.resetArmed = 0;
  }

  build() {
    this.buildToggles();
    this.buildPresets();
    this.buildGroups();
    this.buildReadouts();
  }

  msg(text) {
    $('panel-msg').textContent = text;
    clearTimeout(this.msgT);
    this.msgT = setTimeout(() => ($('panel-msg').textContent = ''), 3500);
  }

  buildToggles() {
    const box = $('toggles');
    for (const [key, label, k] of TOGGLES) {
      const input = el('input', { type: 'checkbox', id: `tg-${key}` });
      input.checked = !!this.app.ui[key];
      input.addEventListener('change', () => this.app.setToggle(key, input.checked));
      box.append(el('label', { class: 'toggle', for: `tg-${key}` }, input, el('span', { text: k ? `${label} (${k})` : label })));
    }
  }

  syncToggles() {
    for (const [key] of TOGGLES) $(`tg-${key}`).checked = !!this.app.ui[key];
  }

  buildPresets() {
    const sel = $('preset-select');
    for (const name of Object.keys(PRESETS)) sel.append(el('option', { value: name, text: name }));
    $('preset-apply').addEventListener('click', () => {
      this.app.applyPreset(sel.value);
      this.msg(`Applied “${sel.value}” on top of the defaults.`);
    });
    const wrap = $('json-wrap');
    const box = $('json-box');
    $('json-copy').addEventListener('click', () => {
      const text = JSON.stringify(diffFromDefaults(this.app.P), null, 2);
      const fallback = () => {
        wrap.hidden = false;
        box.value = text;
        box.focus();
        box.select();
        this.msg('Clipboard is blocked here. The JSON is selected below.');
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => this.msg('Copied. Only values that differ from the defaults.'), fallback);
      } else fallback();
    });
    $('json-load').addEventListener('click', () => {
      wrap.hidden = false;
      box.value = '';
      box.placeholder = '{ "jar": { "liftTorque": 90 } }';
      box.focus();
    });
    $('json-cancel').addEventListener('click', () => (wrap.hidden = true));
    $('json-apply').addEventListener('click', () => {
      try {
        this.app.importParams(JSON.parse(box.value || '{}'));
        wrap.hidden = true;
        this.msg('Tuning loaded.');
      } catch (e) {
        this.msg(`That isn't valid JSON: ${e.message}`);
      }
    });
    $('json-send').addEventListener('click', async () => {
      const btn = $('json-send');
      btn.disabled = true;
      try {
        await this.app.sendTuning();
        this.msg('Sent. Tell Claude to apply your tuning.');
      } catch (e) {
        this.msg(`Couldn't send (${e?.code || 'error'}). Use Copy tuning JSON instead.`);
      } finally {
        btn.disabled = false;
      }
    });
    const reset = $('reset-all');
    reset.addEventListener('click', () => {
      const now = performance.now();
      if (now - this.resetArmed < 3000) {
        this.resetArmed = 0;
        reset.textContent = 'Reset all';
        this.app.resetParams();
        this.msg('Every value is back to its default.');
      } else {
        this.resetArmed = now;
        reset.textContent = 'Click again to reset';
        setTimeout(() => {
          if (this.resetArmed === now) {
            this.resetArmed = 0;
            reset.textContent = 'Reset all';
          }
        }, 3000);
      }
    });
  }

  makeRow(path, label, min, max, step, unit, help, get, onInput, onChange, def) {
    const id = `p-${path.replace(/\./g, '-')}`;
    const input = el('input', { type: 'range', id, min, max, step });
    const out = el('output', { for: id });
    const lab = el('label', { for: id, text: label, title: help || undefined });
    const row = el('div', { class: 'prow' }, lab, out, input);
    if (help) row.append(el('div', { class: 'help', text: help }));
    const r = { path, input, out, row, step, unit, get, def };
    const show = (v) => {
      out.textContent = `${fmt(v, step)}${unit ? ` ${unit}` : ''}`;
      row.classList.toggle('changed', def !== undefined && Math.abs(v - def) > 1e-9);
    };
    r.sync = () => {
      const v = get();
      input.value = v;
      show(v);
    };
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      show(v);
      onInput?.(v);
    });
    input.addEventListener('change', () => onChange?.(parseFloat(input.value)));
    if (def !== undefined) {
      lab.addEventListener('dblclick', () => {
        input.value = def;
        show(def);
        onInput?.(def);
        onChange?.(def);
      });
    }
    r.sync();
    return r;
  }

  buildGroups() {
    const root = $('param-groups');
    const P = this.app.P;
    for (const g of SCHEMA) {
      const count = el('span', { class: 'group-count' });
      const body = el('div', { class: 'group-body' });
      const det = el('details', { class: 'group', open: g.open }, el('summary', {}, el('span', { text: g.title }), count), body);
      const rows = [];
      for (const [path, label, min, max, step, unit, help] of g.rows) {
        const def = getPath(DEFAULT_PARAMS, path);
        const r = this.makeRow(
          path,
          label,
          min,
          max,
          step,
          unit,
          help,
          () => getPath(P, path),
          (v) => {
            this.app.setParam(path, v);
            this.updateCount(grp);
          },
          null,
          def,
        );
        rows.push(r);
        body.append(r.row);
      }
      const grp = { rows, count };
      this.groups.push(grp);
      this.rows.push(...rows);
      this.updateCount(grp);
      root.append(det);
    }
  }

  updateCount(grp) {
    const n = grp.rows.filter((r) => r.row.classList.contains('changed')).length;
    grp.count.textContent = n ? `${n} changed` : '';
  }

  syncAll() {
    for (const r of this.rows) r.sync();
    for (const g of this.groups) this.updateCount(g);
  }

  // Per-level values edit a working copy of the level and restart it.
  buildLevelControls(level) {
    const root = $('level-controls');
    root.textContent = '';
    this.levelRows = [];
    const body = el('div', { class: 'group-body' });
    const det = el('details', { class: 'group', open: level.id === 0 }, el('summary', {}, el('span', { text: `This level: ${level.name}` })), body);
    const add = (path, label, min, max, step, unit, help) => {
      const r = this.makeRow(
        `lvl.${path}`,
        label,
        min,
        max,
        step,
        unit,
        help,
        () => getPath(level, path) ?? 0,
        null,
        (v) => this.app.editLevel(path, v),
      );
      this.levelRows.push(r);
      body.append(r.row);
    };
    add('hand.speed', 'Hand speed', 4, 40, 0.5, 'cm/s', '');
    add('hand.y', 'Hand height', 16, 45, 0.5, 'cm', '');
    add('hand.heightCoupling', 'Holding raises hand', 0, 12, 0.5, 'cm', 'Brief §37: the same press also gains clearance.');
    add('hand.startX', 'Start position', -70, 0, 1, 'cm', '');
    for (const t of TYPE_IDS) add(`mix.${t}`, `${TYPE_LABELS[t]} in jar`, 0, t === 'bead' ? 600 : 120, 1, 'pcs', '');
    level.cakes.forEach((c, i) => add(`cakes.${i}.required`, `Cake ${i + 1}: full cover`, 1, 400, 1, '', i ? '' : 'Sprinkle mass that covers a cake completely (spread evenly).'));
    add('coverGoal', 'Cover goal (pass)', 0.1, 1, 0.01, '', 'Share of each cake that must be covered.');
    add('allowedWaste', 'Waste allowance', 0, 1, 0.01, '', 'Share of the jar. Clean-pour points reach zero at 1.5× this.');
    const actions = el(
      'div',
      { class: 'row-actions' },
      el('button', { class: 'pbtn', type: 'button', text: 'Copy level JSON' }),
      el('button', { class: 'pbtn', type: 'button', text: 'Restore level' }),
    );
    const [copyBtn, restoreBtn] = actions.children;
    copyBtn.addEventListener('click', () => {
      const text = JSON.stringify(level, null, 2);
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(
          () => this.msg('Level JSON copied.'),
          () => this.showJson(text),
        );
      } else this.showJson(text);
    });
    restoreBtn.addEventListener('click', () => this.app.restoreLevel());
    body.append(actions);
    root.append(det);
  }

  showJson(text) {
    $('json-wrap').hidden = false;
    const box = $('json-box');
    box.value = text;
    box.focus();
    box.select();
    this.msg('Clipboard is blocked here. The JSON is selected below.');
  }

  buildReadouts() {
    const dl = $('readouts');
    const items = [
      ['theta', 'jar angle'],
      ['omega', 'swing'],
      ['flow', 'flow out'],
      ['start', 'pour start ≈'],
      ['fill', 'jar weight'],
      ['contents', 'in jar'],
      ['air', 'in the air'],
      ['settled', 'settled'],
      ['target', 'on cakes'],
      ['waste', 'wasted'],
      ['fps', 'frame rate'],
      ['seed', 'seed'],
    ];
    for (const [k, label] of items) {
      const dd = el('dd', { text: '–' });
      dl.append(el('div', {}, el('dt', { text: label }), dd));
      this.readouts[k] = dd;
    }
  }

  update(game, fps, now) {
    if (now < this.nextUpdate) return;
    this.nextUpdate = now + 50;
    const jar = game.jar;
    const R = this.readouts;
    const start = Math.max(1, game.startMass);
    R.theta.textContent = `${(jar.theta / D).toFixed(1)}°`;
    R.omega.textContent = `${(jar.omega / D).toFixed(0)}°/s`;
    R.flow.textContent = `${jar.flow.toFixed(0)}/s`;
    R.start.textContent = `${game.pourStart.toFixed(0)}°`;
    R.fill.textContent = pct(jar.fill);
    R.contents.textContent = `${game.count} pcs`;
    R.air.textContent = game.particles.length;
    R.settled.textContent = game.stuck.length;
    R.target.textContent = pct(game.stats.onTarget / start);
    R.waste.textContent = pct(game.stats.wasted / start);
    R.fps.textContent = `${fps.toFixed(0)} fps`;
    R.seed.textContent = game.seed;
    this.drawGraph(game);
  }

  drawGraph(game) {
    const cv = this.graph;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (!w) return;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const g = this.gctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const H = game.hist;
    const N = H.theta.length;
    const n = H.n;
    const top = 8;
    const bot = h - 8;
    const y = (deg) => bot - ((deg + 15) / 195) * (bot - top);
    const dx = w / N;
    const idx = (k) => (H.i - n + k + N) % N;
    const xAt = (k) => w - (n - k) * dx;

    // held spans
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let k = 0; k < n; k++) if (H.held[idx(k)]) g.fillRect(xAt(k), 0, dx + 0.5, h);

    // grid
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.font = '10px "JetBrains Mono", ui-monospace, monospace';
    g.lineWidth = 1;
    for (const deg of [0, 45, 90, 135, 180]) {
      g.beginPath();
      g.moveTo(0, y(deg));
      g.lineTo(w, y(deg));
      g.stroke();
      g.fillText(`${deg}°`, 4, y(deg) - 2);
    }
    const danger = game.P.jar.dangerAngle;
    g.strokeStyle = 'rgba(255,90,110,0.45)';
    g.setLineDash([2, 3]);
    g.beginPath();
    g.moveTo(0, y(danger));
    g.lineTo(w, y(danger));
    g.stroke();
    g.setLineDash([]);

    // flow (area, bottom third)
    const maxF = 300;
    g.fillStyle = 'rgba(127,220,181,0.35)';
    g.beginPath();
    g.moveTo(xAt(0), bot);
    for (let k = 0; k < n; k++) g.lineTo(xAt(k), bot - Math.min(1, H.flow[idx(k)] / maxF) * (h * 0.4));
    g.lineTo(xAt(n - 1), bot);
    g.closePath();
    g.fill();

    const line = (arr, color, width, dash) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.setLineDash(dash || []);
      g.beginPath();
      for (let k = 0; k < n; k++) {
        const yy = y(arr[idx(k)]);
        if (k) g.lineTo(xAt(k), yy);
        else g.moveTo(xAt(k), yy);
      }
      g.stroke();
      g.setLineDash([]);
    };
    line(H.start, '#F2B544', 1.2, [3, 2]);
    line(H.theta, '#FF8FB1', 2);
  }
}

// "212 in jar" or "180 + 9 pearls" when the mix has more than one kind.
export function countLabel(game) {
  const g = game.grains;
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < g.n; i++) counts[g.t[i]]++;
  const kinds = TYPE_IDS.filter((t) => game.level.mix[t]);
  if (kinds.length <= 1) return `${g.n} in jar`;
  const short = { bead: 'beads', rod: 'rods', heart: 'sequins', pearl: 'pearls' };
  return TYPE_IDS.map((t, i) => (game.level.mix[t] ? `${counts[i]} ${short[t]}` : null))
    .filter(Boolean)
    .join(' · ');
}

// ---- banner + result --------------------------------------------------------
// Shown while a level waits for its first press. The first visit to a level
// gets its name; retries only get the hint, so they stay instant.
export function showBanner(level, full) {
  $('banner-num').textContent = full ? (level.id === 0 ? 'Sandbox' : `Level ${level.id}`) : '';
  $('banner-name').textContent = full ? (level.id === 0 ? level.blurb : level.name) : '';
  $('banner-hint').textContent = level.hint || 'Hold to start';
  $('banner').classList.add('show');
}

export function hideBanner() {
  $('banner').classList.remove('show');
}

const STAR = (on) =>
  `<svg viewBox="0 0 24 24"><path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="${on ? '#F2B544' : 'none'}" stroke="${on ? '#D9962A' : 'rgba(43,30,42,0.22)'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

const TITLES = ['Not quite', 'Cakes decorated', 'Getting there', 'Nicely poured', 'Lovely work', 'Perfect pour!'];

export function showResult(r, nextLabel, nextName) {
  $('res-stars').innerHTML = [0, 1, 2, 3, 4].map((i) => STAR(i < r.stars)).join('');
  $('res-stars').setAttribute('aria-label', `${r.stars} of 5 stars`);
  $('res-title').textContent = TITLES[r.stars];
  $('res-points').textContent = r.score;

  // Where the points came from, so the stars make sense.
  const rows = [
    ['Coverage', `${pct(r.coverage)} of the frosting`, r.parts.coverage, POINTS.coverage],
    ['Clean pour', `${pct(r.waste)} spilled`, r.parts.clean, POINTS.clean],
    ['On the cakes', `${pct(r.onCakes)} of the jar`, r.parts.used, POINTS.used],
  ];
  const parts = $('res-parts');
  parts.textContent = '';
  for (const [label, detail, got, max] of rows) {
    const bar = el('span', { class: 'bar' }, el('i'));
    bar.firstChild.style.width = `${Math.round((100 * got) / max)}%`;
    parts.append(
      el(
        'li',
        {},
        el('span', { class: 'part-label', text: label }),
        el('span', { class: 'part-detail', text: detail }),
        el('span', { class: 'part-pts', text: `${Math.round(got)}/${max}` }),
        bar,
      ),
    );
  }
  if (r.bumpPenalty) {
    parts.append(
      el(
        'li',
        { class: 'penalty' },
        el('span', { class: 'part-label', text: 'Jar bumps' }),
        el('span', { class: 'part-detail', text: `${r.bumps}×` }),
        el('span', { class: 'part-pts', text: `−${r.bumpPenalty}` }),
      ),
    );
  }

  const cakes = $('res-cakes');
  cakes.textContent = '';
  for (const c of r.cakes) {
    cakes.append(
      el(
        'li',
        { class: c.met ? 'met' : '' },
        el('span', { text: `${c.met ? '✓' : '✗'} ${c.name}` }),
        el('span', { class: 'amt', text: `${pct(c.coverage)} covered` }),
      ),
    );
  }
  const notes = $('res-notes');
  notes.textContent = '';
  for (const n of r.notes) notes.append(el('li', { text: n }));
  $('res-next').firstChild.textContent = `${nextLabel} `;
  $('res-next').title = nextName;
  $('result').hidden = false;
}

export function hideResult() {
  $('result').hidden = true;
}
