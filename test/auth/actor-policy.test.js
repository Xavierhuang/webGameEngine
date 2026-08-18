const assert = require('assert');
const fs = require('fs');
const path = require('path');
globalThis.AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;
const { unstable_doesMiddlewareMatch } = require('next/experimental/testing/server');
const { NextRequest } = require('next/server');
const { createActorResolver } = require('../.build/lib/auth/actor');
const { config: proxyConfig, proxy } = require('../.build/proxy');

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
  } catch (error) {
    console.error(`FAIL ${name}\n  ${error.stack ?? error.message}`);
    process.exit(1);
  }
  passed++;
  console.log(`ok   ${name}`);
}

function resolver(overrides = {}) {
  return createActorResolver({
    getUserIdFromToken: () => null,
    findUserProfileId: async (userId) => userId === 'u1' ? 'p1' : null,
    inspectGuestToken: async () => ({ status: 'missing' }),
    ...overrides,
  });
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(location);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [location] : [];
  });
}

async function main() {
  await test('authenticated user outranks a valid guest token', async () => {
    const { resolveActorFromCredentials } = resolver();
    const actor = await resolveActorFromCredentials({ userId: 'u1', guestProfileId: 'g1' });
    assert.deepEqual(actor, { kind: 'user', userId: 'u1', profileId: 'p1' });
  });

  await test('simultaneous valid auth and guest cookies resolve only the user', async () => {
    let guestLookupCalled = false;
    const { resolveActor } = resolver({
      getUserIdFromToken: (token) => token === 'valid-auth-token' ? 'u1' : null,
      inspectGuestToken: async () => {
        guestLookupCalled = true;
        return { status: 'valid', sessionId: 'session-1', profileId: 'guest-1' };
      },
    });
    const request = new Request('https://lingplay.test/editor', {
      headers: {
        cookie: 'auth-token=valid-auth-token; lingplay_guest_session=0123456789012345678901234567890123456789012',
      },
    });

    assert.deepStrictEqual(await resolveActor(request), {
      kind: 'user',
      userId: 'u1',
      profileId: 'p1',
    });
    assert.equal(guestLookupCalled, false);
  });

  await test('a valid opaque session resolves to a guest actor', async () => {
    const { resolveActor } = resolver({
      inspectGuestToken: async (token) => {
        assert.equal(token, 'opaque-token');
        return { status: 'valid', sessionId: 'session-1', profileId: 'guest-1' };
      },
    });
    const request = new Request('https://lingplay.test/editor', {
      headers: { cookie: 'lingplay_guest_session=opaque-token' },
    });
    assert.deepStrictEqual(await resolveActor(request), {
      kind: 'guest',
      sessionId: 'session-1',
      profileId: 'guest-1',
    });
  });

  await test('expired and revoked sessions resolve to anonymous', async () => {
    for (const status of ['expired', 'revoked']) {
      const { resolveActor } = resolver({ inspectGuestToken: async () => ({ status }) });
      const request = new Request('https://lingplay.test/editor', {
        headers: { cookie: 'lingplay_guest_session=opaque-token' },
      });
      assert.deepStrictEqual(await resolveActor(request), { kind: 'anonymous' }, status);
    }
  });

  await test('claim inspection is non-authorizing and never returns an Actor', async () => {
    const { inspectGuestSessionForClaim } = resolver({
      inspectGuestToken: async () => ({
        status: 'valid',
        sessionId: 'session-1',
        profileId: 'guest-1',
      }),
    });
    const request = new Request('https://lingplay.test/signup', {
      headers: { cookie: 'lingplay_guest_session=opaque-token' },
    });
    const inspection = await inspectGuestSessionForClaim(request);
    assert.deepStrictEqual(inspection, {
      status: 'valid',
      sessionId: 'session-1',
      profileId: 'guest-1',
    });
    assert.equal(Object.prototype.hasOwnProperty.call(inspection, 'kind'), false);
  });

  await test('legacy guest-profile-id is ignored as authority', async () => {
    let opaqueLookupCalled = false;
    const { resolveActor, inspectGuestSessionForClaim } = resolver({
      inspectGuestToken: async () => {
        opaqueLookupCalled = true;
        return { status: 'valid', sessionId: 'forged', profileId: 'victim-profile' };
      },
    });
    const request = new Request('https://lingplay.test/editor/victim-project', {
      headers: { cookie: 'guest-profile-id=victim-profile' },
    });

    assert.deepStrictEqual(await resolveActor(request), { kind: 'anonymous' });
    assert.deepStrictEqual(await inspectGuestSessionForClaim(request), { status: 'missing' });
    assert.equal(opaqueLookupCalled, false);
  });

  await test('server authority paths contain no legacy guest cookie read', async () => {
    const violations = sourceFiles('app').concat(sourceFiles('lib')).filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      const readsLiteralLegacyCookie = source.includes('guest-profile-id') && /\.get\s*\(/.test(source);
      const readsNamedLegacyCookie = /\.get\s*\(\s*LEGACY_GUEST_COOKIE_NAME\s*\)/.test(source);
      return readsLiteralLegacyCookie || readsNamedLegacyCookie;
    });
    assert.deepStrictEqual(violations, []);
  });

  await test('guest compatibility helper is resolution-only for anonymous callers', async () => {
    const source = fs.readFileSync('lib/auth/guest.ts', 'utf8');
    assert.match(source, /Guest session required; call POST \/api\/guest-session/);
    assert.doesNotMatch(source, /\bcookies\b|issueGuestSession/);
  });

  await test('every excluded response-cookie route explicitly clears the legacy cookie', async () => {
    for (const file of [
      'app/api/guest-session/route.ts',
      'app/api/auth/login/route.ts',
      'app/api/auth/signup/route.ts',
      'app/api/auth/logout/route.ts',
      'app/api/locale/route.ts',
    ]) {
      const source = fs.readFileSync(file, 'utf8');
      assert.match(source, /expireLegacyGuestCookie\(response\)/, file);
    }
  });

  await test('proxy expires the legacy cookie on covered requests', async () => {
    const response = proxy(new NextRequest('https://lingplay.test/editor', {
      headers: { cookie: 'guest-profile-id=forged-profile' },
    }));
    const expired = response.cookies.get('guest-profile-id');
    assert.equal(expired.value, '');
    assert.equal(expired.maxAge, 0);
    assert.equal(expired.path, '/');
  });

  await test('proxy excludes only static paths and response-cookie-owning APIs', async () => {
    const doesMatch = (url) => unstable_doesMiddlewareMatch({ config: proxyConfig, url });
    for (const path of [
      '/_next/static/chunk.js',
      '/_next/image',
      '/favicon.ico',
      '/icon',
      '/icon.svg',
      '/apple-icon',
      '/api/guest-session',
      '/api/auth/login',
      '/api/auth/signup',
      '/api/auth/logout',
      '/api/locale',
    ]) {
      assert.equal(doesMatch(path), false, `${path} should bypass Proxy`);
    }
    for (const path of [
      '/editor/project-1',
      '/api/projects',
      '/api/reports',
      '/api/guest-session/unexpected',
      '/api/locale/unexpected',
      '/api/auth/login/unexpected',
      '/api/auth/reset-password',
      '/api/auth/forgot-password',
    ]) {
      assert.equal(doesMatch(path), true, `${path} should be covered by Proxy`);
    }
  });

  console.log(`\nactor policy: ${passed} checks passed`);
}

main();
