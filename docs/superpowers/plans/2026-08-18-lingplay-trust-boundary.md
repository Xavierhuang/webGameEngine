# LingPlay Trust Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace forgeable guest identity and scattered access checks with revocable opaque sessions, centralized authorization, server-controlled consent, shared AI budgets, and fail-closed publication.

**Architecture:** A discriminated server-only actor model feeds one access facade for projects and nested resources. Migration 008 introduces hashed guest sessions, quarantine, consent, quota, audit, feature-flag, and publication-snapshot state. Risky AI mutation and new publishing remain disabled until durable-work transactions and private storage are available.

**Tech Stack:** Next.js 16 App Router and Route Handlers, TypeScript, MySQL 8/mysql2, Zod, Node test runner, Playwright browser scripts.

## Global Constraints

- Ignore and clear every legacy `guest-profile-id` cookie; never migrate it into authority.
- Use a 32-byte base64url guest token, store only SHA-256, and expire it after 30 days.
- Authenticated users outrank guest sessions; public IDs never prove identity.
- Return 404 for non-viewable resources and 403 for a known actor denied an already-public action.
- Reclassify existing public projects as `moderation_pending`; do not expose live mutable graphs as approved snapshots.
- Store only birth month (`YYYY-MM`) and derive `under_13`, `teen`, or `adult` on the server.
- `/test/[projectId]` is unavailable in production and requires edit access in development.
- AI mutation and new publishing remain disabled until their durable-work dependencies pass.
- Browser security tests must reject non-localhost base URLs.
- Preserve all pre-existing dirty work; stage only files named by the active task.

---

### Task 1: Trust Schema, Production Configuration, and Safe Defaults

**Files:**
- Create: `migrations/008_trust_boundary.sql`
- Create: `lib/config/security.ts`
- Modify: `lib/database.types.ts`
- Create: `test/database/trust-boundary-migration.test.js`
- Create: `test/config/security.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces `SecurityConfig` with `guestSessionDays: 30`, `trustedProxyHops`, capability flags, and exact AI limits.
- Produces schema tables `guest_sessions`, `legacy_guest_quarantine`, `consent_tokens`, `rate_limit_buckets`, `security_audit_events`, `feature_flags`, `publication_snapshots`, and `publication_assets`.
- Changes `profiles.user_id` to nullable and adds `profile_kind ENUM('user','guest') NOT NULL DEFAULT 'user'`.

- [ ] **Step 1: Write failing migration and configuration tests**

Create a source-level migration test that reads SQL and asserts every required table/index/column, plus a pure configuration test:

```js
test('production refuses unsafe trust configuration', () => {
  assert.throws(
    () => readSecurityConfig({ NODE_ENV: 'production', TRUSTED_PROXY_HOPS: '' }),
    /TRUSTED_PROXY_HOPS/
  );
});

test('AI limits are exact and bounded', () => {
  const c = readSecurityConfig({ NODE_ENV: 'test', TRUSTED_PROXY_HOPS: '1' });
  assert.deepEqual(c.ai, {
    maxPayloadBytes: 262144,
    maxInputTokens: 8000,
    maxOutputTokens: 2000,
    maxHistoryMessages: 20,
    maxConcurrentPerActor: 2,
    maxConcurrentPerProject: 4,
    dailyAsk: 50,
    dailyChat: 20,
    dailyCharacterJobs: 5,
  });
});
```

- [ ] **Step 2: Add `test:trust-schema` and verify RED**

Add a package script compiling `lib/config/security.ts` and running both new tests. Run `npm run test:trust-schema`. Expected: failure because the migration and configuration module do not exist.

- [ ] **Step 3: Implement the idempotent migration and configuration parser**

Use MySQL 8-compatible DDL. Quarantine rows where `profile_kind='guest'`, `user_id IS NULL`, or the linked user email matches `guest-%@temp.local`. Seed server flags `ai_project_context`, `ai_mutation`, `personal_media_upload`, and `new_publication` to false. Parse production values without permissive fallbacks:

```ts
export function readSecurityConfig(env: NodeJS.ProcessEnv): SecurityConfig {
  const trustedProxyHops = Number(env.TRUSTED_PROXY_HOPS);
  if (env.NODE_ENV === 'production' && !Number.isInteger(trustedProxyHops)) {
    throw new Error('TRUSTED_PROXY_HOPS is required in production');
  }
  return { guestSessionDays: 30, trustedProxyHops: Number.isInteger(trustedProxyHops) ? trustedProxyHops : 0, ai: AI_LIMITS };
}
```

- [ ] **Step 4: Verify GREEN**

Run `npm run test:trust-schema && npm run type-check`. Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add migrations/008_trust_boundary.sql lib/config/security.ts lib/database.types.ts test/database/trust-boundary-migration.test.js test/config/security.test.js package.json
git commit -m "feat: add trust boundary schema"
```

---

### Task 2: Opaque Guest Sessions and Unified Actor Resolution

**Files:**
- Create: `lib/auth/actor.ts`
- Create: `lib/auth/guestSession.ts`
- Create: `app/api/guest-session/route.ts`
- Create: `proxy.ts`
- Modify: `lib/auth/guest.ts`
- Modify: `lib/mysql/server.ts`
- Modify: `lib/auth/admin.ts`
- Modify: `lib/auth/adminAccess.ts`
- Delete: `lib/auth/client.ts` if no live import remains
- Create: `test/auth/guest-session.test.js`
- Create: `test/auth/actor-policy.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces `Actor = UserActor | GuestActor | AnonymousActor`.
- Produces `resolveActor(request: Request)`, `resolveCurrentActor()`, and non-authorizing `inspectGuestSessionForClaim(request)`.
- Produces `POST /api/guest-session` that creates or rotates the response-owned cookie.

- [ ] **Step 1: Write failing token and precedence tests**

```js
test('guest token is random while storage uses only its hash', async () => {
  const issued = await issueGuestSession(fakeStore, 'profile-1');
  assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(fakeStore.rows[0].tokenHash, sha256(issued.token));
  assert.equal(JSON.stringify(fakeStore.rows).includes(issued.token), false);
});

test('authenticated user outranks a valid guest token', async () => {
  const actor = await resolveActorFromCredentials({ userId: 'u1', guestProfileId: 'g1' });
  assert.deepEqual(actor, { kind: 'user', userId: 'u1', profileId: 'p1' });
});
```

Also assert expired/revoked sessions are anonymous, rotation revokes the parent row, and claim inspection never returns an authorizing `Actor`.

- [ ] **Step 2: Run focused tests to verify RED**

Add `test:guest-session` and run it. Expected: compilation or import failure for missing modules.

- [ ] **Step 3: Implement guest issuance, hashing, rotation, and actor adapters**

Use `randomBytes(32).toString('base64url')` and `createHash('sha256')`. Cookie options are:

```ts
const GUEST_COOKIE = {
  name: 'lingplay_guest_session',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 24 * 60 * 60,
};
```

Use async Next 16 `cookies()`. `proxy.ts` expires `guest-profile-id` and excludes `/_next`, static assets, icons, and API requests that must own their response cookies. Remove the JavaScript-readable auth-cookie helper when `rg` confirms it has no consumer.

- [ ] **Step 4: Verify GREEN and legacy-cookie rejection**

Run `npm run test:guest-session && npm run type-check && npm run test:admin-access`. Expected: all pass and no server path reads `guest-profile-id` as authority.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/actor.ts lib/auth/guestSession.ts app/api/guest-session/route.ts proxy.ts lib/auth/guest.ts lib/mysql/server.ts lib/auth/admin.ts lib/auth/adminAccess.ts lib/auth/client.ts test/auth/guest-session.test.js test/auth/actor-policy.test.js package.json
git commit -m "feat: replace guest identity with opaque sessions"
```

---

### Task 3: Central Project and Nested-Resource Authorization

**Files:**
- Modify: `lib/auth/projectAccess.ts`
- Rewrite: `lib/auth/access.ts`
- Create: `lib/auth/publicProjectDto.ts`
- Modify: `test/auth/project-access.test.js`
- Create: `test/api/trust-boundary-guard.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces `getProjectAccess(actor, projectId)`, `requireProjectView`, `requireProjectEdit`, and `requireResourceEdit`.
- Produces explicit public DTOs without internal owner/profile IDs.

- [ ] **Step 1: Write the failing authorization matrix**

Cover owner user, owner guest, authenticated stranger, anonymous visitor, moderator/admin, private/public/pending/rejected projects, and cross-project nested IDs:

```js
test('a resource from another project is rejected', async () => {
  await assert.rejects(
    () => requireResourceEdit(ownerOfA, 'object', objectInB),
    (error) => error.status === 404
  );
});

test('public DTO omits internal authority fields', () => {
  const dto = toPublicProjectDto(projectRow, authorRow);
  for (const key of ['owner_id', 'profile_id', 'user_id']) assert.equal(key in dto, false);
});
```

- [ ] **Step 2: Run `npm run test:access` to verify RED**

Expected: new policy cases fail because current access trusts the raw guest profile and nested lookups are inconsistent.

- [ ] **Step 3: Implement joined ownership resolution and stable denials**

Keep pure visibility/capability decisions in `projectAccess.ts`; keep all SQL in `access.ts`. Resolve resource-to-project through joined queries keyed only by the resource ID. Use typed `AccessError` with `status` and stable reason code.

- [ ] **Step 4: Add the protected-route manifest guard and verify GREEN**

The guard enumerates every route/page named in the trust spec and asserts it imports a required guard or delegates to an approved guarded service. Run `npm run test:access && npm run type-check`.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/projectAccess.ts lib/auth/access.ts lib/auth/publicProjectDto.ts test/auth/project-access.test.js test/api/trust-boundary-guard.test.js package.json
git commit -m "feat: centralize project authorization"
```

---

### Task 4: Convert Every Project Surface to the Trust Boundary

**Files:**
- Modify: `app/projects/[id]/page.tsx`
- Modify: `app/play/[id]/page.tsx`
- Modify: `app/editor/[id]/page.tsx`
- Modify: `app/test/[projectId]/page.tsx`
- Modify: `app/projects/page.tsx`
- Modify: `app/api/projects/route.ts`
- Modify: `app/api/projects/[id]/route.ts`
- Modify: `app/api/projects/[id]/export/route.ts`
- Modify: `app/api/projects/explore/route.ts`
- Modify: `app/api/scenes/route.ts`
- Modify: `app/api/scenes/[id]/route.ts`
- Modify: `app/api/game-objects/[id]/route.ts`
- Modify: `app/api/game-objects/[id]/logic-blocks/route.ts`
- Modify: `app/api/game-objects/reorder/route.ts`
- Modify: `app/api/projects/[id]/remix/route.ts`
- Modify: `app/api/projects/import/route.ts`
- Modify: `app/api/projects/[id]/like/route.ts`
- Modify: `app/api/reports/route.ts`
- Modify: `app/api/admin/reports/route.ts`
- Modify: `app/api/admin/users/route.ts`
- Create: `test/api/authorization-matrix.mjs`
- Modify: `test/visual/private-project.mjs`
- Modify: `test/visual/stranger-write.mjs`

**Interfaces:**
- Consumes Task 2 `Actor` and Task 3 access guards.
- Produces no unguarded project graph read or write surface.

- [ ] **Step 1: Extend live hostile tests before route edits**

Add owner/guest/stranger/anonymous cases for every HTTP method and nested cross-project ID. Explicitly include AI routes in later Task 7. Make browser tests call `assertLocalBaseUrl(BASE)` and refuse any non-loopback host.

- [ ] **Step 2: Run the local route matrix to verify RED**

Apply migration 008 to the test database, start the local app, and run `node test/api/authorization-matrix.mjs`. Expected: unauthorized object GET, editor access, or a current nested-resource case fails.

- [ ] **Step 3: Replace route-local identity logic with required guards**

For every file in this task, resolve one actor, require view/edit on the true owning project, then query. `app/editor/[id]` requires edit. `/test` calls `notFound()` in production before graph loading and requires edit in development. Preserve existing dirty ordering/delete fixes while replacing only authority and DTO paths.

- [ ] **Step 4: Verify route guard coverage and browser GREEN**

Run `npm run test:access`, the route manifest guard, `node test/api/authorization-matrix.mjs`, `npm run test:private-project`, and `npm run test:stranger-write` against localhost.

- [ ] **Step 5: Commit**

Stage exactly the route/page/test files listed above and commit:

```bash
git commit -m "fix: enforce project access on every surface"
```

---

### Task 5: Parent-First Consent State Machine

**Files:**
- Modify: `lib/safety/coppa.ts`
- Rewrite: `lib/safety/parentalConsent.ts`
- Create: `lib/safety/capabilities.ts`
- Modify: `app/api/auth/signup/route.ts`
- Create: `app/api/auth/parent-enrollment/route.ts`
- Create: `app/api/auth/consent/resend/route.ts`
- Modify: `app/api/auth/consent/route.ts`
- Modify: `app/auth/signup/page.tsx`
- Modify: `app/auth/pending-approval/page.tsx`
- Modify: `app/parent/consent/page.tsx`
- Modify: `components/auth/ConsentForm.tsx`
- Modify: `lib/email/send.ts`
- Modify: `test/safety/coppa.test.js`
- Create: `test/safety/consent-state.test.js`
- Modify: `test/email/consent-email.test.js`
- Create: `test/api/consent-flow.mjs`

**Interfaces:**
- Produces `ConsentState` and `capabilitiesFor(actor, profile)`.
- Uses `birth_month` and parent-first verified email enrollment; removes client `isParent` authority.

- [ ] **Step 1: Write failing state and token-leak tests**

```js
test('pending under-13 capabilities are private and non-AI', () => {
  assert.deepEqual(capabilitiesFor({ ageBand: 'under_13', consent: 'pending' }), {
    editPrivate: true, publish: false, share: false, creationAI: false,
    personalMedia: false, community: false,
  });
});

test('child signup never returns consent credentials', async () => {
  const body = await signupUnder13({ emailDelivery: 'failed' });
  assert.equal('consentUrl' in body, false);
  assert.equal(JSON.stringify(body).includes('token='), false);
});
```

- [ ] **Step 2: Run consent tests to verify RED**

Run `npm run test:coppa && npm run test:email` plus the new consent test. Expected: current `isParent` and fallback URL behavior fail.

- [ ] **Step 3: Implement parent-first enrollment and atomic single-use tokens**

Parent enrollment verifies email before creating a parent role and child invite. Underage direct signup stays pending and sends a 24-hour purpose-bound, hash-only token to the parent address. Approval, denial, resend, and expiry invalidate sibling tokens atomically. API responses expose only state and resend availability.

- [ ] **Step 4: Verify GREEN**

Run focused consent/email tests, the localhost consent-flow test, `npm run type-check`, and ensure `rg "isParent|consentUrl" app lib components` finds no authority or child response path.

- [ ] **Step 5: Commit**

Stage the files listed in this task and commit `feat: enforce parent-first consent`.

---

### Task 6: Shared Quotas, Capability Flags, and Redacted Audit

**Files:**
- Create: `lib/safety/persistentRateLimit.ts`
- Create: `lib/safety/featureFlags.ts`
- Create: `lib/safety/audit.ts`
- Modify: `lib/safety/rateLimit.ts`
- Create: `test/safety/persistent-limiter.test.js`
- Create: `test/api/capability-flags.test.js`
- Create: `test/safety/audit.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces atomic MySQL-backed actor/project/IP buckets and server-only feature checks.
- Extracts client IP by taking the configured number of trusted proxy hops from the right of `X-Forwarded-For`; direct untrusted headers are ignored when hops is zero.

- [ ] **Step 1: Write failing shared-bucket and redaction tests**

Assert two limiter instances consume the same database bucket, concurrency leases release on success/failure, untrusted forwarded IPs cannot choose their key, disabled flags return 503 with `feature_unavailable`, and audit serialization excludes raw prompt/email/token/IP values.

- [ ] **Step 2: Run the new safety tests to verify RED**

Expected: missing modules or current in-memory isolation causes failure.

- [ ] **Step 3: Implement atomic upserts, leases, flags, and audit events**

Bucket keys are HMAC-derived pseudonyms. Store count/window/expiry only. Audits store actor kind, pseudonymous actor key, operation, outcome, reason, correlation ID, and timestamp.

- [ ] **Step 4: Verify GREEN**

Run `npm run test:rate-limit`, all three new tests, and `npm run type-check`.

- [ ] **Step 5: Commit**

Stage this task's files and commit `feat: add shared safety budgets`.

---

### Task 7: Guard and Bound Every AI Surface

**Files:**
- Create: `lib/ai/updateSchema.ts`
- Create: `lib/ai/jobs.ts`
- Modify: `app/api/ai/chat/route.ts`
- Modify: `app/api/ai/apply-update/route.ts`
- Modify: `app/api/ai/generate-character/route.ts`
- Modify: `app/api/ai/ask/route.ts`
- Modify: `app/api/ai/translate/route.ts`
- Modify: `lib/ai/claude.ts`
- Modify: `lib/ai/meshy.ts`
- Create: `test/ai/update-schema.test.js`
- Create: `test/api/ai-access.mjs`

**Interfaces:**
- Produces a strict discriminated AI command union with at most 50 commands, depth 20, strings 2,000 characters, and unknown keys rejected.
- Consumes centralized access, consent capabilities, flags, shared budgets, and audit.

- [ ] **Step 1: Write failing schema and access tests**

Test unknown commands/keys, cross-project IDs, oversized payloads, unsafe input/output, disabled mutation, private-context stranger access, actor/project concurrency, and daily limits. Assert no model provider is called before every guard passes.

- [ ] **Step 2: Run the focused AI tests to verify RED**

Expected: current chat leaks private context and apply-update reaches mutation logic without `canEdit`.

- [ ] **Step 3: Implement guard order and asynchronous character jobs**

Order is parse bytes → actor → capability flag → project access → consent capability → shared budget/lease → input moderation → provider → output moderation → strict schema. `apply-update` remains 503-disabled until the durable command transaction is injected. Meshy returns a bounded job ID and polling endpoint rather than holding one request for 180 seconds.

- [ ] **Step 4: Verify GREEN with mutation still disabled**

Run AI schema/access tests, `npm run test:safety`, `npm run type-check`, and `npm run lint`.

- [ ] **Step 5: Commit**

Stage only Task 7 files and commit `fix: guard and budget AI routes`.

---

### Task 8: Fail-Closed Publication Candidates and Snapshot State

**Files:**
- Create: `lib/safety/publication.ts`
- Create: `lib/safety/mediaPolicy.ts`
- Modify: `lib/safety/moderation.ts`
- Modify: `app/api/projects/[id]/route.ts`
- Modify: `app/api/projects/explore/route.ts`
- Modify: `app/projects/[id]/page.tsx`
- Create: `test/safety/publication-candidate.test.js`
- Modify: `test/visual/share-flow.mjs`

**Interfaces:**
- Produces a complete immutable candidate covering metadata, scenes, objects, recursive block text, dialogue/questions/prompts, assets, and external references.
- Existing public projects become pending; last approved snapshots alone feed Explore and public Play.

- [ ] **Step 1: Write failing complete-graph and provider-failure tests**

Build a fixture with unsafe text only inside nested block data and a remote model reference. Assert both enter the candidate, remote media is rejected before durable storage exists, moderation-provider failure returns `moderation_pending`, and live draft mutation never changes an approved snapshot.

- [ ] **Step 2: Run focused publication tests to verify RED**

Expected: current metadata-only moderation and always-safe image stub fail.

- [ ] **Step 3: Implement candidate collection and disabled publication transition**

Create canonical stable JSON and a content hash. Read public pages/Explore from `publication_snapshots`. New publication remains flag-disabled until `AssetStore` exists; the API returns a clear pending/unavailable state rather than approving direct URLs.

- [ ] **Step 4: Verify GREEN**

Run publication tests, share-flow under disabled mode, `npm run type-check`, and `npm run build`.

- [ ] **Step 5: Commit**

Stage Task 8 files and commit `feat: add fail-closed publication snapshots`.

---

### Task 9: Trust Browser Matrix and CI Gate

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/setup-db.sh`
- Modify: `test/api/authorization-matrix.mjs`
- Modify: `test/api/consent-flow.mjs`
- Modify: `test/api/ai-access.mjs`
- Modify: `test/visual/private-project.mjs`
- Modify: `test/visual/stranger-write.mjs`
- Modify: `test/visual/share-flow.mjs`

**Interfaces:**
- Produces `test:trust` and `test:trust-browser` gates; migration errors are fatal.

- [ ] **Step 1: Add a deliberately failing CI-manifest assertion**

Assert CI invokes both trust scripts and no longer tolerates migration failure. Run it and confirm RED against current CI.

- [ ] **Step 2: Wire focused and browser trust scripts**

`test:trust` compiles/runs Tasks 1–8 pure tests. `test:trust-browser` validates a loopback URL, resets only `gameengine_test`, applies every migration with `set -e`, starts the built app, and runs the hostile matrices.

- [ ] **Step 3: Run the complete trust gate**

```bash
npm run test:trust
npm run type-check
npm run lint
npm run test:all
npm run build
npm run test:trust-browser
npm run smoke
```

Expected: all commands exit 0; AI mutation and new publication remain disabled.

- [ ] **Step 4: Commit**

```bash
git add package.json .github/workflows/ci.yml scripts/setup-db.sh test/api/authorization-matrix.mjs test/api/consent-flow.mjs test/api/ai-access.mjs test/visual/private-project.mjs test/visual/stranger-write.mjs test/visual/share-flow.mjs
git commit -m "test: enforce trust boundary in CI"
```
