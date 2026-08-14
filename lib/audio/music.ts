/**
 * Music extension — note/drum/tempo maths.
 *
 * Pure, no Web Audio, so it can be unit-tested in node and shared by the
 * AudioManager. Mirrors Scratch's Music extension, which is one of the two
 * extensions kids actually reach for (the other being Pen).
 */

/** Scratch uses MIDI note numbers; 60 is middle C. */
export const MIDDLE_C = 60;

export const MIN_TEMPO = 20;
export const MAX_TEMPO = 500;

/** Equal temperament, A4 (MIDI 69) = 440 Hz. */
export function midiToFrequency(note: number): number {
  const n = Number(note);
  if (!Number.isFinite(n)) return 0;
  // Scratch clamps playable notes to 0-130.
  const clamped = Math.min(130, Math.max(0, n));
  return 440 * Math.pow(2, (clamped - 69) / 12);
}

/** Beats to seconds at a given tempo. Scratch caps a single note at 100 beats. */
export function beatsToSeconds(beats: number, tempo: number): number {
  const b = Number.isFinite(Number(beats)) ? Math.min(100, Math.max(0, Number(beats))) : 0;
  const t = clampTempo(tempo);
  return (b * 60) / t;
}

export function clampTempo(tempo: number): number {
  const t = Number(tempo);
  if (!Number.isFinite(t)) return 60;
  return Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, t));
}

export type DrumId =
  | 'snare' | 'bass' | 'side-stick' | 'crash' | 'open-hat'
  | 'closed-hat' | 'tambourine' | 'bongo' | 'wood-block';

/** Drum synthesis recipes: noise-based or pitched, matching the catalog style. */
export const DRUMS: Record<DrumId, { wave: 'noise' | 'sine' | 'triangle' | 'square'; freq: number; toFreq?: number; duration: number; cutoff?: number; gain: number }> = {
  bass: { wave: 'sine', freq: 150, toFreq: 45, duration: 0.22, gain: 0.6 },
  snare: { wave: 'noise', freq: 0, duration: 0.16, cutoff: 2500, gain: 0.4 },
  'side-stick': { wave: 'square', freq: 420, duration: 0.06, gain: 0.35 },
  crash: { wave: 'noise', freq: 0, duration: 0.7, cutoff: 9000, gain: 0.3 },
  'open-hat': { wave: 'noise', freq: 0, duration: 0.28, cutoff: 8000, gain: 0.25 },
  'closed-hat': { wave: 'noise', freq: 0, duration: 0.07, cutoff: 9000, gain: 0.25 },
  tambourine: { wave: 'noise', freq: 0, duration: 0.18, cutoff: 6000, gain: 0.22 },
  bongo: { wave: 'sine', freq: 300, toFreq: 180, duration: 0.14, gain: 0.45 },
  'wood-block': { wave: 'triangle', freq: 900, duration: 0.06, gain: 0.35 },
};

export const DRUM_IDS = Object.keys(DRUMS) as DrumId[];

/** Instrument timbres for `play note`. */
export type InstrumentId = 'piano' | 'organ' | 'guitar' | 'bass' | 'marimba' | 'synth';

export const INSTRUMENTS: Record<InstrumentId, { wave: OscillatorTypeName; decay: number }> = {
  piano: { wave: 'triangle', decay: 0.45 },
  organ: { wave: 'sine', decay: 0.05 },
  guitar: { wave: 'sawtooth', decay: 0.55 },
  bass: { wave: 'sine', decay: 0.35 },
  marimba: { wave: 'sine', decay: 0.8 },
  synth: { wave: 'square', decay: 0.2 },
};

export type OscillatorTypeName = 'sine' | 'square' | 'sawtooth' | 'triangle';

export const INSTRUMENT_IDS = Object.keys(INSTRUMENTS) as InstrumentId[];

/** Dropdown options for the Blockly blocks. */
export function drumOptions(): [string, string][] {
  return DRUM_IDS.map((id) => [id.replace(/-/g, ' '), id]);
}

export function instrumentOptions(): [string, string][] {
  return INSTRUMENT_IDS.map((id) => [id, id]);
}
