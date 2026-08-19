const assert = require('node:assert/strict');
const test = require('node:test');
const { runTransaction, withTransaction } = require('../.build/lib/mysql/transaction');

function fakeConnection(overrides = {}) {
  const calls = [];
  const base = {
    async beginTransaction() { calls.push('begin'); },
    async commit() { calls.push('commit'); },
    async rollback() { calls.push('rollback'); },
    release() { calls.push('release'); },
    calls,
  };
  return Object.assign(base, overrides);
}

function fakePool(connectionFactory) {
  return {
    async getConnection() {
      return connectionFactory();
    },
  };
}

test('commits and releases on a successful operation', async () => {
  const connection = fakeConnection();
  const result = await runTransaction(connection, async (conn) => {
    assert.equal(conn, connection);
    return 42;
  });
  assert.equal(result, 42);
  assert.deepEqual(connection.calls, ['begin', 'commit', 'release']);
});

test('rolls back and releases after an operation failure', async () => {
  const connection = fakeConnection();
  await assert.rejects(
    () => runTransaction(connection, async () => { throw new Error('step'); }),
    /step/,
  );
  assert.deepEqual(connection.calls, ['begin', 'rollback', 'release']);
});

test('rollback failure surfaces with the original operation error as cause', async () => {
  const connection = fakeConnection({
    async rollback() {
      this.calls.push('rollback-attempt');
      throw new Error('rollback broke');
    },
  });
  let thrown;
  try {
    await runTransaction(connection, async () => { throw new Error('step'); });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, 'expected an error');
  assert.match(String(thrown.message), /Rollback failed.*rollback broke/);
  assert.equal(thrown.cause?.message, 'step');
  assert.deepEqual(connection.calls, ['begin', 'rollback-attempt', 'release']);
});

test('retries deadlocks only twice', async () => {
  let attempts = 0;
  const connections = [];
  const pool = fakePool(() => {
    const conn = fakeConnection();
    connections.push(conn);
    return conn;
  });
  await assert.rejects(
    () => withTransaction(async () => {
      attempts++;
      throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' });
    }, { pool, sleep: async () => {}, random: () => 0 }),
    /deadlock/,
  );
  assert.equal(attempts, 3);
  assert.equal(connections.length, 3);
  for (const conn of connections) {
    assert.deepEqual(conn.calls, ['begin', 'rollback', 'release']);
  }
});

test('retries lock-wait timeouts and succeeds on the retry', async () => {
  let attempts = 0;
  const pool = fakePool(() => fakeConnection());
  const result = await withTransaction(async () => {
    attempts++;
    if (attempts < 3) {
      throw Object.assign(new Error('timeout'), { code: 'ER_LOCK_WAIT_TIMEOUT' });
    }
    return 'ok';
  }, { pool, sleep: async () => {}, random: () => 0 });
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('non-retriable errors bail immediately without a second attempt', async () => {
  let attempts = 0;
  const pool = fakePool(() => fakeConnection());
  await assert.rejects(
    () => withTransaction(async () => {
      attempts++;
      throw Object.assign(new Error('constraint'), { code: 'ER_DUP_ENTRY' });
    }, { pool, sleep: async () => {}, random: () => 0 }),
    /constraint/,
  );
  assert.equal(attempts, 1);
});

test('retry delays fall within the specified 25–75 ms then 75–175 ms windows', async () => {
  const sleeps = [];
  const pool = fakePool(() => fakeConnection());
  await assert.rejects(
    () => withTransaction(async () => {
      throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' });
    }, {
      pool,
      sleep: async (ms) => { sleeps.push(ms); },
      random: () => 0.5,
    }),
    /deadlock/,
  );
  assert.equal(sleeps.length, 2);
  assert.ok(sleeps[0] >= 25 && sleeps[0] < 75, `first delay ${sleeps[0]} out of [25,75)`);
  assert.ok(sleeps[1] >= 75 && sleeps[1] < 175, `second delay ${sleeps[1]} out of [75,175)`);
});
