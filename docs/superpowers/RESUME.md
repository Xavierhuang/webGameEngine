# LingPlay Remediation Resume Plan

**Purpose:** any fresh Claude Code (or Codex) session can pick this up cold,
pick the next task, execute it end-to-end, commit, deploy, and update this
file — without prior context.

**Author of this file:** the session that shipped commits `d2b0933..1bdfde6`
(2026-08-19). Everything in the "State snapshot" section below reflects that
session's endpoint.

---

## State snapshot

### World Builder Phase 1 boundary

World Builder template worlds are **private-phase only**. They always start as
private drafts and are owner-editable/playable, but do not appear in Explore or
anonymous play. Neither project-creation endpoint accepts publication fields,
and the World Builder share surface contains no public-release control. Public
release remains blocked pending the later candidate, asset-quarantine,
approval, and reviewer phases; do not enable `new_publication` as a workaround.

- **Branch:** `main` on both local and `origin` (github.com/Xavierhuang/webGameEngine)
- **HEAD:** `1bdfde6 checkpoint: batch in-progress editor + i18n + examples work`
- **Live at play.lingcode.dev:** through commit `657421a` (the last `./deploy.sh` run).
  Everything past `657421a` is code-only; no deploy has run since.
- **Working tree:** clean. `git status` shows nothing modified, nothing untracked.
- **MySQL:** production database has migrations 001–009 applied (verified by the
  last deploy's automatic migration step; `deploy.sh` reads `schema_migrations`).

### Session commit chain (most recent first)

```
1bdfde6 checkpoint: batch in-progress editor + i18n + examples work   [pushed, unshipped]
6064992 feat: add server-only feature flag reader                     [pushed, unshipped]
ec4da01 feat: add redacted safety audit event                         [pushed, unshipped]
657421a feat: add project command schema                              [LIVE]
933716c feat: add durable project schema (migration 009)              [LIVE]
8394b15 feat: add transactional database helper                       [LIVE]
d2b0933 fix: reject boundary calls that skip await                    [LIVE]
9329811 fix: make trust regressions fail closed                       [LIVE, prior session]
```

### What "the plans" are

Four SDD plan files under `docs/superpowers/plans/2026-08-18-lingplay-*.md`:

1. `2026-08-18-lingplay-trust-boundary.md` — 45 steps, Tasks 1–9
2. `2026-08-18-lingplay-durable-work.md` — 46 steps, Tasks 1–9
3. `2026-08-18-lingplay-creation-experience.md` — 41 steps, Tasks 1–?
4. `2026-08-18-lingplay-production-readiness.md` — 41 steps, Tasks 1–?

Total ~173 steps. **~7 tasks complete, ~160 remaining.** Realistic pace: 1–3
tasks per focused session, so 20–50 sessions of work spread over weeks.

### Task completion map

| Plan | Task | Status | Commit(s) |
|---|---|---|---|
| trust-boundary | 1 Schema + safe defaults | done | bb026f0 |
| trust-boundary | 2 Opaque guest sessions | done | 47440f3..1dda043 |
| trust-boundary | 3 Central authorization | done | 1277edf..8553e6e |
| trust-boundary | 4 Convert every surface | done (3 fix rounds) | c50d36a..d2b0933 |
| trust-boundary | 5 Parent consent state machine | done | 5de284d |
| trust-boundary | 6 Shared quotas + audit | done | ec4da01, 6064992, 0a15e8f |
| trust-boundary | 7 AI-route guard | **TODO** | — |
| trust-boundary | 8 Publication candidates | **TODO** | — |
| trust-boundary | 9 CI gate | **TODO** | — |
| durable-work | 1 Transaction primitive | done | 8394b15 |
| durable-work | 2 Migration 009 schema | done | 933716c |
| durable-work | 3 Command service + snapshots | done | 657421a, b431008 |
| durable-work | 4 Multi-row + compat writers | done | 502627c |
| durable-work | 5 Guest project claiming | **TODO** | — |
| durable-work | 6 S3 asset store | **TODO** | — |
| durable-work | 7 Deletion pipeline | **TODO** | — |
| durable-work | 8 Off-site backup | **TODO** | — |
| durable-work | 9 CI gate | **TODO** | — |
| creation-experience | all | **untouched** | — |
| production-readiness | all | **untouched** | — |

---

## Execution model

Each session should follow the same shape as the prior sessions that shipped
`8394b15`, `933716c`, `657421a`, `ec4da01`, `6064992`:

1. **Read this file top-to-bottom** — resume where the last session stopped.
2. **Pick one task** from "Next tasks in dependency order" below. Do not skip
   ahead or the code will reference things that don't exist yet.
3. **Read the plan's task section** in the referenced file.
4. **Write failing tests first**, then implement, then verify green. The plan
   files use `- [ ]` checkboxes for each step; treat them as a strict order.
5. **Type-check** with `npm run type-check` before committing.
6. **Commit as one atomic unit** with the plan's suggested commit title
   (e.g. `feat: add durable project schema`). Include the
   `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer.
7. **Update this file** — mark the task done in the table above, add the SHA.
8. **Push** if the task is complete and tests are green.
9. **Deploy** only when asked; `./deploy.sh` runs migration + build + restart +
   smoke against `https://play.lingcode.dev`.
10. **Handoff** — write the "next task" name in this file's "Resume marker"
    section at the bottom so the next session picks up cold.

---

## Next tasks in dependency order

Execute in this order. Later tasks depend on earlier ones being present.

### Trust-boundary Task 7 — Guard and Bound Every AI Surface

Wires the audit + feature-flag + rate-limit modules into the five AI
routes that Task 4 explicitly deferred. Live paths — every fix round
must include a fail-closed browser fixture.

**Reads the plan at:** `docs/superpowers/plans/2026-08-18-lingplay-trust-boundary.md`
section "Task 7".

**Landmine:** `app/api/ai/apply-update/route.ts` currently returns 503
`feature_unavailable`. Task 7 replaces it with a strict AI-command
translator that dispatches through `executeProjectCommand`. The route
must stay behind `readFeatureFlag('creation_ai')` and `readFeatureFlag
('ai_mutation')` until Task 7's full pipeline (guard order + browser
fixture) is green.

---

### Then, in this order

10. **trust-boundary Task 8** — Fail-Closed Publication Candidates and
    Snapshot State. Owns immutable publication snapshots and the removed
    `published` state that migration 008 left dormant.
11. **durable-work Tasks 5–8** — guest claiming, S3 asset store, deletion
    pipeline, off-site backup. Each depends on the command service from 3b
    being live.
12. **trust-boundary Task 9** — CI gate for the trust suite.
13. **durable-work Task 9** — CI gate for the durable-work suite.
14. **creation-experience** — 41 steps. Depends on trust-boundary +
    durable-work substantially complete. Zustand store, revision-pinned play
    UI, tutorial persistence.
15. **production-readiness** — 41 steps. Depends on all three above. Semantic
    UI primitives, RTL/i18n review, performance budgets, zero-warning lint
    CI, nonce CSP, config validation.

---

## Known infra / landmines

### MySQL for local tests

Several remaining tests (persistent-limiter, command-service integration,
migration 009 live-apply) require MySQL running locally with
`gameengine_test`. Setup pattern used by the trust-boundary work:

```bash
brew services start mysql  # or your local service manager
mysql -u root -e "CREATE DATABASE IF NOT EXISTS gameengine_test;"
for m in migrations/*.sql; do
  mysql -u root gameengine_test < "$m"
done
```

Test databases **must contain `_test`**; destructive test/restore scripts
refuse every other name (plan global constraint).

### `TRUSTED_PROXY_HOPS` env

`lib/config/security.ts:readSecurityConfig` throws in production if
`TRUSTED_PROXY_HOPS` is unset. Non-production defaults to 0. If a test
suite hits this, set `TRUSTED_PROXY_HOPS=0` explicitly.

### Feature flag defaults

`readFeatureFlag` defaults to **disabled in production**, **enabled in every
other NODE_ENV**. Tests default to enabled. Production kill-switch requires
an explicit `FEATURE_FLAG_<NAME>=false`.

### Migration 009 already applied on prod

Do NOT re-run migration 009's individual statements manually against prod;
`schema_migrations` records it as applied. If a future migration needs to
alter a Task-2 table, use a new numbered file (`010_*.sql`) and use the
same idempotent probe pattern as 008/009.

### package.json script wiring

Every task adds one or more `test:<name>` scripts. The session pattern for a
clean commit that doesn't clobber other WIP has been:

```bash
cp package.json /tmp/pkg-snapshot.json
git checkout -- package.json  # revert to HEAD
# add ONLY your one script line
git add package.json
# ... other commits ...
cp /tmp/pkg-snapshot.json package.json  # restore working-tree WIP
# add your new line back to the working tree so it stays in sync with HEAD
```

Since the checkpoint commit (`1bdfde6`) landed all WIP into git, this dance
is no longer strictly necessary until the next batch of ad-hoc edits
accumulates.

### `./deploy.sh` rsyncs the working tree

Uncommitted files ship live on every deploy. Prefer to keep the working tree
clean between task cycles — commit or `git stash` any half-work before
running `deploy.sh`. The last three deploys have carried WIP piggybacks
without incident (12/12 smoke test passed), but a broken WIP file would
white-screen prod.

### Racing with Codex

Codex was running trust-boundary Task 4 rereview2 in parallel and ran out
of tokens. If Codex resumes, coordinate before starting trust-boundary
Tasks 5–8 or you'll get double-commits on the same files.

### `AGENTS.md` re-writes itself

`node_modules/next/dist/server/lib/generate-agent-files.js` re-adds a block
to `AGENTS.md` on every `next dev`. Committing that block keeps the tree
clean; removing it just re-creates the diff.

---

## Resume marker

The next session should read this section first, then start work.

**Last completed:** `5de284d feat: enforce parent-first consent`
(2026-08-19) — trust-boundary Task 5: `capabilitiesFor(...)` deny-by-
default reducer, `ConsentState` machine with 24-hour purpose-bound
tokens + atomic sibling invalidation, `birth_month` migration off raw
age, parent enrollment route (email-verified), pending-approval
resend button, `isParent` client authority removed. 10 real-MySQL
consent-flow tests + 10 capability-table tests all green.

**Next task:** trust-boundary **Task 7** — Guard and Bound Every AI
Surface. Wires audit + feature-flag + rate-limit + capabilities into
the five AI routes (chat, apply-update, generate-character, ask,
translate). Task 4 disabled apply-update behind the flag; Task 7
replaces the stub with a strict AI-command translator that dispatches
through `executeProjectCommand`.

**Deploy status:** local `5de284d` is unpushed. Prior tasks landed as
`6681e0d` (Task 3b) and `681f429` (Task 4) on `origin/main`. Live prod
is on `657421a`. Deploy caveats stack: Task 4 requires `If-Match`
headers on graph writes, Task 5 breaks the signup checkbox flow. Do
not `./deploy.sh` until the browser editor + signup UI are updated.

**When updating this file:** move the completed task from "Next tasks" to
"Task completion map", write the new SHA, update the "Last completed" line,
and set the new "Next task".
