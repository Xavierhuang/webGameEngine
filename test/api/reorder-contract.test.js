const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function loadContract() {
  return require('../.build/lib/auth/reorder');
}

function fakeDatabase({ rows = [], updateError = null, rollbackError = null } = {}) {
  const events = [];
  const connection = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql, params) {
      events.push({ sql, params });
      if (/^\s*SELECT/i.test(sql)) return [rows];
      if (updateError) throw updateError;
      return [{ affectedRows: rows.length }];
    },
    async commit() { events.push('commit'); },
    async rollback() {
      events.push('rollback');
      if (rollbackError) throw rollbackError;
    },
    destroy() { events.push('destroy'); },
    release() { events.push('release'); },
  };
  let connections = 0;
  return {
    events,
    dependencies: {
      async getConnection() {
        connections += 1;
        return connection;
      },
    },
    connectionCount: () => connections,
  };
}

test('duplicates and malformed IDs fail before opening a transaction', async () => {
  const { reorderSceneObjects, ReorderError } = loadContract();
  for (const orderedIds of [['a', 'a'], ['a', 3], ['']]) {
    const db = fakeDatabase();
    await assert.rejects(
      () => reorderSceneObjects('scene-a', orderedIds, db.dependencies),
      (error) => error instanceof ReorderError && error.status === 400
    );
    assert.equal(db.connectionCount(), 0);
  }
});

test('a missing or foreign ID rolls back before the first update', async () => {
  const { reorderSceneObjects, ReorderError } = loadContract();
  const db = fakeDatabase({ rows: [{ id: 'owned' }] });

  await assert.rejects(
    () => reorderSceneObjects('scene-a', ['owned', 'foreign'], db.dependencies),
    (error) => error instanceof ReorderError && error.status === 404
  );

  const statements = db.events.filter((event) => typeof event === 'object');
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /FOR UPDATE/i);
  assert.equal(statements.some(({ sql }) => /^\s*UPDATE/i.test(sql)), false);
  assert.deepEqual(db.events.filter((event) => typeof event === 'string'), [
    'begin', 'rollback', 'release',
  ]);
});

test('a valid complete input updates once and commits', async () => {
  const { reorderSceneObjects } = loadContract();
  const db = fakeDatabase({ rows: [{ id: 'one' }, { id: 'two' }] });
  await reorderSceneObjects('scene-a', ['two', 'one'], db.dependencies);

  const statements = db.events.filter((event) => typeof event === 'object');
  assert.equal(statements.length, 2);
  assert.match(statements[1].sql, /^\s*UPDATE game_objects/i);
  assert.deepEqual(db.events.filter((event) => typeof event === 'string'), [
    'begin', 'commit', 'release',
  ]);
});

test('an update failure rolls back and always releases the connection', async () => {
  const { reorderSceneObjects } = loadContract();
  const db = fakeDatabase({ rows: [{ id: 'one' }], updateError: new Error('write failed') });
  await assert.rejects(() => reorderSceneObjects('scene-a', ['one'], db.dependencies), /write failed/);
  assert.deepEqual(db.events.filter((event) => typeof event === 'string'), [
    'begin', 'rollback', 'release',
  ]);
});

test('rollback failure preserves the write error and destroys the poisoned connection', async () => {
  const { reorderSceneObjects } = loadContract();
  const writeError = new Error('original write failure');
  const db = fakeDatabase({
    rows: [{ id: 'one' }],
    updateError: writeError,
    rollbackError: new Error('rollback failed'),
  });

  await assert.rejects(
    reorderSceneObjects('scene-a', ['one'], db.dependencies),
    (error) => error === writeError
  );
  assert.deepEqual(
    db.events.filter((event) => typeof event === 'string'),
    ['begin', 'rollback', 'destroy']
  );
});

test('the live matrix compares the complete ordered ID state after a rejected attack', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, 'authorization-matrix.mjs'),
    'utf8'
  );
  const attack = source.match(/const beforeCrossProject[\s\S]*?an object from another project[^\n]*/)?.[0] ?? '';
  assert.match(attack, /game_objects\.map\(\(object\) => object\.id\)/);
  assert.match(attack, /assert\.deepEqual/);
  assert.doesNotMatch(attack, /\.order_index/, 'the object DTO omits order_index, so this is false-green');
});
