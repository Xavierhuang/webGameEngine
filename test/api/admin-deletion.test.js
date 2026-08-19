const assert = require('node:assert/strict');
const test = require('node:test');

const ADMIN = { id: 'profile-admin', role: 'admin', email: 'admin@example.test' };
const TARGET = {
  id: 'profile-child',
  role: 'child',
  email: 'child@example.test',
  user_id: 'user-child',
};

function loadService() {
  return require('../.build/lib/auth/adminDeletion');
}

function fakeDatabase({ target = TARGET, failStage = null } = {}) {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); },
    async execute(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      events.push(normalized);
      if (/SELECT p\.id, p\.role, p\.user_id, u\.email/.test(normalized)) {
        assert.match(normalized, /FOR UPDATE$/, 'the authorization row must be locked');
        return [[target].filter(Boolean)];
      }
      if (/SELECT COUNT\(\*\)/.test(normalized)) {
        assert.match(normalized, /FOR UPDATE$/, 'the owned project set must be locked');
        return [[{ project_count: 2 }]];
      }
      if (/DELETE FROM projects/.test(normalized)) {
        if (failStage === 'projects') return [{ affectedRows: 1 }];
        return [{ affectedRows: 2 }];
      }
      if (/DELETE FROM profiles/.test(normalized)) {
        if (failStage === 'profile') return [{ affectedRows: 0 }];
        return [{ affectedRows: 1 }];
      }
      if (/DELETE FROM users/.test(normalized)) {
        if (failStage === 'user') throw new Error('user delete failed');
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
  };
  return {
    events,
    deps: { getConnection: async () => connection },
  };
}

test('account deletion commits only after all exact affected-row checks pass', async () => {
  const { deleteAdminAccount } = loadService();
  const database = fakeDatabase();
  await deleteAdminAccount(
    ADMIN,
    { profileId: TARGET.id, confirmEmail: TARGET.email, ownerEmails: [] },
    database.deps
  );
  assert.equal(database.events.filter((event) => /^DELETE FROM /.test(event)).length, 3);
  assert.deepEqual(database.events.slice(-2), ['commit', 'release']);
  assert.ok(!database.events.includes('rollback'));
});

for (const failStage of ['projects', 'profile', 'user']) {
  test(`account deletion rolls back a failure at the ${failStage} delete stage`, async () => {
    const { deleteAdminAccount } = loadService();
    const database = fakeDatabase({ failStage });
    await assert.rejects(
      deleteAdminAccount(
        ADMIN,
        { profileId: TARGET.id, confirmEmail: TARGET.email, ownerEmails: [] },
        database.deps
      ),
      /delete|affected/i
    );
    assert.deepEqual(database.events.slice(-2), ['rollback', 'release']);
    assert.ok(!database.events.includes('commit'));
  });
}

test('authorization uses the locked role and rejects a concurrent promotion', async () => {
  const { AdminDeletionError, deleteAdminAccount } = loadService();
  const database = fakeDatabase({ target: { ...TARGET, role: 'admin' } });
  await assert.rejects(
    deleteAdminAccount(
      ADMIN,
      { profileId: TARGET.id, confirmEmail: TARGET.email, ownerEmails: [] },
      database.deps
    ),
    (error) => error instanceof AdminDeletionError && error.status === 403
  );
  assert.equal(database.events.some((event) => /^DELETE FROM /.test(event)), false);
  assert.deepEqual(database.events.slice(-2), ['rollback', 'release']);
});

test('email confirmation is rechecked against the locked row', async () => {
  const { AdminDeletionError, deleteAdminAccount } = loadService();
  const database = fakeDatabase({ target: { ...TARGET, email: 'changed@example.test' } });
  await assert.rejects(
    deleteAdminAccount(
      ADMIN,
      { profileId: TARGET.id, confirmEmail: TARGET.email, ownerEmails: [] },
      database.deps
    ),
    (error) => error instanceof AdminDeletionError && error.status === 400
  );
  assert.equal(database.events.some((event) => /^DELETE FROM /.test(event)), false);
  assert.deepEqual(database.events.slice(-2), ['rollback', 'release']);
});
