# 3D Scratch Core Creation Loop Design

Date: 2026-08-09
Status: Approved design, awaiting written-spec review

## Summary

Build a polished, local-first core creation loop for a 3D block-programming environment aimed at children ages 6–12. A child must be able to start from a guided obstacle-course template or blank world, create and edit 3D objects, program them with true drag-and-snap Blockly blocks, test the game immediately, close and reopen the app without losing work, and export or import the complete project as one file.

This milestone strengthens the existing application rather than replacing it. The current Three.js/React Three Fiber scene editor, object tooling, and useful assets remain. The temporary logic-block UI, fragmented state, and partial player behavior are replaced by one versioned project document and a shared runtime used by both edit-preview and play mode.

## Goals

- Deliver one reliable end-to-end creation loop for a 3D obstacle-course game.
- Support children ages 6–12 with progressive disclosure, large controls, icons, plain-language labels, and optional read-aloud help.
- Provide true Blockly drag, snap, nesting, undo/redo, keyboard access, and serialization.
- Make editor preview and standalone play mode execute identical project behavior.
- Work across desktop, tablet, and phone through an adaptive interface.
- Save automatically without requiring an account, database, or environment configuration.
- Keep project execution safe by interpreting validated commands rather than evaluating generated JavaScript.

## Non-goals for This Milestone

- Public galleries, likes, comments, following, or remix feeds.
- Real-time collaboration or networked multiplayer.
- Cloud project synchronization, classroom dashboards, or teacher administration.
- AI-generated 3D models, cloud asset storage, or production moderation workflows.
- An advanced keyframe animation timeline or custom extension marketplace.
- Full compatibility with Scratch project files or every block available in Scratch.

The existing implementations of deferred features may remain reachable only where they do not compromise the core creation loop. They are not acceptance criteria for this milestone.

## Product Experience

### First-run flow

1. The home screen offers **Start an Obstacle Course** and **Blank 3D World**.
2. The obstacle-course starter opens with a hero, ground, one collectible, one hazard, and one goal. Short coach marks introduce building, blocks, and Play.
3. The blank starter opens with a camera, light, ground, and an empty object list.
4. The editor creates and autosaves a local project immediately. No sign-in is required.

### Creation loop

1. Add an object from the built-in library: hero, platform, collectible, hazard, goal, primitive shape, or sound.
2. Select the object in the scene or object list.
3. Move, rotate, scale, duplicate, rename, or delete it. Scene and block changes share undo/redo history at the user-action level.
4. Open Blocks and attach one or more event scripts to the selected object.
5. Press Play to test in place. The editor preserves the authored state separately from the temporary runtime state.
6. Press Stop or Reset to restore the exact authored state and cancel scripts and audio.
7. Autosave after a short debounce. Reopen the project from a recent-project list.
8. Export or import a single versioned project file for sharing or backup.

### Responsive behavior

- **Desktop/laptop:** show the object library/list, main 3D stage or Blockly workspace, and object inspector together where space permits.
- **Tablet:** use collapsible trays for the palette, object list, and inspector; Stage and Blocks remain primary modes.
- **Phone:** show one focused tool at a time with large bottom tabs for Stage, Blocks, Objects, and Play. Editing uses full-screen sheets rather than compressed sidebars.
- The project model and capabilities are identical across devices. Mobile does not use a reduced file format or incompatible block set.
- Touch targets are at least 44 CSS pixels. Blockly controls, scene gestures, and scroll gestures must not compete for the same touch sequence.

## Architecture

### Versioned project document

One serializable `ProjectDocument` is the source of truth for editing, local persistence, import/export, and runtime startup. It contains:

- schema version and project metadata;
- ordered scenes and their environment settings;
- 3D objects with stable IDs, transforms, render properties, physics properties, and asset references;
- per-object Blockly workspace serialization;
- project and scene variables;
- broadcast-message declarations;
- asset metadata for built-in or imported local assets;
- accessibility and editor preferences that belong with the project.

The document uses explicit schemas and migrations. Import first parses untrusted JSON, validates size and structure, applies ordered migrations, and reports a friendly error without partially replacing the open project.

### Editor state boundaries

The editor has three distinct state layers:

1. **Authored project state:** serializable content stored in `ProjectDocument`.
2. **Ephemeral editor state:** selection, open panel, camera orbit, drag state, Blockly flyout state, and coach-mark progress.
3. **Runtime state:** object velocities, active script tasks, transient clones, current score/lives, playing sounds, and win/loss status.

Play clones authored state into runtime state. Runtime changes never mutate the authored document unless a future explicit recording feature is introduced. Stop discards runtime state.

### Modules and responsibilities

- **Project model:** types, schema validation, defaults, migrations, and stable ID creation.
- **Project store:** authored-state commands, subscriptions, grouped undo/redo, dirty tracking, and selection-safe updates.
- **Local project repository:** IndexedDB CRUD, recent-project metadata, debounce, crash-recovery record, import, and export.
- **Blockly adapter:** custom block definitions, toolbox levels, field validation, icons/help metadata, workspace serialization, and conversion to the runtime intermediate representation.
- **Runtime compiler:** validates block graphs and compiles each top-level event stack into typed runtime instructions.
- **Runtime scheduler:** dispatches events and advances isolated script tasks with cancellation and per-frame step budgets.
- **3D runtime adapter:** applies instructions to Three.js objects, physics, camera, audio, variables, messages, and game state.
- **Responsive editor shell:** chooses desktop, tablet, or phone presentation while reusing the same editor commands and project state.

Each module exposes typed interfaces. UI components issue project commands; they do not write persistence records or runtime internals directly.

## Blockly Language

### Workspace rules

- Each programmable object owns a Blockly workspace serialized into its object record.
- Top-level scripts must begin with an event hat block. Detached non-event stacks are allowed while editing but do not run.
- Blocks use plain text plus category icons. Help includes a short description, an example, and optional speech synthesis through the browser accessibility API.
- The toolbox initially shows Starter categories. **Show all blocks** reveals the complete milestone palette and remembers the preference.
- Fields use constrained dropdowns, numeric bounds, object/message selectors, and accessible labels. Invalid values are corrected or flagged before Play.
- Blockly undo/redo integrates with the project store as grouped user actions so workspace edits persist and can be reversed consistently.

### Milestone block categories

**Events**

- when Play starts;
- when key pressed;
- when screen control pressed;
- when this object clicked or tapped;
- when touching an object or tag;
- when I receive a message;
- broadcast message and broadcast-and-wait.

**3D Motion**

- move forward/backward by amount;
- change or set X, Y, or Z;
- go to object or position;
- turn yaw/pitch/roll;
- point toward object;
- jump with strength;
- glide to position over time.

**Looks and Camera**

- show/hide;
- set color;
- set or change size;
- say text for duration;
- switch simple animation state when the model supports it;
- set active camera target or reset camera.

**Sound**

- play sound;
- play sound until done;
- stop this sound or all sounds;
- set volume.

**Control**

- wait;
- repeat count;
- forever;
- if and if/else;
- repeat until;
- stop this script or all scripts.

**Sensing and Operators**

- touching object/tag;
- distance to object;
- key or screen control pressed;
- grounded state;
- comparisons, boolean operators, arithmetic, random number, and text joining.

**Variables and Game State**

- set/change/show/hide a variable;
- score and lives are ordinary named project variables supplied by the starter template;
- win game and lose game.

**Physics**

- enable/disable physics;
- set gravity response;
- set velocity component;
- apply impulse;
- set static/dynamic state before runtime starts.

Object selectors store stable IDs while displaying names. Deleted references become visibly unresolved blocks and do not silently target a different object.

## Runtime Semantics

- The runtime uses a fixed simulation step for game logic and physics, with rendering interpolated separately when needed.
- Event dispatch creates independent script tasks. Each task owns its instruction pointer, control stack, waits, and cancellation state.
- Multiple scripts may run concurrently. Object mutations are applied in stable object/script order within a simulation tick for reproducible behavior.
- `wait`, glides, and sound-until-done yield without blocking other scripts.
- `forever` and other loops are cooperatively scheduled. A per-task and per-frame instruction budget prevents a malformed project from freezing the page.
- Broadcast delivers to matching event scripts in a stable order. Broadcast-and-wait resumes after spawned receiver tasks complete or are cancelled.
- Collision/touch events use enter semantics by default: they fire when contact begins, not on every rendered frame. Continuous touching is available through a sensing reporter inside loops.
- Play initializes variables, transforms, physics, visibility, sounds, and runtime flags from the authored document. Reset performs the same initialization.
- Stop cancels every task, stops audio, clears transient UI and clones, releases runtime resources, and restores authored state.
- Runtime exceptions stop only the affected script when safe. The editor highlights the responsible block and displays a short actionable message.

## Persistence and Portability

- IndexedDB stores full documents and recent-project metadata. A small localStorage pointer may identify the most recently opened project, but project bodies do not live in localStorage.
- Autosave is debounced after authored changes and flushed on visibility changes when the browser permits.
- A recovery record is written independently enough to detect an interrupted save. On next launch, the child can restore or discard recovered work.
- Export produces one JSON-based project file with a distinct extension and MIME type. Small imported assets may be embedded; large assets must respect an explicit project-size limit and produce a clear message.
- Import never overwrites an existing project ID. It creates a new local project with remapped identity while preserving internal object references.
- The current MySQL APIs become an optional future repository adapter. The local repository is the default and requires no `.env` file.

## Accessibility and Child Safety

- All block categories and common blocks have recognizable icons and visible text.
- Optional read-aloud uses browser speech synthesis and never sends block text to a remote service.
- Keyboard users can reach the primary editor modes, object list, inspector controls, Blockly controls, Play, Stop, undo, and redo with visible focus.
- Motion-heavy transitions respect `prefers-reduced-motion`.
- Colors are not the only category or status indicator; labels and shapes remain present.
- Errors avoid stack traces and blame language. They state what happened, identify the block or asset, and suggest one correction.
- Imported documents are treated as untrusted input. The app rejects executable code, remote scripts, unsafe URLs, unsupported asset types, oversized files, and pathological block graphs.

## Error Handling

- Schema or migration failure leaves the current project untouched and offers a readable import report.
- Missing assets render a conspicuous placeholder while the rest of the project remains editable and playable.
- Unsupported model features degrade to a primitive preview or static model rather than crashing the scene.
- IndexedDB failure moves the editor into an explicit unsaved state and immediately offers export; it never claims the project is saved.
- Blockly compilation reports all discoverable errors together and links each error to the corresponding block.
- Runtime budget exhaustion pauses the offending script, highlights it, and keeps the editor responsive.
- WebGL loss displays a recovery panel and attempts a controlled scene recreation without discarding authored work.

## Testing and Acceptance Criteria

### Automated tests

- Project schemas accept valid documents and reject malformed, oversized, or unsafe documents.
- Every schema migration has fixture-based before/after tests.
- Project commands preserve invariants and grouped undo/redo restores exact prior authored state.
- Blockly serialization round-trips without semantic changes.
- Every included block compiles to typed runtime instructions; invalid graphs produce block-linked diagnostics.
- Scheduler tests cover concurrent events, waits, nested control flow, cancellation, broadcast-and-wait, collision enter semantics, and instruction budgets.
- Save/load and export/import round-trips preserve scenes, objects, blocks, variables, messages, settings, and internal references.
- A deterministic obstacle-course fixture can move, jump, collect an item, lose a life to a hazard, reach the goal, and reset to its authored state.
- Responsive component tests cover mode and panel state across desktop, tablet, and phone breakpoints.

### Manual acceptance journey

A child or tester can, without database configuration or developer tools:

1. start the obstacle-course template;
2. add and position a platform, collectible, hazard, and goal;
3. give the hero keyboard controls and touch-screen controls using blocks;
4. program score, hazard/life, and goal/win behaviors;
5. play, stop, edit, and replay with consistent reset behavior;
6. close and reopen the browser and find the project intact;
7. export the project, import it as a copy, and play the copy;
8. complete the journey on desktop and tablet, and perform the same authoring capabilities through the focused phone layout;
9. use icons, visible text, and read-aloud help for the primary starter blocks;
10. recover gracefully from one intentionally broken reference and one invalid imported file.

### Performance guardrails

The obstacle-course starter and acceptance fixture must maintain responsive editing and play on a representative mid-range tablet. The implementation plan will define measurable budgets for initial load, interaction latency, frame rate, object count, active script count, import size, and autosave time after baseline measurements of the current app. Guardrails must be enforced or surfaced; they must not rely on silent degradation.

## Migration from the Existing Application

- Preserve compatible scene objects and assets through an explicit legacy-to-`ProjectDocument` adapter.
- Replace `LogicBlockEditor` with the Blockly adapter and responsive Blocks workspace.
- Move gameplay interpretation out of `GamePlayer` into the shared compiler, scheduler, and 3D runtime adapter.
- Replace component-local project mutation in `GameEditor` with typed project-store commands in focused components.
- Remove active Supabase editor dependencies from the local-first path. Do not require MySQL for creating, saving, or playing local projects.
- Retain existing server-backed project data behind an adapter or migration path; do not silently delete or overwrite it.
- Split oversized editor and player components only along the module boundaries defined above. Avoid unrelated visual or backend rewrites.

## Delivery Sequence

1. Establish schemas, migrations, fixtures, and the local project repository.
2. Establish the project store and migrate core scene editing to typed commands.
3. Add Blockly with serialized per-object workspaces and the progressive accessible toolbox.
4. Build and test the compiler, scheduler, and core event/control/data blocks.
5. Connect 3D motion, physics, sensing, sound, camera, and win/loss behavior.
6. Integrate in-editor Play/Stop/Reset and standalone play mode with the shared runtime.
7. Implement adaptive desktop/tablet/phone editor shells and touch controls.
8. Add the obstacle-course starter, coach marks, read-aloud help, import/export, and recovery UI.
9. Run the automated suite, device acceptance journey, accessibility checks, and performance measurements.

Each sequence item must leave the application in a testable state. The detailed implementation plan will break these items into small test-first tasks and name the exact files after confirming dependency and test-runner choices.
