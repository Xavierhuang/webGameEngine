# LingPlay Remediation Resume Plan

**Purpose:** any fresh Claude Code (or Codex) session can pick this up cold,
pick the next task, execute it end-to-end, commit, deploy, and update this
file — without prior context.

**Last refreshed:** 2026-09-01, after the improvement pass described in
"2026-09-01 improvement pass" below. Not yet deployed — the tree needs a
`./deploy.sh` and a live smoke/a11y check.

Before that: 2026-08-27, after merging `origin/main`, guarding the AI
routes, and deploying. Everything below was verified against the tree and the
droplet, not carried over from the previous version of this file (which had
drifted a week out of date).

---

## State snapshot

- **Branch:** `main`, containing the 2026-08-27 merge of `origin/main`
  (`00a6e5d World Builder release beta (#2)`) — the checkout had been one
  commit behind, missing the entire release beta. The only conflict was an
  add/add on
  `docs/superpowers/plans/2026-08-26-world-builder-release-beta.md`, resolved to
  origin's executed copy (55 of 61 steps ticked) over the local unticked one.
- **Migrations:** `001`–`015` present locally.
- **Remote:** github.com/Xavierhuang/webGameEngine, in sync.
- **Deployed:** 2026-08-27, `59c9fce`, from a clean tree. Verified live:
  12/12 browser smoke pages, 7/7 accessibility pages, `/api/health` reporting
  `database: true`, an anonymous `POST /api/ai/generate-character` answering
  404, and `/api/ai/ask` still answering for players. `schema_migrations`
  still shows 15 — no migration re-ran.
- **Deploys are now recorded.** `deploy.sh` appends SHA + dirty-count +
  operator to `/opt/lingplay/RELEASES.log` on the droplet. Read that first
  rather than inferring. It previously wrote nothing, which is how an audit
  session concluded production was a week behind when it was current —
  **production had the release beta since 2026-08-26 19:37**, evidenced by
  migrations `013`–`015` applied at 19:36 and the `.next` build stamped 19:37.
  The log is seeded with that reconstructed entry.
- **`FEATURE_FLAG_COMMUNITY_PUBLISHING` is unset on the droplet**, so it reads
  as disabled by the production default. That is Task 10 Step 1's required
  state and it was **not** changed by this deploy.
- **CI now runs 125 of 130 test files**, up from 90. Five gates:
  `test:all`, `test:critical`, `test:regression`, `test:world-release`,
  `test:browser`. The last three are serial and treat a skipped test as a
  failure — `node --test` exits 0 on a skip, which would turn an unreachable
  database into a green release gate.
- **Verification, run 2026-08-27 on the merged tree:** `npx tsc --noEmit` → 0
  errors. `npm run test:all` → exit 0, 0 failed, 0 skipped. `npm run
  test:critical` → exit 0. `npm run test:regression` → **131 tests, 0
  skipped**. `npm run test:world-release` → **100 tests, 0 skipped**, and the
  20-step release journey passed end to end (submit → review → approve →
  public play → edit draft → snapshot unchanged → remix → report → withdraw).
  `npm run test:browser` → 6 suites. Nothing in the repo is failing.
- Still outstanding: `codex/minion-focus-shortcut` is 14 commits ahead of its
  remote and unmerged.

**`./deploy.sh` rsyncs the working tree, not a git ref**, and migrations are
forward-only through a `schema_migrations` ledger with **no down-migrations**.
Check `git status` *and* `git rev-list --left-right --count main...origin/main`
before every deploy — a stale checkout silently ships old code over new schema.

### World Builder boundary

Template worlds start as private drafts. Public release goes through the
reviewed, immutable release pipeline, now deployed and gated by
`FEATURE_FLAG_COMMUNITY_PUBLISHING` (production default: **disabled**). Do not
enable it as a workaround for anything; Task 10 of the release-beta plan
requires explicit operator authorization and a cohort insert first.

---

## 2026-09-01 improvement pass

An audit across child-facing UX, code health and production readiness, then
fixes for everything that did not need a product decision. All verified
locally: `type-check` 0, `lint` 0 errors, `test:all`, `test:critical`,
`test:regression`, `build`, and `smoke` + `a11y` against a local `next start`.

Fixed:

- **Share dialog no longer shows `publication_moved`.** It sends only
  `visibility`; a public-but-unreviewed game shows "Submitted for review"
  and hides the link that would have 404'd. The publish path itself is still
  the open decision in section 1.
- **Undo/redo persist.** `GameEditor` diffs the two snapshots per object and
  replays create/update/delete through the existing command paths, keeps the
  selection when the object survives, and ⌘Z inside the Blockly workspace no
  longer fires the project undo on top of Blockly's own.
- **Block edits flush on unmount** (`BlockEditor`) instead of being dropped
  when the child switches object within the 800 ms debounce.
- **Interpreter errors are visible.** `RuntimeWorld.scriptErrors` +
  `onScriptError`; the player shows a "{n} blocks had a problem" badge with
  object, block type and message. Unknown block types report too.
- **Error pages exist**: `app/error.tsx`, `app/global-error.tsx`,
  `app/not-found.tsx`, and `not-found.tsx` under `play/[id]` and
  `editor/[id]`, via `components/common/FriendlyErrorScreen.tsx`.
- **No more `window.alert`.** `components/common/Toast.tsx`; every message is
  translated (en/zh) and none says "check the console".
- Player has a back link; the editor stage has a Stop button and shows from
  `lg` (1024px) not `xl`; the editor header has the language switcher; the
  D-pad presses WASD as well as arrows and is translated in all 19 locales;
  `/learn` cards open their tutorial in the new project via `?tutorial=`.
- Performance: `dpr={[1, 2]}` on the player canvas; key state is a mutated
  ref (no re-render per key-repeat); per-frame `Vector3`/`JSON.parse`
  allocations hoisted; visibility `setState` only on change; interpreter
  `env` object reused per runtime; name lookups indexed; pen strokes capped.
- Server: CSP + HSTS + frame/referrer/permissions headers and immutable
  caching for `/models` and `/backdrops` in `next.config.js`; MySQL pool
  10 connections with a bounded queue and connect timeout; remix and import
  use multi-row inserts; `ai/chat` is rate limited like its siblings.
- `deploy.sh` keeps `.next.prev` until the smoke test passes and rolls back
  on failure; a machine without Playwright fails the deploy unless
  `LINGPLAY_SKIP_SMOKE=1`.
- Removed 14 unused dependencies (`phaser`, both `cannon`s, `zustand`,
  `framer-motion`, `date-fns`, the shadcn trio, five Radix packages) and the
  dead `PhysicsProvider`, `CollaborationProvider` and `lib/realtime`.
- `GameEditor` takes a typed `EditorProject` instead of `any`.

Deliberately not done (each is a larger or riskier piece):

- Draco/meshopt compression of the 60 starter GLBs and replacing the 7.6 MB
  Minion FBX — a generator change plus loader/decoder wiring, and
  `test:visual` measures rendered pixels.
- Tutorial catalog (`lib/tutorials/catalog.ts`) and `TutorialPanel` chrome
  are still English-only; progress is still per-browser, not per-account.
- Splitting `GamePlayer.tsx` (RuntimeContext literal at the `ctxRef.current`
  assignment is the natural first cut) and collapsing the 107 `test:*`
  scripts onto `scripts/lib/test-gate.mjs`.
- Instancing for repeated platforms, a FULLTEXT index for gallery search,
  CI job parallelisation, and the durable-work/production-readiness plans.

## Plan status

Checkbox state in `docs/superpowers/plans/` is **not** a reliable completion
signal — the 2026-08-09/11 plans read as 0% done and every asset they describe
ships in `public/models/`. Judge by deliverable presence.

| Plan | State |
|---|---|
| `2026-08-26-creator-platform-hardening` | Done and deployed (`4c9ab0c`) |
| `2026-08-26-world-builder-release-beta` | **Code complete, merged and deployed.** Task 10's deploy and live-verification steps are done (2026-08-27, flag off). What remains is human-gated only: manual staging verification, **explicit operator authorization before enabling `FEATURE_FLAG_COMMUNITY_PUBLISHING`**, and cohort activation. Nothing is published until a person does those. |
| `2026-08-24-sky-steps-flagship` | **Halted.** Ledger: Task 1 review rejected at `c242389` — the player flattens platforms, has no platform collision, and transforms template coordinates differently from the spec. "Sky Steps v2 is unwinnable." Needs a revised runtime/coordinate design and fresh spec approval. Sky Steps nonetheless ships in the template catalog. |
| `2026-08-24-lingplay-world-builder` | Tasks 1–5 shipped; the SDD ledger was never closed past Task 2 |
| `2026-08-18-lingplay-trust-boundary` | T1–T6 done. **T7 guards done** — all five AI routes are now on the actor/access/flag/limit/moderation pipeline and the manifest has no deferrals left. T7's *asynchronous character jobs* (`lib/ai/jobs.ts`, a bounded job ID + polling endpoint instead of holding one request for Meshy's ~180s) are **still open** — that is a latency refactor, not a security gap. T8 superseded by the release-beta plan. T9 (CI gate) done in substance: `.github/workflows/ci.yml` exists |
| `2026-08-18-lingplay-durable-work` | T1–T4 done. **T5–T8 not started**: guest project claiming, S3 asset store, deletion pipeline, encrypted off-site backup |
| `2026-08-18-lingplay-production-readiness` | Untouched. Notably there is no `Content-Security-Policy` anywhere |
| `2026-08-18-lingplay-creation-experience` | Untouched |

---

## Next tasks in dependency order

### 0. ~~Push and deploy~~ — done 2026-08-27 (`134069c`)

Merged, pushed, deployed, smoke- and a11y-verified against production. The
release beta's remaining Task 10 steps are a **deliberate human gate, not a
chore to automate**: do not set `FEATURE_FLAG_COMMUNITY_PUBLISHING=true` or
insert `world_release_beta_cohort_members` because a deploy succeeded. The
plan requires explicit product-owner authorization, and the flag is still
unset. Enabling it is what makes children's worlds publicly reachable.

When that authorization comes, the order is: enable the flag for the cohort,
then manually exercise submit → reject → publish → play → remix → withdraw →
takedown, and disable immediately if any check, audit, or public-boundary
assertion fails.

### 1. Ordinary-project sharing still has no publish path

**Update 2026-09-01:** the dialog bug is fixed — `ShareDialog` no longer sends
`is_published`, so the 501 and the raw `publication_moved` string are gone, and
a public-but-unreviewed game shows "Submitted for review" with no link. What
remains is the product decision below: nothing yet flips
`is_published`/`moderation_status='published'` for ordinary projects.


`components/editor/ShareDialog.tsx` sends `is_published` on every share toggle —
both directions. `app/api/projects/[id]/route.ts:249` rejects that key with a
501 `publication_moved` before any other logic runs, and the dialog renders
`data?.reason`, so **a child clicking Share sees the literal string
`publication_moved`.** The 501 came in with `502627c`, an ancestor of the last
recorded deploy.

The release-beta merge does not fix this: on `origin/main`, `ShareDialog` routes
World Builder projects to `WorldReleasePanel` and leaves the ordinary flow
"deliberately unchanged."

Deeper: **nothing anywhere writes `is_published = TRUE` or
`moderation_status = 'published'` except `scripts/seed-examples.js`**, and there
is no admin approve action (`app/api/admin/reports/route.ts` allows only
`dismiss`|`remove`). So `/explore`, shared links (`lib/auth/projectAccess.ts:88`
404s them for the recipient), remix lineage, and the "pending review" queue are
all structurally empty for user content. Decide whether ordinary projects get a
real publish path or are folded into the release pipeline.

### 2. ~~Guard the three remaining AI routes~~ — done 2026-08-27

`generate-character` had no actor, no access check, no flag, no limit and no
moderation while spending Meshy and Anthropic credits for anonymous callers. It
now runs the Task 7 order: actor → `requireProjectEdit` → input moderation →
prefab (free, stays available with AI off) → `creation_ai` flag → per-actor
limit → provider → output moderation. `ask` and `translate` stay **`actorOnly`
on purpose** — the runtime fires them mid-game from published worlds, so
requiring project edit would break the game for every player who isn't the
author — but they now resolve an actor, honour the flag, and key their budget
on that identity instead of `clientKey`'s forgeable `x-forwarded-for`.

The manifest's `deferredTo: 'Task 7'` category is gone, and two new tests keep
it gone: `no protected surface is deferred`, and `every AI route file appears
in the manifest`. Verified the AST guard can fail — removing
`requireProjectEdit` from `generate-character` makes `npm run test:access` fail
with `expected exactly one requireProjectEdit call, found 0`.

**Still open here:** the manifest is complete for `app/api/ai` only. It has 31
entries against 49 route files overall, and nothing asserts the rest are
classified — a new route outside the AI directory still escapes the gate
silently. Closing that means deciding the intended access for ~18 routes
(`world-missions`, `commands`, `play-snapshot`, the `auth/*` surface), which is
a task, not a cleanup.

### 3. ~~Wire the orphaned test suites into CI~~ — done 2026-08-27

**125 of 130 test files now run in CI, up from 90.** Two new gates, both using
one shared runner (`scripts/lib/test-gate.mjs`, extracted from the release gate
so there is a single skip-is-a-failure mechanism, not three):

- `npm run test:regression` — 131 tests + 1 standalone script, serial, on the
  guarded `_test` database. The command service, transactions, multi-row
  rollback, the trust and durable-work schema contracts, audit, feature flags,
  the persistent limiter, capability flags, the COPPA consent state machine,
  and the whole player/Sky-Steps runtime.
- `npm run test:browser` — 6 real-Chromium suites against a signed-in session:
  private-project, admin-console, share-flow, stage-panel, examples-play,
  lighting-probe. `scripts/smoke.js` loads 12 public pages and never signs in,
  so before this the editor, player and World Builder were browser-verified by
  nothing.

**Running them for the first time found four real defects, all invisible behind
a green `test:all`:**

1. `app/worlds/[slug]/page.tsx` and `lib/worlds/releaseRemix.ts` were raw writes
   to protected tables that **shipped to production undeclared**. Both are
   legitimate; neither had been through the bypass review. Now documented in
   `ALLOWED_BYPASSES`.
2. `template-service.integration.mjs` asserted an object (`Sky Cloud`) that has
   **never existed in any template** — `git log -S` finds it only in the test.
3. The same suite queried `Bouncy Bumper`, renamed to `Spinning Bumper One` by
   `1026331` weeks earlier. The query matched nothing and the assertions ran
   against an empty set.
4. `test/api/consent-flow.mjs` passed 10/10 and then **hung forever** on the
   app's memoised pool (`enableKeepAlive`). Added `closePool()` to
   `lib/mysql/client.ts` for it. In CI that is a job that burns its timeout
   after succeeding.
5. `examples-play.mjs` reported "all 0 examples play" and exited 0 against an
   empty gallery — a check that passes when there is nothing to check. It now
   fails instead.
6. `authorization-matrix.mjs` pinned `templateVersion: 1`, which Sky Steps v2
   marked inactive; every world-creation call had been returning 422 "Unknown
   template". It now resolves the active version from the catalog.

**Five files still do not run**, each with a specific diagnosis — recorded in
`scripts/browser-gate.mjs` so the list cannot quietly become "we only ever ran
six":

| File | Why |
|---|---|
| `test/api/authorization-matrix.mjs` | Predates trust-boundary Task 4; its ~20 mutating calls send no `If-Match`/`Idempotency-Key`, so the first PATCH gets 428. Needs each call updated and its expectations re-derived. |
| `test/visual/stranger-write.mjs` | A stranger's write returns 401 where it expects 404. One of the two is wrong about the convention — elsewhere the repo answers 404 so a caller cannot probe for existence. Decide before changing either. |
| `test/visual/journey.mjs` | Fails at the template editor's private-draft graph; World Builder Task 3 already recorded it blocked on the character picker having no search field. |
| `test/visual/sky-steps-preview.mjs` | "Hero did not land on the first step." Plausibly the halted flagship's own finding — the ledger says Sky Steps v2 is unwinnable pending a runtime/coordinate redesign. |
| `test/video/camera-pipeline.mjs` | Needs Chromium synthetic-capture flags; not yet verified. |

### 4. Adopt or delete the shelfware safety modules

`lib/safety/persistentRateLimit.ts`, `lib/safety/audit.ts`, and
`capabilitiesFor()` in `lib/safety/capabilities.ts` all have **zero production
callers**. Consequences: every quota resets on deploy and doesn't hold across
workers; `security_audit_events` is empty; and `app/api/projects/[id]/route.ts`
reads `can_share` directly — the path `lib/safety/coppa.ts:56` says new callers
must not use. `moderateImage()` is a stub returning `safe: true` and is called
from nowhere, so uploads are never image-moderated.

Also reconcile the feature flags: five are declared, one is ever read, and the
`feature_flags` table is seeded with a completely disjoint set of names.

### 5. Then, in order

- durable-work **T8** — encrypted off-site backup. `scripts/backup-db.sh` keeps
  14 days *on the same droplet*; a droplet loss takes the database and the
  backups together. Do this before T5–T7.
- durable-work **T5–T7** — guest claiming, S3 asset store, deletion pipeline.
- production-readiness — semantic primitives, RTL review, nonce CSP,
  performance budgets, config validation.
- creation-experience — Zustand store, Blockly flush barriers, revision-pinned
  play UI, tutorial persistence.
- Sky Steps flagship — blocked on a runtime/coordinate redesign and fresh spec.

---

## Known infra / landmines

### `deploy.sh` gaps

- It rsyncs the **working tree**. Uncommitted files ship live; a stale checkout
  silently ships old code.
- Its rsync exclude list does **not** exclude `.opendeploy/`, which holds a
  plaintext MySQL password and `JWT_SECRET`. Every deploy copies them to
  `/opt/lingplay/source/`. Confirm and rotate.
- ~~Smoke skipped silently without Playwright~~ — fixed 2026-09-01: the deploy
  fails unless `LINGPLAY_SKIP_SMOKE=1` is set on purpose.
- ~~Smoke failure did not roll back~~ — fixed 2026-09-01: `.next.prev` is kept
  until the smoke test passes and restored when it fails.
- `scripts/smoke.js` covers 12 **public** pages and zero authenticated creator
  pages. The block editor, scene view, player and World Builder are never
  browser-verified before or after a ship. `test/visual/journey.mjs` and
  `share-flow.mjs` do cover them but are loopback-only by design and run in
  neither CI nor deploy.

### Migrations hardcode their database

14 of the 15 migrations open with `USE gameengine;`. Piping one into a
different database **does not fail** — it applies to `gameengine` and leaves
the target empty. Only `010` lacks the line, which is why 010 was the single
file that errored when the regression gate first ran against a fresh
`gameengine_test`.

Every runner (`ci.yml`, `deploy.sh`, `scripts/setup-db.sh`) now strips the
selection with `sed` before piping, and `setup-db.sh` creates the database
itself and passes `$MYSQL_DATABASE` explicitly — it previously printed that
variable in its banner and never passed it to `mysql` at all.
`test/database/migration-database-selection.test.js` keeps every runner doing
this, and tells you to delete itself if the migrations ever stop hardcoding.

**If you write a new migration, do not add a `USE` line.** If you apply one by
hand, name the database on the `mysql` command and strip the `USE` first, or
you will silently edit `gameengine`.

### Production environment is unverifiable from the repo

Each fails quietly or fails closed if unset on the droplet, and nothing here
proves any of them is set:

- `RESEND_API_KEY` — unset means parental-consent email silently does not send.
  `lib/email/send.ts` correctly returns `{ok:false, reason:'unconfigured'}`
  rather than pretending, but there is **no error monitoring** — failures
  surface only in `journalctl -u lingplay`.
- `TRUSTED_PROXY_HOPS` — `lib/config/security.ts:43` throws in production if
  unset. Non-production defaults to 0; set it explicitly if a suite trips on it.
- `FEATURE_FLAG_*` — production default is **disabled**, and these are absent
  from `.env.example`.
- `NEXT_PUBLIC_WS_URL` — appears in no config anywhere, so
  `CollaborationProvider` is a mounted no-op and there is no WebSocket server in
  the repo to point it at.

### MySQL for local tests

```bash
brew services start mysql
mysql -u root -e "CREATE DATABASE IF NOT EXISTS gameengine_test;"
for m in migrations/*.sql; do mysql -u root gameengine_test < "$m"; done
```

Test databases **must contain `_test`** — destructive test/restore scripts
refuse every other name.

### `AGENTS.md` re-writes itself

`node_modules/next/dist/server/lib/generate-agent-files.js` re-adds a block to
`AGENTS.md` on every `next dev`. Committing it keeps the tree clean; removing it
just re-creates the diff.

---

## Resume marker

**Last completed:** the 2026-09-01 improvement pass (see that section).
`type-check`, `lint`, `test:all`, `test:critical`, `test:regression`, `build`,
local `smoke` and `a11y` all green. **Not deployed yet.**

**Next task:** decide the ordinary-project publish story (section 1). That 501
is what a child hits on day one, and the release beta does not fix it. It needs
a product decision first — a real publish path, folding ordinary projects into
the release pipeline, or making the toggle visibility-only and accepting that
`/explore` stays seed-only — so do not start by writing code.

**When updating this file:** correct the state snapshot from the actual tree
rather than appending to it. The previous version drifted a week out of date by
recording intentions instead of re-checking.
