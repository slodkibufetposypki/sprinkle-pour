// Bootstrap: input, main loop, persistence, and wiring between the sim,
// renderer, audio and panel.
import { DEFAULT_PARAMS, PRESETS, clone, deepMerge, setPath, diffFromDefaults } from './params.js';
import { LEVELS } from './levels.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Sfx } from './audio.js';
import { Panel, showBanner, hideBanner, showResult, hideResult, countLabel } from './ui.js';
import { botHold } from './bot.js';

const STORE = {
  params: 'sprinklePour.params.v1',
  ui: 'sprinklePour.ui.v1',
  best: 'sprinklePour.best.v2', // v2: five-star scale
};

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or blocked storage: tuning just won't persist */
  }
}

const $ = (id) => document.getElementById(id);

// The public player build (<html data-mode="play">, see tools/build.mjs) has
// no tuning panel, no debug keys and always plays the default physics.
const PLAYER = document.documentElement.dataset.mode === 'play';

class App {
  constructor() {
    this.P = PLAYER ? clone(DEFAULT_PARAMS) : deepMerge(clone(DEFAULT_PARAMS), load(STORE.params, {}));
    this.ui = {
      gauge: false,
      meters: true,
      slowmo: false,
      paused: false,
      fixedSeed: false,
      autoRetry: false,
      autopilot: false,
      sound: true,
      haptics: true,
      panel: window.innerWidth >= 1100,
      level: 1,
      ...load(STORE.ui, {}),
    };
    // Pause and autopilot never carry over from a previous visit.
    this.ui.paused = false;
    this.ui.autopilot = false;
    if (PLAYER) Object.assign(this.ui, { panel: false, gauge: false, autopilot: false, slowmo: false, fixedSeed: false, autoRetry: false });
    // Local dev shortcuts, e.g. ?level=7&autopilot=1&gauge=1&panel=0
    const q = new URLSearchParams(PLAYER ? '' : location.search);
    this.warp = Number(q.get('warp')) || 0;
    if (q.has('level')) this.ui.level = Number(q.get('level'));
    for (const k of ['autopilot', 'gauge', 'panel', 'slowmo', 'fixedSeed']) {
      if (q.has(k)) this.ui[k] = q.get(k) !== '0';
    }
    this.best = load(STORE.best, {});
    this.levels = LEVELS.map(clone);
    this.game = new Game(this.P);
    this.renderer = new Renderer($('view'));
    this.sfx = new Sfx();
    this.sfx.enabled = this.ui.sound;
    this.sfx.haptics = this.ui.haptics;
    this.panel = PLAYER ? null : new Panel(this);
    this.pointers = new Set();
    this.keys = new Set();
    this.attempt = 0;
    this.fps = 60;
    this.last = 0;
    this.resultShownAt = 0;
    this.retryTimer = 0;
  }

  start() {
    if (PLAYER) {
      $('btn-tune').hidden = true;
      $('panel').hidden = true;
    }
    this.panel?.build();
    this.buildLevelSelect();
    this.bindInput();
    this.applyPanelState();
    this.syncSoundButton();
    const stage = $('stage');
    const fit = () => {
      const r = stage.getBoundingClientRect();
      this.renderer.resize(Math.max(1, r.width), Math.max(1, r.height));
      if (this.game.jar) this.renderer.snapCamera(this.game);
    };
    new ResizeObserver(fit).observe(stage);
    this.linkClaude();
    fit();
    const idx = Math.max(0, this.levels.findIndex((l) => l.id === this.ui.level));
    this.loadLevel(idx);
    // ?warp=4 fast-forwards the sim (dev screenshots / checking late states).
    for (let t = 0; t < this.warp && this.game.state !== 'result'; t += 1 / 240) {
      this.game.step(1 / 240, this.ui.autopilot ? botHold(this.game) : false);
    }
    if (this.warp) this.renderer.snapCamera(this.game);
    requestAnimationFrame((t) => this.frame(t));
  }

  get level() {
    return this.levels[this.levelIndex];
  }

  // A tap shorter than a frame still counts once (latched until consumed).
  isHeld() {
    const latched = this.tapLatch;
    this.tapLatch = false;
    return latched || this.pointers.size > 0 || this.keys.size > 0;
  }

  // ---- levels ---------------------------------------------------------------
  buildLevelSelect() {
    const sel = $('level-select');
    sel.textContent = '';
    this.levels.forEach((l, i) => {
      const stars = this.best[l.id] || 0;
      const label = l.id === 0 ? 'Sandbox' : `${l.id}. ${l.name}`;
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${label}  ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`;
      sel.append(opt);
    });
    sel.value = this.levelIndex ?? 0;
  }

  loadLevel(i) {
    clearTimeout(this.retryTimer);
    this.levelIndex = (i + this.levels.length) % this.levels.length;
    const level = this.level;
    this.attempt++;
    const seed = this.ui.fixedSeed ? 1 : ((Date.now() ^ (this.attempt * 2654435761)) >>> 0) % 100000;
    this.game.load(level, seed);
    this.renderer.snapCamera(this.game);
    this.renderer.fx.length = 0;
    hideResult();
    $('level-select').value = this.levelIndex;
    this.ui.level = level.id;
    save(STORE.ui, this.ui);
    // The level waits for the first press. Only the first visit shows the
    // level name; retries just show the hint so they stay instant.
    showBanner(level, this.lastBannerLevel !== level.id);
    this.lastBannerLevel = level.id;
    this.lastCount = -1;
    this.panel?.buildLevelControls(level);
  }

  restart() {
    this.loadLevel(this.levelIndex);
  }

  next() {
    this.loadLevel(this.levelIndex + 1);
  }

  editLevel(path, value) {
    setPath(this.level, path, value);
    this.restart();
  }

  restoreLevel() {
    this.levels[this.levelIndex] = clone(LEVELS[this.levelIndex]);
    this.restart();
    this.panel?.msg('Level restored to its original data.');
  }

  // ---- params ---------------------------------------------------------------
  setParam(path, value) {
    setPath(this.P, path, value);
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => save(STORE.params, diffFromDefaults(this.P)), 250);
  }

  replaceParams(next) {
    // Mutate in place: the game holds a reference to this.P.
    for (const k of Object.keys(this.P)) delete this.P[k];
    Object.assign(this.P, next);
    save(STORE.params, diffFromDefaults(this.P));
    this.panel?.syncAll();
  }

  applyPreset(name) {
    this.replaceParams(deepMerge(clone(DEFAULT_PARAMS), PRESETS[name] || {}));
    this.restart();
  }

  importParams(obj) {
    this.replaceParams(deepMerge(clone(DEFAULT_PARAMS), obj));
    this.restart();
  }

  resetParams() {
    this.replaceParams(clone(DEFAULT_PARAMS));
    this.restart();
  }

  // Hosted on claude.ai the page can hand its tuning to Claude through the
  // artifact's database; anywhere else (local, GitHub Pages) this is a no-op.
  async linkClaude() {
    if (PLAYER || !window.claude?.use) return;
    try {
      this.db = await window.claude.use('db');
    } catch {
      this.db = null;
    }
    if (this.db) $('json-send').hidden = false;
  }

  async sendTuning() {
    const edited = this.levels.filter((l, i) => JSON.stringify(l) !== JSON.stringify(LEVELS[i]));
    await this.db.doc('tuning/latest').set({
      params: diffFromDefaults(this.P),
      levels: JSON.parse(JSON.stringify(edited)),
      currentLevel: this.level.id,
      sentAt: new Date().toISOString(),
    });
  }

  // ---- toggles ----------------------------------------------------------------
  setToggle(key, on) {
    this.ui[key] = on;
    if (key === 'sound') {
      this.sfx.setEnabled(on);
      this.syncSoundButton();
    }
    if (key === 'haptics') this.sfx.haptics = on;
    if (key === 'paused') $('paused').hidden = !on;
    if (key === 'panel') this.applyPanelState();
    if (key !== 'paused') save(STORE.ui, this.ui);
    this.panel?.syncToggles();
  }

  toggle(key) {
    this.setToggle(key, !this.ui[key]);
  }

  applyPanelState() {
    $('app').classList.toggle('panel-open', !!this.ui.panel);
    $('btn-tune').setAttribute('aria-expanded', String(!!this.ui.panel));
  }

  syncSoundButton() {
    const b = $('btn-sound');
    b.setAttribute('aria-pressed', String(!!this.ui.sound));
    b.setAttribute('aria-label', this.ui.sound ? 'Sound on' : 'Sound off');
  }

  // ---- input ------------------------------------------------------------------
  bindInput() {
    const stage = $('stage');
    const isUi = (t) => t.closest && t.closest('button, select, input, textarea, label, .result-card, .hud');
    stage.addEventListener('pointerdown', (e) => {
      this.sfx.unlock();
      if (isUi(e.target)) return;
      if (!$('result').hidden) {
        // Tapping the backdrop behind the result card retries.
        if (performance.now() - this.resultShownAt > 450) this.restart();
        return;
      }
      e.preventDefault();
      this.pointers.add(e.pointerId);
      this.tapLatch = true;
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {
        /* capture can fail for synthetic events */
      }
    });
    const up = (e) => this.pointers.delete(e.pointerId);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('lostpointercapture', up);
    stage.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => {
      this.pointers.clear();
      this.keys.clear();
    });

    const typing = (t) => t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox'));
    window.addEventListener('keydown', (e) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.code;
      if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') {
        e.preventDefault();
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        if (!e.repeat) {
          this.sfx.unlock();
          if (!$('result').hidden) return;
          this.keys.add(k);
          this.tapLatch = true;
        }
        return;
      }
      if (e.repeat) return;
      const actions = {
        KeyR: () => this.restart(),
        KeyN: () => this.next(),
        Enter: () => !$('result').hidden && this.next(),
        BracketRight: () => this.next(),
        BracketLeft: () => this.loadLevel(this.levelIndex - 1),
        KeyP: () => this.toggle('paused'),
        ...(PLAYER
          ? {}
          : {
              KeyS: () => this.toggle('slowmo'),
              KeyG: () => this.toggle('gauge'),
              KeyA: () => this.toggle('autopilot'),
              KeyT: () => this.toggle('panel'),
            }),
        KeyM: () => this.toggle('sound'),
      };
      if (actions[k]) {
        e.preventDefault();
        actions[k]();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    const click = (id, fn) =>
      $(id).addEventListener('click', (e) => {
        this.sfx.unlock();
        fn();
        e.currentTarget.blur();
      });
    click('btn-retry', () => this.restart());
    click('btn-sound', () => this.toggle('sound'));
    click('btn-tune', () => this.toggle('panel'));
    click('panel-close', () => this.setToggle('panel', false));
    click('res-retry', () => this.restart());
    click('res-next', () => this.next());
    $('level-select').addEventListener('change', (e) => {
      this.loadLevel(Number(e.target.value));
      e.target.blur();
    });
  }

  // ---- loop ---------------------------------------------------------------------
  frame(now) {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    const g = this.game;
    const held = this.ui.autopilot ? botHold(g) : this.isHeld();
    if (!this.ui.paused) g.update(dt * (this.ui.slowmo ? 0.25 : 1), held);
    this.handleEvents(g);
    this.sfx.frame(dt);
    this.sfx.setPour(this.ui.paused ? 0 : g.jar.flow);
    this.renderer.render(g, this.ui.paused ? 0 : dt, { gauge: this.ui.gauge, meters: this.ui.meters });
    const x0 = g.level.hand.startX;
    const k = Math.max(0, Math.min(1, (g.jar.x - x0) / (g.endX - x0)));
    $('progress-fill').style.width = `${(k * 100).toFixed(1)}%`;
    if (g.count !== this.lastCount) {
      this.lastCount = g.count;
      $('jar-count').textContent = countLabel(g);
    }
    if (this.ui.panel) this.panel?.update(g, this.fps, now);
    requestAnimationFrame((t) => this.frame(t));
  }

  handleEvents(g) {
    const sfx = this.sfx;
    const r = this.renderer;
    for (const e of g.events) {
      switch (e.type) {
        case 'start':
          hideBanner();
          break;
        case 'threshold':
          sfx.tick();
          sfx.buzz(6, 0.25);
          break;
        case 'danger':
          sfx.buzz([4, 40, 4], 0.4);
          break;
        case 'catch':
          sfx.buzz(8, 0.15);
          break;
        case 'land':
          if (e.t === 'bead' || e.t === 'rod') sfx.patter(e.zone === 'target');
          else {
            sfx.thud(Math.max(40, e.impact), e.zone === 'target');
            if (e.zone === 'target' && e.t === 'pearl') {
              r.addFx('sparkle', e.x, e.y + 0.8);
              sfx.buzz(12, 0.08);
            }
          }
          break;
        case 'hit':
          sfx.thud(e.speed, e.zone === 'target');
          break;
        case 'plop':
          // a big piece tumbling out over the rim
          sfx.plop();
          r.addFx('ring', e.x, e.y);
          break;
        case 'bump':
          sfx.knock(e.severity);
          sfx.buzz(30, 0.2);
          r.shake = Math.min(10, 2 + e.severity / 6);
          break;
        case 'result':
          this.onResult(e.result);
          break;
        default:
          break;
      }
    }
    g.events.length = 0;
  }

  onResult(result) {
    const id = this.level.id;
    if (result.stars > (this.best[id] || 0)) {
      this.best[id] = result.stars;
      save(STORE.best, this.best);
      this.buildLevelSelect();
    }
    this.sfx.chime(result.stars);
    const next = this.levels[(this.levelIndex + 1) % this.levels.length];
    showResult(result, next.id === 0 ? 'Sandbox' : 'Next level', next.name);
    this.resultShownAt = performance.now();
    if (this.ui.autoRetry) this.retryTimer = setTimeout(() => this.restart(), 1400);
  }
}

const app = new App();
app.start();
// Handy in the console while tuning: sprinkle.P.jar.liftTorque = 90
if (!PLAYER) window.sprinkle = app;
