import assert from 'node:assert/strict';
import test from 'node:test';

async function loadHelper() {
  return import('./local-test-database.mjs');
}

function fakeConnector() {
  let connects = 0;
  let closes = 0;
  const statements = [];
  return {
    connect: async () => {
      connects += 1;
      return {
        async beginTransaction() { statements.push('begin'); },
        async commit() { statements.push('commit'); },
        async rollback() { statements.push('rollback'); },
        async execute(sql) {
          statements.push(sql.replace(/\s+/g, ' ').trim());
          if (/^UPDATE projects/.test(sql.trim())) return [{ affectedRows: 1 }];
          if (/^SELECT visibility/.test(sql.trim())) {
            return [[{ visibility: 'public', moderation_status: 'published' }]];
          }
          if (/^SELECT u\.id/.test(sql.trim())) return [[]];
          return [{ affectedRows: 0 }];
        },
        end: async () => { closes += 1; },
      };
    },
    counts: () => ({ connects, closes }),
    statements,
  };
}

test('database helper exposes only gated high-level mutations', async () => {
  const helper = await loadHelper();
  assert.deepEqual(Object.keys(helper).sort(), [
    'cleanupSecurityFixturesForLocalTest',
    'publishProjectForLocalTest',
  ]);
  assert.equal('withLocalTestDatabase' in helper, false);
  assert.equal('publishProjectForTest' in helper, false);
  assert.equal('deleteProjectForTest' in helper, false);
});

test('every database mutator rejects unsafe targets before connecting', async () => {
  const { cleanupSecurityFixturesForLocalTest, publishProjectForLocalTest } = await loadHelper();
  const operations = [
    (baseUrl, options) => publishProjectForLocalTest(baseUrl, 'project-id', options),
    (baseUrl, options) => cleanupSecurityFixturesForLocalTest(
      baseUrl,
      { projectId: 'project-id', emails: ['owner@example.test'] },
      options
    ),
  ];
  for (const [baseUrl, env] of [
    ['https://play.example.com', { MYSQL_HOST: 'localhost', MYSQL_DATABASE: 'gameengine_test' }],
    ['http://localhost:3100', { MYSQL_HOST: 'db.example.com', MYSQL_DATABASE: 'gameengine_test' }],
    ['http://localhost:3100', { MYSQL_HOST: 'localhost', MYSQL_DATABASE: 'gameengine' }],
  ]) {
    for (const operation of operations) {
      const connector = fakeConnector();
      await assert.rejects(
        () => operation(baseUrl, { env, connect: connector.connect }),
        /Refusing|gameengine_test|loopback/
      );
      assert.deepEqual(connector.counts(), { connects: 0, closes: 0 });
    }
  }
});

test('high-level mutators always close approved local connections', async () => {
  const { cleanupSecurityFixturesForLocalTest, publishProjectForLocalTest } = await loadHelper();
  const env = { MYSQL_HOST: '127.0.0.1', MYSQL_DATABASE: 'gameengine_test' };

  const publish = fakeConnector();
  await publishProjectForLocalTest('http://localhost:3100', 'project-id', {
    env,
    connect: publish.connect,
  });
  assert.deepEqual(publish.counts(), { connects: 1, closes: 1 });

  const cleanup = fakeConnector();
  await cleanupSecurityFixturesForLocalTest(
    'http://localhost:3100',
    { projectId: 'project-id', emails: ['owner@example.test', 'stranger@example.test'] },
    { env, connect: cleanup.connect }
  );
  assert.deepEqual(cleanup.counts(), { connects: 1, closes: 1 });
  assert.equal(cleanup.statements.at(-1), 'commit');
});
