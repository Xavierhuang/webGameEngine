/**
 * Video sensing end to end, against a synthetic camera.
 *
 * I told the user this feature needed a camera I did not have. That was wrong,
 * and worth recording: Chromium ships a fake capture device
 * (--use-fake-device-for-media-stream) that produces a real MediaStream through
 * the real getUserMedia path, and — the part that makes it useful — its picture
 * moves between frames. So the whole pipeline is testable here: permission,
 * stream, video element, canvas sampling, and motion coming out the other end.
 *
 * What still genuinely needs a person and a real camera is calibration: whether
 * NOISE_FLOOR and SENSITIVITY feel right for a hand waving in a real room with
 * real lighting. That is tuning, not correctness, and this cannot answer it.
 *
 *   node test/video/camera-pipeline.mjs [baseUrl]
 */

import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const context = await browser.newContext({ permissions: ['camera'] });
const page = await context.newPage();
// getUserMedia needs a secure context; localhost counts.
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async () => {
  const SAMPLE_W = 160;
  const SAMPLE_H = 120;

  // Mirrors components/player/VideoSensing.tsx. The motion maths itself is
  // unit-tested separately; what this exercises is the browser plumbing.
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: SAMPLE_W * 2, height: SAMPLE_H * 2 },
    audio: false,
  });
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  await new Promise((r) => setTimeout(r, 500));

  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const grab = () => {
    ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    return new Uint8ClampedArray(ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data);
  };

  const frames = [];
  for (let i = 0; i < 6; i++) {
    frames.push(grab());
    await new Promise((r) => setTimeout(r, 120));
  }

  // A still frame compared with itself must be silent, whatever the camera is
  // pointed at — this is the check that catches a detector that reports motion
  // from noise alone.
  const still = frames[0];

  const trackSettings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
  stream.getTracks().forEach((t) => t.stop());
  const liveAfterStop = stream.getVideoTracks().some((t) => t.readyState === 'live');

  return {
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    frameBytes: still.length,
    frames: frames.map((f) => Array.from(f.slice(0, 0))), // placeholder, unused
    settingsWidth: trackSettings.width ?? 0,
    liveAfterStop,
    // Ship the frames out as plain arrays so the assertions run in node, using
    // the same detectMotion the app uses rather than a copy.
    raw: frames.map((f) => Array.from(f)),
  };
});

check('the camera opens through the real getUserMedia path', result.videoWidth > 0,
  `videoWidth was ${result.videoWidth}`);
check('frames arrive at the sampled size', result.frameBytes === 160 * 120 * 4,
  `got ${result.frameBytes} bytes`);
check('stopping the stream really stops it', result.liveAfterStop === false,
  'a track was still live after stop() — the camera indicator would lie');

// Use the app's own detector, not a reimplementation.
const { detectMotion } = await import('../.build/lib/video/motion.js');
const frames = result.raw.map((a) => Uint8ClampedArray.from(a));

const still = detectMotion(frames[0], frames[0], 160, 120);
check('a frame compared with itself reports no motion', still.amount === 0,
  `reported ${still.amount}`);

const readings = [];
for (let i = 1; i < frames.length; i++) {
  readings.push(detectMotion(frames[i - 1], frames[i], 160, 120));
}
const moved = readings.filter((r) => r.amount > 0);
check('a moving picture produces motion readings', moved.length > 0,
  `all ${readings.length} frame pairs reported zero — is the fake device static?`);

check('every reading is in range', readings.every((r) =>
  r.amount >= 0 && r.amount <= 100 && r.direction >= 0 && r.direction < 360),
  JSON.stringify(readings.slice(0, 3)));

console.log(
  `\nreadings: ${readings.map((r) => `${r.amount}@${r.direction}°`).join(' ')}`
);

await browser.close();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
