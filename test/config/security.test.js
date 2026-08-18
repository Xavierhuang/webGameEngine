const assert = require('assert');
const { readSecurityConfig } = require('../.build/lib/config/security');

let passed = 0;
function test(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`FAIL ${name}\n  ${error.message}`);
    process.exit(1);
  }
  passed++;
  console.log(`ok   ${name}`);
}

test('production refuses unsafe trust configuration', () => {
  assert.throws(
    () => readSecurityConfig({ NODE_ENV: 'production', TRUSTED_PROXY_HOPS: '' }),
    /TRUSTED_PROXY_HOPS/
  );
});

test('production accepts only non-negative decimal proxy hops', () => {
  assert.strictEqual(
    readSecurityConfig({ NODE_ENV: 'production', TRUSTED_PROXY_HOPS: '0' }).trustedProxyHops,
    0
  );
  assert.strictEqual(
    readSecurityConfig({ NODE_ENV: 'production', TRUSTED_PROXY_HOPS: '2' }).trustedProxyHops,
    2
  );

  for (const value of [undefined, ' ', '-1', '1.5', 'one', '1e2']) {
    assert.throws(
      () => readSecurityConfig({ NODE_ENV: 'production', TRUSTED_PROXY_HOPS: value }),
      /TRUSTED_PROXY_HOPS/,
      `production accepted ${String(value)}`
    );
  }
});

test('non-production invalid proxy hops fall back to zero', () => {
  for (const value of [undefined, '', ' ', '-1', '1.5', 'one']) {
    assert.strictEqual(
      readSecurityConfig({ NODE_ENV: 'test', TRUSTED_PROXY_HOPS: value }).trustedProxyHops,
      0,
      `test configuration did not fall back for ${String(value)}`
    );
  }
});

test('AI limits are exact and bounded', () => {
  const c = readSecurityConfig({ NODE_ENV: 'test', TRUSTED_PROXY_HOPS: '1' });
  assert.deepStrictEqual(c.ai, {
    maxPayloadBytes: 262144,
    maxInputTokens: 8000,
    maxOutputTokens: 2000,
    maxHistoryMessages: 20,
    maxConcurrentPerActor: 2,
    maxConcurrentPerProject: 4,
    dailyAsk: 50,
    dailyChat: 20,
    dailyCharacterJobs: 5,
  });
});

test('risky capabilities default to disabled', () => {
  assert.deepStrictEqual(
    readSecurityConfig({ NODE_ENV: 'test', TRUSTED_PROXY_HOPS: '1' }).capabilities,
    {
      aiProjectContext: false,
      aiMutation: false,
      personalMediaUpload: false,
      newPublication: false,
    }
  );
});

console.log(`\nsecurity config: ${passed} checks passed`);
