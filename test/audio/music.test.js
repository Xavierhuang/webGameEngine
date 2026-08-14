const {
  midiToFrequency, beatsToSeconds, clampTempo, DRUMS, DRUM_IDS,
  INSTRUMENTS, INSTRUMENT_IDS, drumOptions, instrumentOptions, MIDDLE_C,
} = require('../.build/lib/audio/music.js');

let failures = 0;
function close(a, b, label, tol = 0.01) {
  if (Math.abs(a - b) > tol) { failures++; console.log(`FAIL ${label}: expected ~${b}, got ${a}`); }
  else console.log(`ok   ${label}`);
}
function eq(a, b, label) {
  if (!Object.is(a, b)) { failures++; console.log(`FAIL ${label}: expected ${b}, got ${a}`); }
  else console.log(`ok   ${label}`);
}
function ok(c, label) { eq(Boolean(c), true, label); }

close(midiToFrequency(69), 440, 'A4 (MIDI 69) is 440 Hz');
close(midiToFrequency(60), 261.63, 'middle C is ~261.63 Hz');
close(midiToFrequency(81), 880, 'an octave up doubles the frequency');
close(midiToFrequency(57), 220, 'an octave down halves it');
eq(MIDDLE_C, 60, 'middle C is MIDI 60');

ok(midiToFrequency(-50) > 0, 'below-range note clamps to something audible');
ok(Number.isFinite(midiToFrequency(9999)), 'above-range note stays finite');
eq(midiToFrequency(NaN), 0, 'NaN note returns 0 rather than NaN');
eq(midiToFrequency('x'), 0, 'non-numeric note returns 0');

close(beatsToSeconds(1, 60), 1, '1 beat at 60bpm is 1 second');
close(beatsToSeconds(2, 120), 1, '2 beats at 120bpm is 1 second');
close(beatsToSeconds(0.25, 60), 0.25, 'fractional beats work');
eq(beatsToSeconds(-5, 60), 0, 'negative beats clamp to 0');
close(beatsToSeconds(1000, 60), 100, 'beats cap at 100 like Scratch');
ok(Number.isFinite(beatsToSeconds(1, 0)), 'zero tempo does not divide by zero');
ok(beatsToSeconds(1, 0) > 0, 'zero tempo clamps to the minimum, not infinity');

eq(clampTempo(10), 20, 'tempo clamps up to the minimum');
eq(clampTempo(9999), 500, 'tempo clamps down to the maximum');
eq(clampTempo(NaN), 60, 'NaN tempo falls back to 60');

ok(DRUM_IDS.length >= 9, `${DRUM_IDS.length} drums available`);
ok(INSTRUMENT_IDS.length >= 6, `${INSTRUMENT_IDS.length} instruments available`);
for (const id of DRUM_IDS) {
  const d = DRUMS[id];
  ok(d.duration > 0, `drum '${id}' has a positive duration`);
  ok(d.gain > 0 && d.gain <= 1, `drum '${id}' gain is in range`);
}
for (const id of INSTRUMENT_IDS) {
  const i = INSTRUMENTS[id];
  ok(['sine', 'square', 'sawtooth', 'triangle'].includes(i.wave), `instrument '${id}' has a valid waveform`);
  ok(i.decay >= 0 && i.decay <= 1, `instrument '${id}' decay is a fraction`);
}
eq(drumOptions().length, DRUM_IDS.length, 'every drum is offered');
eq(instrumentOptions().length, INSTRUMENT_IDS.length, 'every instrument is offered');

if (failures > 0) { console.log(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nAll music tests passed');
