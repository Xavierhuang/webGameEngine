# LingPlay Remediation Resume Plan

**Purpose:** any fresh Claude Code (or Codex) session can pick this up cold,
pick the next task, execute it end-to-end, commit, deploy, and update this
file — without prior context.

**Last refreshed:** 2026-08-27, by an audit session that made no code changes.
Everything below was verified against the tree, not carried over from the
previous version of this file (which had drifted a week out of date).

---

## State snapshot

- **Branch:** `main` at `ba80cee`, a merge of `origin/main` (`00a6e5d World
  Builder release beta (#2)`) into the three local doc commits. Done
  2026-08-27; the checkout had been one commit behind, missing the entire
  release beta. The only conflict was an add/add on
  `docs/superpowers/plans/2026-08-26-world-builder-release-beta.md`, resolved to
  origin's executed copy (55 of 61 steps ticked) over the local unticked one.
- **Migrations:** `001`–`015` present locally.
- **Remote:** github.com/Xavierhuang/webGameEngine. The merge is **not pushed**.
- **Last recorded deploy:** `4c9ab0c Harden creator platform workflows`
  (2026-08-26). **There is no deploy log anywhere in the repo** — `deploy.sh`
  writes no SHA record, so what is actually running on 45.55.39.39 cannot be
  confirmed without SSH. Treat `4c9ab0c` as a floor, not a fact. **Production
  does not have the release beta**; its Task 10 deploy steps are unticked.
- **Verification, run 2026-08-27 on the merged tree:** `npx tsc --noEmit` → 0
  errors. `npm run test:all` → exit 0, 0 failed, 0 skipped. `npm run
  test:critical` → exit 0. `npm run test:world-release` → exit 0, **100 tests,
  0 skipped**, and the 20-step release journey passed end to end (submit →
  review → approve → public play → edit draft → snapshot unchanged → remix →
  report → withdraw). Nothing in the repo is failing.
- Still outstanding: `codex/minion-focus-shortcut` is 14 commits ahead of its
  remote and unmerged.

**`./deploy.sh` rsyncs the working tree, not a git ref**, and migrations are
forward-only through a `schema_migrations` ledger with **no down-migrations**.
Check `git status` *and* `git rev-list --left-right --count main...origin/main`
before every deploy — a stale checkout silently ships old code over new schema.

### World Builder boundary

Template worlds start as private drafts. Public release now goes through the
reviewed, immutable release pipeline on `origin/main`, gated by
`FEATURE_FLAG_COMMUNITY_PUBLISHING` (production default: **disabled**). Do not
enable it as a workaround for anything; Task 10 of the release-beta plan
requires explicit operator authorization and a cohort insert first.

---

## Plan status

Checkbox state in `docs/superpowers/plans/` is **not** a reliable completion
signal — the 2026-08-09/11 plans read as 0% done and every asset they describe
ships in `public/models/`. Judge by deliverable presence.

| Plan | State |
|---|---|
| `2026-08-26-creator-platform-hardening` | Done and deployed (`4c9ab0c`) |
| `2026-08-26-world-builder-release-beta` | **Code complete and merged** (`00a6e5d`), 55/61 steps. The 6 open ones are all human-gated: Task 9 Step 5 (manual staging verification with the flag disabled) and the whole of Task 10 (deploy, live verification, **explicit operator authorization before enabling `FEATURE_FLAG_COMMUNITY_PUBLISHING`**, cohort activation, evidence). Nothing is published until a person does those. |
| `2026-08-24-sky-steps-flagship` | **Halted.** Ledger: Task 1 review rejected at `c242389` — the player flattens platforms, has no platform collision, and transforms template coordinates differently from the spec. "Sky Steps v2 is unwinnable." Needs a revised runtime/coordinate design and fresh spec approval. Sky Steps nonetheless ships in the template catalog. |
| `2026-08-24-lingplay-world-builder` | Tasks 1–5 shipped; the SDD ledger was never closed past Task 2 |
| `2026-08-18-lingplay-trust-boundary` | T1–T6 done. **T7 partial** — `apply-update` and `chat` converted; `ask`, `translate`, `generate-character` still deferred. T8 superseded by the release-beta plan. T9 (CI gate) done in substance: `.github/workflows/ci.yml` exists |
| `2026-08-18-lingplay-durable-work` | T1–T4 done. **T5–T8 not started**: guest project claiming, S3 asset store, deletion pipeline, encrypted off-site backup |
| `2026-08-18-lingplay-production-readiness` | Untouched. Notably there is no `Content-Security-Policy` anywhere |
| `2026-08-18-lingplay-creation-experience` | Untouched |

---

## Next tasks in dependency order

### 0. Push the merge, then decide about deploying

`ba80cee` is local-only. Push it. Then the release beta's Task 10 is a
deliberate human gate, not a chore to automate: deploy with
`FEATURE_FLAG_COMMUNITY_PUBLISHING` **off**, run
`node scripts/smoke.js https://play.lingcode.dev` and `scripts/a11y.js`, and
stop. Do not enable the flag or insert cohort members because a deploy
succeeded — the plan requires explicit product-owner authorization first.

### 1. Ordinary-project sharing is broken in production

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

### 2. Guard the three remaining AI routes (trust-boundary Task 7)

`app/api/ai/generate-character/route.ts` POST has **no `resolveActor`, no rate
limit, no feature flag, no moderation** and spends Meshy credits on anonymous
requests. `ai/ask` has moderation but no actor; `ai/translate` has only the
in-process limiter. All three are listed as `deferredTo: 'Task 7'` in
`test/api/trust-boundary-guard.test.js:133` — the test encodes the hole rather
than failing on it.

While you are there: that guard asserts `inventory.length === 31` against a
hardcoded manifest, with no test asserting the manifest covers every file under
`app/api`. 21 route files are outside it and escape authorization checking
silently.

### 3. Wire the orphaned test suites into CI

**40 of 105 `test:*` scripts are unreachable from `test:all`, `test:critical`
or `test:world-release`**, so nothing ever runs them — including
`test:authorization-matrix`, `test:consent-flow` (the COPPA HTTP flow),
`test:commands`, `test:multi-row-rollback`, `test:transactions`, `test:audit`,
`test:feature-flags`, `test:capability-flags`, and **all 10 Playwright
journeys**. They pass when run by hand.

Bring the skip-equals-failure guard with them: six MySQL-backed suites
self-skip when the DB is unreachable and `node --test` exits 0 on a skip, so
adding them naively makes an unreachable database read as a green gate.
`scripts/world-release-gate.mjs` already solves this — it reports skipped
counts and fails on them (`0 skipped` in its own output is the assertion, not a
comment). Reuse it rather than writing a second mechanism.

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
- The browser smoke step is gated on `[ -f node_modules/.bin/playwright ]` and
  otherwise prints "skipping browser smoke test" and **exits 0**. A deploy from
  a machine without Playwright ships with no real verification.
- On smoke failure it prints "Investigate or roll back" and exits 1 but **does
  not roll back** — `.next.prev` was already deleted a few lines earlier. Only a
  `systemctl start` failure triggers the actual restore.
- `scripts/smoke.js` covers 12 **public** pages and zero authenticated creator
  pages. The block editor, scene view, player and World Builder are never
  browser-verified before or after a ship. `test/visual/journey.mjs` and
  `share-flow.mjs` do cover them but are loopback-only by design and run in
  neither CI nor deploy.

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

**Next task:** push `ba80cee` (section 0), then decide the ordinary-project
publish story (section 1) — that 501 is what a child hits on day one, and the
release beta does not fix it.

**When updating this file:** correct the state snapshot from the actual tree
rather than appending to it. The previous version drifted a week out of date by
recording intentions instead of re-checking.
