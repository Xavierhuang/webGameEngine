const assert = require('assert');
const { createHash } = require('crypto');
const {
  issueGuestSession,
  inspectGuestToken,
} = require('../.build/lib/auth/guestSession');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

class FakeGuestSessionStore {
  constructor() {
    this.rows = [];
  }

  async insert(row) {
    this.rows.push({ ...row, revokedAt: null, lastSeenAt: null });
  }

  async findByTokenHash(tokenHash) {
    return this.rows.find((row) => row.tokenHash === tokenHash) ?? null;
  }

  async revokeByTokenHash(tokenHash, revokedAt) {
    const row = await this.findByTokenHash(tokenHash);
    if (row && row.revokedAt === null) row.revokedAt = revokedAt;
  }

  async touchByTokenHash(tokenHash, lastSeenAt) {
    const row = await this.findByTokenHash(tokenHash);
    if (row) row.lastSeenAt = lastSeenAt;
  }
}

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

async function main() {
  await test('guest token is random while storage uses only its hash', async () => {
    const fakeStore = new FakeGuestSessionStore();
    const issued = await issueGuestSession(fakeStore, 'profile-1');
    assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(fakeStore.rows[0].tokenHash, sha256(issued.token));
    assert.equal(JSON.stringify(fakeStore.rows).includes(issued.token), false);

    const second = await issueGuestSession(fakeStore, 'profile-2');
    assert.notEqual(second.token, issued.token, 'separate sessions must not reuse a token');
  });

  await test('valid guest session resolves by hash and updates last seen', async () => {
    const fakeStore = new FakeGuestSessionStore();
    const now = new Date('2026-08-18T12:00:00.000Z');
    const issued = await issueGuestSession(fakeStore, 'profile-1', null, now);
    const inspected = await inspectGuestToken(fakeStore, issued.token, now);

    assert.deepStrictEqual(inspected, {
      status: 'valid',
      sessionId: issued.sessionId,
      profileId: 'profile-1',
    });
    assert.deepStrictEqual(fakeStore.rows[0].lastSeenAt, now);
  });

  await test('expired and revoked sessions are rejected', async () => {
    const expiredStore = new FakeGuestSessionStore();
    const issuedExpired = await issueGuestSession(
      expiredStore,
      'profile-expired',
      null,
      new Date('2026-01-01T00:00:00.000Z')
    );
    assert.deepStrictEqual(
      await inspectGuestToken(expiredStore, issuedExpired.token, new Date('2026-03-01T00:00:00.000Z')),
      { status: 'expired' }
    );

    const revokedStore = new FakeGuestSessionStore();
    const now = new Date('2026-08-18T12:00:00.000Z');
    const issuedRevoked = await issueGuestSession(revokedStore, 'profile-revoked', null, now);
    await revokedStore.revokeByTokenHash(sha256(issuedRevoked.token), now);
    assert.deepStrictEqual(
      await inspectGuestToken(revokedStore, issuedRevoked.token, now),
      { status: 'revoked' }
    );
  });

  await test('rotation revokes the parent row and stores a fresh hash', async () => {
    const fakeStore = new FakeGuestSessionStore();
    const first = await issueGuestSession(
      fakeStore,
      'profile-1',
      null,
      new Date('2026-08-18T12:00:00.000Z')
    );
    const rotatedAt = new Date('2026-08-19T12:00:00.000Z');
    const second = await issueGuestSession(fakeStore, 'profile-1', first.token, rotatedAt);

    assert.deepStrictEqual(fakeStore.rows[0].revokedAt, rotatedAt);
    assert.equal(fakeStore.rows[1].tokenHash, sha256(second.token));
    assert.notEqual(second.token, first.token);
    assert.equal(JSON.stringify(fakeStore.rows).includes(second.token), false);
  });

  console.log(`\nguest sessions: ${passed} checks passed`);
}

main();
