# LingPlay Remediation Resume Plan

**Purpose:** any fresh Claude Code (or Codex) session can pick this up cold,
pick the next task, execute it end-to-end, commit, deploy, and update this
file — without prior context.

**Author of this file:** the session that shipped commits `d2b0933..1bdfde6`
(2026-08-19). Everything in the "State snapshot" section below reflects that
session's endpoint.

---

## State snapshot

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
| trust-boundary | 5 Parent consent state machine | **TODO** | — |
| trust-boundary | 6 Shared quotas + audit | done | ec4da01, 6064992, 0a15e8f |
| trust-boundary | 7 AI-route guard | **TODO** | — |
| trust-boundary | 8 Publication candidates | **TODO** | — |
| trust-boundary | 9 CI gate | **TODO** | — |
| durable-work | 1 Transaction primitive | done | 8394b15 |
| durable-work | 2 Migration 009 schema | done | 933716c |
| durable-work | 3 Command service + snapshots | done | 657421a, b431008 |
| durable-work | 4 Multi-row + compat writers | **TODO** | — |
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

### Durable-work Task 4 — Convert Multi-Row and Compatibility Writers

Migrates every existing writer into the command service so the
`test/api/project-write-boundary.test.js` allowlist shrinks to zero. The
current allowlist enumerates the exact 18 files that still bypass the
command service — each one either moves its writes into a new command
handler or is deleted. Compat HTTP routes that keep a REST shape must
require `Idempotency-Key` + `If-Match: "<revision>"` and return 428 on
missing preconditions.

**Reads the plan at:** `docs/superpowers/plans/2026-08-18-lingplay-durable-work.md`
section "Task 4: Convert Multi-Row and Compatibility Writers".

**Landmine:** the new `/api/projects/[id]/commands` route is the sole
writer entry point — do NOT invent parallel writers. The service enforces
idempotency, revision fence, and audit; wrappers only bind existing REST
inputs to a `ProjectCommandEnvelope`.

---

### Then, in this order

8. **trust-boundary Task 5** — Parent-First Consent State Machine.
   16 files. Rewrites `lib/safety/parentalConsent.ts` and the child-signup
   flow to move consent authority to the parent-first path. Big; do not
   attempt in one session unless you have deep context budget.
9. **trust-boundary Task 7** — Guard and Bound Every AI Surface.
   Wires the audit + feature-flag + rate-limit modules into the five AI
   routes that Task 4 explicitly deferred (see `progress.md` note
   `deferredTo: 'Task 7'`). Live paths — every fix round must include a
   fail-closed browser fixture.
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

**Last completed:** `b431008 feat: add revisioned project commands`
(2026-08-19) — durable-work Task 3b: canonical project snapshot loader,
10 command handlers, transactional service (idempotency + optimistic
revision fence), commands + play-snapshot routes, real-MySQL integration
suite, and the write-boundary source guard with the Task-4 deferred
allowlist.

**Next task:** durable-work **Task 4** — Convert Multi-Row and
Compatibility Writers. See "Next tasks in dependency order" above.
Reason: every trust-boundary task past 5 needs a single writer entry
point; Task 4 turns the write-boundary allowlist to zero by migrating
every existing writer through `executeProjectCommand`.

**Deploy status:** local `b431008` is two commits ahead of
`origin/main` (Task 6 finish `0a15e8f` was pushed as `1f7098f`; this
Task 3b commit is unpushed). Live prod is on `657421a`. Run
`./deploy.sh` after any commit lands to move prod forward, but only
when the user asks.

**When updating this file:** move the completed task from "Next tasks" to
"Task completion map", write the new SHA, update the "Last completed" line,
and set the new "Next task".
