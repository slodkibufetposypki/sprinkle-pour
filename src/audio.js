// Synthesized sound + restrained haptics. No audio files: noise and sine
// voices shaped per material, so sugar sounds different from chocolate.
//   pour   continuous filtered noise, level follows the flow ("shhh")
//   beads  tiny high clicks, rate-limited ("tktktk")
//   pearls pitched thud that drops ("plop"), softer on cream
//   jar    wooden-ish knock on cake contact
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.haptics = true;
    this.clickBudget = 0;
    this.lastBuzz = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const clickLen = Math.floor(ctx.sampleRate * 0.012);
    this.click = ctx.createBuffer(1, clickLen, ctx.sampleRate);
    const c = this.click.getChannelData(0);
    for (let i = 0; i < clickLen; i++) c[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / clickLen, 3);

    // The pour bed.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.pourFilter = ctx.createBiquadFilter();
    this.pourFilter.type = 'bandpass';
    this.pourFilter.frequency.value = 3000;
    this.pourFilter.Q.value = 0.7;
    this.pourGain = ctx.createGain();
    this.pourGain.gain.value = 0;
    src.connect(this.pourFilter).connect(this.pourGain).connect(this.master);
    src.start();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.02);
  }

  buzz(pattern, minGap = 0.05) {
    // Browsers reject vibrate() before the first tap; unlock() marks that.
    if (!this.haptics || !this.ctx || !navigator.vibrate) return;
    const now = performance.now() / 1000;
    if (now - this.lastBuzz < minGap) return;
    this.lastBuzz = now;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* some browsers refuse vibrate outside a gesture */
    }
  }

  // flow in mass units per second; ~120/s is a full, steady stream
  setPour(flow) {
    if (!this.ctx) return;
    const k = Math.min(1.6, flow / 120);
    const t = this.ctx.currentTime;
    this.pourGain.gain.setTargetAtTime(k > 0.01 ? 0.05 + 0.13 * Math.sqrt(k) : 0, t, 0.04);
    this.pourFilter.frequency.setTargetAtTime(2400 + 1800 * k, t, 0.08);
  }

  // Called once per frame; refills the click budget so a dump doesn't turn
  // into white noise.
  frame(dt) {
    this.clickBudget = Math.min(6, this.clickBudget + dt * 45);
  }

  patter(onCream) {
    if (!this.ctx || this.clickBudget < 1) return;
    this.clickBudget -= 1;
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.03;
    const s = ctx.createBufferSource();
    s.buffer = this.click;
    s.playbackRate.value = onCream ? 0.5 + Math.random() * 0.3 : 0.9 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter();
    f.type = onCream ? 'lowpass' : 'highpass';
    f.frequency.value = onCream ? 2200 : 3500;
    const g = ctx.createGain();
    g.gain.value = (onCream ? 0.05 : 0.09) * (0.6 + Math.random() * 0.6);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
  }

  thud(speed, soft) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const k = Math.min(1, speed / 220);
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = soft ? 260 : 420;
    o.frequency.setValueAtTime(f0 * (0.9 + Math.random() * 0.2), t);
    o.frequency.exponentialRampToValueAtTime(soft ? 90 : 150, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 + 0.25 * k, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (soft ? 0.16 : 0.1));
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
    if (!soft) this.patter(false);
  }

  plop() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(85, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
  }

  knock(severity) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const k = Math.min(1, severity / 60);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 + 0.3 * k, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
    const n = ctx.createBufferSource();
    n.buffer = this.click;
    n.playbackRate.value = 0.35;
    const ng = ctx.createGain();
    ng.gain.value = 0.3 * k + 0.1;
    n.connect(ng).connect(this.master);
    n.start(t);
  }

  tick() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = 2100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.05);
  }

  chime(stars) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const notes = stars ? [523.25, 659.25, 783.99, 1046.5].slice(0, stars + 1) : [392, 329.63];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.11;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.4);
    });
  }
}
