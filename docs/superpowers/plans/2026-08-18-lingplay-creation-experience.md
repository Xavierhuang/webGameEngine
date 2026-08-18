# LingPlay Creation Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make editor state, persistence, preview, Play, undo, starters, tutorials, controls, sharing, and player overlays truthful and reliable from first creation through remix.

**Architecture:** A single Zustand-backed authored-project store consumes the durable command/revision API and owns optimistic state, a single-flight queue, grouped undo, recovery, and save status. Blockly, stage, and editor panels subscribe to that store. Play is revision-pinned through durable snapshots; templates, tutorials, sharing, and Explore use explicit versioned metadata and trust-boundary capabilities.

**Tech Stack:** React 19, Next.js 16, Zustand, Blockly 13, React Three Fiber/Three.js, TypeScript, Zod, MySQL, Node tests, Playwright browser scripts.

## Global Constraints

- Depend on completed trust-boundary and durable-work plans; do not create a second command schema or persistence queue.
- Use exactly four save states: `Unsaved`, `Saving`, `Saved`, and `Retry`.
- Only one command per project may be in flight; never discard pending work on cleanup.
- Group Blockly events by Blockly `event.group`; debounce network transmission for 400 ms, not local stage updates.
- Flush with normal fetch before user-triggered Play/Share/navigation and `fetch(...,{keepalive:true})` on visibility loss; always retain local recovery because unload delivery is not guaranteed.
- Play uses an immutable snapshot for the exact confirmed revision.
- Suppress default movement per controlled object only when that object has a relevant authored movement binding.
- Tutorial progress persists for users and secure guests.
- Product events use an allowlist and contain no project content or direct identifiers.
- Broad release remains blocked until the approved 5–8-session usability threshold is met.
- Preserve all current dirty editor, runtime, examples, localization, watcher, and browser-test changes.

---

### Task 1: Authoritative Project Store and Single-Flight Queue

**Files:**
- Create: `lib/editor/projectCommands.ts`
- Create: `lib/editor/projectStore.ts`
- Create: `components/editor/EditorStoreProvider.tsx`
- Create: `components/editor/SaveStatus.tsx`
- Modify: `types/game.ts`
- Modify: `app/editor/[id]/page.tsx`
- Modify: `components/editor/GameEditor.tsx`
- Modify: `components/editor/PropertiesPanel.tsx`
- Modify: `components/editor/SceneTabs.tsx`
- Modify: `components/editor/Toolbar.tsx`
- Create: `test/editor/project-store.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes durable `ProjectSnapshot`, `ProjectCommand`, command success, and 409 response.
- Produces `dispatch`, `flush`, `retry`, `undo`, `redo`, `exportRecovery`, and subscribed optimistic/confirmed snapshots.

- [ ] **Step 1: Write failing store ordering and truthfulness tests**

```js
test('only one command is in flight and acknowledgements apply in order', async () => {
  const transport = deferredTransport();
  const store = createProjectStore(snapshot(3), transport.send);
  store.dispatch(move('a', 1));
  store.dispatch(rename('a', 'Hero'));
  assert.equal(transport.calls.length, 1);
  transport.resolveNext({ commandId: 'c1', revision: 4, result: {} });
  await tick();
  assert.equal(transport.calls.length, 2);
});

test('Saved means confirmed snapshot equals optimistic snapshot', async () => {
  const store = createProjectStore(snapshot(3), neverResolvingTransport);
  store.dispatch(move('a', 1));
  assert.notEqual(store.getState().saveState, 'Saved');
});
```

Cover optimistic state, retry, rollback/reapply after rejection, conflict, recovery export without credentials, and safe transform coalescing inside one group.

- [ ] **Step 2: Add `test:project-store` and verify RED**

Expected: missing store modules.

- [ ] **Step 3: Implement store and provider**

The transport posts the durable envelope and records the current `editingSessionId`. Selection, modal, transform mode, and camera remain component/ephemeral state. Replace component-owned authored arrays and direct mutation fetches with typed dispatches.

- [ ] **Step 4: Verify GREEN**

Run `npm run test:project-store && npm run type-check`. Confirm `GameEditor` no longer reports Saved from a metadata-only PATCH.

- [ ] **Step 5: Commit**

Stage Task 1 files and commit `feat: centralize authored editor state`.

---

### Task 2: Blockly Flush Barriers, Persistent Undo, and Recovery

**Files:**
- Modify: `components/editor/BlockEditor.tsx`
- Modify: `lib/blockly/serializer.ts`
- Modify: `components/editor/GameEditor.tsx`
- Modify: `components/editor/ShareDialog.tsx`
- Create: `app/api/projects/recover/route.ts`
- Create: `test/editor/blockly-flush.test.js`
- Create: `test/editor/persistent-undo.integration.mjs`
- Modify: `test/blockly/serializer.test.js`
- Modify: `package.json`

**Interfaces:**
- `BlockEditor` emits immediate `replace_workspace` commands with Blockly group ID.
- `flush(reason)` returns only after the confirmed revision includes every queued command or rejects with a recoverable error.

- [ ] **Step 1: Write failing debounce/cleanup/undo tests**

Test immediate optimistic stage update, one 400 ms network debounce, group-change flush, object/tab/Play/Share flush, cleanup without command loss, failed keepalive retaining recovery, and edit→undo→reload→redo→Play consistency.

- [ ] **Step 2: Run focused tests to verify RED**

Expected: current 800 ms component timer is cancelled on cleanup and has no parent update.

- [ ] **Step 3: Move debounce into the store and wire barriers**

Remove independent block PUTs. User-triggered navigation awaits `flush`. `visibilitychange` calls keepalive transport and writes the recovery record first. Recovery import validates schema, creates a new project, then reapplies ordered commands through the normal service.

- [ ] **Step 4: Verify GREEN**

Run project-store, Blockly flush, serializer, block-order, and persistent-undo tests plus type-check.

- [ ] **Step 5: Commit**

Stage Task 2 files and commit `fix: preserve Blockly edits across navigation`.

---

### Task 3: Real Versioned Starters and Honest Creation Modes

**Files:**
- Create: `lib/projects/projectTemplate.ts`
- Create: `lib/projects/templateService.ts`
- Modify: `app/api/projects/route.ts`
- Modify: `app/projects/new/page.tsx`
- Modify: `app/page.tsx`
- Modify: `lib/examples/catalog.ts`
- Modify: `scripts/seed-examples.js`
- Modify: `test/examples/catalog.test.js`
- Create: `test/projects/templates.integration.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces discriminated creation input `{mode:'blank'}`, `{mode:'starter',templateId}`, or `{mode:'ai',prompt}`.
- Templates contain schema version, distinct scene/object/block graph, assets, instructions, genre, mechanics, accessible thumbnail fallback, and completion fixture.

- [ ] **Step 1: Write failing starter-distinctness and atomicity tests**

Assert every homepage card resolves to a real template, creates a distinct non-empty graph, passes a completion fixture, and rolls back entirely on a missing asset or AI failure.

- [ ] **Step 2: Run examples/template tests to verify RED**

Expected: homepage cards currently create only an empty Main Scene.

- [ ] **Step 3: Implement validated templates and three explicit modes**

Convert existing examples to the template interface without duplicating catalogs. Template service runs inside the durable transaction. Rename marketing copy only if an item is inspiration rather than a template.

- [ ] **Step 4: Verify GREEN**

Run examples, template integration, type-check, and build.

- [ ] **Step 5: Commit**

Stage Task 3 files and commit `feat: create playable starter projects`.

---

### Task 4: Tutorial Continuity and Observed Progress

**Files:**
- Create: `migrations/010_creation_experience.sql`
- Modify: `lib/tutorials/catalog.ts`
- Create: `lib/tutorials/progress.ts`
- Modify: `components/tutorials/TutorialPanel.tsx`
- Modify: `app/learn/page.tsx`
- Modify: `app/projects/new/page.tsx`
- Modify: `app/editor/[id]/page.tsx`
- Create: `app/api/tutorial-progress/route.ts`
- Modify: `test/tutorials/catalog.test.js`
- Create: `test/tutorials/progress.test.js`
- Modify: `test/visual/journey.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `TutorialAction` union: `object_added`, `logic_opened`, `block_present`, `play_started`, and `outcome_reached` with schema-validated parameters.
- Persists progress by resolved user/guest profile and tutorial ID.
- Migration 010 also creates the privacy-safe `product_events` table consumed by Task 8 and the production-readiness operational-event sink; payload columns accept only allowlisted numeric, boolean, enum, and duration-bucket JSON.

- [ ] **Step 1: Write failing action and continuity tests**

Assert Learn preserves `tutorial=<id>` through creation/editor, first-run opens the selected tutorial, paging alone does not complete a step, store/runtime events do, invalid IDs safely open catalog, and progress survives another session.

- [ ] **Step 2: Run tutorial tests to verify RED**

Expected: current links lose identity and last viewed index can imply completion.

- [ ] **Step 3: Implement migration, action predicates, event subscription, and API**

Tutorial steps declare exact actions. The panel subscribes to the editor store/runtime event bus and posts only verified advancement. Access follows the resolved actor.

- [ ] **Step 4: Verify GREEN**

Run tutorial tests, localhost journey, type-check, and migration application.

- [ ] **Step 5: Commit**

Stage Task 4 files and commit `feat: make tutorials action aware`.

---

### Task 5: Live Runtime Clock and Complete Reset Contract

**Files:**
- Modify: `lib/runtime/interpreter.ts`
- Modify: `components/player/GamePlayer.tsx`
- Create: `test/runtime/timer-resume.test.js`
- Create: `test/player/runtime-reset.test.js`
- Modify: `package.json`

**Interfaces:**
- Runtime stores current frame time and reads it whenever a generator resumes.
- Produces one reset operation clearing tasks, waits, prompts, answers, keys, clones, outcomes, timers, audio, speech, variables, and scene-runtime state.

- [ ] **Step 1: Write failing timer-after-yield and reset tests**

```js
test('timer reads current time after a wait resumes', () => {
  const runtime = runScript([onStart(), wait(1), say(timer())], { startTime: 5 });
  runtime.step(5);
  runtime.step(6.1);
  assert.equal(runtime.lastSpeech, 1.1);
});
```

Cover reset after concurrent scripts, active sounds, clones, prompt, win/loss, held keys, and scene switch; Stop stays stopped while Restart starts one clean runtime.

- [ ] **Step 2: Run `test:timer-resume` and reset tests to verify RED**

Expected: timer reports generator creation time and reset leaves at least one transient state.

- [ ] **Step 3: Inject current frame time on every resume and centralize reset**

Do not change fixed-step physics semantics. Remove duplicated partial reset branches in the player and delegate to the tested runtime reset contract.

- [ ] **Step 4: Verify GREEN**

Run timer/reset, runtime, demo-parity, game-outcome, scripts-run, and type-check.

- [ ] **Step 5: Commit**

Stage Task 5 files and commit `fix: keep runtime time and reset state current`.

---

### Task 6: Generated Controls, Readable Speech, Debug Gating, and Player Actions

**Files:**
- Create: `lib/player/controlMap.ts`
- Create: `lib/player/speechLayout.ts`
- Create: `components/player/SpeechOverlay.tsx`
- Create: `components/player/PlayerActions.tsx`
- Modify: `components/player/GamePlayer.tsx`
- Modify: `components/player/FPSCounter.tsx`
- Modify: `components/player/TouchControls.tsx`
- Modify: `app/play/[id]/page.tsx`
- Create: `test/player/control-map.test.js`
- Create: `test/player/speech-layout.test.js`
- Modify: `test/player/scripts-always-run.test.js`
- Modify: `test/runtime/game-outcome.test.js`
- Modify: `test/visual/stage-panel.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces per-object control maps and localized structured instruction tokens.
- Produces viewport-aware speech boxes with width 120–280 px and a reserved question-input region.
- Debug overlay mounts only when `NODE_ENV !== 'production' && NEXT_PUBLIC_PLAYER_DEBUG === '1'`.

- [ ] **Step 1: Write failing control and layout tests**

Assert unrelated event hats retain defaults, an authored movement binding suppresses only that object's default, touch and keyboard instructions match bindings, bubbles wrap words without single-character columns, collisions resolve deterministically, and question controls are never overlapped.

- [ ] **Step 2: Run focused player tests to verify RED**

Expected: any event currently suppresses movement and bubble layout collapses.

- [ ] **Step 3: Extract control/speech modules and explicit player actions**

Render speech in one DOM overlay with polite live announcements. Add Back to Game, Remix when allowed, and error actions with correlation ID. Do not mount FPSCounter or its animation loop when debug is false.

- [ ] **Step 4: Verify GREEN**

Run control-map, speech-layout, scripts-run, game-outcome, stage-panel, type-check, and build.

- [ ] **Step 5: Commit**

Stage Task 6 files and commit `fix: align player controls and overlays`.

---

### Task 7: Revision-Pinned Share, Project Landing, and Truthful Explore

**Files:**
- Modify: `components/editor/ShareDialog.tsx`
- Modify: `app/projects/[id]/page.tsx`
- Modify: `app/play/[id]/page.tsx`
- Modify: `app/explore/page.tsx`
- Modify: `app/api/projects/explore/route.ts`
- Create: `lib/projects/explore.ts`
- Create: `test/api/creation-experience.test.js`
- Modify: `test/visual/examples-play.mjs`
- Modify: `test/visual/share-flow.mjs`
- Modify: `test/visual/private-project.mjs`
- Modify: `test/visual/stranger-write.mjs`

**Interfaces:**
- Share flushes, creates/uses an approved publication snapshot, and copies `/projects/:id`.
- Play accepts `revision`/snapshot ID and never substitutes a newer mutable graph.
- Explore reads approved snapshots and mechanic tags inferred at publication time.

- [ ] **Step 1: Write failing share/viewer/Explore tests**

Assert share cannot copy before flush/approval, viewer nav identity differs from author, bare Play offers Back, private/pending is unavailable, counts are real, examples are labeled, thumbnails differ or use intentional fallback, and genre/mechanic filters use approved snapshot metadata.

- [ ] **Step 2: Run focused API/browser tests to verify RED**

Expected: share copies `/play`, author identity is passed as viewer, and Explore uses generic cards/live rows.

- [ ] **Step 3: Implement snapshot-based share and Explore queries**

Use public author DTOs and approved snapshot mechanics. Generate fallback thumbnail style deterministically from project ID/title without claiming it is a capture.

- [ ] **Step 4: Verify GREEN**

Run creation API and all five visual tests, then type-check/build.

- [ ] **Step 5: Commit**

Stage Task 7 files and commit `feat: restore the share and remix loop`.

---

### Task 8: Privacy-Preserving Milestones, Usability Protocol, and Creation CI

**Files:**
- Create: `lib/monitoring/creationEvents.ts`
- Create: `app/api/events/creation/route.ts`
- Create: `test/monitoring/creation-events.test.js`
- Create: `docs/usability/creation-facilitator-script.md`
- Create: `docs/usability/creation-observation-sheet.md`
- Create: `docs/usability/creation-release-gate.md`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Allows only `first_project`, `first_object`, `first_working_script`, `first_play`, `save_recovery`, and `first_share_or_remix` with boolean/duration-bucket properties.
- Produces `test:creation` and `test:creation-browser` gates.

- [ ] **Step 1: Write failing event privacy and CI-manifest tests**

Reject unknown event/property keys and strings containing project text, prompt text, email, raw IP, title, or direct actor ID. Assert CI includes all creation focused/browser suites.

- [ ] **Step 2: Run tests to verify RED**

Expected: event module and CI gates are absent.

- [ ] **Step 3: Implement allowlist, pseudonymous rotating actor key, and research documents**

The facilitator never operates the UI. Observation sheet records task outcome/timing and issue codes, not content. Release gate requires 5–8 guardian-consented or teacher-supervised participants, at least 80% completing the approved 15-minute journey, and zero work-loss, false-Saved, or consent failures.

- [ ] **Step 4: Run final creation verification**

```bash
npm run test:trust
npm run test:durable
npm run test:creation
npm run test:all
npm run type-check
npm run lint
npm run build
npm run test:creation-browser
```

Expected: all automated gates exit 0. Documentation states that broad release remains blocked until external sessions are completed.

- [ ] **Step 5: Commit**

Stage Task 8 files and commit `test: gate the complete creation journey`.
