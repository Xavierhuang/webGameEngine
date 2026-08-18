import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLocalBaseUrl } from './local-base-url.mjs';

test('localhost assertion accepts only loopback HTTP origins', () => {
  assert.equal(assertLocalBaseUrl('http://localhost:3100'), 'http://localhost:3100');
  assert.equal(assertLocalBaseUrl('http://127.0.0.1:3000/'), 'http://127.0.0.1:3000');
  assert.equal(assertLocalBaseUrl('http://[::1]:3200'), 'http://[::1]:3200');
  for (const target of [
    'https://play.lingcode.dev',
    'http://192.168.1.8:3000',
    'https://localhost:3000',
    'http://localhost:3000/path',
  ]) {
    assert.throws(() => assertLocalBaseUrl(target), /Refusing|bare origin/);
  }
});
