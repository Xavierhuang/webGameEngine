'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '../..');
const BUILD_ROOT = path.join(ROOT, 'test/.build');
const originalLoad = Module._load;

const OWNER = { kind: 'user', userId: 'user-1', profileId: 'profile-owner' };
const STRANGER = { kind: 'user', userId: 'user-2', profileId: 'profile-stranger' };
const ANONYMOUS = { kind: 'anonymous' };
const GUEST = { kind: 'guest', profileId: 'profile-guest', sessionId: 'session-1' };

const VALID_KEY = 'idem-key-0123456789abcdef';

class FakeReleaseServiceError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'ReleaseServiceError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Loads the compiled route handlers with the release service and actor
 * resolution replaced. `calls` records exactly what each route handed the
 * service, which is how the substitution tests prove the routes never take
 * release/project/snapshot identity from the request body.
 */
function loadRoutes({ actor = OWNER, serviceError, ownerHistory } = {}) {
  const calls = [];
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(BUILD_ROOT)) delete require.cache[key];
  }
  const record = (operation) => async (input) => {
    calls.push({ operation, input });
    if (serviceError) throw serviceError;
    if (operation === 'submit') {
      return { id: 'release-1', status: 'review_pending', sourceRevision: input.expectedRevision, submittedAt: '2026-08-26T00:00:00.000Z', replayed: false };
    }
    return { id: input.releaseId, status: operation === 'withdraw' ? 'withdrawn' : 'published', replayed: false };
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@/lib/auth/actor') return { resolveActor: async () => actor };
    if (request === '@/lib/worlds/releaseService') {
      return {
        ReleaseServiceError: FakeReleaseServiceError,
        submitWorldRelease: record('submit'),
        decideWorldRelease: record('decide'),
        withdrawWorldRelease: record('withdraw'),
        takeDownWorldRelease: record('takedown'),
      };
    }
    if (request === '@/lib/worlds/releaseAccess') {
      return {
        listOwnerWorldReleases: async (input) => {
          calls.push({ operation: 'ownerHistory', input });
          if (serviceError) throw serviceError;
          return ownerHistory ?? [];
        },
      };
    }
    if (request.startsWith('@/')) {
      return originalLoad(path.join(BUILD_ROOT, `${request.slice(2)}.js`), parent, isMain);
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    return {
      calls,
      releases: require(path.join(BUILD_ROOT, 'app/api/projects/[id]/world-releases/route.js')),
      withdraw: require(path.join(BUILD_ROOT, 'app/api/projects/[id]/world-releases/[releaseId]/withdraw/route.js')),
      decision: require(path.join(BUILD_ROOT, 'app/api/admin/world-releases/[releaseId]/decision/route.js')),
      takedown: require(path.join(BUILD_ROOT, 'app/api/admin/world-releases/[releaseId]/takedown/route.js')),
    };
  } finally {
    Module._load = originalLoad;
  }
}

function jsonRequest(body, headers = {}) {
  return {
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input');
      return body;
    },
  };
}

function params(value) {
  return { params: Promise.resolve(value) };
}

async function readJson(response) {
  return { status: response.status, body: await response.json() };
}

test('anonymous and guest actors cannot submit a world release', async () => {
  for (const actor of [ANONYMOUS, GUEST]) {
    const { releases, calls } = loadRoutes({ actor });
    const response = await releases.POST(
      jsonRequest({ expectedRevision: 4 }, { 'idempotency-key': VALID_KEY }),
      params({ id: 'project-1' }),
    );
    assert.equal(response.status, 401, `${actor.kind} must not reach the release service`);
    assert.equal(calls.length, 0, 'authorization precedes any service call');
  }
});

test('a stranger cannot distinguish a project they do not own from one that is absent', async () => {
  const { releases } = loadRoutes({
    actor: STRANGER,
    serviceError: new FakeReleaseServiceError('release_not_found', 404),
  });
  const { status, body } = await readJson(await releases.POST(
    jsonRequest({ expectedRevision: 4 }, { 'idempotency-key': VALID_KEY }),
    params({ id: 'project-1' }),
  ));
  assert.equal(status, 404);
  assert.equal(body.error, 'release_not_found');
});

test('a disabled community publishing flag surfaces as an unavailable feature', async () => {
  const { releases } = loadRoutes({ serviceError: new FakeReleaseServiceError('feature_unavailable', 503) });
  const { status, body } = await readJson(await releases.POST(
    jsonRequest({ expectedRevision: 4 }, { 'idempotency-key': VALID_KEY }),
    params({ id: 'project-1' }),
  ));
  assert.equal(status, 503);
  assert.deepEqual(body, { error: 'feature_unavailable', reason: 'flag_disabled' });
});

test('a stale expected revision is a conflict, not a server error', async () => {
  const { releases } = loadRoutes({ serviceError: new FakeReleaseServiceError('revision_conflict', 409) });
  const { status, body } = await readJson(await releases.POST(
    jsonRequest({ expectedRevision: 3 }, { 'idempotency-key': VALID_KEY }),
    params({ id: 'project-1' }),
  ));
  assert.equal(status, 409);
  assert.equal(body.error, 'revision_conflict');
});

test('a live release holding the snapshot is a typed conflict', async () => {
  const { releases } = loadRoutes({ serviceError: new FakeReleaseServiceError('release_already_in_flight', 409) });
  const { status, body } = await readJson(await releases.POST(
    jsonRequest({ expectedRevision: 4 }, { 'idempotency-key': VALID_KEY }),
    params({ id: 'project-1' }),
  ));
  assert.equal(status, 409);
  assert.equal(body.error, 'release_already_in_flight');
});

test('a non-admin decision is forbidden and never reaches the takedown path', async () => {
  const { decision } = loadRoutes({
    actor: STRANGER,
    serviceError: new FakeReleaseServiceError('release_auth_forbidden', 403),
  });
  const { status, body } = await readJson(await decision.POST(
    jsonRequest({ action: 'publish' }),
    params({ releaseId: 'release-1' }),
  ));
  assert.equal(status, 403);
  assert.equal(body.error, 'release_auth_forbidden');
});

test('an anonymous caller is rejected before the reason code is parsed', async () => {
  // Ledger constraint (Task 4 review, Minor #3): the HTTP surface must not let
  // an unauthorized caller probe the reason-code allowlist.
  const { takedown, calls } = loadRoutes({ actor: ANONYMOUS });
  const invalid = await takedown.POST(jsonRequest({ reasonCode: 'not_a_real_code' }), params({ releaseId: 'release-1' }));
  const valid = await takedown.POST(jsonRequest({ reasonCode: 'content_policy' }), params({ releaseId: 'release-1' }));
  assert.equal(invalid.status, 401);
  assert.equal(valid.status, 401);
  assert.deepEqual(await invalid.json(), await valid.json(), 'an invalid reason code is indistinguishable to an unauthorized caller');
  assert.equal(calls.length, 0);
});

test('submission requires a bounded idempotency key and a non-negative integer revision', async () => {
  const cases = [
    [{ expectedRevision: 4 }, {}, 'a missing idempotency key'],
    [{ expectedRevision: 4 }, { 'idempotency-key': 'too-short' }, 'a key under 16 characters'],
    [{ expectedRevision: 4 }, { 'idempotency-key': 'k'.repeat(129) }, 'a key over 128 characters'],
    [{ expectedRevision: -1 }, { 'idempotency-key': VALID_KEY }, 'a negative revision'],
    [{ expectedRevision: 1.5 }, { 'idempotency-key': VALID_KEY }, 'a fractional revision'],
    [{ expectedRevision: '4' }, { 'idempotency-key': VALID_KEY }, 'a string revision'],
    [{}, { 'idempotency-key': VALID_KEY }, 'a missing revision'],
    [{ expectedRevision: 4, projectId: 'other' }, { 'idempotency-key': VALID_KEY }, 'an unexpected key'],
    [[], { 'idempotency-key': VALID_KEY }, 'an array body'],
    [undefined, { 'idempotency-key': VALID_KEY }, 'an unparseable body'],
  ];
  for (const [body, headers, label] of cases) {
    const { releases, calls } = loadRoutes();
    const response = await releases.POST(jsonRequest(body, headers), params({ id: 'project-1' }));
    assert.equal(response.status, 422, `${label} must be rejected`);
    assert.equal((await response.json()).error, 'invalid_release_input');
    assert.equal(calls.length, 0, `${label} must not reach the release service`);
  }
});

test('release, project, snapshot, and hash identity are never taken from the request body', async () => {
  const { releases, calls } = loadRoutes();
  await releases.POST(
    jsonRequest({ expectedRevision: 4 }, { 'idempotency-key': VALID_KEY }),
    params({ id: 'project-1' }),
  );
  assert.deepEqual(calls[0].input, {
    actor: OWNER, projectId: 'project-1', expectedRevision: 4, idempotencyKey: VALID_KEY,
  });

  const withdrawCall = loadRoutes();
  await withdrawCall.withdraw.POST(jsonRequest({}), params({ id: 'project-1', releaseId: 'release-9' }));
  assert.deepEqual(withdrawCall.calls[0].input, { actor: OWNER, projectId: 'project-1', releaseId: 'release-9' });

  const decisionCall = loadRoutes();
  await decisionCall.decision.POST(
    // Every one of these keys is an attempted substitution of server-owned state.
    jsonRequest({ action: 'publish', releaseId: 'release-evil', projectId: 'project-evil', snapshotId: 's', snapshotSha256: 'h' }),
    params({ releaseId: 'release-9' }),
  );
  assert.equal(decisionCall.calls.length, 0, 'a body carrying server-owned identity is rejected outright');

  const cleanDecision = loadRoutes();
  await cleanDecision.decision.POST(jsonRequest({ action: 'publish' }), params({ releaseId: 'release-9' }));
  assert.deepEqual(cleanDecision.calls[0].input, { actor: OWNER, releaseId: 'release-9', action: 'publish' });
});

test('decision and takedown reject actions and reasons outside the allowlist', async () => {
  for (const action of ['approve', 'delete', 'publish ', '', null, 42]) {
    const { decision, calls } = loadRoutes();
    const response = await decision.POST(jsonRequest({ action }), params({ releaseId: 'release-1' }));
    assert.equal(response.status, 422, `action ${JSON.stringify(action)} must be rejected`);
    assert.equal(calls.length, 0);
  }
  for (const reasonCode of ['approved', 'changes_requested', 'not_a_code', '', null]) {
    const { takedown, calls } = loadRoutes();
    const response = await takedown.POST(jsonRequest({ reasonCode }), params({ releaseId: 'release-1' }));
    assert.equal(response.status, 422, `reason ${JSON.stringify(reasonCode)} must be rejected`);
    assert.equal(calls.length, 0);
  }
});

test('owner status returns release history and no non-owner can inspect it', async () => {
  const history = [{
    id: 'release-1', status: 'review_pending', sourceRevision: 4, submittedAt: '2026-08-26T00:00:00.000Z',
    publicSlug: null, checks: [{ name: 'project_budgets', status: 'passed', reasonCode: null }],
  }];
  const { releases, calls } = loadRoutes({ ownerHistory: history });
  const { status, body } = await readJson(await releases.GET(jsonRequest(), params({ id: 'project-1' })));
  assert.equal(status, 200);
  assert.deepEqual(body, { releases: history });
  assert.deepEqual(calls[0].input, { actor: OWNER, projectId: 'project-1' });

  const anonymous = loadRoutes({ actor: ANONYMOUS });
  assert.equal((await anonymous.releases.GET(jsonRequest(), params({ id: 'project-1' }))).status, 401);
  assert.equal(anonymous.calls.length, 0);

  const stranger = loadRoutes({ actor: STRANGER, serviceError: new FakeReleaseServiceError('release_not_found', 404) });
  assert.equal((await stranger.releases.GET(jsonRequest(), params({ id: 'project-1' }))).status, 404);
});

test('an unexpected failure never serializes internal error detail', async () => {
  const leaky = new Error('connect ECONNREFUSED 10.0.0.5:3306 while running INSERT INTO world_releases');
  leaky.stack = 'Error: secret stack frame';
  for (const [name, invoke] of [
    ['submit', (r) => r.releases.POST(jsonRequest({ expectedRevision: 4 }, { 'idempotency-key': VALID_KEY }), params({ id: 'project-1' }))],
    ['withdraw', (r) => r.withdraw.POST(jsonRequest({}), params({ id: 'project-1', releaseId: 'release-1' }))],
    ['decision', (r) => r.decision.POST(jsonRequest({ action: 'publish' }), params({ releaseId: 'release-1' }))],
    ['takedown', (r) => r.takedown.POST(jsonRequest({ reasonCode: 'content_policy' }), params({ releaseId: 'release-1' }))],
  ]) {
    const routes = loadRoutes({ serviceError: leaky });
    const response = await invoke(routes);
    const serialized = JSON.stringify(await response.json());
    assert.equal(response.status, 500, `${name} maps an unknown failure to 500`);
    assert.doesNotMatch(serialized, /ECONNREFUSED|10\.0\.0\.5|INSERT INTO|secret stack frame/, `${name} leaks internal detail`);
  }
});
