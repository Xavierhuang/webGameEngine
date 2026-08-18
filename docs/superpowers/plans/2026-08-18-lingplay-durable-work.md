# LingPlay Durable Work and Data Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make project writes, undo history, guest claiming, uploads, deletion, and backups transactional, revision-safe, idempotent, private, and recoverable.

**Architecture:** A MySQL transaction helper underpins a typed project-command service with optimistic revisions and idempotency. Secure guest ownership moves atomically. A generic S3-compatible private `AssetStore` uses content-addressed immutable blobs and per-owner asset rows, while asynchronous deletion and encrypted off-site backups provide auditable lifecycle guarantees.

**Tech Stack:** TypeScript, MySQL 8/mysql2, Zod, `@aws-sdk/client-s3`, Node crypto, Next.js 16 Route Handlers, Node tests, Playwright browser scripts.

## Global Constraints

- Depend on trust-boundary `Actor`, project guards, opaque guest sessions, and disabled high-risk flags.
- Use migration `009_durable_work.sql`; trust owns migration 008.
- Never hold a database transaction open across network, AI, email, moderation, or blob operations.
- Require `If-Match`/expected revision and `Idempotency-Key`; compatibility writes without them return HTTP 428.
- Retain command/idempotency records for 30 days and edit-session undo history for 7 days.
- Use immutable content-addressed blobs; remixes create new ownership rows referencing the same checksum/storage key.
- Use an S3-compatible private bucket for assets and a distinct off-site bucket/prefix for backups.
- Encrypt backups with AES-256-GCM using a 32-byte base64 key and explicit `BACKUP_KEY_ID`.
- Keep 30 daily and 12 monthly backups; never delete the final verified backup.
- Test databases must contain `_test`; destructive test/restore scripts refuse every other name.
- Preserve current dirty editor, route, admin, localization, and visual-test work.

---

### Task 1: Transaction Primitive with Bounded Deadlock Retry

**Files:**
- Create: `lib/mysql/transaction.ts`
- Modify: `lib/mysql/client.ts`
- Modify: `lib/mysql/server.ts`
- Create: `test/mysql/transaction.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces `TransactionConnection` and `withTransaction<T>(operation, options?): Promise<T>`.
- Retries MySQL `ER_LOCK_DEADLOCK` and `ER_LOCK_WAIT_TIMEOUT` at most twice after the initial attempt; no other error is retried.

- [ ] **Step 1: Write failing transaction lifecycle tests**

```js
test('rolls back and releases after an operation failure', async () => {
  const connection = fakeConnection();
  await assert.rejects(() => runTransaction(connection, async () => { throw new Error('step'); }));
  assert.deepEqual(connection.calls, ['begin', 'rollback', 'release']);
});

test('retries deadlocks only twice', async () => {
  let attempts = 0;
  await assert.rejects(() => withFakePool(async () => {
    attempts++;
    throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' });
  }));
  assert.equal(attempts, 3);
});
```

- [ ] **Step 2: Add `test:transactions` and verify RED**

Run `npm run test:transactions`. Expected: missing transaction module.

- [ ] **Step 3: Implement one-connection commit/rollback/release**

Inject `sleep` and randomness into pure retry orchestration for deterministic tests. Use delays of 25–75 ms then 75–175 ms. Always release in `finally`; surface rollback failure with the original error as `cause`.

- [ ] **Step 4: Verify GREEN**

Run `npm run test:transactions && npm run type-check`.

- [ ] **Step 5: Commit**

```bash
git add lib/mysql/transaction.ts lib/mysql/client.ts lib/mysql/server.ts test/mysql/transaction.test.js package.json
git commit -m "feat: add transactional database helper"
```

---

### Task 2: Revision, Command, Asset, Deletion, and Backup Schema

**Files:**
- Create: `migrations/009_durable_work.sql`
- Modify: `lib/database.types.ts`
- Modify: `types/game.ts`
- Create: `test/database/durable-work-migration.test.js`
- Modify: `package.json`

**Interfaces:**
- Adds `projects.revision BIGINT UNSIGNED NOT NULL DEFAULT 0`.
- Adds `project_commands`, `editing_sessions`, `project_play_snapshots`, `guest_claims`, `asset_blobs`, expanded `assets`, `storage_repair_jobs`, `deletion_jobs`, and `backup_runs`.

- [ ] **Step 1: Write a failing schema contract test**

Assert unique `(project_id,idempotency_key)`, command expiry, seven-day edit-session expiry support, snapshot `(project_id,revision)` uniqueness, blob checksum uniqueness/refcount, deletion states, and backup key/checksum fields.

- [ ] **Step 2: Run the migration contract to verify RED**

Expected: migration 009 is absent.

- [ ] **Step 3: Implement idempotent DDL and safe legacy defaults**

Do not cascade-delete projects/assets before a deletion job captures blob keys. Backfill revision 0. Store command JSON/inverse/result and publication/play snapshots as canonical JSON with SHA-256. Add indexes for expiry workers.

- [ ] **Step 4: Apply migrations to `gameengine_test` and verify GREEN**

Run the schema contract, apply 001–009 with fatal errors, and run `npm run type-check`.

- [ ] **Step 5: Commit**

Stage migration, types, test, and package script; commit `feat: add durable project schema`.

---

### Task 3: Typed Command Service and Revision-Pinned Play Snapshots

**Files:**
- Create: `lib/projects/commandSchema.ts`
- Create: `lib/projects/projectSnapshot.ts`
- Create: `lib/projects/commandHandlers.ts`
- Create: `lib/projects/commandService.ts`
- Create: `app/api/projects/[id]/commands/route.ts`
- Create: `app/api/projects/[id]/play-snapshot/route.ts`
- Create: `test/projects/command-schema.test.js`
- Create: `test/projects/command-service.integration.mjs`
- Create: `test/api/project-write-boundary.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes `{ expectedRevision, idempotencyKey, editingSessionId, groupId, command }`.
- Returns `{ commandId, revision, result }`; conflicts return 409 `{ error:'revision_conflict', currentRevision }`.
- Produces a play snapshot for an exact acknowledged revision and returns `{ revision, snapshotId }`.

- [ ] **Step 1: Write failing command-schema and service tests**

```js
test('duplicate idempotency key replays the original result', async () => {
  const first = await service.execute(actor, envelope);
  const second = await service.execute(actor, envelope);
  assert.deepEqual(second, first);
  assert.equal(await countObjects(), 1);
});

test('concurrent expected revisions never silently overwrite', async () => {
  const [a, b] = await Promise.allSettled([executeAt(4, moveA), executeAt(4, moveB)]);
  assert.equal([a, b].filter(x => x.status === 'fulfilled').length, 1);
  assert.equal([a, b].filter(x => x.reason?.code === 'revision_conflict').length, 1);
});
```

Cover project metadata, scene/object create/update/delete/reorder, block workspace replacement, server-computed inverses, rollback failpoints, and snapshot hash stability.

- [ ] **Step 2: Add `test:commands` and verify RED**

Expected: missing command modules/service.

- [ ] **Step 3: Implement strict schemas, canonical loader, handlers, and service**

Use a Zod discriminated union; never accept a client inverse. Inside one transaction: require edit, lock project, replay idempotency, compare revision, run handler, store server inverse/result, increment revision, commit. `play-snapshot` requires the supplied revision to equal current revision, loads the canonical graph inside the transaction, stores its hash/JSON, and returns its ID.

- [ ] **Step 4: Verify GREEN and write-boundary guard**

The source guard fails when a project table mutation occurs outside approved command/transaction modules. Run `npm run test:commands && npm run test:access && npm run type-check`.

- [ ] **Step 5: Commit**

Stage Task 3 files and commit `feat: add revisioned project commands`.

---

### Task 4: Convert Multi-Row and Compatibility Writers

**Files:**
- Modify: `app/api/projects/route.ts`
- Modify: `app/api/projects/[id]/route.ts`
- Modify: `app/api/projects/import/route.ts`
- Modify: `app/api/projects/[id]/remix/route.ts`
- Modify: `app/api/projects/[id]/like/route.ts`
- Modify: `app/api/scenes/route.ts`
- Modify: `app/api/scenes/[id]/route.ts`
- Modify: `app/api/game-objects/[id]/route.ts`
- Modify: `app/api/game-objects/reorder/route.ts`
- Modify: `app/api/game-objects/[id]/logic-blocks/route.ts`
- Modify: `app/api/ai/apply-update/route.ts`
- Modify: `app/api/admin/reports/route.ts`
- Modify: `app/api/auth/signup/route.ts`
- Modify: `app/api/auth/reset-password/route.ts`
- Modify: `lib/safety/parentalConsent.ts`
- Modify: `scripts/seed-examples.js`
- Create: `test/api/multi-row-rollback.integration.mjs`

**Interfaces:**
- Compatibility writers require `If-Match: "<revision>"` and `Idempotency-Key`; missing preconditions return 428.
- Import/remix helpers accept a `TransactionConnection` and never open nested independent connections.

- [ ] **Step 1: Write failpoint and precondition tests**

Force failure after each row group in signup, create, import, remix, block replacement, consent, and seed. Assert no partial rows. Assert compatibility requests missing either header make no write and return 428.

- [ ] **Step 2: Run integration tests to verify RED**

Expected: current independent queries leave partial data or accept unversioned writes.

- [ ] **Step 3: Route every writer through transaction or command service**

Do not fetch “current” revision to paper over missing preconditions. AI update translates its strict batch into command handlers and stays feature-disabled until this task passes.

- [ ] **Step 4: Verify GREEN**

Run rollback tests, `npm run test:commands`, `npm run test:block-order`, `npm run test:trust`, and `npm run type-check`.

- [ ] **Step 5: Commit**

Stage exact Task 4 files and commit `fix: make multi-row writes atomic`.

---

### Task 5: Secure Guest Project Claiming and My Games

**Files:**
- Create: `lib/auth/guestClaim.ts`
- Modify: `app/api/auth/signup/route.ts`
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/projects/route.ts`
- Modify: `app/projects/page.tsx`
- Create: `test/auth/guest-claim.integration.mjs`
- Create: `test/visual/guest-claim.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes trust's claim-only session inspection.
- Produces idempotent claim keyed by destination user and guest session; a lost-response retry can return the committed result without restoring guest authority.

- [ ] **Step 1: Write failing success, rollback, and lost-response tests**

Cover project and asset ownership transfer, My Games before signup, forced failure preserving the guest session, double-submit, and retry after committed revocation.

- [ ] **Step 2: Run `test:guest-claim` to verify RED**

Expected: guest My Games is empty and signup creates unrelated ownership.

- [ ] **Step 3: Implement locked, atomic claim**

Lock guest session, guest profile, destination profile, projects, and asset ownership rows. Move ownership, record audit/idempotency, and revoke only immediately before commit. Exclude quarantine records.

- [ ] **Step 4: Verify GREEN**

Run integration and localhost browser guest-claim tests plus `npm run type-check`.

- [ ] **Step 5: Commit**

Stage Task 5 files and commit `feat: preserve secure guest projects on sign-in`.

---

### Task 6: Private S3-Compatible Asset Store and Legacy Migration

**Files:**
- Create: `lib/storage/assetStore.ts`
- Create: `lib/storage/localAssetStore.ts`
- Create: `lib/storage/s3AssetStore.ts`
- Create: `lib/storage/index.ts`
- Create: `lib/storage/uploadService.ts`
- Create: `app/api/assets/[id]/route.ts`
- Create: `scripts/migrate-legacy-assets.ts`
- Modify: `app/api/uploads/audio/route.ts`
- Modify: `app/api/uploads/model/route.ts`
- Modify: `app/api/uploads/texture/route.ts`
- Modify: `components/editor/CharacterSelector.tsx`
- Modify: `components/editor/SoundSelector.tsx`
- Modify: `components/editor/SoundRecorder.tsx`
- Modify: `components/editor/PropertiesPanel.tsx`
- Modify: `components/editor/GameEditor.tsx`
- Create: `test/storage/asset-store.test.mjs`
- Create: `test/storage/upload-service.integration.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Defines `AssetStore.putQuarantined`, `promote`, `open`, `head`, and `delete`.
- Uses storage key `sha256/<first-two>/<full-hex>` and immutable shared blobs with ownership rows/refcounts.
- Every upload includes an authorized `projectId`.

- [ ] **Step 1: Write failing storage lifecycle tests**

Test quarantine→database row→promotion, failed-row cleanup, checksum deduplication, remix refcount, byte/media quotas, ranged authenticated reads, and repair-job creation when external deletion fails.

- [ ] **Step 2: Add the AWS S3 client and verify RED**

Run `npm install @aws-sdk/client-s3`, add `test:storage`, and run it. Expected: missing adapters/service.

- [ ] **Step 3: Implement private adapters and upload orchestration**

Local development stores outside `public/`. Production requires endpoint, region, bucket, access key, and secret. The route authorizes project access before reading. Upload callers include project ID; direct arbitrary remote URLs are rejected.

- [ ] **Step 4: Implement non-destructive legacy migration**

Scan database asset rows and object JSON URLs under `/uploads`, copy/checksum into the new store, update references transactionally, and write a manifest. Leave verified source files in a timestamped archive; do not delete them automatically.

- [ ] **Step 5: Verify GREEN**

Run `npm run test:storage`, trust publication tests, `npm run type-check`, and `npm run build`.

- [ ] **Step 6: Commit**

Stage Task 6 files and commit `feat: store child assets privately`.

---

### Task 7: Auditable Project and Account Deletion

**Files:**
- Create: `lib/lifecycle/deletionService.ts`
- Create: `lib/lifecycle/deletionWorker.ts`
- Create: `scripts/run-deletion-worker.ts`
- Modify: `app/api/projects/[id]/route.ts`
- Modify: `app/api/admin/users/route.ts`
- Create: `app/api/account/route.ts`
- Create: `app/api/admin/deletions/route.ts`
- Create: `test/lifecycle/deletion-worker.integration.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces idempotent deletion jobs with `queued|running|retry|completed|failed`.
- Project/account APIs return 202 and a deletion ID; they never report complete before blob absence and row cleanup are verified.

- [ ] **Step 1: Write failing retry and completion tests**

Cover transient blob failure, worker crash between blob and row deletion, repeat request, shared-blob refcount, admin retry, and completion only after every owned record/blob is absent.

- [ ] **Step 2: Run `test:deletion` to verify RED**

Expected: current deletion removes SQL only and leaves files.

- [ ] **Step 3: Implement service, worker, and shared lifecycle**

Capture keys/checksums before marking the project/account pending deletion. Use the same service for user and admin actions; record redacted audit outcomes.

- [ ] **Step 4: Verify GREEN**

Run deletion tests, storage tests, trust tests, and type-check.

- [ ] **Step 5: Commit**

Stage Task 7 files and commit `feat: audit project and account deletion`.

---

### Task 8: Encrypted Off-Site Backup and Isolated Restore Verification

**Files:**
- Create: `lib/backups/config.ts`
- Create: `lib/backups/manifest.ts`
- Create: `lib/backups/encryption.ts`
- Replace: `scripts/backup-db.sh` with `scripts/backup.ts`
- Create: `scripts/verify-restore.ts`
- Create: `docs/operations/backup-and-restore.md`
- Modify: `README.md`
- Modify: `deploy.sh`
- Create: `test/backups/manifest.test.js`
- Create: `test/backups/encryption.test.js`
- Create: `test/backups/restore-verification.integration.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces encrypted dump plus versioned asset manifest uploaded to a distinct backup bucket/prefix.
- Requires `BACKUP_ENCRYPTION_KEY` (32-byte base64) and `BACKUP_KEY_ID`; output stores nonce/auth tag/key ID, never the key.

- [ ] **Step 1: Write failing manifest, authenticated-encryption, retention, and target-safety tests**

Assert tampering fails GCM authentication, retention preserves 30 daily/12 monthly plus final verified backup, and restore refuses databases without `_test` or asset prefixes without `/restore-test/`.

- [ ] **Step 2: Add backup scripts and verify RED**

Expected: missing modules/scripts.

- [ ] **Step 3: Implement backup and restore verification**

Spawn `mysqldump` without exposing password on the command line where supported, encrypt stream output, build checksummed asset manifest, upload both, record `backup_runs`, and prune only after a verified upload. Restore into explicit isolated targets, validate schema/row counts/checksums/references/sample snapshot load, then delete only the named targets.

- [ ] **Step 4: Verify GREEN**

Run backup unit tests and isolated restore integration against `gameengine_restore_test`.

- [ ] **Step 5: Commit**

Stage Task 8 files and commit `feat: back up database and assets off site`.

---

### Task 9: Durable-Work CI and End-to-End Gate

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Create: `test/visual/upload-delete.mjs`
- Modify: `test/visual/guest-claim.mjs`
- Create: `test/visual/project-recovery.mjs`

**Interfaces:**
- Produces `test:durable`, `test:durable:integration`, and `test:durable-browser`.

- [ ] **Step 1: Add a failing package/CI manifest test**

Assert all durable scripts run in CI and test databases are isolated.

- [ ] **Step 2: Wire the full durable gates**

Include transaction, schema, command, rollback, guest claim, storage, deletion, backup, and browser recovery/upload-delete tests.

- [ ] **Step 3: Run final verification**

```bash
npm run test:trust
npm run test:durable
npm run test:durable:integration
npm run test:all
npm run type-check
npm run lint
npm run build
npm run test:durable-browser
```

Expected: all exit 0; AI mutation/new publication may be enabled only when their trust flags and durable dependency checks are both true.

- [ ] **Step 4: Commit**

Stage package, CI, and three browser files; commit `test: enforce durable work in CI`.
