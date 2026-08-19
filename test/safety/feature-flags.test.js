const assert = require('node:assert/strict');
const test = require('node:test');
const {
  readFeatureFlag,
  knownFeatureFlags,
  FeatureFlagReason,
} = require('../.build/lib/safety/featureFlags');

function env(overrides = {}) {
  return { NODE_ENV: 'test', ...overrides };
}

test('unset flag defaults to enabled in non-production', () => {
  const result = readFeatureFlag('creation_ai', { env: env() });
  assert.equal(result.enabled, true);
  assert.equal(result.reason, FeatureFlagReason.Enabled);
  assert.equal(result.name, 'creation_ai');
});

test('unset flag defaults to disabled in production', () => {
  const result = readFeatureFlag('creation_ai', { env: env({ NODE_ENV: 'production' }) });
  assert.equal(result.enabled, false);
  assert.equal(result.reason, FeatureFlagReason.Disabled);
});

test('accepts every documented truthy value', () => {
  for (const value of ['1', 'true', 'TRUE', 'yes', 'on', 'enabled']) {
    const result = readFeatureFlag('creation_ai', {
      env: env({ FEATURE_FLAG_CREATION_AI: value }),
    });
    assert.equal(result.enabled, true, `value ${value} unexpectedly disabled`);
  }
});

test('accepts every documented falsy value', () => {
  for (const value of ['0', 'false', 'FALSE', 'no', 'off', 'disabled']) {
    const result = readFeatureFlag('creation_ai', {
      env: env({ FEATURE_FLAG_CREATION_AI: value }),
    });
    assert.equal(result.enabled, false, `value ${value} unexpectedly enabled`);
  }
});

test('trims whitespace before parsing', () => {
  const result = readFeatureFlag('creation_ai', {
    env: env({ FEATURE_FLAG_CREATION_AI: '  true  ' }),
  });
  assert.equal(result.enabled, true);
});

test('malformed env value throws — silent fallback would look like a kill switch during audit', () => {
  assert.throws(
    () => readFeatureFlag('creation_ai', { env: env({ FEATURE_FLAG_CREATION_AI: 'truue' }) }),
    /invalid FEATURE_FLAG_CREATION_AI value/,
  );
});

test('unknown flag name is a programmer error, not a silent disable', () => {
  assert.throws(
    () => readFeatureFlag('nonexistent_flag', { env: env() }),
    /unknown flag name/,
  );
});

test('env variable name is derived from the flag name — routes cannot smuggle aliases', () => {
  // If a route tried to override creation_ai by setting a made-up variable,
  // the reader must ignore that and read only FEATURE_FLAG_CREATION_AI.
  const result = readFeatureFlag('creation_ai', {
    env: env({
      NODE_ENV: 'production',
      FEATURE_FLAG_AI: 'true',
      FLAG_CREATION_AI: 'true',
      CREATION_AI: 'true',
    }),
  });
  assert.equal(result.enabled, false, 'only FEATURE_FLAG_CREATION_AI must count');
});

test('flags are independent — one enabled does not enable another', () => {
  const env_ = env({
    NODE_ENV: 'production',
    FEATURE_FLAG_CREATION_AI: 'true',
  });
  assert.equal(readFeatureFlag('creation_ai', { env: env_ }).enabled, true);
  assert.equal(readFeatureFlag('personal_media', { env: env_ }).enabled, false);
  assert.equal(readFeatureFlag('community_publishing', { env: env_ }).enabled, false);
  assert.equal(readFeatureFlag('remote_model_imports', { env: env_ }).enabled, false);
  assert.equal(readFeatureFlag('ai_moderation', { env: env_ }).enabled, false);
});

test('knownFeatureFlags exposes every supported flag once', () => {
  const flags = knownFeatureFlags();
  const asSet = new Set(flags);
  assert.equal(asSet.size, flags.length, 'no duplicates');
  assert.deepEqual(asSet, new Set([
    'creation_ai',
    'personal_media',
    'community_publishing',
    'remote_model_imports',
    'ai_moderation',
  ]));
});

test('reason codes match the wire contract', () => {
  assert.deepEqual(FeatureFlagReason, {
    Disabled: 'flag_disabled',
    Enabled: 'flag_enabled',
    MisconfiguredInProduction: 'flag_misconfigured_in_production',
  });
});
