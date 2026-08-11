import { createRequire } from 'node:module';
import * as THREE from 'three';

const require = createRequire(import.meta.url);
const { modelCache } = require('../.build/lib/utils/modelCache.js');
const { startAsyncResourceLifecycle } = require('../.build/lib/utils/asyncResourceLifecycle.js');

let failures = 0;

function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) {
    failures++;
    console.log(`FAIL ${label}: expected ${expected}, got ${actual}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

modelCache.clear();

eq(typeof modelCache.acquire, 'function', 'model cache exposes explicit reference-counted acquisitions');
eq(typeof startAsyncResourceLifecycle, 'function', 'async resource lifecycle is available');

if (typeof modelCache.acquire !== 'function' || typeof startAsyncResourceLifecycle !== 'function') {
  console.log(`\n${failures} FAILURES`);
  process.exit(1);
}

let loads = 0;
const sourceModel = new THREE.Group();
const acquire = () => modelCache.acquire('/models/test.fbx', async () => {
  loads++;
  await Promise.resolve();
  return { model: sourceModel, animations: [] };
});

const [firstLease, secondLease] = await Promise.all([acquire(), acquire()]);
eq(loads, 1, 'concurrent acquisitions share one underlying FBX load');
eq(modelCache.getStats().totalRefs, 2, 'each acquisition owns one cache reference');

firstLease.release();
firstLease.release();
eq(modelCache.getStats().totalRefs, 1, 'a lease releases its cache reference at most once');

secondLease.release();
eq(modelCache.getStats().totalRefs, 0, 'all acquired cache references are balanced');

const pending = deferred();
const callbackCalls = [];
let lifecycleReleases = 0;
const handlersRef = {
  current: {
    onLoad: () => callbackCalls.push('stale'),
    onError: () => callbackCalls.push('stale-error'),
  },
};

const stop = startAsyncResourceLifecycle(
  () => pending.promise,
  handlersRef,
);

handlersRef.current = {
  onLoad: (resource) => callbackCalls.push(resource),
  onError: () => callbackCalls.push('fresh-error'),
};
pending.resolve({
  resource: 'fresh-callback',
  release: () => { lifecycleReleases++; },
});
await pending.promise;
await Promise.resolve();

eq(JSON.stringify(callbackCalls), JSON.stringify(['fresh-callback']), 'an in-flight load calls the latest callback without reacquiring');
stop();
stop();
eq(lifecycleReleases, 1, 'mounted lifecycle cleanup releases its lease exactly once');

const latePending = deferred();
let lateCallbacks = 0;
let lateReleases = 0;
const stopBeforeLoad = startAsyncResourceLifecycle(
  () => latePending.promise,
  { current: { onLoad: () => { lateCallbacks++; } } },
);
stopBeforeLoad();
latePending.resolve({
  resource: 'late',
  release: () => { lateReleases++; },
});
await latePending.promise;
await Promise.resolve();

eq(lateCallbacks, 0, 'an unmounted lifecycle ignores a late load');
eq(lateReleases, 1, 'an unmounted lifecycle releases a late acquisition exactly once');

let handlerErrorReleases = 0;
let handlerErrors = 0;
const stopAfterHandlerError = startAsyncResourceLifecycle(
  async () => ({
    resource: 'handler-error',
    release: () => { handlerErrorReleases++; },
  }),
  {
    current: {
      onLoad: () => { throw new Error('attach failed'); },
      onError: () => { handlerErrors++; },
    },
  },
);
await Promise.resolve();
await Promise.resolve();

eq(handlerErrors, 1, 'resource attachment errors reach the latest error handler');
eq(handlerErrorReleases, 0, 'a mounted URL retains its acquired reference after a handler error');
stopAfterHandlerError();
eq(handlerErrorReleases, 1, 'handler-error cleanup releases the mounted URL exactly once');

modelCache.clear();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
