'use client';

import { getSound, isSampleUrl } from './soundCatalog';

class AudioManager {
  private static instance: AudioManager | null = null;
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private beatInterval: number | null = null;
  private beatBpm: number = 120;
  private isBeatRunning = false;
  /** Live SFX sources so `stop all sounds` can silence them. */
  private activeSources = new Set<AudioScheduledSourceNode>();
  /** Decoded audio files, keyed by URL, so loops don't refetch. */
  private sampleCache = new Map<string, AudioBuffer>();
  private samplesLoading = new Set<string>();

  static get(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
      AudioManager.instance.installUserGestureUnlock();
    }
    return AudioManager.instance;
  }

  /**
   * Browsers require a user gesture in the *current window* before an
   * AudioContext will play. When the play page opens in a new window (via
   * "Play game in new window"), that popup's gesture history is empty even if
   * the click that opened it came from another window — so `on_start` scripts
   * that fire immediately produce silence. This listener resumes the context
   * on the first click/tap/keypress in the play window and then unregisters
   * itself.
   */
  private installUserGestureUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.ensureContext();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    window.addEventListener('touchstart', unlock, { once: false });
  }

  private ensureContext() {
    if (typeof window === 'undefined') return;
    if (!this.context) {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  setMasterVolume(volume: number) {
    this.ensureContext();
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
  }

  /**
   * Play a synthesized SFX. `volume` is 0-1 and scales this one sound.
   * Returns the sound's duration in seconds (for `play sound until done`).
   */
  /**
   * Play a sound from the catalog, or a real audio file when given a URL.
   * `volume` is 0-1 and scales this one sound. Returns the duration in seconds
   * so `play sound until done` knows how long to wait.
   *
   * This used to be a six-case switch over hand-tuned oscillator settings; the
   * recipes now live in lib/audio/soundCatalog.ts so the picker, the block
   * dropdown and this renderer can't drift apart.
   */
  playSfx(type: string, volume: number = 1): number {
    this.ensureContext();
    if (!this.context || !this.masterGain) return 0;

    if (isSampleUrl(type)) return this.playSample(type, volume);

    const spec = getSound(type) ?? getSound('click')!;
    const ctx = this.context;
    const now = ctx.currentTime;
    const vol = Math.max(0, Math.min(1, volume));

    for (const layer of spec.layers) {
      const delay = (layer.delay ?? 0) * spec.duration;
      const length = (layer.length ?? 1 - (layer.delay ?? 0)) * spec.duration;
      if (length <= 0) continue;

      const startAt = now + delay;
      const peak = Math.max(0.0001, (layer.gain ?? 0.4) * vol);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(peak, startAt + Math.min(0.015, length / 3));
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + length);
      gain.connect(this.masterGain);

      let source: AudioScheduledSourceNode;

      if (layer.wave === 'noise') {
        // Filtered white noise — used for percussion, wind and explosions.
        const frames = Math.max(1, Math.floor(ctx.sampleRate * length));
        const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(layer.cutoff ?? 2000, startAt);
        noise.connect(filter);
        filter.connect(gain);
        source = noise;
      } else {
        const osc = ctx.createOscillator();
        osc.type = layer.wave;
        osc.frequency.setValueAtTime(layer.freq, startAt);
        if (layer.toFreq !== undefined) {
          // exponentialRamp cannot cross or reach zero.
          osc.frequency.exponentialRampToValueAtTime(
            Math.max(1, layer.toFreq),
            startAt + length
          );
        }
        osc.connect(gain);
        source = osc;
      }

      source.start(startAt);
      source.stop(startAt + length + 0.02);
      this.activeSources.add(source);
      source.onended = () => this.activeSources.delete(source);
    }

    return spec.duration;
  }

  /**
   * Play a real audio file by URL. Decoded buffers are cached, so replaying a
   * sound in a loop doesn't refetch it.
   */
  private playSample(url: string, volume: number): number {
    const ctx = this.context;
    if (!ctx || !this.masterGain) return 0;

    const cached = this.sampleCache.get(url);
    if (cached) {
      this.startBuffer(cached, volume);
      return cached.duration;
    }

    // Not decoded yet — fetch, then play when ready. The reported duration is a
    // best guess for this first play; subsequent plays report the real length.
    if (!this.samplesLoading.has(url)) {
      this.samplesLoading.add(url);
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((buf) => ctx.decodeAudioData(buf))
        .then((decoded) => {
          this.sampleCache.set(url, decoded);
          this.startBuffer(decoded, volume);
        })
        .catch(() => { /* unreachable or undecodable audio — stay silent */ })
        .finally(() => this.samplesLoading.delete(url));
    }
    return 1;
  }

  private startBuffer(buffer: AudioBuffer, volume: number) {
    const ctx = this.context;
    if (!ctx || !this.masterGain) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start();
    this.activeSources.add(src);
    src.onended = () => this.activeSources.delete(src);
  }

  /** Stop every playing SFX and the beat loop (Scratch `stop all sounds`). */
  stopAllSfx() {
    for (const src of this.activeSources) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    this.activeSources.clear();
    this.stopBeat();
  }

  startBeat(loopName: string, bpm: number = 120) {
    this.ensureContext();
    if (!this.context || !this.masterGain) return;
    this.stopBeat();
    this.beatBpm = bpm;
    this.isBeatRunning = true;

    // Very simple 4/4 loop: kick on 1 & 3, hat on all 8ths, snare on 2 & 4
    const scheduleBeat = () => {
      if (!this.context || !this.isBeatRunning) return;
      const beatDur = 60 / this.beatBpm; // quarter
      const now = this.context.currentTime;
      for (let step = 0; step < 8; step++) {
        const t = now + step * (beatDur / 2);
        // Hats every 8th
        this.triggerHat(t, 0.05);
        // Kick on step 0 and 4 (1 and 3)
        if (step === 0 || step === 4) this.triggerKick(t, 0.08);
        // Snare on step 2 and 6 (2 and 4)
        if (step === 2 || step === 6) this.triggerSnare(t, 0.08);
      }
    };

    scheduleBeat();
    const intervalMs = (60 / this.beatBpm) * 1000 * 2; // schedule every half bar
    this.beatInterval = window.setInterval(scheduleBeat, intervalMs);
  }

  stopBeat() {
    this.isBeatRunning = false;
    if (this.beatInterval) {
      window.clearInterval(this.beatInterval);
      this.beatInterval = null;
    }
  }

  private triggerKick(time: number, length: number) {
    if (!this.context || !this.masterGain) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + length);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.9, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + length + 0.02);
  }

  private triggerSnare(time: number, length: number) {
    if (!this.context || !this.masterGain) return;
    // White noise snare
    const bufferSize = this.context.sampleRate * length;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.context.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = this.context.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.5, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    noise.connect(noiseFilter);
    noiseFilter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(time);
    noise.stop(time + length + 0.02);
  }

  private triggerHat(time: number, length: number) {
    if (!this.context || !this.masterGain) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(8000, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.15, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + length + 0.02);
  }
}

export default AudioManager;


