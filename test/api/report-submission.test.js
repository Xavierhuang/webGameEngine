const assert = require('node:assert/strict');
const test = require('node:test');

const USER = { kind: 'user', userId: 'user-1', profileId: 'profile-user' };
const GUEST = { kind: 'guest', sessionId: 'session-1', profileId: 'profile-guest' };
const ANONYMOUS = { kind: 'anonymous' };

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
    { projectId: 'project-1', profileId: 'profile-1', reason: 'spam' },
    { projectId: 'project-1', profileId: '', reason: 'spam' },
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

test('anonymous reports fail 401 before limiting, target access, or insertion', async () => {
  const { createReportSubmissionService, ReportSubmissionError } = loadService();
  const setup = fixture();
  await assert.rejects(
    createReportSubmissionService(setup.dependencies).submit(ANONYMOUS, {
      projectId: 'project-1',
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
      projectId: 'unrelated-project',
      reason: 'spam',
    }),
    /project_not_viewable/
  );
  assert.deepEqual(setup.calls.projects, ['unrelated-project']);
  assert.deepEqual(setup.calls.inserts, []);
});

test('missing reported profiles are rejected without inserting', async () => {
  const { createReportSubmissionService, ReportSubmissionError } = loadService();
  const setup = fixture({ findProfile: async () => null });
  await assert.rejects(
    createReportSubmissionService(setup.dependencies).submit(USER, {
      profileId: 'missing-profile',
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
        profileId: 'profile-target',
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
    profileId: 'profile-target',
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
      reportedProfileId: 'profile-target',
      reason: 'harassment',
      details: 'details',
    },
  ]);
});
