'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const test = require('node:test');
const ts = require('typescript');

Module._extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

const {
  WORLD_RELEASE_TRANSITIONS,
  canTransitionRelease,
  isTerminalWorldReleaseStatus,
  isPublicWorldRelease,
} = require('../../lib/worlds/releaseTypes.ts');

const STATES = [
  'submitted',
  'checking',
  'review_pending',
  'published',
  'changes_requested',
  'rejected',
  'withdrawn',
  'taken_down',
  'superseded',
];

const EXPECTED_TRANSITIONS = {
  submitted: ['checking', 'withdrawn'],
  checking: ['review_pending', 'changes_requested', 'rejected', 'withdrawn'],
  review_pending: ['published', 'changes_requested', 'rejected', 'withdrawn'],
  published: ['withdrawn', 'taken_down', 'superseded'],
  changes_requested: [],
  rejected: [],
  withdrawn: [],
  taken_down: [],
  superseded: [],
};

test('release state machine permits only the approved lifecycle transitions', () => {
  assert.equal(Object.isFrozen(WORLD_RELEASE_TRANSITIONS), true);

  for (const from of STATES) {
    assert.deepEqual(
      [...WORLD_RELEASE_TRANSITIONS[from]],
      EXPECTED_TRANSITIONS[from],
      `${from} has exactly its approved next states`,
    );
    for (const to of STATES) {
      assert.equal(
        canTransitionRelease(from, to),
        EXPECTED_TRANSITIONS[from].includes(to),
        `${from} -> ${to} must match the release state machine`,
      );
    }
  }
});

test('only a current published release is public', () => {
  for (const status of STATES) {
    assert.equal(
      isPublicWorldRelease(status, true),
      status === 'published',
      `${status} must not be public unless it is published`,
    );
    assert.equal(isPublicWorldRelease(status, false), false, `${status} without the current flag is hidden`);
  }
});

test('terminal release states have no outgoing transitions', () => {
  for (const status of STATES) {
    assert.equal(
      isTerminalWorldReleaseStatus(status),
      EXPECTED_TRANSITIONS[status].length === 0,
      `${status} terminal status must match the transition graph`,
    );
  }
});
