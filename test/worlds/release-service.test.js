'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');

Module._extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

test('release service exposes the transactional candidate and removal boundaries', () => {
  const service = require(path.join(ROOT, 'lib/worlds/releaseService.ts'));
  for (const name of [
    'createReleaseService',
    'submitWorldRelease',
    'decideWorldRelease',
    'withdrawWorldRelease',
    'takeDownWorldRelease',
  ]) {
    assert.equal(typeof service[name], 'function', `${name} is the server authority boundary`);
  }
});

const owner = { kind: 'user', userId: 'user-owner', profileId: 'profile-owner' };
const guest = { kind: 'guest', sessionId: 'guest-session', profileId: 'profile-owner' };

const snapshot = {
  project: {
    id: 'project-1',
    owner_id: 'profile-owner',
    title: 'Cloud Castle',
    description: 'Hop across clouds.',
    thumbnail_url: '/assets/cloud-castle.png',
    visibility: 'private',
    genre: 'platformer',
    is_published: false,
    moderation_status: 'draft',
    revision: 4,
  },
  scenes: [],
  assets: [{
    id: 'asset-1', asset_type: 'image', name: 'Cloud', file_url: '/assets/cloud-castle.png',
    mime_type: 'image/png', blob_checksum: null,
  }],
};

const SNAPSHOT_HASH = '9093aee070f85e0e0607b485bcc23eeb3b6fc5dd165a0a52bedad866fe1058b7';
const PASSING_CHECKS = [
  'snapshot_integrity', 'template_identity', 'project_budgets', 'asset_policy',
  'block_policy', 'playability', 'public_metadata',
].map((name) => ({ name, status: 'passed', reasonCode: null }));

function createReleaseStore({ release, profileRole = 'child', assetSizeRows = [{ id: 'asset-1', file_size: 512 }] } = {}) {
  const releases = release ? [release] : [];
  const checks = [];
  const decisions = [];
  let transactionCount = 0;

  const connection = {
    async beginTransaction() { transactionCount += 1; },
    async commit() {},
    async rollback() {},
    release() {},
    async execute(sql, values = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from projects') && normalized.includes('for update')) {
        return [[{ id: 'project-1', owner_id: 'profile-owner', revision: 4 }]];
      }
      if (normalized.includes('from world_releases') && normalized.includes('where project_id = ? and submission_idempotency_key = ?')) {
        const prior = releases.find((row) => row.project_id === values[0] && row.submission_idempotency_key === values[1]);
        return [prior ? [prior] : []];
      }
      if (normalized.includes('from project_worlds') && normalized.includes('world_templates')) {
        return [[{ template_id: 'platformer', template_version: 2, active: 1 }]];
      }
      if (normalized.includes('from profiles') && normalized.includes('birth_month')) {
        return [[{
          id: 'profile-owner', user_id: 'user-owner', profile_kind: 'user', role: profileRole,
          display_name: 'Cloud Builder', username: 'cloud', birth_month: '2010-01',
        }]];
      }
      if (normalized.includes('from parental_consents')) return [[]];
      if (normalized.includes('from world_release_beta_cohort_members')) return [[{ present: 1 }]];
      if (normalized.includes('from project_play_snapshots') && normalized.includes('where id = ? and project_id = ?')) {
        return [[{
          id: 'snapshot-1', project_id: 'project-1', revision: 4,
          snapshot_json: JSON.stringify(snapshot), snapshot_sha256: SNAPSHOT_HASH,
        }]];
      }
      if (normalized.includes('from project_play_snapshots') && normalized.includes('where project_id = ? and revision = ?')) {
        return [[{
          id: 'snapshot-1', project_id: 'project-1', revision: 4,
          snapshot_json: JSON.stringify(snapshot), snapshot_sha256: SNAPSHOT_HASH,
        }]];
      }
      if (normalized.includes('from assets') && normalized.includes('file_size')) {
        return [assetSizeRows];
      }
      if (normalized.startsWith('insert into world_releases')) {
        releases.push({
          id: values[0], project_id: values[1], project_play_snapshot_id: values[2],
          template_id: values[3], template_version: values[4], project_revision: values[5],
          snapshot_sha256: values[6], status: 'submitted', current_public: false,
          public_slug: null, creator_label: values[7], submission_idempotency_key: values[8],
          submitted_at: '2026-08-26T00:00:00.000Z',
        });
        return [{ affectedRows: 1 }];
      }
      if (normalized.startsWith('update world_releases set status = \'checking\'')) {
        releases.find((row) => row.id === values[0]).status = 'checking';
        return [{ affectedRows: 1 }];
      }
      if (normalized.startsWith('insert into world_release_checks')) {
        checks.push({ releaseId: values[1], name: values[2], status: values[3], reason: values[4] });
        return [{ affectedRows: 1 }];
      }
      if (normalized.startsWith('update world_releases set status = ?')) {
        const row = releases.find((item) => item.id === values[2]);
        row.status = values[0];
        row.decision_reason_code = values[1];
        return [{ affectedRows: 1 }];
      }
      if (normalized.includes('from world_releases') && normalized.includes('where id = ? for update')) {
        const row = releases.find((item) => item.id === values[0]);
        return [row ? [row] : []];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };

  return {
    pool: { async getConnection() { return connection; } },
    releases,
    checks,
    decisions,
    transactionCount: () => transactionCount,
  };
}

function loadService(options) {
  const { createReleaseService } = require(path.join(ROOT, 'lib/worlds/releaseService.ts'));
  return createReleaseService(options);
}

test('submission rejects a guest before it can open a transaction', async () => {
  const store = createReleaseStore();
  const service = loadService({ pool: store.pool });

  await assert.rejects(
    () => service.submitWorldRelease({
      actor: guest, projectId: 'project-1', expectedRevision: 4, idempotencyKey: 'release-key-0001',
    }),
    (error) => error && error.code === 'release_auth_forbidden',
  );
  assert.equal(store.transactionCount(), 0);
});

test('submission replays the same immutable candidate and hands only persisted asset sizes to checks', async () => {
  const store = createReleaseStore();
  const audited = [];
  let observedSizes = null;
  let nextId = 0;
  const service = loadService({
    pool: store.pool,
    getWorldTemplate: () => ({ id: 'platformer', version: 2, active: true }),
    readFeatureFlag: () => ({ name: 'community_publishing', enabled: true, reason: 'flag_enabled' }),
    runWorldReleaseChecks: async (_snapshot, context) => {
      observedSizes = context.assetByteSizes;
      return PASSING_CHECKS;
    },
    writeAudit: async (event) => { audited.push(event); },
    uuid: () => `release-${++nextId}`,
  });
  const request = {
    actor: owner, projectId: 'project-1', expectedRevision: 4, idempotencyKey: 'release-key-0001',
  };

  const first = await service.submitWorldRelease(request);
  const replay = await service.submitWorldRelease(request);

  assert.deepEqual(first, {
    id: 'release-1', status: 'review_pending', sourceRevision: 4,
    submittedAt: '2026-08-26T00:00:00.000Z', replayed: false,
  });
  assert.deepEqual(replay, { ...first, replayed: true });
  assert.deepEqual(observedSizes, { 'asset-1': 512 });
  assert.equal(store.checks.length, PASSING_CHECKS.length, 'one code-only row per deterministic check');
  assert.equal(audited.length, 1, 'replay does not duplicate the committed-outcome audit event');
  assert.equal(store.releases[0].project_play_snapshot_id, 'snapshot-1');
});

test('a missing or malformed persisted asset size becomes a non-reviewable check result', async () => {
  for (const assetSizeRows of [[], [{ id: 'asset-1', file_size: null }], [{ id: 'asset-1', file_size: -1 }], [{ id: 'asset-1', file_size: '9007199254740992' }]]) {
    const store = createReleaseStore({ assetSizeRows });
    let observedSizes = null;
    const service = loadService({
      pool: store.pool,
      getWorldTemplate: () => ({ id: 'platformer', version: 2, active: true }),
      readFeatureFlag: () => ({ name: 'community_publishing', enabled: true, reason: 'flag_enabled' }),
      runWorldReleaseChecks: async (_snapshot, context) => {
        observedSizes = context.assetByteSizes;
        return PASSING_CHECKS.map((check) => check.name === 'project_budgets'
          ? { ...check, status: 'failed', reasonCode: 'asset_size_unavailable' }
          : check);
      },
      writeAudit: async () => {},
      uuid: (() => { let id = 0; return () => `size-release-${++id}`; })(),
    });

    const result = await service.submitWorldRelease({
      actor: owner, projectId: 'project-1', expectedRevision: 4, idempotencyKey: `asset-size-${assetSizeRows.length}-${String(assetSizeRows[0]?.file_size)}`,
    });
    assert.deepEqual(observedSizes, {}, 'only valid, exact persisted file sizes may reach Task 3 checks');
    assert.equal(result.status, 'changes_requested');
    assert.deepEqual(store.checks.find((check) => check.name === 'project_budgets'), {
      releaseId: result.id, name: 'project_budgets', status: 'failed', reason: 'asset_size_unavailable',
    });
  }
});

test('a terminal rejected release cannot be published', async () => {
  const store = createReleaseStore({
    profileRole: 'admin',
    release: {
      id: 'release-rejected', project_id: 'project-1', project_play_snapshot_id: 'snapshot-1',
      project_revision: 4, snapshot_sha256: SNAPSHOT_HASH, status: 'rejected', current_public: false,
    },
  });
  const service = loadService({ pool: store.pool });

  await assert.rejects(
    () => service.decideWorldRelease({ actor: owner, releaseId: 'release-rejected', action: 'publish' }),
    (error) => error && error.code === 'invalid_release_transition',
  );
});

test('release audits persist only the pseudonymized actor and fixed result codes', async () => {
  const { writeReleaseAudit } = require(path.join(ROOT, 'lib/worlds/releaseAudit.ts'));
  const calls = [];
  await writeReleaseAudit({
    actorKind: 'user', actorKey: 'user-private-id', operation: 'world_release.submitted',
    outcome: 'allowed', reason: 'review_pending',
    attributes: { parentEmail: 'parent@example.test', sourceRevision: 4 },
  }, {
    secret: 'release-audit-test-secret',
    uuid: () => 'audit-row-id',
    query: async (sql, values) => { calls.push({ sql, values }); return []; },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO security_audit_events/i);
  assert.equal(JSON.stringify(calls[0].values).includes('user-private-id'), false);
  assert.equal(JSON.stringify(calls[0].values).includes('parent@example.test'), false);
  assert.deepEqual(
    calls[0].values.slice(0, 6),
    ['audit-row-id', 'user', calls[0].values[2], 'world_release.submitted', 'allowed', 'review_pending'],
  );
  assert.match(calls[0].values[2], /^[0-9a-f]{32}$/);
});
