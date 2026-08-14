/**
 * The sound catalog — pure data, no Web Audio, so the picker, the block
 * dropdown and node tests can all share one source of truth.
 *
 * Previously there were six hardcoded oscillator beeps, duplicated in three
 * places (two block dropdowns in definitions.ts and a switch in AudioManager)
 * that had to be kept in lockstep by hand.
 *
 * These are synthesized rather than recorded: shipping Scratch's ~1000-sample
 * library isn't something this repo can carry. `kind: 'sample'` entries let a
 * real audio file be used by URL, which is how user-uploaded sounds work.
 */

export type SoundCategory = 'ui' | 'game' | 'animal' | 'music' | 'ambient';

export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface SoundSpec {
  id: string;
  name: string;
  category: SoundCategory;
  /** Rough duration in seconds, used for `play sound until done`. */
  duration: number;
  /** Synthesis recipe. `noise` uses a filtered white-noise burst. */
  layers: Array<{
    wave: Waveform | 'noise';
    /** Starting frequency in Hz. Ignored for noise. */
    freq: number;
    /** Optional glide target — produces sweeps (lasers, boings, meows). */
    toFreq?: number;
    /** Fraction of the total duration this layer occupies (0-1). */
    length?: number;
    /** Delay before this layer starts, as a fraction of duration. */
    delay?: number;
    /** Relative loudness 0-1. */
    gain?: number;
    /** Low-pass cutoff for noise layers. */
    cutoff?: number;
  }>;
}

export const SOUND_CATALOG: SoundSpec[] = [
  // --- UI -----------------------------------------------------------------
  { id: 'click', name: 'Click', category: 'ui', duration: 0.06,
    layers: [{ wave: 'square', freq: 800, gain: 0.5 }] },
  { id: 'confirm', name: 'Confirm', category: 'ui', duration: 0.22,
    layers: [
      { wave: 'triangle', freq: 600, length: 0.5, gain: 0.5 },
      { wave: 'triangle', freq: 900, delay: 0.45, length: 0.55, gain: 0.5 },
    ] },
  { id: 'error', name: 'Error', category: 'ui', duration: 0.3,
    layers: [{ wave: 'sawtooth', freq: 200, toFreq: 120, gain: 0.4 }] },
  { id: 'pop', name: 'Pop', category: 'ui', duration: 0.09,
    layers: [{ wave: 'sine', freq: 400, toFreq: 1000, gain: 0.6 }] },
  { id: 'whoosh', name: 'Whoosh', category: 'ui', duration: 0.35,
    layers: [{ wave: 'noise', freq: 0, cutoff: 1600, gain: 0.35 }] },

  // --- Game ---------------------------------------------------------------
  { id: 'pickup', name: 'Pickup', category: 'game', duration: 0.16,
    layers: [
      { wave: 'triangle', freq: 900, length: 0.4, gain: 0.5 },
      { wave: 'triangle', freq: 1350, delay: 0.35, length: 0.65, gain: 0.45 },
    ] },
  { id: 'coin', name: 'Coin', category: 'game', duration: 0.5,
    layers: [
      { wave: 'square', freq: 988, length: 0.18, gain: 0.35 },
      { wave: 'square', freq: 1319, delay: 0.16, length: 0.84, gain: 0.35 },
    ] },
  { id: 'jump', name: 'Jump', category: 'game', duration: 0.18,
    layers: [{ wave: 'square', freq: 380, toFreq: 760, gain: 0.45 }] },
  { id: 'boing', name: 'Boing', category: 'game', duration: 0.3,
    layers: [{ wave: 'sine', freq: 700, toFreq: 180, gain: 0.5 }] },
  { id: 'hit', name: 'Hit', category: 'game', duration: 0.18,
    layers: [
      { wave: 'square', freq: 150, toFreq: 60, gain: 0.5 },
      { wave: 'noise', freq: 0, cutoff: 800, length: 0.5, gain: 0.3 },
    ] },
  { id: 'laser', name: 'Laser', category: 'game', duration: 0.25,
    layers: [{ wave: 'sawtooth', freq: 1400, toFreq: 200, gain: 0.35 }] },
  { id: 'explosion', name: 'Explosion', category: 'game', duration: 0.7,
    layers: [
      { wave: 'noise', freq: 0, cutoff: 500, gain: 0.5 },
      { wave: 'sine', freq: 90, toFreq: 30, length: 0.6, gain: 0.4 },
    ] },
  { id: 'powerup', name: 'Power up', category: 'game', duration: 0.55,
    layers: [
      { wave: 'square', freq: 392, length: 0.25, gain: 0.3 },
      { wave: 'square', freq: 523, delay: 0.25, length: 0.25, gain: 0.3 },
      { wave: 'square', freq: 659, delay: 0.5, length: 0.25, gain: 0.3 },
      { wave: 'square', freq: 784, delay: 0.72, length: 0.28, gain: 0.32 },
    ] },
  { id: 'gameover', name: 'Game over', category: 'game', duration: 0.9,
    layers: [
      { wave: 'triangle', freq: 440, length: 0.3, gain: 0.35 },
      { wave: 'triangle', freq: 349, delay: 0.3, length: 0.3, gain: 0.35 },
      { wave: 'triangle', freq: 262, delay: 0.6, length: 0.4, gain: 0.35 },
    ] },

  // --- Animals ------------------------------------------------------------
  { id: 'meow', name: 'Meow', category: 'animal', duration: 0.45,
    layers: [
      { wave: 'sawtooth', freq: 620, toFreq: 900, length: 0.45, gain: 0.28 },
      { wave: 'sawtooth', freq: 900, toFreq: 480, delay: 0.42, length: 0.58, gain: 0.28 },
    ] },
  { id: 'bark', name: 'Bark', category: 'animal', duration: 0.22,
    layers: [
      { wave: 'sawtooth', freq: 280, toFreq: 160, gain: 0.4 },
      { wave: 'noise', freq: 0, cutoff: 1200, length: 0.4, gain: 0.25 },
    ] },
  { id: 'bird', name: 'Bird', category: 'animal', duration: 0.3,
    layers: [
      { wave: 'sine', freq: 2200, toFreq: 3000, length: 0.35, gain: 0.25 },
      { wave: 'sine', freq: 2600, toFreq: 1900, delay: 0.4, length: 0.5, gain: 0.25 },
    ] },
  { id: 'roar', name: 'Roar', category: 'animal', duration: 0.8,
    layers: [
      { wave: 'sawtooth', freq: 110, toFreq: 70, gain: 0.4 },
      { wave: 'noise', freq: 0, cutoff: 700, gain: 0.3 },
    ] },

  // --- Music --------------------------------------------------------------
  { id: 'note_c', name: 'Note C', category: 'music', duration: 0.5,
    layers: [{ wave: 'sine', freq: 262, gain: 0.4 }] },
  { id: 'note_e', name: 'Note E', category: 'music', duration: 0.5,
    layers: [{ wave: 'sine', freq: 330, gain: 0.4 }] },
  { id: 'note_g', name: 'Note G', category: 'music', duration: 0.5,
    layers: [{ wave: 'sine', freq: 392, gain: 0.4 }] },
  { id: 'chord', name: 'Happy chord', category: 'music', duration: 0.8,
    layers: [
      { wave: 'sine', freq: 262, gain: 0.25 },
      { wave: 'sine', freq: 330, gain: 0.25 },
      { wave: 'sine', freq: 392, gain: 0.25 },
    ] },
  { id: 'drum_kick', name: 'Kick drum', category: 'music', duration: 0.2,
    layers: [{ wave: 'sine', freq: 150, toFreq: 45, gain: 0.6 }] },
  { id: 'drum_snare', name: 'Snare', category: 'music', duration: 0.16,
    layers: [{ wave: 'noise', freq: 0, cutoff: 2500, gain: 0.4 }] },
  { id: 'drum_hat', name: 'Hi-hat', category: 'music', duration: 0.06,
    layers: [{ wave: 'noise', freq: 0, cutoff: 9000, gain: 0.25 }] },

  // --- Ambient ------------------------------------------------------------
  { id: 'wind', name: 'Wind', category: 'ambient', duration: 1.2,
    layers: [{ wave: 'noise', freq: 0, cutoff: 500, gain: 0.22 }] },
  { id: 'water', name: 'Water drop', category: 'ambient', duration: 0.3,
    layers: [{ wave: 'sine', freq: 1200, toFreq: 500, gain: 0.35 }] },
  { id: 'magic', name: 'Magic', category: 'ambient', duration: 0.6,
    layers: [
      { wave: 'sine', freq: 800, toFreq: 2000, length: 0.6, gain: 0.25 },
      { wave: 'sine', freq: 1200, toFreq: 2600, delay: 0.2, length: 0.7, gain: 0.2 },
    ] },
  // --- Expanded library ----------------------------------------------------
  { id: 'beep', name: 'Beep', category: 'ui', duration: 0.1,
    layers: [{ wave: 'sine', freq: 1000, gain: 0.4 }] },
  { id: 'select', name: 'Select', category: 'ui', duration: 0.08,
    layers: [{ wave: 'triangle', freq: 700, toFreq: 1100, gain: 0.4 }] },
  { id: 'cancel', name: 'Cancel', category: 'ui', duration: 0.16,
    layers: [{ wave: 'triangle', freq: 500, toFreq: 300, gain: 0.4 }] },
  { id: 'notify', name: 'Notify', category: 'ui', duration: 0.35,
    layers: [
      { wave: 'sine', freq: 880, length: 0.4, gain: 0.35 },
      { wave: 'sine', freq: 1174, delay: 0.4, length: 0.6, gain: 0.35 },
    ] },
  { id: 'typewriter', name: 'Typewriter', category: 'ui', duration: 0.05,
    layers: [{ wave: 'noise', freq: 0, cutoff: 4000, gain: 0.3 }] },

  { id: 'footstep', name: 'Footstep', category: 'game', duration: 0.12,
    layers: [{ wave: 'noise', freq: 0, cutoff: 900, gain: 0.28 }] },
  { id: 'door', name: 'Door', category: 'game', duration: 0.5,
    layers: [{ wave: 'sawtooth', freq: 180, toFreq: 90, gain: 0.3 }] },
  { id: 'splash', name: 'Splash', category: 'game', duration: 0.4,
    layers: [{ wave: 'noise', freq: 0, cutoff: 3000, gain: 0.35 }] },
  { id: 'swoosh', name: 'Swoosh', category: 'game', duration: 0.3,
    layers: [{ wave: 'noise', freq: 0, cutoff: 2200, gain: 0.3 }] },
  { id: 'teleport', name: 'Teleport', category: 'game', duration: 0.55,
    layers: [
      { wave: 'sine', freq: 300, toFreq: 1800, length: 0.6, gain: 0.3 },
      { wave: 'square', freq: 600, toFreq: 2400, delay: 0.3, length: 0.7, gain: 0.18 },
    ] },
  { id: 'shield', name: 'Shield', category: 'game', duration: 0.35,
    layers: [{ wave: 'triangle', freq: 500, toFreq: 900, gain: 0.32 }] },
  { id: 'break', name: 'Break', category: 'game', duration: 0.35,
    layers: [
      { wave: 'noise', freq: 0, cutoff: 5000, length: 0.5, gain: 0.35 },
      { wave: 'square', freq: 260, toFreq: 120, delay: 0.2, length: 0.6, gain: 0.25 },
    ] },
  { id: 'levelup', name: 'Level up', category: 'game', duration: 0.7,
    layers: [
      { wave: 'square', freq: 523, length: 0.2, gain: 0.3 },
      { wave: 'square', freq: 659, delay: 0.2, length: 0.2, gain: 0.3 },
      { wave: 'square', freq: 784, delay: 0.4, length: 0.2, gain: 0.3 },
      { wave: 'square', freq: 1047, delay: 0.6, length: 0.4, gain: 0.32 },
    ] },
  { id: 'lose-life', name: 'Lose a life', category: 'game', duration: 0.6,
    layers: [{ wave: 'sawtooth', freq: 400, toFreq: 80, gain: 0.35 }] },

  { id: 'cow', name: 'Cow', category: 'animal', duration: 0.7,
    layers: [{ wave: 'sawtooth', freq: 180, toFreq: 130, gain: 0.32 }] },
  { id: 'duck', name: 'Duck', category: 'animal', duration: 0.22,
    layers: [{ wave: 'sawtooth', freq: 520, toFreq: 380, gain: 0.3 }] },
  { id: 'frog', name: 'Frog', category: 'animal', duration: 0.2,
    layers: [{ wave: 'square', freq: 180, toFreq: 260, gain: 0.3 }] },
  { id: 'owl', name: 'Owl', category: 'animal', duration: 0.5,
    layers: [
      { wave: 'sine', freq: 420, length: 0.4, gain: 0.28 },
      { wave: 'sine', freq: 380, delay: 0.45, length: 0.55, gain: 0.28 },
    ] },
  { id: 'horse', name: 'Horse', category: 'animal', duration: 0.45,
    layers: [{ wave: 'sawtooth', freq: 300, toFreq: 500, gain: 0.28 }] },
  { id: 'bee', name: 'Bee', category: 'animal', duration: 0.8,
    layers: [{ wave: 'sawtooth', freq: 220, gain: 0.18 }] },

  { id: 'note_d', name: 'Note D', category: 'music', duration: 0.5,
    layers: [{ wave: 'sine', freq: 294, gain: 0.4 }] },
  { id: 'note_f', name: 'Note F', category: 'music', duration: 0.5,
    layers: [{ wave: 'sine', freq: 349, gain: 0.4 }] },
  { id: 'note_a', name: 'Note A', category: 'music', duration: 0.5,
    layers: [{ wave: 'sine', freq: 440, gain: 0.4 }] },
  { id: 'note_b', name: 'Note B', category: 'music', duration: 0.5,
    layers: [{ wave: 'sine', freq: 494, gain: 0.4 }] },
  { id: 'sad_chord', name: 'Sad chord', category: 'music', duration: 0.9,
    layers: [
      { wave: 'sine', freq: 262, gain: 0.24 },
      { wave: 'sine', freq: 311, gain: 0.24 },
      { wave: 'sine', freq: 392, gain: 0.24 },
    ] },
  { id: 'cymbal', name: 'Cymbal', category: 'music', duration: 0.8,
    layers: [{ wave: 'noise', freq: 0, cutoff: 9000, gain: 0.28 }] },
  { id: 'tom', name: 'Tom drum', category: 'music', duration: 0.25,
    layers: [{ wave: 'sine', freq: 220, toFreq: 110, gain: 0.5 }] },
  { id: 'fanfare', name: 'Fanfare', category: 'music', duration: 1.0,
    layers: [
      { wave: 'square', freq: 523, length: 0.18, gain: 0.28 },
      { wave: 'square', freq: 523, delay: 0.2, length: 0.15, gain: 0.28 },
      { wave: 'square', freq: 659, delay: 0.38, length: 0.2, gain: 0.28 },
      { wave: 'square', freq: 784, delay: 0.6, length: 0.4, gain: 0.3 },
    ] },

  { id: 'thunder', name: 'Thunder', category: 'ambient', duration: 1.2,
    layers: [
      { wave: 'noise', freq: 0, cutoff: 400, gain: 0.4 },
      { wave: 'sine', freq: 60, toFreq: 30, length: 0.7, gain: 0.35 },
    ] },
  { id: 'rain', name: 'Rain', category: 'ambient', duration: 1.5,
    layers: [{ wave: 'noise', freq: 0, cutoff: 3500, gain: 0.18 }] },
  { id: 'fire', name: 'Fire', category: 'ambient', duration: 1.2,
    layers: [{ wave: 'noise', freq: 0, cutoff: 1200, gain: 0.2 }] },
  { id: 'heartbeat', name: 'Heartbeat', category: 'ambient', duration: 0.8,
    layers: [
      { wave: 'sine', freq: 70, toFreq: 40, length: 0.18, gain: 0.5 },
      { wave: 'sine', freq: 65, toFreq: 38, delay: 0.28, length: 0.2, gain: 0.4 },
    ] },
  { id: 'chime', name: 'Wind chime', category: 'ambient', duration: 1.0,
    layers: [
      { wave: 'sine', freq: 1400, length: 0.5, gain: 0.2 },
      { wave: 'sine', freq: 1900, delay: 0.25, length: 0.6, gain: 0.16 },
      { wave: 'sine', freq: 1650, delay: 0.5, length: 0.5, gain: 0.14 },
    ] },
];

export const SOUND_IDS = SOUND_CATALOG.map((s) => s.id);

export function getSound(id: string): SoundSpec | undefined {
  return SOUND_CATALOG.find((s) => s.id === id);
}

export function soundsByCategory(category: SoundCategory): SoundSpec[] {
  return SOUND_CATALOG.filter((s) => s.category === category);
}

/** Dropdown options for the Blockly `play sound` blocks. */
export function soundDropdownOptions(): [string, string][] {
  return SOUND_CATALOG.map((s) => [s.name, s.id]);
}

/** A URL (rather than a catalog id) means "play this real audio file". */
export function isSampleUrl(value: string): boolean {
  return /^(https?:)?\/\//.test(value) || value.startsWith('/');
}
