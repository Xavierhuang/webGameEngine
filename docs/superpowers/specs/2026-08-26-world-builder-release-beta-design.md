# World Builder Release Beta Design

## Goal

Let a child safely submit a World Builder template game for a limited public beta without ever exposing their mutable draft. Every public play and remix must use one approved, immutable project snapshot.

## Scope

This release applies **only** to projects with a `project_worlds` row. It adds a release candidate, deterministic safety checks, parent-capability enforcement, a manual Lingplay admin review queue, public discovery/play/remix from approved releases, creator withdrawal, moderator takedown, and redacted audit events.

Existing ordinary-project sharing and remixing remain unchanged. World Builder releases do not add chat, comments, private messages, custom code, arbitrary remote media, payments, or multiplayer.

## Product flow

```text
Private World Builder draft
  -> submit current revision
  -> deterministic checks
  -> admin review
  -> published release
  -> creator withdrawal or moderator takedown
```

`project_play_snapshots` remains the immutable runtime payload. A release candidate references exactly one snapshot ID, revision, and SHA-256 hash. Editing after submission creates later project revisions but cannot alter the candidate or an approved public release.

The child-facing status is intentionally short:

- **Private draft**: test and keep building.
- **In review**: the exact submitted version is being checked.
- **Changes needed**: build a new version and submit again.
- **Published**: the reviewed version is public; new edits stay private until a new submission.

## Release states and transitions

`world_releases.status` is the release authority and uses these states:

| State | Meaning | Allowed transition |
| --- | --- | --- |
| `submitted` | A candidate snapshot was captured. | `checking`, `withdrawn` |
| `checking` | Server is running deterministic checks. | `review_pending`, `changes_requested`, `rejected`, `withdrawn` |
| `review_pending` | Checks passed; a moderator can decide. | `published`, `changes_requested`, `rejected`, `withdrawn` |
| `published` | Current, approved public release. | `withdrawn`, `taken_down`, `superseded` |
| `changes_requested` | Moderator requests a new submission. | terminal |
| `rejected` | The candidate cannot be published. | terminal |
| `withdrawn` | Creator removed the release from public surfaces. | terminal |
| `taken_down` | Moderator removed the release from public surfaces. | terminal |
| `superseded` | A later approved release replaced this one. | terminal |

There is no route that changes a candidate's captured revision, snapshot, or hash. A re-submission always creates a new candidate. Publishing a new candidate marks the previous current release for the same project `superseded` in the same transaction.

## Data model

Migration `013_world_release_beta.sql` adds only release-specific records:

### `world_releases`

- `id` UUID primary key.
- `project_id` foreign key to `projects`.
- `project_play_snapshot_id` foreign key to `project_play_snapshots`.
- `template_id` and `template_version`, copied from `project_worlds` at submission.
- `source_revision` and `content_hash`, copied from the selected snapshot.
- `status`, `current_public`, `submitted_at`, `published_at`, `withdrawn_at`, `taken_down_at`, and `decided_at`.
- `creator_label`, a bounded, server-derived public attribution label; it contains no email, birth information, or parent data.
- `decision_reason_code`, a small allowlisted reason code. It never stores free-form moderator notes in child-facing release records.

Constraints prevent multiple public-current releases per project and prevent two candidates for the same project snapshot. Indexes support public discovery by `status/current_public/published_at`, reviewer queues by `status/submitted_at`, and project history by `project_id/submitted_at`.

### `world_release_checks`

- `id` UUID primary key and `world_release_id` foreign key.
- `check_name` from a fixed server allowlist, `status` (`passed`, `failed`, `error`), a bounded public-safe `reason_code`, and timestamps.
- Unique `(world_release_id, check_name)` for idempotent retrying.

### `world_release_decisions`

- `id` UUID primary key and `world_release_id` foreign key.
- `decision` (`published`, `changes_requested`, `rejected`, `taken_down`), actor role, a pseudonymous audit reference, allowlisted reason code, and timestamp.
- This is append-only. It does not store a staff email, a parent email, raw report details, or free-form user text.

The existing `publication_snapshots` table is not used as a second release payload in this beta. The already-working revision-pinned `project_play_snapshots` payload is the single runtime artifact. This avoids a second serializer that can drift from what Play actually runs.

## Server boundaries

New server-only modules provide narrow interfaces:

- `lib/worlds/releaseService.ts` creates candidates, checks state transitions, publishes, withdraws, and takes down releases inside transactions.
- `lib/worlds/releaseChecks.ts` runs deterministic validation of a snapshot and returns fixed-name check results.
- `lib/worlds/releaseAccess.ts` turns an approved release into a public DTO and rejects all non-public release states.
- `lib/worlds/releaseRemix.ts` copies only an approved release snapshot into a private World Builder project with release attribution.
- `lib/worlds/releaseAudit.ts` writes redacted audit events through `lib/safety/audit.ts`.

Route handlers resolve the actor, require the existing `community_publishing` feature flag, and call one service method. UI code can request an action but never decides whether a release is publishable.

### Submission requirements

`POST /api/projects/[id]/world-releases` may submit only when all conditions are true:

1. The caller is an authenticated project owner, not a guest.
2. The project has a `project_worlds` row for an active approved template.
3. `community_publishing` is enabled server-side.
4. The current profile has the existing `publish` capability. Under-13 accounts need active consent; the service derives this from the consent state, rather than trusting client values or stale `can_publish` fields.
5. The request supplies the current project revision and an idempotency key. A stale revision returns a conflict and cannot create a candidate.
6. A matching `project_play_snapshots` row exists for that revision and its SHA-256 hash agrees with the reconstructed canonical snapshot.

The submit transaction inserts the candidate, begins checks, and writes a redacted audit event. It does not set `projects.visibility`, `is_published`, or `moderation_status`; legacy project publication remains outside this beta.

### Deterministic checks

The check service fails closed and records one outcome for each of these fixed checks:

- `snapshot_integrity`: the stored snapshot hash matches canonical serialized content and project revision.
- `template_identity`: release is from an active approved World Builder template/version.
- `project_budgets`: scene, object, logic-block, script-step, asset count, and snapshot-size limits match the template's published budget profile.
- `asset_policy`: every model, texture, image, and sound URL satisfies the existing upload/model policy; no arbitrary remote URLs or unapproved extensions are allowed.
- `block_policy`: every serialized block belongs to the supported Blockly vocabulary and its inputs satisfy the command/runtime schema.
- `playability`: snapshot contains at least one scene and playable actor, and the existing headless runtime can load it without an unsupported feature or runtime validation failure.
- `public_metadata`: title, description, and creator label are sanitized, moderated, length-bounded, and contain no external links.

A check exception records `error` and leaves the candidate out of the review queue. An outage or unexpected result can never publish content.

### Admin decisions and takedown

`POST /api/admin/world-releases/[releaseId]/decision` requires the existing admin boundary and accepts only `publish`, `request_changes`, or `reject`. The service re-checks the candidate state and immutable snapshot hash before writing a decision. A publish transaction makes this release current and supersedes any prior current public release for the project.

`POST /api/admin/world-releases/[releaseId]/takedown` requires an admin and an allowlisted reason code. It removes the release from discovery, play, and new remix selection in the same transaction. It never deletes the private project or its source snapshot.

`POST /api/projects/[id]/world-releases/[releaseId]/withdraw` requires the release owner and moves their own published release to `withdrawn`. It does not expose a restore button; publishing again requires a fresh reviewable submission.

## Public surfaces

`/explore` gains an approved World Builder releases section driven exclusively by `releaseAccess.listPublicWorldReleases`. It shows allowlisted title, template genre, thumbnail, release date, public creator label, likes, plays, and remix count.

`/worlds/[slug]` is the canonical public world page. It resolves only a `published` and `current_public` release. The play route loads its immutable `project_play_snapshots` JSON rather than the mutable `/api/projects/[id]` graph.

`POST /api/world-releases/[releaseId]/remix` accepts only a published release. It creates a private World Builder draft, materializes the approved snapshot through the existing project command/snapshot path, and records `source_release_id` and `remixed_from`. A taken-down, withdrawn, rejected, superseded, or private release returns 404 to non-admin callers.

Reports include the release ID when present. A report does not automatically take content down, but moderators can use it to take down exactly the offending public release.

## Creator and moderator UI

The existing `ShareDialog` remains the legacy project-sharing control. For World Builder projects it becomes a compact Release panel:

- Private draft: **Test game** and **Submit for review**.
- Checking/review pending: status, submitted version, and a **Withdraw submission** action.
- Changes requested/rejected: a short neutral status; no moderator private notes.
- Published: public page link and **Withdraw from Explore**.

The admin moderation page gains a separate World Release queue. Each row provides the frozen playable preview, template/version, automated check summary, release age, report count, and three explicit decisions. Takedown remains a separate destructive action with reason-code selection.

## Access, privacy, and failure behavior

- All release writes use the established actor and project access services plus transactions and revision/idempotency requirements.
- Public queries never join or serialize parent emails, consent data, birth data, private moderator notes, session IDs, or raw report details.
- A disabled feature flag returns `503 feature_unavailable`; a non-public release looks absent to ordinary public callers.
- A child whose consent is revoked after a candidate reaches review cannot have a later decision publish it. The publish transition evaluates current capability again.
- The creator can continue private editing after every release outcome.
- Existing reports and admin project removal keep working for legacy projects; the new release states do not weaken those paths.

## Rollout and operations

1. Ship schema, service, and UI while `FEATURE_FLAG_COMMUNITY_PUBLISHING=false` in production.
2. Run database migration, full test suite, build, browser journey, accessibility checks, and production smoke while the flag stays disabled.
3. Create two internal World Builder test releases, test submit/reject/publish/withdraw/takedown, and verify public APIs reject every non-published state.
4. Enable the flag only for an approved small creator cohort using server-side eligibility enforced in `releaseService`; do not expose cohort membership in public DTOs.
5. Watch audit events, error events, release queue age, safety-check failure rate, and report rate. Disable `FEATURE_FLAG_COMMUNITY_PUBLISHING` to halt new submissions immediately if a safety or reliability signal appears.

The flag stops new submission and moderator publication. Existing approved releases remain readable until an admin takes them down, so a rollout switch cannot accidentally make current public links disappear.

## Verification

Tests must cover:

- every release state transition and forbidden transition;
- owner, stranger, guest, child-without-consent, child-with-consent, teen, adult, moderator, and admin authorization;
- stale project revision, mismatched snapshot ID/hash, duplicate idempotency key, and duplicate submission;
- each deterministic check failure and check exception fail-closed behavior;
- release DTO redaction and no public access to any non-published release;
- frozen public play after later project edits;
- release-only remix lineage and rejection of non-published sources;
- withdrawal/takedown immediate removal from Explore, world page, play, and remix;
- audit-event redaction, disabled-flag behavior, and existing legacy publication/remix regressions.

The release gate is `npm run lint`, `npx tsc --noEmit`, relevant focused unit/integration tests, `npm run build`, browser release journeys, accessibility checks, a staged production deploy, and live production smoke checks before enabling the beta flag.

## Non-goals

- Replacing legacy ordinary-project sharing in this beta.
- Open social features, chat, messaging, comments, or collaboration.
- Automatic publication, external moderation-provider dependency, or storing raw moderation notes in public records.
- Importing arbitrary remote game assets or executable code.
- Multiplayer, marketplace, advertising, or creator payments.
