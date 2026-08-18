const assert = require('node:assert/strict');
const test = require('node:test');

const { AccessError, createAccessService } = require('../.build/lib/auth/access.js');
const { decideAccess } = require('../.build/lib/auth/projectAccess.js');
const { toPublicProjectDto } = require('../.build/lib/auth/publicProjectDto.js');

const ownerUser = { kind: 'user', userId: 'user-owner', profileId: 'profile-owner' };
const ownerGuest = { kind: 'guest', sessionId: 'session-owner', profileId: 'profile-owner' };
const stranger = { kind: 'user', userId: 'user-other', profileId: 'profile-other' };
const anonymous = { kind: 'anonymous' };

const project = (overrides = {}) => ({
  id: 'project-a',
  owner_id: 'profile-owner',
  visibility: 'private',
  moderation_status: 'draft',
  ...overrides,
});

test('owner users and secure guest owners can view, edit, publish, and remix', () => {
  for (const actor of [ownerUser, ownerGuest]) {
    assert.deepEqual(decideAccess(project(), actor), {
      canView: true,
      canEdit: true,
      canPublish: true,
      canRemix: true,
      isOwner: true,
      reason: 'owner',
    });
  }
});

test('private projects are hidden from strangers and anonymous visitors', () => {
  for (const actor of [stranger, anonymous]) {
    const access = decideAccess(project(), actor);
    assert.equal(access.canView, false);
    assert.equal(access.canEdit, false);
    assert.equal(access.canPublish, false);
    assert.equal(access.canRemix, false);
    assert.equal(access.isOwner, false);
    assert.equal(access.reason, 'private');
  }
});

test('only a published public project is visible to strangers', () => {
  for (const status of ['draft', 'moderation_pending', 'rejected', 'approved']) {
    const access = decideAccess(
      project({ visibility: 'public', moderation_status: status }),
      stranger
    );
    assert.equal(access.canView, false, `${status} must remain hidden`);
    assert.equal(access.reason, status === 'approved' ? 'not_published' : status);
  }

  const published = decideAccess(
    project({ visibility: 'public', moderation_status: 'published' }),
    stranger
  );
  assert.equal(published.canView, true);
  assert.equal(published.canEdit, false);
  assert.equal(published.canPublish, false);
  assert.equal(published.canRemix, true);
  assert.equal(published.reason, 'published');
});

test('anonymous visitors can view but cannot remix a published public project', () => {
  const access = decideAccess(
    project({ visibility: 'public', moderation_status: 'published' }),
    anonymous
  );
  assert.equal(access.canView, true);
  assert.equal(access.canEdit, false);
  assert.equal(access.canPublish, false);
  assert.equal(access.canRemix, false);
});

test('admin and moderator authority can moderate private or pending work without editing it', () => {
  for (const role of ['admin', 'moderator']) {
    for (const row of [
      project(),
      project({ visibility: 'public', moderation_status: 'moderation_pending' }),
      project({ visibility: 'public', moderation_status: 'rejected' }),
    ]) {
      const access = decideAccess(row, stranger, role);
      assert.equal(access.canView, true);
      assert.equal(access.canEdit, false);
      assert.equal(access.canPublish, true);
      assert.equal(access.isOwner, false);
      assert.equal(access.reason, 'moderator');
    }
  }
});

test('public visibility and missing fields never grant write or legacy approval visibility', () => {
  assert.equal(decideAccess(project({ visibility: 'public' }), stranger).canEdit, false);
  assert.equal(decideAccess({ owner_id: 'profile-owner' }, stranger).canView, false);
  assert.equal(
    decideAccess(project({ visibility: 'public', moderation_status: 'approved' }), stranger).canView,
    false
  );
});

function fakeService(rows, actorRoles = {}) {
  const calls = [];
  const service = createAccessService({
    async queryOne(sql, params) {
      calls.push({ sql, params });
      if (/FROM profiles actor_profile/i.test(sql)) {
        const role = actorRoles[`${params[0]}:${params[1]}`];
        return role ? { role } : null;
      }
      const id = params.at(-1);
      return rows[id] ?? null;
    },
    async resolveCurrentActor() {
      throw new Error('compatibility resolver should not run for actor-first calls');
    },
  });
  return { service, calls };
}

test('canonical project guards load by actor plus project ID and use stable denials', async () => {
  const published = project({ visibility: 'public', moderation_status: 'published' });
  const { service } = fakeService({
    'project-a': published,
    'project-private': project({ id: 'project-private' }),
  });

  const viewed = await service.requireProjectView(stranger, 'project-a');
  assert.equal(viewed.project.id, 'project-a');
  assert.equal(viewed.access.canView, true);

  await assert.rejects(
    () => service.requireProjectEdit(stranger, 'project-a'),
    (error) => error instanceof AccessError &&
      error.status === 403 && error.code === 'project_edit_forbidden'
  );
  await assert.rejects(
    () => service.requireProjectView(stranger, 'project-private'),
    (error) => error instanceof AccessError &&
      error.status === 404 && error.code === 'project_not_viewable'
  );
  await assert.rejects(
    () => service.requireProjectView(stranger, 'missing'),
    (error) => error instanceof AccessError &&
      error.status === 404 && error.code === 'project_not_found'
  );
});

test('a resource from another project is rejected', async () => {
  const { service, calls } = fakeService({
    'object-in-a': { resource_id: 'object-in-a', ...project() },
    'object-in-b': {
      resource_id: 'object-in-b',
      ...project({ id: 'project-b', owner_id: 'profile-b' }),
    },
  });

  const authorized = await service.requireResourceEdit(ownerUser, 'object', 'object-in-a');
  assert.equal(authorized.project.id, 'project-a');
  assert.equal(authorized.resource.id, 'object-in-a');

  await assert.rejects(
    () => service.requireResourceEdit(ownerUser, 'object', 'object-in-b'),
    (error) => error instanceof AccessError && error.status === 404
  );

  const objectQuery = calls.find((call) => call.params.at(-1) === 'object-in-a');
  assert.match(objectQuery.sql, /FROM game_objects\s+resource/i);
  assert.match(objectQuery.sql, /JOIN scenes/i);
  assert.match(objectQuery.sql, /JOIN projects/i);
  assert.match(objectQuery.sql, /WHERE resource\.id = \?/i);
  assert.deepEqual(objectQuery.params.slice(-1), ['object-in-a']);
});

test('nested resource types use a closed SQL whitelist keyed by resource ID', async () => {
  const { service, calls } = fakeService({
    scene: { resource_id: 'scene', ...project() },
    object: { resource_id: 'object', ...project() },
    block: { resource_id: 'block', ...project() },
    asset: { resource_id: 'asset', ...project() },
  });

  for (const [type, id] of [
    ['scene', 'scene'],
    ['object', 'object'],
    ['logic-block', 'block'],
    ['asset', 'asset'],
  ]) {
    const authorized = await service.requireResourceEdit(ownerUser, type, id);
    assert.equal(authorized.resource.type, type);
  }

  const before = calls.length;
  await assert.rejects(
    () => service.requireResourceEdit(ownerUser, 'projects; DROP TABLE projects', 'scene'),
    (error) => error instanceof AccessError &&
      error.status === 404 && error.code === 'resource_type_invalid'
  );
  assert.equal(calls.length, before, 'invalid resource type must not reach SQL');
});

test('moderators get a 403 when edit is denied on a project they may inspect', async () => {
  const { service, calls } = fakeService(
    { 'private-project': project({ id: 'private-project' }) },
    { 'profile-other:user-other': 'moderator' }
  );

  await assert.rejects(
    () => service.requireProjectEdit(stranger, 'private-project'),
    (error) => error instanceof AccessError &&
      error.status === 403 && error.code === 'project_edit_forbidden'
  );

  const roleLookup = calls.find((call) => /FROM profiles actor_profile/i.test(call.sql));
  assert.deepEqual(roleLookup.params, ['profile-other', 'user-other']);
  assert.match(roleLookup.sql, /profile_kind = 'user'/i);
});

test('the deprecated row overload resolves a secure current actor', async () => {
  let resolutions = 0;
  const service = createAccessService({
    async queryOne(sql, params) {
      assert.match(sql, /FROM profiles actor_profile/i);
      assert.deepEqual(params, ['profile-owner', 'user-owner']);
      return { role: 'child' };
    },
    async resolveCurrentActor() {
      resolutions += 1;
      return ownerUser;
    },
  });

  const access = await service.getProjectAccess(project());
  assert.equal(access.canEdit, true);
  assert.equal(resolutions, 1);
});

test('the deprecated row overload ignores forged moderator authority on its supplied row', async () => {
  const service = createAccessService({
    async queryOne() { return null; },
    async resolveCurrentActor() { return stranger; },
  });

  const access = await service.getProjectAccess(
    project({ actor_role: 'admin', visibility: 'private' })
  );
  assert.equal(access.canView, false);
  assert.equal(access.canPublish, false);
  assert.equal(access.reason, 'private');
});

test('inherited object keys are rejected as resource types before querying', async () => {
  const { service, calls } = fakeService({
    scene: { resource_id: 'scene', ...project() },
  });

  for (const inheritedKey of ['constructor', 'toString', '__proto__']) {
    await assert.rejects(
      () => service.requireResourceEdit(ownerUser, inheritedKey, 'scene'),
      (error) => error instanceof AccessError &&
        error.status === 404 && error.code === 'resource_type_invalid'
    );
  }
  assert.equal(calls.length, 0, 'inherited resource type keys must not reach SQL');
});

test('public DTO omits internal authority fields', () => {
  const dto = toPublicProjectDto(
    {
      ...project({ visibility: 'public', moderation_status: 'published' }),
      title: 'Public game',
      description: 'A safe description',
      thumbnail_url: '/thumb.png',
      genre: 'Adventure',
      created_at: '2026-08-18T00:00:00.000Z',
      updated_at: '2026-08-18T01:00:00.000Z',
      play_count: 3,
      like_count: 2,
      remix_count: 1,
      remixed_from: null,
      moderation_notes: 'internal note',
      user_id: 'secret-user',
      profile_id: 'secret-profile',
    },
    {
      profile_id: 'secret-author-profile',
      user_id: 'secret-author-user',
      username: 'maker',
      display_name: 'Maker',
      avatar_url: '/avatar.png',
    }
  );

  for (const key of ['owner_id', 'profile_id', 'user_id', 'moderation_notes']) {
    assert.equal(key in dto, false);
    assert.equal(key in dto.author, false);
  }
  assert.deepEqual(dto.author, {
    username: 'maker',
    display_name: 'Maker',
    avatar_url: '/avatar.png',
  });
});
