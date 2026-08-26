import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('local test database helper uses an explicit mysql2 ESM specifier', async () => {
  const source = await readFile(new URL('./local-test-database.mjs', import.meta.url), 'utf8');
  assert.match(source, /from\s+['"]mysql2\/promise\.js['"]/);
});
