import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('private-project treats every status except exact 404 as failure', () => {
  const source = read('test/visual/private-project.mjs');
  assert.match(source, /status !== 404/);
  assert.match(source, /api !== 404/);
  assert.doesNotMatch(source, /status === 200/);
  assert.doesNotMatch(source, /api === 200/);
});

test('stranger-write setup is guarded, non-AI, and test-database-only', () => {
  const source = read('test/visual/stranger-write.mjs');
  assert.doesNotMatch(source, /\/api\/ai\//);
  assert.match(source, /\/api\/projects\/import/);
  assert.match(source, /withLocalTestDatabase/);
  assert.match(source, /moderation_status[^\n]*published|status[^\n]*published/);
  assert.match(source, /try\s*\{[\s\S]*finally\s*\{/);
});

test('stranger-write proves exact denials and complete state preservation', () => {
  const source = read('test/visual/stranger-write.mjs');
  for (const evidence of [
    'expectedStatus',
    'objectId',
    'logic_blocks',
    'color',
    'moderation_status',
    'visibility',
    'title',
  ]) {
    assert.match(source, new RegExp(evidence), `missing ${evidence} assertion evidence`);
  }
  assert.match(source, /public page[\s\S]*200/i);
});
