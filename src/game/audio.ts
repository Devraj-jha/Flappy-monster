import jumpSound from '../sound/jump.mp3';

// ---- Persistent volume / mute settings ----
const MUSIC_VOL_KEY = 'flappyMusicVol';
const SFX_VOL_KEY = 'flappySfxVol';
const MUSIC_ON_KEY = 'flappyMusicOn';

function readNum(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
  } catch {
    return fallback;
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

// ---- Procedural background music (no external audio file needed) ----
// A simple, pleasant chiptune loop built from oscillators.

type Step = number | null; // frequency in Hz, or null for a rest

// 16-step loop: a little C-major melody with a light octave bass feel.
const MELODY: Step[] = [
  523.25, 659.25, 783.99, 659.25, // C5 E5 G5 E5
  880.00, 783.99, 659.25, 587.33, // A5 G5 E5 D5
  659.25, 783.99, 987.77, 783.99, // E5 G5 B5 G5
  1046.50, 987.77, 880.00, 783.99,// C6 B5 A5 G5
];
const BASS: Step[] = [
  261.63, null, 196.00, null, // C4  .  G3  .
  220.00, null, 196.00, null, // A3  .  G3  .
  164.81, null, 196.00, null, // E3  .  G3  .
  130.81, null, 130.81, null, // C3  .  C3  .
];
const STEP_MS = 150;

class MusicPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;

  playing = false;
  volume = 0.4;
  enabled = true;

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private playStep() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const idx = this.step % MELODY.length;
    const melody = MELODY[idx];
    const bass = BASS[idx];
    const t0 = ctx.currentTime;

    const playTone = (freq: number, dur: number, vol: number, type: OscillatorType) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;

      const attack = 0.005;
      const release = dur * 0.6;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + attack);
      gain.gain.setValueAtTime(vol, t0 + dur - release);
      gain.gain.linearRampToValueAtTime(0, t0 + dur);

      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    };

    if (melody !== null) playTone(melody, STEP_MS / 1000, 0.09, 'square');
    if (bass !== null) playTone(bass, STEP_MS / 1000, 0.12, 'triangle');

    this.step = (this.step + 1) % MELODY.length;
  }

  private tick = () => {
    if (!this.playing) return;
    this.playStep();
    this.timer = window.setTimeout(this.tick, STEP_MS);
  };

  start() {
    const ctx = this.ensureCtx();
    if (!ctx || ctx.state === 'closed') return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (this.playing) return;
    this.playing = true;
    this.tick();
  }

  stop() {
    this.playing = false;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = this.enabled ? v : 0;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.volume : 0;
  }
}

// ---- Sound effects (jump) ----
class SfxPlayer {
  private jumpEl: HTMLAudioElement | null = null;
  volume = 0.5;

  private jump() {
    if (typeof Audio === 'undefined') return null;
    if (!this.jumpEl) {
      this.jumpEl = new Audio(jumpSound);
    }
    return this.jumpEl;
  }

  playJump() {
    const el = this.jump();
    if (!el) return;
    el.volume = this.volume;
    try { el.currentTime = 0; } catch { /* ignored */ }
    el.play().catch(() => {});
  }

  setVolume(v: number) {
    this.volume = v;
  }
}

export const audio = {
  music: new MusicPlayer(),
  sfx: new SfxPlayer(),

  // Initialise stored settings on load
  init() {
    this.music.volume = readNum(MUSIC_VOL_KEY, 0.4);
    this.music.enabled = readBool(MUSIC_ON_KEY, true);
    this.sfx.volume = readNum(SFX_VOL_KEY, 0.5);
  },

  setMusicVolume(v: number, persist = true) {
    this.music.setVolume(v);
    if (persist) try { localStorage.setItem(MUSIC_VOL_KEY, String(v)); } catch { /* ignored */ }
  },

  setSfxVolume(v: number, persist = true) {
    this.sfx.setVolume(v);
    if (persist) try { localStorage.setItem(SFX_VOL_KEY, String(v)); } catch { /* ignored */ }
  },

  setMusicEnabled(on: boolean, persist = true) {
    this.music.setEnabled(on);
    if (!on) this.music.stop();
    else if (!this.music.playing) this.music.start();
    if (persist) try { localStorage.setItem(MUSIC_ON_KEY, on ? '1' : '0'); } catch { /* ignored */ }
  },

  // Call from within a user gesture to start background music.
  startMusic() {
    if (this.music.enabled && !this.music.playing) {
      this.music.start();
    }
  },
};

audio.init();