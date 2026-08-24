# Lingplay Worlds Platform Design

Date: 2026-08-24
Status: Proposed for implementation planning

## Summary

Evolve Lingplay from a 3D block-based game editor into **Lingplay Worlds**: a kid-safe creator platform where children make, test, version, submit, publish, discover, play, and remix small games. The first release is template-first and uses blocks only; it does not provide arbitrary JavaScript/Lua execution, open chat, direct messaging, or unreviewed external media.

The platform is deliberately built on existing Lingplay primitives: projects, scenes, the Blockly runtime, project revisions and play snapshots, Explore, likes, play/remix counts, remix ancestry, publication snapshots, reports, parental consent, centralized authorization, and feature flags.

## Product Goal

Children can choose a game type, personalize a complete playable world, learn through guided missions, test it, submit a stable version, and have that version appear as a safe public world once it passes platform policy. Other children can play and remix approved worlds while attribution and safety boundaries remain intact.

The outcome is a first-party platform loop:

```text
Choose a world type → build with blocks → test → save version → submit
→ automated checks → parent/teacher approval → Lingplay review
→ public World page → Explore → play or remix an approved version
```

## Users and Roles

### Child creator

- Creates from approved templates and edits with the existing 3D editor and Blockly blocks.
- Can save private drafts and play private test snapshots.
- Cannot expose a world publicly without the required consent and publishing workflow.
- Can remix approved public releases into a new private draft.

### Parent or teacher approver

- Receives or views a summary of the proposed public release.
- Approves or rejects a specific submitted version, not an unconstrained mutable project.
- Can revoke approval before Lingplay review; revocation stops the submission.

### Lingplay reviewer

- Reviews the static candidate and automated-check results.
- Publishes, rejects, requests changes, or takes down a live release.
- Never sees raw secrets, private session identifiers, or unnecessary child data.

### Player/remixer

- Can browse and play approved public releases.
- Can report a release.
- Can remix only a published snapshot and only into a private draft under their own authorized profile.

## First Release Scope

### World Builder

The first primary action after sign-in is **Create a World**. It offers a fixed catalog of template families:

- Platformer
- Obby / obstacle course
- Racing
- Story adventure
- Pet world

Each template includes a playable scene, approved starter models, safe assets, starter logic, named customization goals, and a short guided mission sequence. A child can change the title, visuals, world layout, characters, rules, and blocks within the same project model Lingplay already uses.

The initial template catalog is data-driven and versioned in source. Each template declares its supported block set, starting asset references, game genre, world card art, mission sequence, object/block/asset budget profile, and minimum player checks. Templates cannot point at arbitrary remote assets.

### Guided missions

Guided missions are optional, resumable tasks attached to a draft project. They guide the child through meaningful changes such as adding a collectible, changing a character, writing a win condition, and testing the game. Completion earns in-product creator badges but does not influence moderation outcomes or make publication automatic.

### Draft versions and releases

Existing `projects.revision` and `project_play_snapshots` remain the source of editable state and testable revision-pinned runtime content. Lingplay Worlds introduces a creator-facing version layer:

- A **draft** is the mutable project at a specific project revision.
- A **release candidate** is an immutable serialized project snapshot bound to exactly one project revision and submitted for publication.
- A **published release** is the approved immutable candidate served to public players.
- Editing after submission does not mutate the release candidate or published release; it creates later draft revisions.
- The public world page always resolves to one approved release. A new approved release replaces the current default release while older approved releases remain auditable and can be restored by a reviewer.

The existing `publication_snapshots` table is the durable candidate payload. The platform adds first-class release metadata and review history rather than duplicating project graphs in a new format.

### Public World pages and Explore

The existing `/explore`, `/projects/[id]`, and `/play/[id]` surfaces become release-aware:

- Explore lists only current approved releases, with title, child-safe creator label, template/genre, thumbnail, play count, likes, remix count, and age band.
- World pages show the published version, release date, creator attribution, template credits, remix ancestry, Play, Remix, Like, and Report controls.
- A new curated collection model powers Featured, New, Popular, and template-family collections. It is reviewer-managed, not algorithmically personalized in the first release.
- Search remains title/description/tag based and has bounded query length, pagination, safe sort choices, and no exposure of private author metadata.

### Remix policy

Remix starts from an immutable approved release snapshot—not the creator’s live project—and creates a private draft for the remixer. The created draft stores both the source project and source release identity. Public presentation shows an attribution chain such as “Remixed from …,” including template credits when applicable.

If a source release is taken down, existing remixes remain private until separately reviewed. Public remixes whose source becomes unavailable display preserved attribution without linking to hidden content.

## Safety and Trust Model

### Publication state machine

The release state is explicit:

```text
draft → submitted → automated_checking → awaiting_approval → reviewer_queue
      → published | changes_requested | rejected | withdrawn | taken_down
```

- `draft` is private and mutable at the project layer.
- `submitted` captures a revision-pinned release candidate.
- Automated checks validate the full candidate before human review.
- A child requiring consent cannot leave `awaiting_approval` without an active parent/teacher approval for that candidate.
- Reviewer publication is the only transition to `published`.
- A change to the candidate requires a new submission; reviewers never approve a different revision than the one evaluated.
- `withdrawn` is creator-initiated removal; `taken_down` is staff enforcement. Neither leaves a public playable release.

Feature flags keep `new_publication` disabled in production until each gate is implemented and reviewed.

### Automated checks

Checks run on the immutable candidate and fail closed. They include:

- centralized authorization and consent capability check;
- complete project-graph text moderation;
- same-origin/quarantined asset verification;
- supported asset types and model/texture/image/audio limits;
- scene/object/block/clone/script-step and storage budgets;
- block vocabulary and runtime validation;
- load/play smoke test against the captured snapshot;
- no unapproved external URLs, arbitrary executable code, direct peer messaging, or open social input;
- thumbnail and public metadata validation;
- revision/content hash integrity verification.

A provider outage or incomplete result stays pending; it never becomes an approval.

### Human approval and review

The child’s parent/teacher approval and Lingplay staff review are independent recorded decisions against the same release candidate hash. Approval records include candidate ID, decision, limited reviewer/approver identity, timestamp, reason code, and expiry/revocation fields. Child-facing responses show status and actionable next steps, never moderation internals or consent tokens.

No comments, direct messages, friend requests, voice chat, custom code, external web links, or player-to-player multiplayer ship in the first release.

### Reporting and takedown

The existing report system remains the reporting entry point. A report targets the public release as well as its owning project. Repeated reports, failed safety checks, or a reviewer takedown hide the release immediately while retaining immutable evidence and an audit trail. Takedown cannot delete the creator’s private draft by itself.

## Data Model

Add focused tables and extend existing records rather than replacing projects:

| Record | Responsibility |
|---|---|
| `world_templates` | Approved template catalog, version, metadata, defaults, budgets, and mission configuration. Source-backed initial data is seeded into this table. |
| `project_worlds` | Links a project to its template family/version and creator-facing world metadata. |
| `world_mission_progress` | Per-project resumable guided mission completion. |
| `world_releases` | Candidate/release metadata: source revision, publication snapshot ID, content hash, status, public slug, current flag, submitted/published/withdrawn timestamps. |
| `world_release_checks` | Idempotent automated check runs, status, bounded result summary, timestamps, and correlation IDs. |
| `world_release_approvals` | Parent/teacher and Lingplay reviewer decisions, candidate hash, reason code, revocation and expiry data. |
| `world_collections` / `world_collection_entries` | Reviewer-curated Explore collections and ordering. |
| `projects` additions | Current published release pointer and release-safe discovery fields only where a query needs denormalization. |
| `publication_snapshots` | Retains the immutable serialized project graph and approved asset references used by a world release. |

Every release record uses foreign keys, revision/content-hash validation, indexes for current public releases and reviewer queues, and an append-only audit event for safety-sensitive transitions.

## Application Boundaries

### Server-side services

Introduce server-only services with narrow interfaces:

- `WorldTemplateCatalog` lists only approved templates and creates a new project from a template in one transaction.
- `WorldReleaseService` creates release candidates, applies state transitions, validates expected revision/hash, and writes audit events.
- `WorldSafetyCheckService` runs deterministic local checks and queues external moderation checks; it returns a structured status rather than publishing.
- `WorldApprovalService` records candidate-bound approval/rejection/revocation actions.
- `WorldDiscoveryService` returns allowlisted public release DTOs and collection results.
- `WorldRemixService` copies only the approved release snapshot into a new private project through the existing command/transaction layer.

Routes call `resolveCurrentActor`, the centralized access boundary, capability checks, rate limits, and the appropriate service. UI components never decide whether a world is eligible for public release.

### Client surfaces

- **Create a World** opens a template picker and creates an authorized private project.
- **World Builder** is the existing editor with template missions and clear draft/version status.
- **Release panel** replaces the simple public/private toggle with test, submit, status, withdraw, and resubmit actions.
- **Explore and World page** render public release DTOs only.
- **Reviewer console** separates candidate evidence, safety checks, decisions, and takedowns from raw project editing.

## Rollout Plan

### Phase 0 — complete prerequisites

Finish the already-designed trust-boundary and durable-work prerequisites that World publishing depends on: AI guardrails, publication candidates, guest claiming, private asset storage/quarantine, deletion pipeline, backup, and CI gates. Do not enable new publication before these are complete.

### Phase 1 — private World Builder

Ship template catalog, template-based project creation, world metadata, guided missions, and draft version status. This phase is private: no new public worlds, no release candidate creation, and no expanded discovery behavior.

### Phase 2 — release workflow

Add immutable candidate creation, deterministic checks, parent/teacher approval, reviewer queue, and the full audit trail behind a disabled production feature flag. Exercise the complete state machine in browser and integration tests.

### Phase 3 — public discovery

Enable approved releases in Explore and World pages, release-based Play and Remix, curated collections, reports/takedowns, and monitoring dashboards. Roll out to a limited creator cohort first, with a kill switch that withdraws new publication while keeping current approved releases readable.

### Phase 4 — platform expansion

After real child/parent/teacher testing and reliability evidence: classroom cohorts, private teacher sharing, richer creator achievements, carefully scoped collaboration, and only later multiplayer/session services. These are separate specs; they are not implicit in this release.

## Non-goals

- Arbitrary JavaScript, Lua, native code, plugins, or external package execution.
- Open chat, private messaging, voice chat, friend requests, follower graphs, or unmoderated social feeds.
- Real-money currency, advertising, creator payouts, or marketplaces.
- Synchronous real-time multiplayer in the first release.
- Direct remote rendering of uploaded or linked assets.
- Replacing the existing editor, runtime, project command service, or public gallery from scratch.

## Acceptance Criteria

- A signed-in child can create a private world from every approved template and complete a guided mission.
- A child can test a revision-pinned draft without changing a published release.
- A release candidate is immutable, hashes its complete project graph, and cannot be approved after the project changes.
- Public publication requires successful automated checks, active required consent, and a Lingplay reviewer decision for the same candidate hash.
- Only approved releases appear in Explore, public World pages, public play, curated collections, and remix source selection.
- Public Remix creates a private new project from the approved release snapshot, preserving source release and template attribution.
- A rejected, withdrawn, or taken-down release is removed from public discovery and cannot be played publicly or newly remixed.
- Reports/takedowns produce redacted audit events and do not disclose reporter or child-private data.
- All protected routes reject unauthorized, cross-project, stale-revision, stale-candidate, expired-consent, and feature-disabled requests.
- Tests cover every release transition, role, candidate/version mismatch, external asset rejection, budget violation, moderation failure, report/takedown, and remix lineage case.
- Complete unit/integration/browser safety journeys, type-check, lint, build, accessibility, and production smoke gates pass before enabling public release creation.
