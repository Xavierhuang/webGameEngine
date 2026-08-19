const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('only published is counted and moderation_pending is the review queue', () => {
  const adminPage = read('app/admin/page.tsx');
  assert.match(adminPage, /pr\.moderation_status = 'published'[\s\S]*AS published_count/);
  assert.match(adminPage, /moderation_status = 'published'[\s\S]*AS public_count/);

  const usersRoute = read('app/api/admin/users/route.ts');
  assert.match(usersRoute, /pr\.moderation_status = 'published'[\s\S]*AS published_count/);

  const reportsPage = read('app/admin/reports/page.tsx');
  assert.match(reportsPage, /moderation_status = 'moderation_pending'/);
  assert.doesNotMatch(reportsPage, /moderation_status = 'pending'/);
});

test('owner and admin labels use migration-008 states', () => {
  const projectsPage = read('app/projects/page.tsx');
  assert.doesNotMatch(projectsPage, /status === 'approved'/);
  assert.match(projectsPage, /getProjectModerationBadge/);

  const reportQueue = read('components/admin/ReportQueue.tsx');
  assert.doesNotMatch(reportQueue, /auto-approved/i);
  assert.match(read('components/admin/UserTable.tsx'), /published\)/);
});

test('badge policy distinguishes published, pending, rejected, and draft', () => {
  const { getProjectModerationBadge, isPublishedProject } = require(
    '../.build/lib/auth/publicationState'
  );

  assert.equal(isPublishedProject('published'), true);
  for (const state of ['draft', 'moderation_pending', 'rejected', 'approved', 'pending']) {
    assert.equal(isPublishedProject(state), false, `${state} was treated as published`);
  }
  assert.equal(getProjectModerationBadge('published', 'public'), null);
  assert.equal(getProjectModerationBadge('anything', 'private'), null);
  assert.equal(getProjectModerationBadge('moderation_pending', 'public').label, 'Pending review');
  assert.equal(getProjectModerationBadge('rejected', 'public').label, 'Removed');
  assert.equal(getProjectModerationBadge('draft', 'public').label, 'Draft');
});
