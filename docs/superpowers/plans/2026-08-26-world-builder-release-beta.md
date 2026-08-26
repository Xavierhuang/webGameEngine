# World Builder Release Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely publish reviewed, immutable World Builder template releases while preserving private drafts and enabling public play, attribution-preserving remix, withdrawal, and takedown.

**Architecture:** The beta adds `world_releases` metadata around existing revision-pinned `project_play_snapshots`; it never makes a mutable `projects` graph public. Server-only services own release state, deterministic validation, public DTOs, snapshot-based remix, and audit writes. Next route handlers and client components are thin adapters over those services, gated by the existing `community_publishing` feature flag and existing consent/capability boundary.

**Tech Stack:** Next.js 16 App Router and route handlers, TypeScript, MySQL/mysql2 transactions, Zod, existing project snapshot/runtime services, React/Tailwind, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-26-world-builder-release-beta-design.md`

## Global Constraints

- Release beta accepts only `project_worlds` template projects; ordinary project sharing and remixing are unchanged.
- Public play and remix must read an approved immutable `project_play_snapshots` row, never the editable project graph.
- `FEATURE_FLAG_COMMUNITY_PUBLISHING` is required for submission and moderator publication; production defaults disabled.
- Under-13 creators require current server-derived `publish` capability at submission and again at publish time; guests never submit.
- Public responses, audit events, and moderator UI must not expose consent records, emails, birth data, sessions, private moderation notes, or raw report details.
- Every mutable release action is transactional, validates the expected immutable state, and has idempotency or a monotonic terminal-state guard.
- Add no npm dependencies. Follow Next.js 16 route-handler conventions documented in `node_modules/next/dist/docs/`.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `migrations/013_world_release_beta.sql` | Release, check, decision, and cohort schema; report-to-release link and indexes. |
| `lib/worlds/releaseTypes.ts` | Canonical state, reason, DTO, and action unions shared by server services and UI. |
| `lib/worlds/releaseChecks.ts` | Pure deterministic snapshot checks and bounded check results. |
| `lib/worlds/releaseService.ts` | Candidate submission, state transitions, publish, withdrawal, and takedown transactions. |
| `lib/worlds/releaseAccess.ts` | Public/reviewer/creator read DTOs and immutable release snapshot loader. |
| `lib/worlds/releaseRemix.ts` | Materializes an approved snapshot into a new private World Builder draft. |
| `lib/worlds/releaseAudit.ts` | Redacted release-operation audit persistence. |
| `app/api/projects/[id]/world-releases/route.ts` | Owner status read and idempotent candidate submission. |
| `app/api/projects/[id]/world-releases/[releaseId]/withdraw/route.ts` | Creator withdrawal. |
| `app/api/admin/world-releases/[releaseId]/decision/route.ts` | Admin approve/request-changes/reject action. |
| `app/api/admin/world-releases/[releaseId]/takedown/route.ts` | Admin takedown action. |
| `app/api/world-releases/[releaseId]/remix/route.ts` | Approved-release-only remix endpoint. |
| `app/worlds/[slug]/page.tsx` | Public immutable world page and player entry point. |
| `components/worlds/WorldReleasePanel.tsx` | Child-safe owner release status and submit/withdraw UI. |
| `components/admin/WorldReleaseQueue.tsx` | Admin review and takedown controls. |
| `components/editor/ShareDialog.tsx` | Delegates World Builder projects to `WorldReleasePanel`; preserves legacy behavior otherwise. |
| `app/explore/page.tsx` | Lists approved releases through `releaseAccess`, separate from legacy gallery cards. |
| `app/admin/reports/page.tsx`, `components/admin/ReportQueue.tsx` | Shows release-scoped reports and links admins to the frozen review target. |
| `test/worlds/release-*.test.js`, `test/worlds/release-*.integration.mjs`, `test/visual/world-release-journey.mjs` | Regression coverage for all release boundaries. |

## Task 1: Create the immutable release schema

**Files:**
- Create: `migrations/013_world_release_beta.sql`
- Modify: `lib/database.types.ts`
- Modify: `test/database/trust-boundary-migration.test.js`
- Test: `test/database/world-release-migration.test.js`

**Interfaces:**
- Produces `WorldReleaseStatus`, `WorldReleaseCheckStatus`, `WorldReleaseDecision`, and tables consumed by every later task.
- Requires existing `projects`, `project_worlds`, `project_play_snapshots`, `profiles`, and `reports` tables.

- [x] **Step 1: Write schema-contract tests before the migration**

```js
assert.match(sql, /CREATE TABLE IF NOT EXISTS world_releases/i);
assert.match(sql, /project_play_snapshot_id CHAR\(36\) NOT NULL/i);
assert.match(sql, /UNIQUE KEY world_releases_project_snapshot/i);
assert.match(sql, /public_slug VARCHAR\(80\) NULL/i);
assert.match(sql, /submission_idempotency_key VARCHAR\(128\) NOT NULL/i);
assert.match(sql, /ADD COLUMN world_release_id CHAR\(36\) NULL/i);
assert.match(sql, /ADD COLUMN source_release_id CHAR\(36\) NULL/i);
```

- [x] **Step 2: Run the new contract test and confirm it fails**

Run: `node --test test/database/world-release-migration.test.js`

Expected: failure because migration `013_world_release_beta.sql` does not exist.

- [x] **Step 3: Add migration `013_world_release_beta.sql`**

Create `world_releases` with a UUID primary key, `project_id`, `project_play_snapshot_id`, template identity, revision/hash, enum status, `current_public`, nullable unique `public_slug`, creator label, decision reason, timestamps, and `submission_idempotency_key`. Add unique `(project_id, project_play_snapshot_id)`, unique `(project_id, submission_idempotency_key)`, a current-public lookup index, and reviewer/history indexes. Add `world_release_checks`, `world_release_decisions`, `world_release_beta_cohort_members`, nullable `reports.world_release_id`, and nullable `projects.source_release_id`, all with foreign keys and query indexes.

Use this status definition exactly so service and schema state names agree:

```sql
status ENUM(
  'submitted', 'checking', 'review_pending', 'published',
  'changes_requested', 'rejected', 'withdrawn', 'taken_down', 'superseded'
) NOT NULL
```

- [x] **Step 4: Add typed database representations**

Add the types to `lib/database.types.ts` with exact unions:

```ts
export type WorldReleaseStatus =
  | 'submitted' | 'checking' | 'review_pending' | 'published'
  | 'changes_requested' | 'rejected' | 'withdrawn' | 'taken_down' | 'superseded';
export type WorldReleaseCheckStatus = 'passed' | 'failed' | 'error';
```

Include `world_release_id` in the reports row type and full row/insert/update shapes for every new table.

- [x] **Step 5: Run the migration contract suite**

Run: `node --test test/database/world-release-migration.test.js test/database/trust-boundary-migration.test.js`

Expected: PASS; existing migration assertions remain valid.

- [x] **Step 6: Commit the schema slice**

```bash
git add migrations/013_world_release_beta.sql lib/database.types.ts test/database/world-release-migration.test.js test/database/trust-boundary-migration.test.js
git commit -m "feat: add world release beta schema"
```

## Task 2: Define release states, public DTOs, and transition rules

**Files:**
- Create: `lib/worlds/releaseTypes.ts`
- Create: `lib/worlds/releaseAccess.ts`
- Test: `test/worlds/release-state.test.js`
- Test: `test/worlds/release-access.test.js`

**Interfaces:**
- Produces `canTransitionRelease`, `toPublicWorldRelease`, `getPublicWorldReleaseBySlug`, and `listPublicWorldReleases`.
- Consumed by release service, public page, Explore, remix route, and admin queue.

- [x] **Step 1: Write failing pure state-machine and DTO-redaction tests**

```js
assert.equal(canTransitionRelease('review_pending', 'published'), true);
assert.equal(canTransitionRelease('published', 'review_pending'), false);
assert.equal(canTransitionRelease('taken_down', 'published'), false);
const dto = toPublicWorldRelease(row);
assert.deepEqual(Object.keys(dto).sort(), [
  'creatorLabel', 'description', 'genre', 'likeCount', 'playCount',
  'id', 'publishedAt', 'remixCount', 'slug', 'templateId', 'thumbnailUrl', 'title',
]);
```

- [x] **Step 2: Run the tests and confirm they fail**

Run: `node --test test/worlds/release-state.test.js test/worlds/release-access.test.js`

Expected: failure because the release modules do not exist.

- [x] **Step 3: Implement canonical release types and state transitions**

Export a frozen transition map and named terminal-state predicate:

```ts
export function canTransitionRelease(from: WorldReleaseStatus, to: WorldReleaseStatus): boolean;
export function isPublicWorldRelease(status: WorldReleaseStatus, currentPublic: boolean): boolean;
export interface PublicWorldRelease {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  templateId: string;
  genre: string | null;
  creatorLabel: string;
  publishedAt: string;
  likeCount: number;
  playCount: number;
  remixCount: number;
}
```

Only permit the states and transitions defined in the approved specification. Do not export rows containing project owner IDs, profile IDs, consent fields, source hashes, reviewer data, or decision notes.

- [x] **Step 4: Implement release-aware read queries**

`getPublicWorldReleaseBySlug` and `listPublicWorldReleases` must query `world_releases.status = 'published' AND current_public = TRUE`, join only allowed project/profile metadata, validate page bounds, and map through `toPublicWorldRelease`. Return null for every other state, including `superseded`.

- [x] **Step 5: Run pure and database-free access tests**

Run: `node --test test/worlds/release-state.test.js test/worlds/release-access.test.js`

Expected: PASS, including redaction and every forbidden transition.

- [x] **Step 6: Commit the type/access slice**

```bash
git add lib/worlds/releaseTypes.ts lib/worlds/releaseAccess.ts test/worlds/release-state.test.js test/worlds/release-access.test.js
git commit -m "feat: define world release states and public access"
```

## Task 3: Build deterministic release checks

**Files:**
- Create: `lib/worlds/releaseChecks.ts`
- Test: `test/worlds/release-checks.test.js`
- Test: `test/worlds/release-checks.integration.mjs`

**Interfaces:**
- Consumes `ProjectSnapshot`, template catalog validation, model/asset policies, Blockly command schema, and snapshot hash utility.
- Produces `runWorldReleaseChecks(snapshot, context): Promise<ReadonlyArray<WorldReleaseCheckResult>>`.

- [x] **Step 1: Write failing check tests with safe and unsafe snapshot fixtures**

```js
const results = await runWorldReleaseChecks(validSnapshot, validContext);
assert.deepEqual(results.map((r) => r.name), [
  'snapshot_integrity', 'template_identity', 'project_budgets', 'asset_policy',
  'block_policy', 'playability', 'public_metadata',
]);
assert.equal(results.every((r) => r.status === 'passed'), true);
assert.equal((await runWorldReleaseChecks(remoteModelSnapshot, validContext))
  .find((r) => r.name === 'asset_policy').status, 'failed');
```

- [x] **Step 2: Run tests and confirm failure**

Run: `node --test test/worlds/release-checks.test.js`

Expected: failure because `runWorldReleaseChecks` is undefined.

- [x] **Step 3: Implement pure check helpers with fixed reason codes**

Implement one named helper per required check. Every helper returns `{ name, status, reasonCode }`; it never returns raw metadata or source text. Reuse `hashProjectSnapshot`, `validateModelUrl`, template budgets, and the existing block schema rather than parsing a duplicate format.

```ts
export const WORLD_RELEASE_CHECK_NAMES = [
  'snapshot_integrity', 'template_identity', 'project_budgets', 'asset_policy',
  'block_policy', 'playability', 'public_metadata',
] as const;
export async function runWorldReleaseChecks(
  snapshot: ProjectSnapshot,
  context: ReleaseCheckContext,
): Promise<ReadonlyArray<WorldReleaseCheckResult>>;
```

Catch unexpected errors per check and return `status: 'error', reasonCode: 'check_error'`. A caller treats any `failed` or `error` outcome as non-publishable.

- [x] **Step 4: Add integration fixtures for template budget and real Minion asset policy**

Use a valid current template snapshot and the packaged Minion URL as an accepted asset. Assert unsupported direct URLs, an unknown block type, empty scenes, and content-hash mismatch fail closed.

- [x] **Step 5: Run the checks suite**

Run: `node --test test/worlds/release-checks.test.js test/worlds/release-checks.integration.mjs test/models/model-policy.test.js test/projects/command-schema.test.js`

Expected: PASS.

- [x] **Step 6: Commit deterministic validation**

```bash
git add lib/worlds/releaseChecks.ts test/worlds/release-checks.test.js test/worlds/release-checks.integration.mjs
git commit -m "feat: validate world release candidates"
```

## Task 4: Implement transactional candidate, decision, and audit services

**Files:**
- Create: `lib/worlds/releaseAudit.ts`
- Create: `lib/worlds/releaseService.ts`
- Test: `test/worlds/release-service.test.js`
- Test: `test/worlds/release-service.integration.mjs`

**Interfaces:**
- Consumes Task 2 transitions and Task 3 checks, `resolveActor`-derived identities, capability/consent service, feature flag reader, transactions, and project snapshot rows.
- Produces `submitWorldRelease`, `decideWorldRelease`, `withdrawWorldRelease`, and `takeDownWorldRelease`.

- [x] **Step 1: Write failing service tests for authorization, immutability, and idempotency**

```js
await assert.rejects(
  () => submitWorldRelease({ actor: guest, projectId, expectedRevision: 4, idempotencyKey: key }),
  { code: 'release_auth_forbidden' },
);
const first = await submitWorldRelease(ownerRequest);
const replay = await submitWorldRelease(ownerRequest);
assert.equal(replay.id, first.id);
assert.equal(replay.replayed, true);
await assert.rejects(() => decideWorldRelease({ action: 'publish', releaseId: rejected.id }),
  { code: 'invalid_release_transition' });
```

- [x] **Step 2: Run the service tests and confirm failure**

Run: `node --test test/worlds/release-service.test.js`

Expected: failure because release service exports do not exist.

- [x] **Step 3: Implement submit transaction**

Inside one `withTransaction`: lock project, verify owner/authenticated actor, confirm `project_worlds` identity and active template, read the current consent-derived capability, enforce feature flag and cohort membership, compare revision, write/reuse play snapshot, re-read snapshot hash, insert candidate keyed by idempotency, persist all check rows, then transition to `review_pending` only when every result passed. Write a redacted audit event after a committed outcome.

The public request shape is:

```ts
export interface SubmitWorldReleaseInput {
  actor: Actor;
  projectId: string;
  expectedRevision: number;
  idempotencyKey: string;
}
```

Return only `{ id, status, sourceRevision, submittedAt, replayed }` to the route.

- [x] **Step 4: Implement admin decision and removal transitions**

`decideWorldRelease` locks candidate and project rows, checks current capability again before publishing, revalidates snapshot hash, writes a decision row, and changes `current_public` atomically. For `publish`, mark prior current releases `superseded` before marking this release `published` with a random opaque `public_slug`. `withdraw` needs project ownership; `takeDown` needs admin role plus allowlisted reason. Both make the release immediately non-public and append an audit event.

- [x] **Step 5: Add integration tests for concurrent candidates and safe removal**

Prove only one current release survives two admin publish attempts, later project edits do not alter `project_play_snapshot_id`, consent revocation blocks publish, and withdrawal/takedown leave the private project/editing graph untouched.

- [x] **Step 6: Run the service suite**

Run: `node --test test/worlds/release-service.test.js test/worlds/release-service.integration.mjs test/safety/consent-state.test.js test/safety/audit.test.js test/safety/feature-flags.test.js`

Expected: PASS.

- [x] **Step 7: Commit release services**

```bash
git add lib/worlds/releaseAudit.ts lib/worlds/releaseService.ts test/worlds/release-service.test.js test/worlds/release-service.integration.mjs
git commit -m "feat: add world release workflow service"
```

## Task 5: Expose owner and admin release APIs

**Files:**
- Create: `app/api/projects/[id]/world-releases/route.ts`
- Create: `app/api/projects/[id]/world-releases/[releaseId]/withdraw/route.ts`
- Create: `app/api/admin/world-releases/[releaseId]/decision/route.ts`
- Create: `app/api/admin/world-releases/[releaseId]/takedown/route.ts`
- Test: `test/api/world-release-routes.test.js`
- Test: `test/api/world-release-routes.integration.mjs`

**Interfaces:**
- Consumes Task 4 services and existing actor/admin middleware.
- Produces stable API codes for owner status, submit, withdraw, review, reject, and takedown client actions.

- [x] **Step 1: Write failing route-contract tests**

```js
assert.equal(await submitAsAnonymous(), 401);
assert.equal(await submitAsStranger(), 404);
assert.equal(await submitWithFlagDisabled(), 503);
assert.equal(await submitWithStaleRevision(), 409);
assert.equal(await adminDecisionAsNonAdmin(), 403);
```

- [x] **Step 2: Run route tests and confirm failure**

Run: `node --test test/api/world-release-routes.test.js`

Expected: failure because endpoints do not exist.

- [x] **Step 3: Implement strict request parsing and error mapping**

Require JSON object bodies with only allowed keys. Submission requires `expectedRevision` non-negative integer and a 16–128 character `Idempotency-Key`; decisions accept `action` from `publish | request_changes | reject`; takedown accepts an allowlisted reason code. Resolve actors server-side, return 404 for non-viewable release/project resources, and serialize no internal error details.

```ts
return NextResponse.json({ error: 'feature_unavailable', reason: 'flag_disabled' }, { status: 503 });
```

- [x] **Step 4: Add owner status GET and decision integration tests**

Owner GET returns their release history plus safe check summaries; nonowners cannot inspect it. Admin decision tests assert the release ID, project ID, snapshot ID, and hash are not accepted from the client body and cannot be substituted.

- [x] **Step 5: Run API and authorization regressions**

Run: `node --test test/api/world-release-routes.test.js test/api/world-release-routes.integration.mjs test/auth/project-access.test.js test/auth/admin-access.test.js test/auth/actor-policy.test.js`

Expected: PASS.

- [x] **Step 6: Commit API boundaries**

```bash
git add app/api/projects/'[id]'/world-releases app/api/admin/world-releases test/api/world-release-routes.test.js test/api/world-release-routes.integration.mjs
git commit -m "feat: add world release review APIs"
```

## Task 6: Serve immutable public worlds and snapshot-based remixes

**Files:**
- Create: `lib/worlds/releaseRemix.ts`
- Create: `app/api/world-releases/[releaseId]/remix/route.ts`
- Create: `app/worlds/[slug]/page.tsx`
- Create: `components/worlds/PublishedWorldPlayer.tsx`
- Test: `test/worlds/release-remix.test.js`
- Test: `test/worlds/release-public-boundary.integration.mjs`

**Interfaces:**
- Consumes Task 2 public access loader and Task 4 state authority.
- Produces public immutable page `/worlds/[slug]` and private remixed project with source release lineage.

- [x] **Step 1: Write failing public-boundary tests**

```js
assert.equal(await fetchPublicWorld('published-slug').status, 200);
assert.equal(await fetchPublicWorld('withdrawn-slug').status, 404);
const remix = await remixApprovedRelease({ actor: user, releaseId });
assert.equal(remix.project.visibility, 'private');
assert.equal(remix.project.source_release_id, releaseId);
await assert.rejects(() => remixApprovedRelease({ actor: user, releaseId: takenDownId }), { code: 'release_not_public' });
```

- [x] **Step 2: Run tests and confirm failure**

Run: `node --test test/worlds/release-remix.test.js test/worlds/release-public-boundary.integration.mjs`

Expected: failure because no release-specific player/remix path exists.

- [x] **Step 3: Implement snapshot materialization for remix**

Lock and read a published current release, then reconstruct scenes, objects, blocks, assets, and `project_worlds` identity from its stored snapshot into a new private project inside one transaction. Store `remixed_from` and new `source_release_id`; increment source release/project remix counters only after copy succeeds. Do not call the legacy `/api/projects/[id]/remix` service, which copies editable live rows.

- [x] **Step 4: Implement the public player page**

`app/worlds/[slug]/page.tsx` gets a `PublicWorldRelease` and parsed immutable snapshot from `releaseAccess`. Pass the snapshot-derived game data to `PublishedWorldPlayer`/`GamePlayer`; do not call `requireProjectView` or `writePlaySnapshot`. Increment public play count best-effort against the release owner exclusion rule. A missing/non-published slug calls `notFound()`.

- [x] **Step 5: Test snapshot freeze and removal behavior**

Create a candidate, publish it, change its source project, and prove HTML/runtime data stays at the released snapshot. Then withdraw/take down and prove Explore query, world page, play, and remix all return absent/404.

- [x] **Step 6: Commit public boundary and remix**

```bash
git add lib/worlds/releaseRemix.ts app/api/world-releases/'[releaseId]'/remix app/worlds/'[slug]' components/worlds/PublishedWorldPlayer.tsx test/worlds/release-remix.test.js test/worlds/release-public-boundary.integration.mjs
git commit -m "feat: play and remix published world releases"
```

## Task 7: Add creator and moderator release controls

**Files:**
- Create: `components/worlds/WorldReleasePanel.tsx`
- Create: `components/admin/WorldReleaseQueue.tsx`
- Modify: `components/editor/ShareDialog.tsx`
- Modify: `components/editor/GameEditor.tsx`
- Modify: `app/admin/reports/page.tsx`
- Test: `test/worlds/release-panel.test.mjs`
- Test: `test/admin/world-release-queue.test.mjs`

**Interfaces:**
- Consumes Task 5 owner/admin APIs and safe DTOs.
- Produces a World Builder-specific release panel and a review queue; legacy `ShareDialog` code remains the only control for non-World Builder projects.

- [x] **Step 1: Write rendering and request tests first**

```js
assert.match(panelSource, /Submit for review/);
assert.match(panelSource, /Withdraw from Explore/);
assert.doesNotMatch(panelSource, /moderation_notes|parent_email|birth_month/);
assert.match(queueSource, /request_changes/);
assert.match(queueSource, /Take down/);
```

- [x] **Step 2: Run tests and confirm failure**

Run: `node --test test/worlds/release-panel.test.mjs test/admin/world-release-queue.test.mjs`

Expected: failure because the panel and queue do not exist.

- [x] **Step 3: Implement `WorldReleasePanel` with status-driven actions**

The panel fetches owner release status on mount. It derives the expected revision from `GameEditor`'s authoritative project revision, generates one UUID idempotency key per submit click, disables duplicate in-flight actions, and renders only these status-specific controls:

```tsx
{status === 'draft' && <button onClick={submit}>Submit for review</button>}
{status === 'review_pending' && <button onClick={withdraw}>Withdraw submission</button>}
{status === 'published' && <button onClick={withdraw}>Withdraw from Explore</button>}
```

Use neutral child-safe copy for changes/rejection; show no private reason or reviewer identity.

- [x] **Step 4: Integrate panel without changing legacy sharing behavior**

Pass project world identity from `GameEditor` into `ShareDialog`. When `isWorldBuilder` is true, render `WorldReleasePanel` in place of the private-draft placeholder. Leave the non-World Builder branch untouched and keep export available to both project types.

- [x] **Step 5: Implement reviewer queue**

Extend the admin page server query to load `review_pending` releases and safe check summaries. Render each candidate with a new-tab frozen world preview and explicit Publish, Request changes, Reject, and Take down actions. Every action needs a confirmation state; takedown requires selecting an allowlisted reason.

- [x] **Step 6: Run component checks**

Run: `node --test test/worlds/release-panel.test.mjs test/admin/world-release-queue.test.mjs test/worlds/mission-ui.test.mjs`

Expected: PASS.

- [x] **Step 7: Commit release UI**

```bash
git add components/worlds/WorldReleasePanel.tsx components/admin/WorldReleaseQueue.tsx components/editor/ShareDialog.tsx components/editor/GameEditor.tsx app/admin/reports/page.tsx test/worlds/release-panel.test.mjs test/admin/world-release-queue.test.mjs
git commit -m "feat: add world release creator and admin controls"
```

## Task 8: Add release-aware discovery and reporting

**Files:**
- Modify: `app/explore/page.tsx`
- Modify: `components/projects/ReportButton.tsx`
- Modify: `app/api/reports/route.ts`
- Modify: `lib/safety/reportSubmission.ts`
- Modify: `app/admin/reports/page.tsx`
- Modify: `components/admin/ReportQueue.tsx`
- Test: `test/worlds/release-discovery.test.js`
- Test: `test/safety/release-report-submission.test.js`

**Interfaces:**
- Consumes public release DTOs and report `world_release_id` support.
- Produces approved-release cards in Explore and exact-release reports/takedown navigation.

- [x] **Step 1: Write failing discovery/report tests**

```js
const cards = await listPublicWorldReleases();
assert.equal(cards.some((r) => r.status), false);
assert.equal(cards.every((r) => r.slug && r.title), true);
await submitReport({ projectId, releaseId, reason: 'unsafe_content' });
assert.equal(inserted.world_release_id, releaseId);
```

- [x] **Step 2: Run tests and confirm failure**

Run: `node --test test/worlds/release-discovery.test.js test/safety/release-report-submission.test.js`

Expected: failure because discovery and report inputs are not release-aware.

- [x] **Step 3: Render approved release cards separately from templates and legacy projects**

Load release cards only after `listPublicProjects` has established the legacy public boundary. Each card links to `/worlds/[slug]`, contains allowlisted DTO fields, and has a Play action. Do not merge legacy projects into release query or modify `listPublicProjects`.

- [x] **Step 4: Add optional release reporting with strict linkage**

Accept `releaseId` only when it resolves to a current published release belonging to the supplied reported project. Reject mismatch or non-public release with 404, store the release foreign key, and preserve current report moderation/rate-limit behavior. Update report queue rows to link admins to `/worlds/[slug]` and its release decision history while displaying no reporter identity beyond existing admin policy.

- [x] **Step 5: Run discovery, reports, and legacy gallery regression tests**

Run: `node --test test/worlds/release-discovery.test.js test/safety/release-report-submission.test.js test/auth/public-project-boundary.test.js test/api/trust-boundary-guard.test.js`

Expected: PASS.

- [x] **Step 6: Commit public discovery/reporting**

```bash
git add app/explore/page.tsx components/projects/ReportButton.tsx app/api/reports/route.ts lib/safety/reportSubmission.ts app/admin/reports/page.tsx components/admin/ReportQueue.tsx test/worlds/release-discovery.test.js test/safety/release-report-submission.test.js
git commit -m "feat: discover and report published world releases"
```

## Task 9: Add end-to-end safeguards and release gates

**Files:**
- Create: `test/visual/world-release-journey.mjs`
- Create: `test/worlds/release-regression.integration.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/superpowers/plans/2026-08-26-world-builder-release-beta.md`

**Interfaces:**
- Consumes every prior release API and UI boundary.
- Produces `test:world-release` and a CI-required release journey before deployment.

- [x] **Step 1: Write the failing full journey**

```js
await createWorldAs(consentedChild);
await submitRelease(currentRevision);
await assertStatus('review_pending');
await approveAsAdmin();
await assertPublicWorldPlayable();
await editPrivateDraft();
await assertPublicWorldStillUsesOriginalHash();
await withdrawAsOwner();
await assertPublicWorldMissing();
```

- [x] **Step 2: Run the journey and confirm it fails before final integration**

Run: `node test/visual/world-release-journey.mjs`

Expected: failure until all services, routes, pages, and UI actions are joined.

- [x] **Step 3: Add focused package and CI commands**

Add `test:world-release` that executes state, checks, service, route, public-boundary, remix, panel, discovery, report, and journey tests. Add it after `test:critical` in CI so an immutable public release cannot regress behind a passing general suite.

```json
"test:world-release": "node --test test/worlds/release-*.test.js test/safety/release-report-submission.test.js && node test/visual/world-release-journey.mjs"
```

- [x] **Step 4: Run exhaustive local verification**

Run:

```bash
npm run test:world-release
npm run test:critical
npm run test:all
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

Expected: every command exits 0; lint warnings must not introduce errors.

- [ ] **Step 5: Perform manual staging verification with the production flag disabled**

> Not performed. This step needs a deployed staging environment, which is Task 10 territory and outside the approved scope of this run. Its four assertions are covered automatically by `test/worlds/release-regression.integration.mjs` (flag-disabled submission and publication return `feature_unavailable`, withdrawal still works), `test/worlds/release-panel.test.mjs` (the ordinary-project ShareDialog branch is unchanged), and the release gate as a whole (non-admins cannot decide or take down; nothing is public before an admin publishes). The remaining value of the manual pass is confirming this holds against real production configuration.

Verify a World Builder owner sees the release panel but submission returns a clear unavailable state, a legacy project keeps its existing ShareDialog branch, non-admin routes cannot decide/take down, and no current public world release appears until an admin publishes it. Record exact result and commit completed checkboxes into this plan.

- [x] **Step 6: Commit release gates and verification evidence**

```bash
git add package.json .github/workflows/ci.yml test/visual/world-release-journey.mjs test/worlds/release-regression.integration.mjs docs/superpowers/plans/2026-08-26-world-builder-release-beta.md
git commit -m "test: gate world release beta"
```

## Task 10: Deploy safely and activate only after operational approval

**Files:**
- Modify: deployment environment configuration outside the repository only after the release is verified.
- Modify: `docs/superpowers/plans/2026-08-26-world-builder-release-beta.md`

**Interfaces:**
- Consumes existing staged `deploy.sh`, production health endpoint, smoke scripts, and operator-controlled `FEATURE_FLAG_COMMUNITY_PUBLISHING`.
- Produces a deployed-but-disabled beta followed by an explicitly authorized limited cohort activation.

- [ ] **Step 1: Deploy with community publishing disabled**

Run the existing staged deployment script only after Task 9 passes. Verify the service is active and every existing public/legacy path still returns a successful response.

- [ ] **Step 2: Run live production verification**

Run the project smoke and accessibility scripts against the production base URL. Add targeted HTTP checks for a nonexistent world slug and for a known published test slug only after the admin decision has been made in the beta environment.

```bash
node scripts/smoke.js https://play.lingcode.dev
node scripts/a11y.js https://play.lingcode.dev
```

- [ ] **Step 3: Obtain explicit operator authorization before enabling the beta flag**

Do not set `FEATURE_FLAG_COMMUNITY_PUBLISHING=true` or insert cohort members merely because deployment succeeded. Present the completed verification results and wait for the product owner to authorize the limited cohort.

- [ ] **Step 4: Activate and validate the internal cohort**

When authorized, add only the selected internal test profiles to `world_release_beta_cohort_members`, enable the server-side flag, then manually exercise submit, reject, publish, play, remix, withdraw, and takedown. Disable the flag immediately if any check, audit, or public-boundary assertion fails.

- [ ] **Step 5: Record deployment evidence and commit**

```bash
git add docs/superpowers/plans/2026-08-26-world-builder-release-beta.md
git commit -m "docs: record world release beta verification"
```
