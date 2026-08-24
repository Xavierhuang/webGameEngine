# Task 4 report — Server-validated guided missions and draft status

## Delivered

- Added a strict, bounded mission-action parser plus deterministic predicates for objects, recursive Blockly block types, and revision-pinned play snapshots. Outcomes are deliberately deferred because this runtime has no authoritative gameplay-fact log.
- Added the authorized, idempotent mission-progress service and `GET`/`POST /api/projects/:id/world-missions` route. It verifies project edit ownership before reading or writing, derives evidence from stored rows, and stores only action kind, IDs, outcome, and revision.
- Added private-draft status and an optional, dismissible mission panel. The editor passes only a small server DTO; no project graph or stored block content enters the panel.
- Wired candidate signals to persisted Blockly workspaces and observed persisted object creation. A player start requires an authenticated, owner-authorized session-start request for the exact snapshot before the separately posted mission action can advance progress.

## TDD record

- RED: `npm run test:world-missions && npm run test:world-mission-service` initially failed with `TS6053: File 'lib/worlds/missions.ts' not found`.
- RED: `npm run test:world-mission-ui` initially failed because `WorldDraftStatus.js` did not exist.
- RED (review regression): direct `play_started` advanced progress and created a session; the session-start API did not exist. Added the failing direct-POST and explicit-start tests before changing the service.
- GREEN: focused pure, integration, UI, runtime, and type checks below.

## Verification

- PASS — `npm run test:world-missions`
- PASS — `npm run test:world-mission-service` against local `gameengine_test` MySQL (owner/read-write, private stranger boundary, idempotency, identity mismatch)
- PASS — `npm run test:world-mission-ui`
- PASS — `npm run test:runtime`
- PASS — `npm run type-check`
- BLOCKED/ENVIRONMENT — `npm run build`: Next 16 Turbopack fails while processing existing `app/globals.css` because the command environment prohibits a child process from binding a port (`Operation not permitted`). The failure reproduces both sandboxed and escalated runs before application type checking; it is not a source diagnostic. `npm run type-check` passes.
- BLOCKED/NOT CURRENT-CODE — `npm run test:journey` reached World Builder creation but timed out at the new status assertion. Port 3100 was already occupied by a server that was not this workspace's current process; attempts to launch a fresh port-3101 process were terminated by the command runner after readiness, so the journey could not be rerun against the current code. Static UI coverage and the production build confirm the new components compile.

## Review security fixes

- Added creation baselines to `project_worlds`: the server records initial object IDs, initial block-type counts, and baseline revision atomically with template creation. Object missions now require a non-baseline object of the required type at a later revision; block missions require the stored target-block count to exceed its creation baseline at a later revision. Names and client block content are not evidence.
- Added migration 012 and actor-bound `world_mission_sessions`. `/play/:id` now obtains a revision-locked `writePlaySnapshot` and renders that persisted snapshot (including logic blocks), never mutable scene/object rows. A separate authenticated `/world-missions/session` start endpoint binds the exact current snapshot to the owner before the progress endpoint accepts `play_started`; direct progress POSTs cannot create sessions.
- Deferred outcome progress: the current runtime has no server-authenticated gameplay fact log, so a client `outcome_reached` enum cannot complete a mission and the player no longer submits it.
- RED regressions captured for all review findings, then verified green with real MySQL: preexisting object blocked/later matching type accepted; baseline block blocked/later target accepted; direct play progress cannot create a session; explicit actor-bound session start allows progress; and the persisted render snapshot remains unchanged when live graph rows/revision change afterward.
