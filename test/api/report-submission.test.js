const assert = require('node:assert/strict');
const test = require('node:test');

const USER = { kind: 'user', userId: 'user-1', profileId: 'profile-user' };
const GUEST = { kind: 'guest', sessionId: 'session-1', profileId: 'profile-guest' };
const ANONYMOUS = { kind: 'anonymous' };
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';

function loadService() {
  return require('../.build/lib/safety/reportSubmission');
}

function fixture(overrides = {}) {
  const calls = { projects: [], profiles: [], rateKeys: [], inserts: [] };
  const dependencies = {
    requireProjectView: async (_actor, id) => { calls.projects.push(id); },
    findProfile: async (id) => { calls.profiles.push(id); return { id }; },
    moderate: async () => ({ safe: true }),
    sanitize: (value) => value.trim(),
    rateLimit: (key) => {
      calls.rateKeys.push(key);
      return { allowed: true, retryAfter: 0, remaining: 4 };
    },
    createId: () => 'report-1',
    insert: async (report) => { calls.inserts.push(report); },
    ...overrides,
  };
  return { calls, dependencies };
}

test('exactly one projectId or profileId is required before any write', async () => {
  const { createReportSubmissionService, ReportSubmissionError } = loadService();
  for (const input of [
    { reason: 'spam' },
    { projectId: PROJECT_ID, profileId: PROFILE_ID, reason: 'spam' },
    { projectId: PROJECT_ID, profileId: '', reason: 'spam' },
    { projectId: 42, reason: 'spam' },
  ]) {
    const setup = fixture();
    await assert.rejects(
      createReportSubmissionService(setup.dependencies).submit(USER, input),
      (error) => error instanceof ReportSubmissionError && error.status === 400
    );
    assert.deepEqual(setup.calls.projects, []);
    assert.deepEqual(setup.calls.profiles, []);
    assert.deepEqual(setup.calls.inserts, []);
  }
});

test('target IDs must be canonical UUIDs before limiting or target access', async () => {
  const { createReportSubmissionService, ReportSubmissionError } = loadService();
  for (const input of [
    { projectId: 'project-1', reason: 'spam' },
    { profileId: '22222222222242228222222222222222', reason: 'spam' },
    { projectId: ` ${PROJECT_ID}`, reason: 'spam' },
    { profileId: '00000000-0000-0000-0000-000000000000', reason: 'spam' },
  ]) {
    const setup = fixture();
    await assert.rejects(
      createReportSubmissionService(setup.dependencies).submit(USER, input),
      (error) => error instanceof ReportSubmissionError && error.status === 400
    );
    assert.deepEqual(setup.calls.rateKeys, []);
    assert.deepEqual(setup.calls.projects, []);
    assert.deepEqual(setup.calls.profiles, []);
    assert.deepEqual(setup.calls.inserts, []);
  }
});

test('anonymous reports fail 401 before limiting, target access, or insertion', async () => {
  const { createReportSubmissionService, ReportSubmissionError } = loadService();
  const setup = fixture();
  await assert.rejects(
    createReportSubmissionService(setup.dependencies).submit(ANONYMOUS, {
      projectId: PROJECT_ID,
      reason: 'spam',
    }),
    (error) => error instanceof ReportSubmissionError && error.status === 401
  );
  assert.deepEqual(setup.calls.rateKeys, []);
  assert.deepEqual(setup.calls.projects, []);
  assert.deepEqual(setup.calls.inserts, []);
});

test('a project the actor cannot view is rejected without inserting', async () => {
  const { createReportSubmissionService } = loadService();
  const setup = fixture({
    requireProjectView: async (_actor, id) => {
      setup.calls.projects.push(id);
      throw new Error('project_not_viewable');
    },
  });
  await assert.rejects(
    createReportSubmissionService(setup.dependencies).submit(USER, {
      projectId: PROJECT_ID,
      reason: 'spam',
    }),
    /project_not_viewable/
  );
  assert.deepEqual(setup.calls.projects, [PROJECT_ID]);
  assert.deepEqual(setup.calls.inserts, []);
});

test('missing reported profiles are rejected without inserting', async () => {
  const { createReportSubmissionService, ReportSubmissionError } = loadService();
  const setup = fixture({ findProfile: async () => null });
  await assert.rejects(
    createReportSubmissionService(setup.dependencies).submit(USER, {
      profileId: PROFILE_ID,
      reason: 'spam',
    }),
    (error) => error instanceof ReportSubmissionError && error.status === 404
  );
  assert.deepEqual(setup.calls.inserts, []);
});

test('the interim limiter uses only actor-derived user and guest identities', async () => {
  const { createReportSubmissionService, ReportSubmissionError } = loadService();
  for (const [actor, expectedKey] of [
    [USER, 'report:user:user-1'],
    [GUEST, 'report:guest:session-1'],
  ]) {
    const setup = fixture({
      rateLimit: (key) => {
        setup.calls.rateKeys.push(key);
        return { allowed: false, retryAfter: 37, remaining: 0 };
      },
    });
    await assert.rejects(
      createReportSubmissionService(setup.dependencies).submit(actor, {
        profileId: PROFILE_ID,
        reason: 'spam',
        clientKey: 'forwarded:attacker-controlled',
      }),
      (error) =>
        error instanceof ReportSubmissionError && error.status === 429 && error.retryAfter === 37
    );
    assert.deepEqual(setup.calls.rateKeys, [expectedKey]);
    assert.deepEqual(setup.calls.inserts, []);
  }
});

test('a successful report binds the reporter profile to the Actor', async () => {
  const { createReportSubmissionService } = loadService();
  const setup = fixture();
  const result = await createReportSubmissionService(setup.dependencies).submit(USER, {
    profileId: PROFILE_ID,
    reporterProfileId: 'spoofed-profile',
    reason: 'harassment',
    details: '  details  ',
  });
  assert.deepEqual(result, { id: 'report-1', status: 'open' });
  assert.deepEqual(setup.calls.rateKeys, ['report:user:user-1']);
  assert.deepEqual(setup.calls.inserts, [
    {
      id: 'report-1',
      reporterProfileId: USER.profileId,
      reportedProjectId: null,
      reportedProfileId: PROFILE_ID,
      // A profile report never carries a release link.
      worldReleaseId: null,
      reason: 'harassment',
      details: 'details',
    },
  ]);
});
