import assert from 'node:assert/strict';
import test from 'node:test';

async function loadHelper() {
  return import('./local-test-database.mjs');
}

function fakeConnector() {
  let connects = 0;
  let closes = 0;
  return {
    connect: async () => {
      connects += 1;
      return { end: async () => { closes += 1; } };
    },
    counts: () => ({ connects, closes }),
  };
}

test('database helper rejects unsafe targets before connecting', async () => {
  const { withLocalTestDatabase } = await loadHelper();
  for (const [baseUrl, env] of [
    ['https://play.example.com', { MYSQL_HOST: 'localhost', MYSQL_DATABASE: 'gameengine_test' }],
    ['http://localhost:3100', { MYSQL_HOST: 'db.example.com', MYSQL_DATABASE: 'gameengine_test' }],
    ['http://localhost:3100', { MYSQL_HOST: 'localhost', MYSQL_DATABASE: 'gameengine' }],
  ]) {
    const connector = fakeConnector();
    await assert.rejects(
      () => withLocalTestDatabase(baseUrl, async () => {}, { env, connect: connector.connect }),
      /Refusing|gameengine_test|loopback/
    );
    assert.deepEqual(connector.counts(), { connects: 0, closes: 0 });
  }
});

test('database helper always closes the approved local connection', async () => {
  const { withLocalTestDatabase } = await loadHelper();
  const env = { MYSQL_HOST: '127.0.0.1', MYSQL_DATABASE: 'gameengine_test' };

  const success = fakeConnector();
  await withLocalTestDatabase('http://localhost:3100', async () => 'ok', {
    env,
    connect: success.connect,
  });
  assert.deepEqual(success.counts(), { connects: 1, closes: 1 });

  const failure = fakeConnector();
  await assert.rejects(
    () => withLocalTestDatabase('http://localhost:3100', async () => {
      throw new Error('callback failed');
    }, { env, connect: failure.connect }),
    /callback failed/
  );
  assert.deepEqual(failure.counts(), { connects: 1, closes: 1 });
});
