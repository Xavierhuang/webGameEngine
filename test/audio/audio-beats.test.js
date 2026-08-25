'use strict';

const assert = require('node:assert/strict');

class FakeParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeNode {
  connect() {}
  disconnect() {}
}

class FakeSource extends FakeNode {
  constructor(kind) {
    super();
    this.kind = kind;
    this.frequency = new FakeParam();
    this.stopCalls = [];
    this.onended = null;
  }

  start() {}
  stop(time) {
    this.stopCalls.push(time);
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 1;
    this.sampleRate = 1000;
    this.destination = new FakeNode();
    this.state = 'running';
    this.sources = [];
  }

  createGain() {
    const gain = new FakeNode();
    gain.gain = new FakeParam();
    return gain;
  }

  createOscillator() {
    const source = new FakeSource('oscillator');
    this.sources.push(source);
    return source;
  }

  createBufferSource() {
    const source = new FakeSource('buffer');
    this.sources.push(source);
    return source;
  }

  createBiquadFilter() {
    const filter = new FakeNode();
    filter.frequency = new FakeParam();
    return filter;
  }

  createBuffer(_channels, frames) {
    return { getChannelData: () => new Float32Array(frames) };
  }

  resume() { return Promise.resolve(); }
}

const fakeContext = new FakeAudioContext();
global.window = {
  AudioContext: class { constructor() { return fakeContext; } },
  addEventListener() {},
  removeEventListener() {},
  setInterval() { return 1; },
  clearInterval() {},
};

const AudioManager = require('../.build/lib/audio/AudioManager.js').default;
const audio = AudioManager.get();

audio.startBeat('chill', 90);
const beatSources = fakeContext.sources.slice();
const beatStopsBefore = beatSources.map((source) => source.stopCalls.length);

audio.playSfx('fanfare');
const fanfareSources = fakeContext.sources.slice(beatSources.length);
const fanfareStopsBefore = fanfareSources.map((source) => source.stopCalls.length);

audio.stopBeat();

assert.equal(
  beatSources.every((source, index) => source.stopCalls.length === beatStopsBefore[index] + 1),
  true,
  'stopping the background beat cancels every queued beat note immediately',
);
assert.equal(
  fanfareSources.every((source, index) => source.stopCalls.length === fanfareStopsBefore[index]),
  true,
  'stopping background music lets a one-time success fanfare finish',
);

console.log('Audio beat tests passed');
