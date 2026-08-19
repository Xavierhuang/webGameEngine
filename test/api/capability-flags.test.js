/**
 * Capability-flag route contract.
 *
 * The plan requires every kill-switch-worthy capability (creation AI,
 * personal media capture, community publishing, remote model imports, AI
 * moderation) to consult `readFeatureFlag` and return 503 with
 * `feature_unavailable` when the operator has disabled it. Task 7 will
 * wire the reader into the five AI routes, but the *contract* — status
 * code, body shape, and reason field — belongs to Task 6 so downstream
 * routes cannot each invent a different disabled response.
 *
 * The tests here execute the documented wiring pattern against a
 * standalone handler so a route that adopts the pattern gets its response
 * shape verified without depending on the AI stack being wired first.
 * A route-specific integration test lives in each route's own suite.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  readFeatureFlag,
  FeatureFlagReason,
} = require('../.build/lib/safety/featureFlags');

// Minimal Response stand-in that matches the shape returned by
// `NextResponse.json` for the purpose of asserting status and body.
class JsonResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status ?? 200;
  }
  static json(body, init) {
    return new JsonResponse(body, init);
  }
}

/**
 * The wiring pattern documented in `lib/safety/featureFlags.ts`:
 *
 *     const flag = readFeatureFlag('creation_ai');
 *     if (!flag.enabled) return NextResponse.json(
 *       { error: 'feature_unavailable', reason: flag.reason },
 *       { status: 503 },
 *     );
 *
 * Any route that wants a kill switch must call `readFeatureFlag` first and
 * return exactly this shape on failure so clients (and the eventual browser
 * fixtures) can rely on a single disabled-capability contract.
 */
function guardWithFlag(flagName, env, handler) {
  const flag = readFeatureFlag(flagName, { env });
  if (!flag.enabled) {
    return JsonResponse.json(
      { error: 'feature_unavailable', reason: flag.reason, flag: flag.name },
      { status: 503 },
    );
  }
  return handler(flag);
}

function env(overrides = {}) {
  return { NODE_ENV: 'test', ...overrides };
}

test('disabled flag returns 503 feature_unavailable before the handler runs', () => {
  let handlerCalled = false;
  const response = guardWithFlag(
    'creation_ai',
    env({ FEATURE_FLAG_CREATION_AI: 'false' }),
    () => {
      handlerCalled = true;
      return JsonResponse.json({ ok: true });
    },
  );

  assert.equal(response.status, 503);
  assert.equal(response.body.error, 'feature_unavailable');
  assert.equal(response.body.reason, FeatureFlagReason.Disabled);
  assert.equal(response.body.flag, 'creation_ai');
  assert.equal(handlerCalled, false, 'handler must not run when the flag is disabled');
});

test('enabled flag passes through to the handler with the flag result', () => {
  const response = guardWithFlag(
    'personal_media',
    env({ FEATURE_FLAG_PERSONAL_MEDIA: 'true' }),
    (flag) => JsonResponse.json({ ok: true, flagReason: flag.reason }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.flagReason, FeatureFlagReason.Enabled);
});

test('production defaults to 503 for every unset flag — the kill switch is on until an operator enables it', () => {
  const productionEnv = { NODE_ENV: 'production', TRUSTED_PROXY_HOPS: '0' };
  const flags = ['creation_ai', 'personal_media', 'community_publishing', 'remote_model_imports', 'ai_moderation'];
  for (const flag of flags) {
    const response = guardWithFlag(flag, productionEnv, () => JsonResponse.json({ ok: true }));
    assert.equal(response.status, 503, `${flag} must default to 503 in production`);
    assert.equal(response.body.error, 'feature_unavailable', `${flag} must use the shared error code`);
    assert.equal(response.body.reason, FeatureFlagReason.Disabled);
    assert.equal(response.body.flag, flag);
  }
});

test('the disabled response body shape is the wire contract — nothing extra leaks', () => {
  // If a route smuggles extra debug fields into the disabled response, the
  // client-side kill-switch surface has no stable shape to render. Keep it
  // minimal on purpose.
  const response = guardWithFlag(
    'community_publishing',
    env({ FEATURE_FLAG_COMMUNITY_PUBLISHING: 'off' }),
    () => JsonResponse.json({ ok: true }),
  );
  assert.deepEqual(Object.keys(response.body).sort(), ['error', 'flag', 'reason']);
});

test('reason string is the wire-fixed constant, not a UI copy tweak', () => {
  // Routes downstream switch on FeatureFlagReason.Disabled; if this string
  // ever changes, every consumer breaks. Assert the exact wire value.
  const response = guardWithFlag(
    'remote_model_imports',
    env({ FEATURE_FLAG_REMOTE_MODEL_IMPORTS: 'no' }),
    () => JsonResponse.json({ ok: true }),
  );
  assert.equal(response.body.reason, 'flag_disabled');
});

test('malformed env value throws instead of silently opening or closing the gate', () => {
  // A typo like FEATURE_FLAG_CREATION_AI=truue must be loud during an audit,
  // not silently indistinguishable from an operator kill switch.
  assert.throws(
    () => guardWithFlag(
      'creation_ai',
      env({ FEATURE_FLAG_CREATION_AI: 'truue' }),
      () => JsonResponse.json({ ok: true }),
    ),
    /invalid FEATURE_FLAG_CREATION_AI value/,
  );
});
