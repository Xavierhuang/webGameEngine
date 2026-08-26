'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');
Module._extensions['.ts'] = function compileTypeScript(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};
const { createReportSubmissionService, ReportSubmissionError } =
  require(path.join(ROOT, 'lib/safety/reportSubmission.ts'));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const RELEASE_ID = '33333333-3333-4333-8333-333333333333';
const REPORTER = { kind: 'user', userId: 'user-1', profileId: '44444444-4444-4444-8444-444444444444' };

function service({ release = { id: RELEASE_ID, projectId: PROJECT_ID }, omitResolver = false } = {}) {
  const inserted = [];
  const lookups = [];
  const dependencies = {
    requireProjectView: async () => ({}),
    findProfile: async () => ({ id: 'profile' }),
    moderate: async () => ({ safe: true }),
    sanitize: (value) => value,
    rateLimit: () => ({ allowed: true, retryAfter: 0, remaining: 5 }),
    createId: () => 'report-1',
    insert: async (record) => { inserted.push(record); },
  };
  if (!omitResolver) {
    dependencies.findCurrentPublicRelease = async (id) => {
      lookups.push(id);
      return release;
    };
  }
  return { submit: createReportSubmissionService(dependencies).submit, inserted, lookups };
}

test('a report naming the project current public release stores the release link', async () => {
  const { submit, inserted, lookups } = service();
  const result = await submit(REPORTER, { projectId: PROJECT_ID, releaseId: RELEASE_ID, reason: 'inappropriate' });

  assert.equal(result.status, 'open');
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].worldReleaseId, RELEASE_ID);
  assert.equal(inserted[0].reportedProjectId, PROJECT_ID, 'the project link is kept as well as the release link');
  assert.deepEqual(lookups, [RELEASE_ID]);
});

test('an ordinary project report is unchanged and carries no release link', async () => {
  const { submit, inserted, lookups } = service();
  await submit(REPORTER, { projectId: PROJECT_ID, reason: 'spam', details: 'junk' });
  assert.equal(inserted[0].worldReleaseId, null);
  assert.equal(inserted[0].reportedProjectId, PROJECT_ID);
  assert.deepEqual(lookups, [], 'no release lookup runs when no release is named');

  const profileReport = service();
  await profileReport.submit(REPORTER, { profileId: OTHER_PROJECT_ID, reason: 'harassment' });
  assert.equal(profileReport.inserted[0].worldReleaseId, null);
  assert.equal(profileReport.inserted[0].reportedProfileId, OTHER_PROJECT_ID);
});

test('a release belonging to a different project is not found, not a bad request', async () => {
  // A 400 would confirm the release exists; 404 keeps the opaque public slug
  // from being usable to probe which private project owns it.
  const { submit, inserted } = service({ release: { id: RELEASE_ID, projectId: OTHER_PROJECT_ID } });
  await assert.rejects(
    () => submit(REPORTER, { projectId: PROJECT_ID, releaseId: RELEASE_ID, reason: 'inappropriate' }),
    (error) => error instanceof ReportSubmissionError && error.status === 404,
  );
  assert.equal(inserted.length, 0);
});

test('a release that is not currently public cannot be reported', async () => {
  const { submit, inserted } = service({ release: null });
  await assert.rejects(
    () => submit(REPORTER, { projectId: PROJECT_ID, releaseId: RELEASE_ID, reason: 'inappropriate' }),
    (error) => error.status === 404,
  );
  assert.equal(inserted.length, 0);
});

test('a release id without a project, or a malformed one, is refused', async () => {
  for (const input of [
    { releaseId: RELEASE_ID, reason: 'spam' },
    { profileId: OTHER_PROJECT_ID, releaseId: RELEASE_ID, reason: 'spam' },
    { projectId: PROJECT_ID, releaseId: 'not-a-uuid', reason: 'spam' },
    { projectId: PROJECT_ID, releaseId: '', reason: 'spam' },
    { projectId: PROJECT_ID, releaseId: null, reason: 'spam' },
  ]) {
    const { submit, inserted } = service();
    await assert.rejects(
      () => submit(REPORTER, input),
      (error) => error instanceof ReportSubmissionError && (error.status === 400 || error.status === 404),
      `input ${JSON.stringify(input)} must be refused`,
    );
    assert.equal(inserted.length, 0);
  }
});

test('a caller that never wired the resolver cannot accept a release id at all', async () => {
  // Defense in depth: the dependency is optional so existing callers keep
  // working, which must not become a way to store an unverified release link.
  const { submit, inserted } = service({ omitResolver: true });
  await assert.rejects(
    () => submit(REPORTER, { projectId: PROJECT_ID, releaseId: RELEASE_ID, reason: 'spam' }),
    (error) => error.status === 404,
  );
  assert.equal(inserted.length, 0);
});

test('existing moderation and rate limiting still gate a release report', async () => {
  const limited = createReportSubmissionService({
    requireProjectView: async () => ({}),
    findProfile: async () => ({ id: 'p' }),
    findCurrentPublicRelease: async () => ({ id: RELEASE_ID, projectId: PROJECT_ID }),
    moderate: async () => ({ safe: true }),
    sanitize: (v) => v,
    rateLimit: () => ({ allowed: false, retryAfter: 42, remaining: 0 }),
    createId: () => 'report-1',
    insert: async () => { throw new Error('must not insert'); },
  }).submit;
  await assert.rejects(
    () => limited(REPORTER, { projectId: PROJECT_ID, releaseId: RELEASE_ID, reason: 'spam' }),
    (error) => error.status === 429 && error.retryAfter === 42,
  );

  const unsafe = createReportSubmissionService({
    requireProjectView: async () => ({}),
    findProfile: async () => ({ id: 'p' }),
    findCurrentPublicRelease: async () => ({ id: RELEASE_ID, projectId: PROJECT_ID }),
    moderate: async () => ({ safe: false, reason: 'nope' }),
    sanitize: (v) => v,
    rateLimit: () => ({ allowed: true, retryAfter: 0, remaining: 5 }),
    createId: () => 'report-1',
    insert: async () => { throw new Error('must not insert'); },
  }).submit;
  await assert.rejects(
    () => unsafe(REPORTER, { projectId: PROJECT_ID, releaseId: RELEASE_ID, reason: 'spam', details: 'abuse' }),
    (error) => error.status === 422,
  );
});

test('an anonymous visitor cannot file a release report', async () => {
  const { submit, inserted } = service();
  await assert.rejects(
    () => submit({ kind: 'anonymous' }, { projectId: PROJECT_ID, releaseId: RELEASE_ID, reason: 'spam' }),
    (error) => error.status === 401,
  );
  assert.equal(inserted.length, 0);
});

test('a validated public release authorizes its own report without private project access', async () => {
  // The source project of a published world stays private, so requiring
  // `requireProjectView` would block every visitor who can actually play it.
  const attempts = [];
  const inserted = [];
  const submit = createReportSubmissionService({
    requireProjectView: async () => { attempts.push('project-view'); throw new Error('must not be consulted'); },
    findProfile: async () => ({ id: 'p' }),
    findCurrentPublicRelease: async () => ({ id: RELEASE_ID, projectId: PROJECT_ID }),
    moderate: async () => ({ safe: true }),
    sanitize: (v) => v,
    rateLimit: () => ({ allowed: true, retryAfter: 0, remaining: 5 }),
    createId: () => 'report-1',
    insert: async (record) => { inserted.push(record); },
  }).submit;

  await submit(REPORTER, { projectId: PROJECT_ID, releaseId: RELEASE_ID, reason: 'inappropriate' });
  assert.deepEqual(attempts, [], 'a validated public release stands in for project viewability');
  assert.equal(inserted[0].worldReleaseId, RELEASE_ID);
});

test('without a validated release the ordinary project-view boundary still applies', async () => {
  // The exemption above must not become a way to report a project you cannot see.
  const inserted = [];
  const submit = createReportSubmissionService({
    requireProjectView: async () => { const error = new Error('project_not_viewable'); error.status = 404; throw error; },
    findProfile: async () => ({ id: 'p' }),
    findCurrentPublicRelease: async () => null,
    moderate: async () => ({ safe: true }),
    sanitize: (v) => v,
    rateLimit: () => ({ allowed: true, retryAfter: 0, remaining: 5 }),
    createId: () => 'report-1',
    insert: async (record) => { inserted.push(record); },
  }).submit;

  await assert.rejects(
    () => submit(REPORTER, { projectId: PROJECT_ID, reason: 'spam' }),
    (error) => error.message === 'project_not_viewable',
  );
  // And a release that fails validation is refused before it can skip the check.
  await assert.rejects(
    () => submit(REPORTER, { projectId: PROJECT_ID, releaseId: RELEASE_ID, reason: 'spam' }),
    (error) => error.status === 404,
  );
  assert.equal(inserted.length, 0);
});
