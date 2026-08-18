const assert = require('assert');
const { createHash } = require('crypto');
const {
  GUEST_COOKIE,
  issueGuestSession,
  inspectGuestToken,
} = require('../.build/lib/auth/guestSession');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

class FakeGuestSessionStore {
  constructor() {
    this.rows = [];
    this.failNextInsert = false;
    this.loseNextRevoke = false;
  }

  async insert(row) {
    if (this.failNextInsert) {
      this.failNextInsert = false;
      throw new Error('injected rotation insert failure');
    }
    this.rows.push({ ...row, revokedAt: null, lastSeenAt: null });
  }

  async rotate({ parentTokenHash, expectedProfileId, rotatedAt, replacement }) {
    if (this.loseNextRevoke) {
      this.loseNextRevoke = false;
      return false;
    }
    const parent = this.rows.find((row) => row.tokenHash === parentTokenHash);
    if (
      !parent ||
      parent.profileId !== expectedProfileId ||
      parent.revokedAt !== null ||
      parent.expiresAt.getTime() <= rotatedAt.getTime()
    ) {
      return false;
    }

    const snapshot = this.rows.map((row) => ({ ...row }));
    parent.revokedAt = rotatedAt;
    try {
      await this.insert(replacement);
      return true;
    } catch (error) {
      this.rows = snapshot;
      throw error;
    }
  }

  async findByTokenHash(tokenHash) {
    return this.rows.find((row) => row.tokenHash === tokenHash) ?? null;
  }

  async revokeByTokenHash(tokenHash, revokedAt) {
    if (this.loseNextRevoke) {
      this.loseNextRevoke = false;
      return;
    }
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

  await test('guest sessions and cookies expire after exactly 30 days', async () => {
    const fakeStore = new FakeGuestSessionStore();
    const issued = await issueGuestSession(
      fakeStore,
      'profile-1',
      null,
      new Date('2026-08-18T12:00:00.000Z')
    );
    assert.equal(issued.expiresAt.toISOString(), '2026-09-17T12:00:00.000Z');
    assert.deepStrictEqual(GUEST_COOKIE, {
      name: 'lingplay_guest_session',
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
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

  await test('rotation insertion failure rolls back and leaves the parent usable', async () => {
    const fakeStore = new FakeGuestSessionStore();
    const issued = await issueGuestSession(
      fakeStore,
      'profile-1',
      null,
      new Date('2026-08-18T12:00:00.000Z')
    );
    fakeStore.failNextInsert = true;

    await assert.rejects(
      issueGuestSession(
        fakeStore,
        'profile-1',
        issued.token,
        new Date('2026-08-19T12:00:00.000Z')
      ),
      /injected rotation insert failure/
    );
    assert.equal(fakeStore.rows.length, 1, 'failed rotation must not leave a child row');
    assert.deepStrictEqual(
      await inspectGuestToken(
        fakeStore,
        issued.token,
        new Date('2026-08-19T12:00:01.000Z')
      ),
      { status: 'valid', sessionId: issued.sessionId, profileId: 'profile-1' }
    );
  });

  await test('rotation rejects a lost compare-and-swap without inserting a child', async () => {
    const fakeStore = new FakeGuestSessionStore();
    const issued = await issueGuestSession(
      fakeStore,
      'profile-1',
      null,
      new Date('2026-08-18T12:00:00.000Z')
    );
    fakeStore.loseNextRevoke = true;

    await assert.rejects(
      issueGuestSession(
        fakeStore,
        'profile-1',
        issued.token,
        new Date('2026-08-19T12:00:00.000Z')
      ),
      /rotation race/i
    );
    assert.equal(fakeStore.rows.length, 1);
    assert.equal(fakeStore.rows[0].revokedAt, null);
  });

  await test('two concurrent rotations cannot both succeed', async () => {
    const fakeStore = new FakeGuestSessionStore();
    const issued = await issueGuestSession(
      fakeStore,
      'profile-1',
      null,
      new Date('2026-08-18T12:00:00.000Z')
    );
    const rotatedAt = new Date('2026-08-19T12:00:00.000Z');
    const results = await Promise.allSettled([
      issueGuestSession(fakeStore, 'profile-1', issued.token, rotatedAt),
      issueGuestSession(fakeStore, 'profile-1', issued.token, rotatedAt),
    ]);

    assert.deepStrictEqual(
      results.map((result) => result.status).sort(),
      ['fulfilled', 'rejected']
    );
    assert.equal(fakeStore.rows.length, 2, 'one parent and exactly one child should exist');
  });

  console.log(`\nguest sessions: ${passed} checks passed`);
}

main();
