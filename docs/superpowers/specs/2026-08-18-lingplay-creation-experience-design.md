# LingPlay Creation Experience Design

Date: 2026-08-18
Status: Approved design, awaiting written-spec review

## Summary

Give the editor, compact stage, and standalone player one truthful authored-project state and one reliable path from edit to Play. Blockly changes appear immediately, save in order, and flush before navigation. Undo, Save, starters, tutorials, controls, sharing, and player overlays behave exactly as their labels promise.

This project depends on the trust-boundary actor interfaces and durable-work command/revision APIs.

## Goals

- Make the currently visible authored state the source for preview and persistence.
- Eliminate lost Blockly edits and stale Play sessions.
- Make global save status and persistent undo understandable to children.
- Replace inspiration-only cards with real playable starters.
- Carry tutorial intent through creation and verify tutorial actions.
- Restore the project, author, report, and remix loop when sharing.
- Fix player speech, controls, and developer-overlay behavior.

## Non-goals

- Adding new block categories solely to increase the advertised block count.
- Real-time collaboration.
- A new social feed or comment system.
- Redesigning every visual style on the marketing site.
- Deploying to the live service without separate authorization.

## Authoritative Editor Store

One typed project store owns the authored project snapshot, current revision, pending command queue, undo/redo groups, save state, and subscriptions. Ephemeral selection, open panels, camera position, and transient drag state live separately. Runtime physics, variables, clones, and animations never mutate authored state.

Editor components dispatch typed commands to the store. They do not independently patch the API and then attempt to mirror the result in local React state. The store applies commands optimistically, serializes them through the durable-work API, and reconciles acknowledgements by revision and idempotency key.

## Save Queue and Navigation

Only one command per project is in flight. Later commands retain order and may coalesce only when doing so preserves undo boundaries, such as repeated transform samples within one drag. A rejected command restores the last confirmed snapshot, reapplies still-valid later commands, and enters `Retry` with a child-readable message.

Blockly emits a typed workspace-replacement command immediately on meaningful change. The compact stage subscribes to the same optimistic snapshot, so it never waits for a server reload. A short debounce may reduce network writes, but changing objects/tabs, pressing Play or Share, route navigation, document visibility loss, and explicit retry all flush pending work. Cleanup cannot silently cancel an unsaved command.

Play opens only after the current revision is acknowledged. The player receives or loads that exact confirmed revision. If saving fails, the editor stays open and offers Retry or Export Recovery instead of opening stale gameplay.

## Undo, Redo, and Status

Undo and redo use the persistent command inverses defined in the durable-work design. Buttons disable when an operation is unavailable or while a conflicting command is unresolved. Keyboard shortcuts share the same path. Save status is announced visually and through an `aria-live` region; `Saved` is never shown while any authored command is pending or rejected.

The top toolbar does not present a metadata-only Save action. Project metadata editing, when opened, dispatches ordinary project commands and participates in the same save state and undo history.

## Starters and Tutorials

Every starter card references a versioned, validated project template containing scenes, objects, blocks, assets, instructions, and a tested win or completion path. Creation offers three honest choices: Blank World, Starter, or Describe with AI when AI is allowed. If a template cannot be created, the user remains on creation with a clear error; it does not fall back silently to an empty project.

Learn links pass a stable tutorial ID through project creation. The editor opens that tutorial directly. Tutorial steps reference stable editor actions rather than CSS selectors and advance only after the store observes the required event, such as adding an object, opening Logic, adding a named block, playing the project, or reaching an outcome. Progress is per user or secure guest and cannot be completed merely by paging through copy.

## Sharing and Community Loop

Share copies the project landing URL. The landing page displays public author identity, moderation status, description, lineage, Play, Remix, Like where allowed, and Report. Viewer identity is resolved independently from author identity. The standalone player includes Back to Game and, when allowed, Remix actions. End-state overlays retain those actions.

Private or moderation-pending projects cannot produce a public share link. Existing bare player links redirect or render a safe unavailable state when access no longer permits viewing.

Explore uses captured project thumbnails or an intentional accessible fallback, never the same generic controller graphic for every card. Cards show author attribution, age/skill-neutral genre and mechanic filters, moderation state, and truthful engagement counts. Seed examples are labeled as examples; the gallery does not manufacture social proof or imply unavailable community activity.

## Player Controls and Overlays

Default movement is disabled only when the authored project defines relevant movement controls, not merely any event block. Keyboard and touch instructions are generated from the resolved control map. Touch controls appear for coarse pointers and remain keyboard-independent.

Speech and thought bubbles use bounded readable widths, normal word wrapping, viewport-aware positioning, object anchoring, and a deterministic stacking/collision strategy. They never shrink into single-character columns or cover required question controls. Speech updates are exposed through a polite live region.

FPS, bounds, and other developer overlays render only when an explicit development/debug flag is enabled. Production player startup does not allocate their animation loops. Restart and Stop reset all runtime-only state while preserving authored state.

The runtime clock is read from the current frame whenever a suspended script resumes. Waits, timer reporters, timer resets, and timer-based loop conditions cannot retain the frame time from generator creation. Regression fixtures cover timer reads before and after waits and across multiple concurrent scripts.

## Product Validation

Implementation includes a facilitator script, consent-safe observation sheet, and privacy-preserving milestone events for first project, first object, first working script, first Play, save recovery, and first Share/Remix. Events contain no project content or direct child identifiers.

Before a broad live release, run 5–8 moderated sessions with guardian-consented children in the target age range and/or teacher-supervised classroom participants. Recording is off by default. At least 80% of participants must create or remix a working game, make one logic change, Play the changed version, and correctly identify whether it is saved within 15 minutes without the facilitator operating the interface. Any work-loss event, misleading Saved state, or consent failure blocks release. Findings become specific follow-up issues rather than being silently summarized away.

## Error Handling

- Failed save keeps pending work visible and recoverable.
- Revision conflict explains that newer work exists and offers safe reload/reapply choices.
- Missing starter assets show a template creation error before an incomplete project is committed.
- Invalid tutorial IDs fall back to the tutorial catalog without losing the project.
- Unsupported custom controls omit false instructions rather than claiming WASD always works.
- Player render failure shows Back to Game, Report Problem, and a correlation ID without a stack trace.

## Testing and Acceptance Criteria

- A Blockly edit appears immediately in the compact stage and survives immediate Play, tab change, route change, and reload.
- Cleanup and debounce timing cannot discard the last edit.
- Concurrent save attempts remain ordered; stale acknowledgements cannot replace newer state.
- Undo/redo of add, move, property change, block edit, and delete survives reload and Play.
- Save status matches the server-confirmed authored revision in success, slow, conflict, and failure cases.
- Every homepage starter creates a distinct playable template rather than an empty scene.
- A Learn selection opens its intended tutorial and steps advance only on verified actions.
- Explore shows meaningful thumbnails, attribution, and truthful counts without fabricated community activity.
- Shared links land on the project page; player return and remix paths work for allowed viewers.
- An unrelated event block does not disable default movement or produce false instructions.
- Speech bubbles remain readable and non-overlapping in representative desktop and phone examples.
- Debug overlays are absent and inactive in production mode.
- Timer reporters and loop conditions use current frame time after every yield.
- The usability protocol and milestone instrumentation are present; broad release remains blocked until the moderated validation threshold is met.
- Focused tests, the complete logic suite, type-checking, lint, build, and full creation browser journeys pass.
