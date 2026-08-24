# Lingplay World Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 1 of Lingplay Worlds: children can create private, playable template worlds, follow optional guided build missions, and see truthful draft/version status.

**Architecture:** Keep template definitions as pure, source-backed TypeScript data validated by Node tests; create a project by materializing the selected template through one MySQL transaction, using the existing project/scene/object/block rows. Store only template identity and mission progress in new focused tables. The current editor and player remain the runtime; the new World Builder UI creates and annotates private drafts, while public release workflow remains disabled until its separate safety prerequisites are complete.

**Tech Stack:** Next.js 14, React 18, TypeScript, MySQL/mysql2, Zod, existing Blockly runtime, React Three Fiber, Node test scripts, Playwright smoke/journey scripts.

**Spec:** `docs/superpowers/specs/2026-08-24-lingplay-worlds-platform-design.md`

## Global Constraints

- Implement only Phase 1 private World Builder; do not add public release submission, approval, reviewer, collection, or multiplayer behavior.
- Children build with existing blocks and approved local assets only; do not add arbitrary JavaScript/Lua, external assets, open chat, direct messaging, or external links.
- Every created World starts private, with `visibility='private'`, `is_published=FALSE`, and `moderation_status='draft'`.
- Create project graph rows in one transaction; never leave a project without a scene or partial template rows after a failure.
- A template must be source-backed, versioned, validated, and contain only supported block types and local `/models/` or `/backdrops/` references.
- Reuse `projects.revision`, `project_play_snapshots`, centralized actor/access logic, and the existing editor/player; do not add a second editor state or persistence system.
- Template and mission APIs require a resolved non-anonymous actor; every project read/write verifies project ownership through the centralized access boundary.
- Guided missions are optional and resumable. Only server-validated actions mark them complete; client-side clicks alone do not.
- Preserve unrelated existing work and do not enable `new_publication`.
- Before a production deploy run focused tests, `npm run test:all`, `npm run type-check`, `npm run lint`, `npm run build`, `npm run smoke`, and the World Builder browser journey; deploy only through `./deploy.sh` from a clean working tree after explicit user approval.

---

## File Structure

| Path | Responsibility |
|---|---|
| `lib/worlds/templates.ts` | Pure template catalog, type definitions, validated scene/object/block data, supported asset references, and mission declarations. |
| `lib/worlds/templateValidation.ts` | Pure catalog/materialization validation reusable by tests and server service. |
| `lib/worlds/templateService.ts` | Transactional project materialization and project-world identity writer. |
| `lib/worlds/missions.ts` | Pure action schemas and deterministic mission-completion predicates. |
| `lib/worlds/missionService.ts` | Authorized, idempotent mission-progress persistence. |
| `migrations/011_world_builder.sql` | New `world_templates`, `project_worlds`, and `world_mission_progress` tables with foreign keys/indexes. |
| `app/api/world-templates/route.ts` | Allowlisted template catalog for authenticated/secure guest creators. |
| `app/api/worlds/create/route.ts` | Validates metadata/template version and creates a private template project. |
| `app/api/projects/[id]/world-missions/route.ts` | Returns and advances authorized mission progress. |
| `app/worlds/new/page.tsx` | Create a World template-picker experience. |
| `components/worlds/*` | Presentational template cards, builder status, and mission panel. |
| `app/projects/new/page.tsx` | Routes “Create a World” into the picker and retains basic blank-project creation. |
| `components/editor/GameEditor.tsx` | Displays draft revision/template status and mounts the optional mission panel using server-provided metadata. |

---

### Task 1: Pure World Template Catalog and Validation

**Files:**
- Create: `lib/worlds/templates.ts`
- Create: `lib/worlds/templateValidation.ts`
- Create: `test/worlds/templates.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces `WorldTemplate`, `WorldTemplateScene`, `WorldTemplateObject`, `WorldMission`, and `WORLD_TEMPLATES`.
- Produces `getWorldTemplate(id: string, version: number): WorldTemplate | null`.
- Produces `validateWorldTemplate(template: WorldTemplate): ValidationIssue[]`.

- [ ] **Step 1: Write failing catalog tests**

Create `test/worlds/templates.test.js` that imports the compiled modules and asserts all five required template IDs exist: `platformer`, `obby`, `racing`, `story`, and `pet`. For each template assert a positive integer version; non-empty title/description/genre/card art; at least one scene; at least one object; at least one character or player-controlled object; at least one mission; unique scene/object/mission IDs; all block types belong to `BLOCK_SPECS`; and every asset reference begins with `/models/` or `/backdrops/`.

Add negative fixtures to assert `validateWorldTemplate` rejects duplicate IDs, a remote `https://` model URL, an unknown block type, an empty scene list, and a budget profile exceeded by a fixture with too many objects.

- [ ] **Step 2: Add the focused script and verify RED**

Add `test:world-templates` to compile `lib/worlds/templates.ts`, `lib/worlds/templateValidation.ts`, and `lib/blockly/definitions.ts` into `test/.build`, then run the new Node test.

Run: `npm run test:world-templates`

Expected: FAIL because the catalog and validation exports do not exist.

- [ ] **Step 3: Implement the approved catalog**

Create exactly five version-1 templates. Use current packaged starter models and only existing supported blocks. Each has one playable scene, a ground/platform, a controllable character, simple success/fun behavior, a genre, and 3–5 child-readable missions. Define conservative budgets in every template: maximum 3 scenes, 30 objects, 160 blocks, 20 clones, 16 MiB approved assets, and 120 script steps per frame. Keep this module import-free except for relative pure imports so bare `tsc` tests can load it.

Implement validation over the complete template graph, recursively checking nested block children and supported local asset paths. `getWorldTemplate` returns an immutable deep copy so callers cannot mutate the global catalog.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:world-templates`

Expected: every catalog and invalid-fixture assertion passes.

- [ ] **Step 5: Commit**

```bash
git add lib/worlds/templates.ts lib/worlds/templateValidation.ts test/worlds/templates.test.js package.json
git commit -m "feat: add World Builder template catalog"
```

---

### Task 2: Durable World Metadata and Transactional Template Creation

**Files:**
- Create: `migrations/011_world_builder.sql`
- Create: `lib/worlds/templateService.ts`
- Create: `app/api/world-templates/route.ts`
- Create: `app/api/worlds/create/route.ts`
- Modify: `app/api/projects/route.ts`
- Create: `test/worlds/template-service.integration.mjs`
- Create: `test/api/world-create-route.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes `WorldTemplate`, `getWorldTemplate`, centralized `resolveActor`, `withTransaction`, moderation, and existing project/scene/object/block schema.
- Produces `createWorldFromTemplate({ actor, templateId, templateVersion, title, description }): Promise<{ projectId; revision; templateId; templateVersion }>`.
- Produces `GET /api/world-templates` and `POST /api/worlds/create` with no asset URLs outside the approved catalog.

- [ ] **Step 1: Write failing migration/service/route tests**

Create integration tests against `gameengine_test` that apply migration 011 and assert:

```js
const created = await createWorldFromTemplate({ actor, templateId: 'platformer', templateVersion: 1, title: 'Sky Steps' });
assert.equal(project.visibility, 'private');
assert.equal(project.is_published, 0);
assert.equal(project.moderation_status, 'draft');
assert.equal(projectWorld.template_id, 'platformer');
assert.equal(sceneCount, template.scenes.length);
assert.equal(objectCount, flattenedTemplateObjectCount(template));
assert.equal(blockCount, flattenedTemplateBlockCount(template));
```

Inject a transaction failure after the first scene/object insertion and assert zero project/project-world/scene/object/block rows remain. Assert an anonymous actor gets 401, an unknown template/version gets 422, unsafe title input gets 422, and a valid actor receives only an allowlisted template DTO from `GET /api/world-templates`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run test:world-template-service && npm run test:world-create-route`

Expected: FAIL because migration, service, and routes do not exist.

- [ ] **Step 3: Add migration 011**

Create `world_templates` with `(template_id, version)` primary key, catalog metadata JSON, active flag, and timestamps. Create `project_worlds` with one row per project, template ID/version, bounded child-safe world metadata, and foreign key to projects; add indexes for template/version. Create `world_mission_progress` with `(project_id, mission_id)` primary key, status enum `not_started|in_progress|completed`, action evidence JSON restricted by service code, and timestamps. Use the repository’s idempotent `information_schema` migration style and do not alter publication tables.

- [ ] **Step 4: Implement service and routes**

Seed/upsert catalog metadata inside the same creation transaction. Insert a private `projects` row, `project_worlds` identity row, all scenes in order, all object rows, and deterministic logic-block rows preserving parent/order structure. Perform title/description moderation before opening the transaction. Use UUIDs generated server-side, reject unsupported template metadata, and return only project/template identifiers plus revision.

Keep `POST /api/projects` as the blank-project route. The world route owns template creation and cannot accept client-provided objects, blocks, model URLs, or arbitrary configuration. Both routes require a non-anonymous resolved actor.

- [ ] **Step 5: Verify GREEN**

Run: `npm run test:world-template-service && npm run test:world-create-route && npm run type-check`

Expected: all transaction, authorization, validation, and DTO assertions pass.

- [ ] **Step 6: Commit**

```bash
git add migrations/011_world_builder.sql lib/worlds/templateService.ts app/api/world-templates/route.ts app/api/worlds/create/route.ts app/api/projects/route.ts test/worlds/template-service.integration.mjs test/api/world-create-route.test.js package.json
git commit -m "feat: create private template worlds"
```

---

### Task 3: Create a World Picker and Private Draft Entry Point

**Files:**
- Create: `app/worlds/new/page.tsx`
- Create: `components/worlds/WorldTemplatePicker.tsx`
- Create: `components/worlds/WorldTemplateCard.tsx`
- Modify: `app/projects/page.tsx`
- Modify: `app/projects/new/page.tsx`
- Modify: `app/page.tsx`
- Modify: `lib/i18n/messages.ts`
- Modify: every locale under `lib/i18n/locales/`
- Create: `test/worlds/template-picker.test.mjs`
- Modify: `test/visual/journey.mjs`

**Interfaces:**
- Consumes `GET /api/world-templates` allowlisted DTOs.
- Calls `POST /api/worlds/create` with `{ templateId, templateVersion, title, description }` only.
- Produces a route to `/editor/:projectId?worldBuilder=1` after creation.

- [ ] **Step 1: Write failing UI and browser tests**

Use server-render tests for card semantics: every required template has a named button, accessible description, genre, mission count, and no external image URL. Extend the browser journey to sign in/create a guest session, open `/worlds/new`, select Platformer, choose a valid title, create, and assert the editor opens with the template’s expected named objects and private draft status.

Test that submit is disabled while no template/title is selected, network errors preserve the chosen template/title, and the blank project page still creates the existing hero-and-ground seed through `/api/projects`.

- [ ] **Step 2: Verify RED**

Run: `npm run test:world-template-picker`

Expected: FAIL because the World Builder route/components do not exist.

- [ ] **Step 3: Implement the picker**

Create a mobile-safe grid of the five catalog cards with local emoji/gradient artwork, title, concise age-appropriate explanation, genre, estimated mission count, and selected state. Fetch catalog DTOs from the server route. Present title and optional description fields after selecting a template, then call the narrow create-world endpoint. Use clear draft-only copy: “Your world starts private. You can test it and keep building.”

Add a primary **Create a World** link on My Games, New Project, and the landing page. Keep **Blank game** available as a secondary path so existing workflows remain usable. Add every new visible English message key to the catalog and all supported locale files with the existing fallback/review status conventions.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:world-template-picker && npm run test:i18n && npm run type-check`

Run the required browser part with a local test database: `npm run test:journey`

Expected: the complete private world creation journey passes and the blank-game regression stays green.

- [ ] **Step 5: Commit**

```bash
git add app/worlds/new/page.tsx components/worlds app/projects/page.tsx app/projects/new/page.tsx app/page.tsx lib/i18n test/worlds/template-picker.test.mjs test/visual/journey.mjs
git commit -m "feat: add Create a World experience"
```

---

### Task 4: Server-Validated Guided Missions and Draft Status

**Files:**
- Create: `lib/worlds/missions.ts`
- Create: `lib/worlds/missionService.ts`
- Create: `app/api/projects/[id]/world-missions/route.ts`
- Create: `components/worlds/WorldMissionPanel.tsx`
- Create: `components/worlds/WorldDraftStatus.tsx`
- Modify: `app/editor/[id]/page.tsx`
- Modify: `components/editor/GameEditor.tsx`
- Modify: `components/editor/ObjectsPanel.tsx`
- Modify: `components/editor/BlockEditor.tsx`
- Modify: `components/player/GamePlayer.tsx`
- Create: `test/worlds/missions.test.js`
- Create: `test/worlds/mission-service.integration.mjs`
- Modify: `test/visual/journey.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `WorldMissionAction` discriminated union: `object_present`, `block_present`, `play_started`, `outcome_reached`.
- Produces `recordWorldMissionAction({ actor, projectId, action }): Promise<MissionProgress[]>`.
- Consumes existing project ownership access checks and template missions from `project_worlds` template identity.

- [ ] **Step 1: Write failing mission tests**

Create pure tests showing that a mission completes only when its exact predicate is met, never merely when a UI panel is opened. Include positive and negative cases for a required object, a recursive Blockly block presence check, a Play start tied to the current project, an outcome event, unknown action payload, and a mission belonging to a different template.

Create MySQL integration tests that assert an owner can read/advance progress, a stranger receives 404/403 without learning private mission state, re-sending a completed action is idempotent, and project/world identity mismatch makes no row changes.

- [ ] **Step 2: Verify RED**

Run: `npm run test:world-missions && npm run test:world-mission-service`

Expected: FAIL because the action schema, service, and route do not exist.

- [ ] **Step 3: Implement pure mission rules and service**

Define each mission as a deterministic predicate over a server-verified action. On object/block actions, the server loads the authorized project graph and validates the referenced object/block against stored rows rather than trusting client evidence. On Play/outcome actions, bind the event to the authenticated actor, project ID, and current revision-pinned player session. Store only bounded enum/ID/count evidence, not block contents or child text.

- [ ] **Step 4: Wire the editor and player**

Server-render the project’s world metadata and current mission progress on the editor page. The optional mission panel shows current and completed steps, allows dismissal, and stays outside the authored project state. Emit candidate actions when the editor observes object creation/block workspace persistence and when the player starts/reports an outcome; the API remains authoritative. Display a compact status badge such as `Private draft · Platformer · Revision 12`, sourced from the server revision and `project_worlds`, with no publish control.

- [ ] **Step 5: Verify GREEN**

Run: `npm run test:world-missions && npm run test:world-mission-service && npm run test:runtime && npm run type-check`

Run: `npm run test:journey`

Expected: a World Builder project survives reload, has truthful revision/draft status, and completes a mission only after real project/player activity.

- [ ] **Step 6: Commit**

```bash
git add lib/worlds/missions.ts lib/worlds/missionService.ts app/api/projects/[id]/world-missions/route.ts components/worlds/WorldMissionPanel.tsx components/worlds/WorldDraftStatus.tsx app/editor/[id]/page.tsx components/editor/GameEditor.tsx components/editor/ObjectsPanel.tsx components/editor/BlockEditor.tsx components/player/GamePlayer.tsx test/worlds package.json test/visual/journey.mjs
git commit -m "feat: guide World Builder creators"
```

---

### Task 5: Phase-1 Guardrails, Regression Proof, and Release Readiness

**Files:**
- Modify: `lib/auth/publicProjects.ts`
- Modify: `app/explore/page.tsx`
- Modify: `components/editor/ShareDialog.tsx`
- Create: `test/worlds/private-world-boundary.test.js`
- Modify: `test/api/authorization-matrix.mjs`
- Modify: `README.md`
- Modify: `docs/superpowers/RESUME.md`

**Interfaces:**
- Consumes private world metadata and existing publication-state helpers.
- Produces proof that Phase 1 worlds remain private and that no World Builder UI can submit or publicize them.

- [ ] **Step 1: Write failing phase-boundary tests**

Assert that a newly created template world is absent from `listPublicProjects`, `/explore`, and an anonymous public-play request; that it is visible/editable only to the owner; that ShareDialog reports private-draft status and has no route to make the project public while `new_publication` is disabled; and that a direct attempt to set `visibility: public` or `is_published: true` through either creation endpoint is rejected.

Add a regression to the authorization matrix for owner, secure guest owner, authenticated stranger, and anonymous visitor covering template list/create, mission read/write, editor, play, and Explore visibility.

- [ ] **Step 2: Verify RED**

Run: `npm run test:world-private-boundary && npm run test:authorization-matrix`

Expected: FAIL until private-template-world handling is explicit in public discovery/share surfaces.

- [ ] **Step 3: Implement the narrow guardrails**

Keep public discovery filtering release-state based and add explicit private-world copy to the share UI. Ensure neither `POST /api/worlds/create` nor `POST /api/projects` accepts publication fields. Do not create an alternate publish route or silently relax existing consent/moderation checks. Update README and RESUME with a truthful statement: World Builder is private-phase only; public release is blocked pending the later candidate, asset-quarantine, approval, and reviewer phases.

- [ ] **Step 4: Verify Phase 1 end-to-end**

Run: `npm run test:world-templates && npm run test:world-template-service && npm run test:world-create-route && npm run test:world-template-picker && npm run test:world-missions && npm run test:world-mission-service && npm run test:world-private-boundary`

Run: `npm run test:all && npm run type-check && npm run lint && npm run build`

Run with the local test database and a real local server: `npm run smoke && npm run a11y && npm run test:journey`

Expected: all commands exit 0, with a complete Create a World → edit → guided mission → Play → reload journey and no public exposure of the private world.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/publicProjects.ts app/explore/page.tsx components/editor/ShareDialog.tsx test/worlds/private-world-boundary.test.js test/api/authorization-matrix.mjs README.md docs/superpowers/RESUME.md
git commit -m "test: prove World Builder private-phase boundaries"
```

---

## Post-Plan Deployment Gate

After all five tasks are implemented, independently reviewed, committed, and the Phase-1 verification commands are green, request explicit deployment approval. Before `./deploy.sh`, confirm the current branch/commit is the intended one and `git status --short` is empty. Do not deploy unfinished Phase 2 code or worktree artifacts.
