# 3D Scratch Core Creation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first, responsive 3D block-programming creation loop in which children ages 6–12 can build, program, save, reopen, export, import, and play an obstacle-course game.

**Architecture:** Replace the editor's temporary logic state and the player's component-local interpreter with one versioned `ProjectDocument`, a command-based Zustand store, Blockly serialization, a typed compiler, and a deterministic scheduler. IndexedDB is the default repository; both in-editor preview and standalone play consume the same runtime interfaces, while existing MySQL projects enter through an explicit legacy adapter.

**Tech Stack:** Next.js 14, React 18, TypeScript, React Three Fiber/Three.js, Zustand, Zod, Blockly, IndexedDB via `idb`, Vitest, Testing Library, Playwright, and axe-core.

## Global Constraints

- Primary audience is children ages 6–12.
- Blockly must provide true drag-and-snap blocks, nested control flow, keyboard access, undo/redo, and serialization.
- Local project creation, saving, reopening, playing, import, and export must require no account, MySQL server, Supabase project, or `.env` file.
- Desktop uses the full studio, tablet uses collapsible trays, and phone uses focused Stage, Blocks, Objects, and Play tabs with identical project capabilities.
- Touch targets are at least 44 CSS pixels.
- Blocks show icons and visible text; optional read-aloud stays on-device through browser speech synthesis.
- Project execution interprets validated typed instructions and never evaluates generated JavaScript.
- Runtime changes never mutate authored project state; Stop and Reset restore the authored state.
- Imported documents are untrusted input and must be validated before replacing any open state.
- Public galleries, social features, real-time collaboration, multiplayer, cloud sync, classroom tools, advanced animation timelines, AI model generation, and extension marketplaces remain out of scope.
- The current directory is not a Git repository. Keep the commit checkpoints below, but execute them only after Git metadata is restored or the work is moved into a Git checkout.

## Planned File Structure

### Project model and storage

- `lib/project/schema.ts` — Zod schema and inferred canonical types.
- `lib/project/defaults.ts` — blank and obstacle-course document factories.
- `lib/project/migrations.ts` — ordered schema migrations.
- `lib/project/legacy.ts` — conversion from current MySQL-shaped project data.
- `lib/project/repository.ts` — repository interface and typed storage errors.
- `lib/project/indexedDbRepository.ts` — IndexedDB implementation and recovery records.
- `lib/project/portableFile.ts` — validated import/export and internal-ID remapping.
- `stores/projectStore.ts` — authored document commands, selection, dirty state, and grouped undo/redo.

### Blockly and runtime

- `lib/blocks/catalog.ts` — block metadata, progressive toolbox levels, labels, icons, and help text.
- `lib/blocks/definitions.ts` — Blockly JSON block definitions and registration.
- `lib/blocks/workspace.ts` — workspace load/save helpers and object-reference dropdowns.
- `components/editor/BlockWorkspace.tsx` — lifecycle-safe Blockly React integration.
- `components/editor/BlockHelp.tsx` — accessible help and speech controls.
- `lib/runtime/instructions.ts` — typed runtime intermediate representation.
- `lib/runtime/compiler.ts` — Blockly JSON graph validation and compilation.
- `lib/runtime/scheduler.ts` — task scheduling, waits, broadcasts, cancellation, and budgets.
- `lib/runtime/world.ts` — runtime world interface independent of React/Three.js.
- `lib/runtime/threeWorld.ts` — Three.js/physics/audio implementation.
- `lib/runtime/createRuntime.ts` — shared runtime construction for editor and player.

### Editor and product UI

- `components/editor/EditorShell.tsx` — responsive mode and panel layout.
- `components/editor/EditorTopBar.tsx` — project title, save state, undo/redo, Play/Stop/Reset.
- `components/editor/SceneWorkspace.tsx` — scene canvas plus transform interactions.
- `components/editor/ObjectLibrary.tsx` — milestone object palette.
- `components/editor/RuntimeDiagnostics.tsx` — block-linked compilation/runtime errors.
- `components/editor/TouchControls.tsx` — authorable screen-control input.
- `components/editor/ImportExportMenu.tsx` — safe file operations and recovery actions.
- `components/projects/LocalProjects.tsx` — recent local projects and starter creation.
- `components/onboarding/CoachMarks.tsx` — short first-run guidance.
- `app/local/page.tsx` — local project home.
- `app/local/editor/[id]/page.tsx` — local-first editor entry point.
- `app/local/play/[id]/page.tsx` — standalone local play entry point.
- `components/player/RuntimePlayer.tsx` — shared-runtime player UI.

### Tests

- `vitest.config.ts`, `test/setup.ts`, `test/fixtures/*` — unit/component test infrastructure.
- `test/project/*`, `test/blocks/*`, `test/runtime/*`, `test/editor/*` — focused automated tests.
- `playwright.config.ts`, `test/e2e/core-creation-loop.spec.ts`, `test/e2e/accessibility.spec.ts` — browser acceptance checks.

---

### Task 1: Establish Test Infrastructure and the Canonical Project Schema

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `test/setup.ts`
- Create: `lib/project/schema.ts`
- Create: `lib/project/defaults.ts`
- Test: `test/project/schema.test.ts`
- Test: `test/fixtures/obstacle-course.ts`

**Interfaces:**
- Produces: `ProjectDocumentSchema`, `ProjectDocument`, `SceneDocument`, `GameObjectDocument`, `createBlankProject(title)`, and `createObstacleCourseProject(title)`.
- Canonical schema version: literal `1`.

- [ ] **Step 1: Install the unit-test and model dependencies**

Run:

```bash
npm install blockly idb
npm install --save-dev vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb
```

Expected: `package.json` records `blockly` and `idb` under dependencies and the test tools under devDependencies; the lockfile updates without peer-resolution errors.

- [ ] **Step 2: Add deterministic test scripts and configuration**

Add these scripts to `package.json`:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:unit": "vitest run test/project test/blocks test/runtime test/editor",
  "test:e2e": "playwright test"
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    restoreMocks: true,
  },
});
```

Create `test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
```

- [ ] **Step 3: Write failing schema and starter tests**

Create `test/project/schema.test.ts` with these cases:

```ts
import { describe, expect, it } from 'vitest';
import { ProjectDocumentSchema } from '@/lib/project/schema';
import { createBlankProject, createObstacleCourseProject } from '@/lib/project/defaults';

describe('ProjectDocument', () => {
  it('accepts a blank version-1 document', () => {
    expect(ProjectDocumentSchema.parse(createBlankProject('My World')).schemaVersion).toBe(1);
  });

  it('rejects duplicate object ids', () => {
    const project = createObstacleCourseProject('Course');
    project.scenes[0].objects[1].id = project.scenes[0].objects[0].id;
    expect(() => ProjectDocumentSchema.parse(project)).toThrow(/unique/i);
  });

  it('creates a playable obstacle starter', () => {
    const project = createObstacleCourseProject('Course');
    expect(project.scenes[0].objects.map((object) => object.kind)).toEqual(
      expect.arrayContaining(['character', 'platform', 'collectible', 'hazard', 'goal']),
    );
  });
});
```

- [ ] **Step 4: Run the tests and verify the missing-module failure**

Run: `npm test -- test/project/schema.test.ts`

Expected: FAIL because `@/lib/project/schema` and `defaults` do not exist.

- [ ] **Step 5: Implement the canonical schema and starter factories**

Define these exact core shapes in `lib/project/schema.ts` and refine uniqueness per scene:

```ts
import { z } from 'zod';

export const Vec3Schema = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
export const TransformSchema = z.object({
  position: Vec3Schema,
  rotation: Vec3Schema,
  scale: Vec3Schema.refine((v) => v.x > 0 && v.y > 0 && v.z > 0, 'Scale must be positive'),
});

export const GameObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  kind: z.enum(['character', 'platform', 'collectible', 'hazard', 'goal', 'shape', 'sound']),
  transform: TransformSchema,
  appearance: z.object({ shape: z.string(), color: z.string(), modelUrl: z.string().optional(), visible: z.boolean() }),
  physics: z.object({ enabled: z.boolean(), body: z.enum(['static', 'dynamic']), mass: z.number().nonnegative(), gravityScale: z.number() }),
  blocks: z.record(z.unknown()),
  tags: z.array(z.string()),
});

export const ProjectDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  scenes: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), backgroundColor: z.string(), gravity: Vec3Schema,
    objects: z.array(GameObjectSchema),
  }).superRefine((scene, ctx) => {
    const ids = scene.objects.map((object) => object.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Object ids must be unique' });
  })).min(1),
  variables: z.record(z.union([z.number(), z.string(), z.boolean()])),
  messages: z.array(z.object({ id: z.string(), name: z.string().min(1) })),
  assets: z.array(z.object({ id: z.string(), name: z.string(), kind: z.enum(['model', 'audio', 'image']), source: z.string() })),
  settings: z.object({ toolboxLevel: z.enum(['starter', 'all']), readAloud: z.boolean() }),
});

export type ProjectDocument = z.infer<typeof ProjectDocumentSchema>;
export type SceneDocument = ProjectDocument['scenes'][number];
export type GameObjectDocument = SceneDocument['objects'][number];
```

Factories must use `crypto.randomUUID()`, ISO timestamps, stable built-in asset identifiers, and Blockly-compatible empty workspace state `{ blocks: { languageVersion: 0, blocks: [] } }`.

- [ ] **Step 6: Run schema tests and type-check**

Run: `npm test -- test/project/schema.test.ts && npm run type-check`

Expected: all schema tests PASS and TypeScript exits 0.

- [ ] **Step 7: Commit checkpoint when Git is available**

```bash
git add package.json package-lock.json vitest.config.ts test/setup.ts test/project/schema.test.ts test/fixtures/obstacle-course.ts lib/project/schema.ts lib/project/defaults.ts
git commit -m "feat: add canonical local project model"
```

### Task 2: Add Schema Migration and Legacy MySQL Conversion

**Files:**
- Create: `lib/project/migrations.ts`
- Create: `lib/project/legacy.ts`
- Test: `test/project/migrations.test.ts`
- Test: `test/project/legacy.test.ts`

**Interfaces:**
- Consumes: `ProjectDocumentSchema`, `ProjectDocument`.
- Produces: `migrateProjectDocument(input: unknown): ProjectDocument` and `convertLegacyProject(input: LegacyProject): ProjectDocument`.

- [ ] **Step 1: Write migration and legacy-conversion failures first**

```ts
import { expect, it } from 'vitest';
import { migrateProjectDocument } from '@/lib/project/migrations';

it('rejects future schema versions without changing input', () => {
  const source = { schemaVersion: 99, title: 'Future' };
  expect(() => migrateProjectDocument(source)).toThrow(/newer version/i);
  expect(source).toEqual({ schemaVersion: 99, title: 'Future' });
});
```

```ts
import { expect, it } from 'vitest';
import { convertLegacyProject } from '@/lib/project/legacy';

it('preserves object ids and converts JSON properties', () => {
  const result = convertLegacyProject({
    id: 'p1', title: 'Legacy', scenes: [{ id: 's1', name: 'Main', game_objects: [{
      id: 'o1', name: 'Hero', type: 'character', position_x: 1, position_y: 2, position_z: 3,
      properties: JSON.stringify({ shape: 'box', color: '#ff0000' }), logic_blocks: [],
    }] }],
  });
  expect(result.scenes[0].objects[0]).toMatchObject({ id: 'o1', transform: { position: { x: 1, y: 2, z: 3 } } });
});
```

- [ ] **Step 2: Verify both test files fail**

Run: `npm test -- test/project/migrations.test.ts test/project/legacy.test.ts`

Expected: FAIL with missing migration and legacy modules.

- [ ] **Step 3: Implement immutable ordered migration and legacy conversion**

`migrateProjectDocument` must deep-clone input, reject absent/non-integer/future versions, apply a `Record<number, (value: unknown) => unknown>` migration map until version 1, and finish with `ProjectDocumentSchema.parse`.

`LegacyProject` must explicitly model the fields consumed from `app/editor/[id]/page.tsx`; parse `properties` and `block_data` inside guarded helpers, default invalid JSON, preserve scene/object IDs, and store unconvertible legacy blocks in `blocks.meta.legacyBlocks` for visibility instead of executing them.

- [ ] **Step 4: Run focused and full project-model tests**

Run: `npm test -- test/project && npm run type-check`

Expected: PASS; no mutation of migration inputs and no `any` escapes in exported interfaces.

- [ ] **Step 5: Commit checkpoint when Git is available**

```bash
git add lib/project/migrations.ts lib/project/legacy.ts test/project/migrations.test.ts test/project/legacy.test.ts
git commit -m "feat: migrate legacy projects into local schema"
```

### Task 3: Implement IndexedDB Autosave, Recovery, Import, and Export

**Files:**
- Create: `lib/project/repository.ts`
- Create: `lib/project/indexedDbRepository.ts`
- Create: `lib/project/portableFile.ts`
- Create: `test/support/memoryProjectRepository.ts`
- Test: `test/project/repository.test.ts`
- Test: `test/project/portableFile.test.ts`

**Interfaces:**
- Produces: `ProjectSummary = Pick<ProjectDocument, 'id' | 'title' | 'updatedAt'>`.
- Produces: `ProjectRepository` with `list(): Promise<ProjectSummary[]>`, `get(id: string): Promise<ProjectDocument | null>`, `save(document: ProjectDocument): Promise<void>`, `remove(id: string): Promise<void>`, `getRecovery(id: string): Promise<ProjectDocument | null>`, `saveRecovery(document: ProjectDocument): Promise<void>`, and `clearRecovery(id: string): Promise<void>`.
- Produces: `exportProject(document): Blob` and `importProject(file: Blob, limits?: ImportLimits): Promise<ProjectDocument>`.
- Produces for tests: `createMemoryProjectRepository(): ProjectRepository` in `test/support/memoryProjectRepository.ts`.

- [ ] **Step 1: Write failing repository round-trip and recovery tests**

```ts
it('saves and returns an independent document copy', async () => {
  const repository = createIndexedDbProjectRepository(`test-${crypto.randomUUID()}`);
  const original = createBlankProject('Saved');
  await repository.save(original);
  const loaded = await repository.get(original.id);
  loaded!.title = 'Changed in memory';
  expect((await repository.get(original.id))!.title).toBe('Saved');
});

it('keeps recovery separate from the last clean save', async () => {
  const repository = createIndexedDbProjectRepository(`test-${crypto.randomUUID()}`);
  const project = createBlankProject('Clean');
  await repository.save(project);
  await repository.saveRecovery({ ...project, title: 'Recovered' });
  expect((await repository.get(project.id))!.title).toBe('Clean');
  expect((await repository.getRecovery(project.id))!.title).toBe('Recovered');
});
```

- [ ] **Step 2: Write failing safe import/export tests**

Cover exact round-trip equality, malformed JSON, future schema versions, a default 10 MB file limit, and ID remapping:

```ts
it('imports as a copy and keeps internal object references valid', async () => {
  const source = createObstacleCourseProject('Course');
  const imported = await importProject(exportProject(source));
  expect(imported.id).not.toBe(source.id);
  expect(imported.scenes[0].objects).toHaveLength(source.scenes[0].objects.length);
  expect(ProjectDocumentSchema.parse(imported)).toEqual(imported);
});
```

- [ ] **Step 3: Run tests and verify missing implementations fail**

Run: `npm test -- test/project/repository.test.ts test/project/portableFile.test.ts`

Expected: FAIL on missing exported functions.

- [ ] **Step 4: Implement the repository and portable-file boundary**

Use `openDB(name, 1, { upgrade })` with `projects`, `recent`, and `recovery` stores. Parse every read through `migrateProjectDocument`; clone values with `structuredClone`; expose typed `ProjectStorageError` codes `unavailable`, `quota`, `invalid`, and `unknown`.

Export JSON with MIME `application/vnd.lingcode.project+json`. Import must check `Blob.size` before `text()`, parse JSON once, migrate/validate, generate a new project ID, update timestamps, and remap project-level IDs through a single `Map<string,string>` used by object references in Blockly fields.

- [ ] **Step 5: Run persistence tests and type-check**

Run: `npm test -- test/project && npm run type-check`

Expected: PASS, including malformed and oversized import cases.

- [ ] **Step 6: Commit checkpoint when Git is available**

```bash
git add lib/project/repository.ts lib/project/indexedDbRepository.ts lib/project/portableFile.ts test/project/repository.test.ts test/project/portableFile.test.ts
git commit -m "feat: add local project persistence and portability"
```

### Task 4: Create the Authored Project Store and Grouped Undo/Redo

**Files:**
- Create: `stores/projectStore.ts`
- Create: `lib/project/commands.ts`
- Test: `test/project/store.test.ts`

**Interfaces:**
- Consumes: `ProjectDocument`, `ProjectRepository`.
- Produces: `createProjectStore(repository)` and typed commands `addObject`, `updateObject`, `removeObject`, `replaceBlocks`, `setVariable`, `undo`, `redo`, `flushSave`.

- [ ] **Step 1: Write failing state, history, and autosave tests**

```ts
it('groups a drag into one undo entry and persists authored state', async () => {
  const repository = createMemoryProjectRepository();
  const store = createProjectStore(repository);
  const project = createObstacleCourseProject('Course');
  store.getState().load(project);
  const hero = project.scenes[0].objects.find((object) => object.kind === 'character')!;
  store.getState().beginGroup('move-object');
  store.getState().updateObject(hero.id, { transform: { ...hero.transform, position: { x: 1, y: 2, z: 3 } } });
  store.getState().updateObject(hero.id, { transform: { ...hero.transform, position: { x: 4, y: 2, z: 3 } } });
  store.getState().endGroup();
  store.getState().undo();
  expect(store.getState().document!.scenes[0].objects.find((o) => o.id === hero.id)!.transform.position.x).toBe(hero.transform.position.x);
  await store.getState().flushSave();
  expect(await repository.get(project.id)).toEqual(store.getState().document);
});
```

- [ ] **Step 2: Verify the store test fails**

Run: `npm test -- test/project/store.test.ts`

Expected: FAIL because the store and memory test repository do not exist.

- [ ] **Step 3: Implement immutable commands and save lifecycle**

Use Zustand's vanilla `createStore`. Store fields must include `document`, `selection`, `past`, `future`, `group`, `saveStatus: 'saved' | 'saving' | 'unsaved' | 'error'`, and `saveError`. Commands operate by stable IDs and re-parse the final document in development/tests. Debounce clean saves by 500 ms, write recovery on every authored command, and clear recovery only after a clean save succeeds.

- [ ] **Step 4: Run store tests with fake timers and type-check**

Run: `npm test -- test/project/store.test.ts && npm run type-check`

Expected: PASS for grouped history, selection removal, redo clearing, autosave status, recovery writes, and failed-save `error` status.

- [ ] **Step 5: Commit checkpoint when Git is available**

```bash
git add stores/projectStore.ts lib/project/commands.ts test/project/store.test.ts
git commit -m "feat: add command-based project editor store"
```

### Task 5: Add the Progressive Accessible Blockly Workspace

**Files:**
- Create: `lib/blocks/catalog.ts`
- Create: `lib/blocks/definitions.ts`
- Create: `lib/blocks/workspace.ts`
- Create: `components/editor/BlockWorkspace.tsx`
- Create: `components/editor/BlockHelp.tsx`
- Test: `test/blocks/catalog.test.ts`
- Test: `test/editor/BlockWorkspace.test.tsx`

**Interfaces:**
- Consumes: `GameObjectDocument['blocks']`, object IDs/names, message IDs/names, and `replaceBlocks(objectId, state)`.
- Produces: `registerLingBlocks()`, `buildToolbox(level)`, `loadWorkspaceState(workspace, state)`, and `saveWorkspaceState(workspace)`.

- [ ] **Step 1: Write failing toolbox metadata tests**

```ts
it('keeps advanced blocks out of starter mode but always exposes Show all', () => {
  const starter = buildToolbox('starter');
  expect(toolboxBlockTypes(starter)).toContain('ling_when_play');
  expect(toolboxBlockTypes(starter)).not.toContain('ling_apply_impulse');
  expect(starter).toMatchObject({ kind: 'categoryToolbox' });
});

it.each(BLOCK_CATALOG)('$type has icon, text, and spoken help', (block) => {
  expect(block.icon).toBeTruthy();
  expect(block.label).toBeTruthy();
  expect(block.help.spoken).toBeTruthy();
});
```

- [ ] **Step 2: Write the failing React lifecycle test**

Render `BlockWorkspace` with a serialized `ling_when_play` stack, rerender with a different object ID, and assert the first workspace listener is removed and the second object's state is loaded. Mock `Blockly.inject`, `serialization.workspaces.load/save`, and `workspace.dispose` explicitly.

- [ ] **Step 3: Verify the focused tests fail**

Run: `npm test -- test/blocks/catalog.test.ts test/editor/BlockWorkspace.test.tsx`

Expected: FAIL because catalog, registration, helpers, and component are absent.

- [ ] **Step 4: Implement milestone block definitions and toolbox levels**

Define every spec block under stable `ling_` type names. Each catalog entry must include:

```ts
export interface BlockCatalogEntry {
  type: `ling_${string}`;
  category: 'events' | 'motion' | 'looks' | 'sound' | 'control' | 'sensing' | 'operators' | 'variables' | 'physics';
  level: 'starter' | 'all';
  icon: string;
  label: string;
  help: { short: string; example: string; spoken: string };
  definition: Record<string, unknown>;
}
```

Object/message dropdown fields must store stable IDs. Missing IDs render `(missing object)` and retain the unresolved ID. Register blocks once per browser process.

- [ ] **Step 5: Implement the React Blockly boundary and read-aloud help**

`BlockWorkspace` owns exactly one Blockly workspace per mounted selected object, loads before attaching its change listener, debounces `replaceBlocks` by 150 ms, calls `Blockly.svgResize`, and disposes workspace/listeners on unmount. `BlockHelp` calls `speechSynthesis.cancel()` before `speechSynthesis.speak(new SpeechSynthesisUtterance(spoken))` and exposes a labeled Stop Reading button.

- [ ] **Step 6: Run Blockly/component tests and type-check**

Run: `npm test -- test/blocks test/editor/BlockWorkspace.test.tsx && npm run type-check`

Expected: PASS with no duplicate listener calls and no workspace state lost on selection change.

- [ ] **Step 7: Commit checkpoint when Git is available**

```bash
git add lib/blocks components/editor/BlockWorkspace.tsx components/editor/BlockHelp.tsx test/blocks test/editor/BlockWorkspace.test.tsx
git commit -m "feat: add accessible progressive Blockly editor"
```

### Task 6: Compile Blockly State into Safe Typed Instructions

**Files:**
- Create: `lib/runtime/instructions.ts`
- Create: `lib/runtime/compiler.ts`
- Test: `test/runtime/compiler.test.ts`

**Interfaces:**
- Consumes: canonical Blockly serialization and `ProjectDocument` reference tables.
- Produces: `Diagnostic = { severity: 'warning' | 'error'; code: string; message: string; objectId: string; blockId: string }`.
- Produces: `RuntimeEventMatcher = { type: 'play' } | { type: 'key'; code: string } | { type: 'control'; controlId: string } | { type: 'click'; objectId: string } | { type: 'collisionEnter'; objectId: string; targetIdOrTag: string } | { type: 'message'; messageId: string }`.
- Produces: `CompiledScript = { id: string; sceneId: string; objectId: string; event: RuntimeEventMatcher; instructions: RuntimeInstruction[] }`.
- Produces: `CompileResult = { scripts: CompiledScript[]; diagnostics: Diagnostic[] }` and `compileProject(project: ProjectDocument): CompileResult`.

- [ ] **Step 1: Define failing compiler tests for valid and invalid graphs**

```ts
it('compiles an event, repeat, movement, and score change', () => {
  const result = compileProject(projectWithBlocks([
    block('ling_when_play', {}, statement('DO', block('ling_repeat', { TIMES: 3 },
      statement('DO', chain(block('ling_move', { STEPS: 2 }), block('ling_change_variable', { VARIABLE_ID: 'score', BY: 1 }))))))),
  ]));
  expect(result.diagnostics).toEqual([]);
  expect(result.scripts[0].instructions).toMatchObject([{ op: 'repeat', times: 3 }]);
});

it('reports a deleted object reference against the exact block id', () => {
  const result = compileProject(projectWithTarget('missing-object'));
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: 'error', blockId: 'go-block', code: 'missing_object' }));
});
```

- [ ] **Step 2: Verify compiler tests fail**

Run: `npm test -- test/runtime/compiler.test.ts`

Expected: FAIL on missing compiler and instruction modules.

- [ ] **Step 3: Implement the discriminated instruction union**

Include exact instruction families for movement, transform, looks, sound, wait, repeat, forever, if, repeat-until, variables, broadcast, physics, win/lose, and stop. Expressions form a separate `RuntimeExpression` union for literals, variables, arithmetic, booleans, comparisons, random, text join, touching, distance, key/control state, and grounded state.

```ts
export type RuntimeInstruction =
  | { op: 'move'; objectId: string; amount: RuntimeExpression }
  | { op: 'changeAxis'; objectId: string; axis: 'x' | 'y' | 'z'; amount: RuntimeExpression }
  | { op: 'setAxis'; objectId: string; axis: 'x' | 'y' | 'z'; value: RuntimeExpression }
  | { op: 'goTo'; objectId: string; target: { kind: 'object'; objectId: string } | { kind: 'position'; x: RuntimeExpression; y: RuntimeExpression; z: RuntimeExpression } }
  | { op: 'turn'; objectId: string; axis: 'yaw' | 'pitch' | 'roll'; degrees: RuntimeExpression }
  | { op: 'pointToward'; objectId: string; targetId: string }
  | { op: 'jump'; objectId: string; strength: RuntimeExpression }
  | { op: 'glide'; objectId: string; seconds: RuntimeExpression; x: RuntimeExpression; y: RuntimeExpression; z: RuntimeExpression }
  | { op: 'setVisible'; objectId: string; visible: boolean }
  | { op: 'setColor'; objectId: string; color: RuntimeExpression }
  | { op: 'setSize'; objectId: string; value: RuntimeExpression; relative: boolean }
  | { op: 'say'; objectId: string; text: RuntimeExpression; seconds: RuntimeExpression }
  | { op: 'setAnimation'; objectId: string; state: RuntimeExpression }
  | { op: 'setCameraTarget'; objectId: string | null }
  | { op: 'playSound'; soundId: string; wait: boolean }
  | { op: 'stopSound'; soundId: string | 'all' }
  | { op: 'setVolume'; value: RuntimeExpression }
  | { op: 'wait'; seconds: RuntimeExpression }
  | { op: 'repeat'; times: RuntimeExpression; body: RuntimeInstruction[] }
  | { op: 'forever'; body: RuntimeInstruction[] }
  | { op: 'if'; condition: RuntimeExpression; then: RuntimeInstruction[]; otherwise: RuntimeInstruction[] }
  | { op: 'repeatUntil'; condition: RuntimeExpression; body: RuntimeInstruction[] }
  | { op: 'broadcast'; messageId: string; wait: boolean }
  | { op: 'setVariable'; variableId: string; value: RuntimeExpression }
  | { op: 'changeVariable'; variableId: string; amount: RuntimeExpression }
  | { op: 'setVariableVisible'; variableId: string; visible: boolean }
  | { op: 'setPhysicsEnabled'; objectId: string; enabled: boolean }
  | { op: 'setGravityScale'; objectId: string; value: RuntimeExpression }
  | { op: 'setVelocity'; objectId: string; axis: 'x' | 'y' | 'z'; value: RuntimeExpression }
  | { op: 'applyImpulse'; objectId: string; x: RuntimeExpression; y: RuntimeExpression; z: RuntimeExpression }
  | { op: 'setBodyType'; objectId: string; body: 'static' | 'dynamic' }
  | { op: 'win' }
  | { op: 'lose' }
  | { op: 'stop'; scope: 'script' | 'all' };
```

Define `RuntimeExpression` with explicit variants `literal`, `variable`, `arithmetic`, `boolean`, `compare`, `random`, `join`, `touching`, `distance`, `inputPressed`, and `grounded`; each nested operand is another `RuntimeExpression` and every sensing variant stores stable object/control IDs.

- [ ] **Step 4: Implement graph validation and compilation**

Compile only top-level event hats, preserve stable scene/object/script order, detect cycles and excessive nesting, cap a script at 2,000 blocks, resolve object/message/variable IDs, and return all discoverable diagnostics instead of throwing on the first invalid block. Never call Blockly's JavaScript generator or `eval`.

- [ ] **Step 5: Run compiler tests and type-check**

Run: `npm test -- test/runtime/compiler.test.ts && npm run type-check`

Expected: PASS for every catalog block, nested controls, detached stacks, bad fields, missing references, graph cycles, and block limits.

- [ ] **Step 6: Commit checkpoint when Git is available**

```bash
git add lib/runtime/instructions.ts lib/runtime/compiler.ts test/runtime/compiler.test.ts
git commit -m "feat: compile blocks into safe runtime instructions"
```

### Task 7: Build the Deterministic Event Scheduler

**Files:**
- Create: `lib/runtime/world.ts`
- Create: `lib/runtime/scheduler.ts`
- Test: `test/runtime/scheduler.test.ts`

**Interfaces:**
- Consumes: `CompiledScript[]` and `RuntimeWorld`.
- Produces: `RuntimeWorld` with `evaluate(expression, task)`, `apply(instruction, task)`, `beginGlide(instruction, task)`, `advanceGlide(handle, dt)`, `playSound(soundId, wait)`, `isSoundComplete(handle)`, `getContactPairs()`, `stopAllSounds()`, `snapshot()`, and `reset()`; every method is synchronous except sound handles, whose completion is polled by the scheduler.
- Produces: `RuntimeEvent = { type: 'play' | 'key' | 'control' | 'click' | 'collisionEnter' | 'message'; targetId?: string; value?: string }`.
- Produces: `SchedulerSnapshot = { running: boolean; tasks: Array<{ id: string; scriptId: string; blockId: string | null }>; diagnostics: Diagnostic[] }`.
- Produces: `createScheduler({ scripts, world, limits })` with `start(): void`, `dispatch(event: RuntimeEvent): void`, `step(dt: number): void`, `stop(): void`, `snapshot(): SchedulerSnapshot`, and `subscribe(listener: (snapshot: SchedulerSnapshot) => void): () => void`.

- [ ] **Step 1: Write failing concurrency and cancellation tests with a fake world**

```ts
it('lets waiting scripts yield while another script continues', () => {
  const world = createFakeWorld();
  const scheduler = createScheduler({ scripts: concurrentFixture(), world, limits: testLimits });
  scheduler.start();
  scheduler.step(0.1);
  expect(world.calls).toContainEqual(['setVariable', 'fast', 1]);
  expect(world.calls).not.toContainEqual(['setVariable', 'slowFinished', true]);
  scheduler.step(1);
  expect(world.calls).toContainEqual(['setVariable', 'slowFinished', true]);
});

it('stop cancels tasks and audio and returns an empty snapshot', () => {
  const world = createFakeWorld();
  const scheduler = createScheduler({ scripts: foreverSoundFixture(), world, limits: testLimits });
  scheduler.start(); scheduler.step(0.016); scheduler.stop();
  expect(world.stopAllSounds).toHaveBeenCalledOnce();
  expect(scheduler.snapshot().tasks).toEqual([]);
});
```

- [ ] **Step 2: Add failing broadcast, collision-enter, and budget tests**

Assert stable receiver order, broadcast-and-wait completion, one collision event per contact entry, continuous `touching` reporter behavior, and `budget_exceeded` diagnostics tied to the current block ID.

- [ ] **Step 3: Verify scheduler tests fail**

Run: `npm test -- test/runtime/scheduler.test.ts`

Expected: FAIL because `RuntimeWorld` and scheduler are absent.

- [ ] **Step 4: Implement cooperative tasks and a fixed-step event queue**

Use explicit task frames for sequence, repeat, forever, conditional, and repeat-until instructions. Never recurse through unbounded user block graphs. Default limits:

```ts
export const DEFAULT_RUNTIME_LIMITS = {
  fixedStepSeconds: 1 / 60,
  maxStepsPerTaskPerTick: 500,
  maxStepsPerFrame: 10_000,
  maxConcurrentTasks: 1_000,
};
```

Dispatch events in scene/object/script order; evaluate expressions through `RuntimeWorld`; track contact pairs across ticks; make `stop()` idempotent and ensure `stop all` cancels sibling tasks.

- [ ] **Step 5: Run scheduler tests and type-check**

Run: `npm test -- test/runtime/scheduler.test.ts && npm run type-check`

Expected: PASS with deterministic snapshots for two identical runs.

- [ ] **Step 6: Commit checkpoint when Git is available**

```bash
git add lib/runtime/world.ts lib/runtime/scheduler.ts test/runtime/scheduler.test.ts
git commit -m "feat: add deterministic block runtime scheduler"
```

### Task 8: Implement the Three.js World Adapter and Obstacle-Course Semantics

**Files:**
- Create: `lib/runtime/threeWorld.ts`
- Create: `lib/runtime/createRuntime.ts`
- Modify: `lib/audio/AudioManager.ts`
- Test: `test/runtime/threeWorld.test.ts`
- Test: `test/runtime/obstacleCourse.test.ts`

**Interfaces:**
- Consumes: `ProjectDocument`, Three.js object registry, input state, audio manager, and compiled scripts.
- Produces: `createThreeWorld(options): RuntimeWorld` and `createProjectRuntime(options): ProjectRuntime`.
- Produces: `RuntimeSnapshot = { phase: 'stopped' | 'playing' | 'won' | 'lost'; objects: Record<string, RuntimeObjectState>; variables: ProjectDocument['variables']; activeTasks: number; playingSounds: number; diagnostics: Diagnostic[] }`.

- [ ] **Step 1: Write failing authored/runtime isolation tests**

```ts
it('resets transforms, variables, visibility, velocity, and sounds to authored state', () => {
  const authored = createObstacleCourseProject('Course');
  const hero = authored.scenes[0].objects.find((object) => object.kind === 'character')!;
  const runtime = createProjectRuntime({ document: authored, renderer: createFakeRenderer() });
  runtime.play(); runtime.dispatchInput({ type: 'keyDown', code: 'ArrowRight' }); runtime.advance(1); runtime.stop();
  expect(runtime.snapshot().objects[hero.id].transform).toEqual(hero.transform);
  expect(runtime.snapshot().variables).toEqual(authored.variables);
  expect(runtime.snapshot().activeTasks).toBe(0);
  expect(runtime.snapshot().playingSounds).toBe(0);
});
```

- [ ] **Step 2: Write the complete obstacle-course fixture test**

Use a headless/fake Three object registry to move and jump the hero, collect an item exactly once, decrement `lives` on hazard contact with a respawn cooldown, trigger `win` at the goal, and verify Reset restores `score`, `lives`, positions, visibility, and contact state.

- [ ] **Step 3: Verify the tests fail**

Run: `npm test -- test/runtime/threeWorld.test.ts test/runtime/obstacleCourse.test.ts`

Expected: FAIL because the shared runtime factory and adapter are missing.

- [ ] **Step 4: Implement runtime object state and world operations**

Clone authored objects into a `Map<objectId, RuntimeObjectState>`. Implement every `RuntimeWorld` method without React state setters. Normalize inputs to `key:<KeyboardEvent.code>` and `control:<controlId>` tokens. Use stable contact pairs, a fixed simulation step, explicit grounded state, and the existing `AudioManager` behind play/stop/query methods.

- [ ] **Step 5: Implement `ProjectRuntime` lifecycle**

```ts
export interface ProjectRuntime {
  play(): CompileResult;
  advance(realDeltaSeconds: number): void;
  stop(): void;
  reset(): CompileResult;
  dispatchInput(input: RuntimeInputEvent): void;
  subscribe(listener: (snapshot: RuntimeSnapshot) => void): () => void;
  snapshot(): RuntimeSnapshot;
  dispose(): void;
}
```

Define `RuntimeInputEvent` as `{ type: 'keyDown' | 'keyUp'; code: string } | { type: 'controlDown' | 'controlUp'; controlId: string } | { type: 'objectClick'; objectId: string }`.

Compile on Play/Reset, refuse to start when errors exist, retain warnings, cap accumulated frame time, and dispose audio/listeners idempotently.

- [ ] **Step 6: Run all runtime tests and type-check**

Run: `npm test -- test/runtime && npm run type-check`

Expected: PASS for deterministic obstacle-course completion and exact authored-state restoration.

- [ ] **Step 7: Commit checkpoint when Git is available**

```bash
git add lib/runtime/threeWorld.ts lib/runtime/createRuntime.ts lib/audio/AudioManager.ts test/runtime/threeWorld.test.ts test/runtime/obstacleCourse.test.ts
git commit -m "feat: connect block runtime to 3d world"
```

### Task 9: Replace Component-Local Player Logic with the Shared Runtime

**Files:**
- Create: `components/player/RuntimePlayer.tsx`
- Create: `components/player/RuntimeObject.tsx`
- Modify: `components/player/GamePlayer.tsx`
- Modify: `app/play/[id]/page.tsx`
- Create: `app/local/play/[id]/page.tsx`
- Test: `test/editor/RuntimePlayer.test.tsx`

**Interfaces:**
- Consumes: `ProjectDocument` and `ProjectRuntime`.
- Produces: `RuntimePlayerProps = { document: ProjectDocument; mode: 'preview' | 'standalone'; onExit?: () => void; runtimeFactory?: typeof createProjectRuntime }` and `<RuntimePlayer {...props} />`. `runtimeFactory` defaults to `createProjectRuntime` and exists for deterministic component tests.

- [ ] **Step 1: Write a failing player lifecycle component test**

```tsx
it('plays, stops, and disposes one shared runtime', async () => {
  const runtime = createMockProjectRuntime();
  const { unmount } = render(<RuntimePlayer document={createObstacleCourseProject('Course')} runtimeFactory={() => runtime} mode="preview" />);
  await userEvent.click(screen.getByRole('button', { name: /play/i }));
  expect(runtime.play).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole('button', { name: /stop/i }));
  expect(runtime.stop).toHaveBeenCalledOnce();
  unmount();
  expect(runtime.dispose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Verify the player test fails**

Run: `npm test -- test/editor/RuntimePlayer.test.tsx`

Expected: FAIL because `RuntimePlayer` does not exist.

- [ ] **Step 3: Implement `RuntimePlayer` and focused object rendering**

Create the runtime once per document identity, subscribe with cleanup, call `advance(delta)` from one `useFrame`, render objects from runtime snapshots, render diagnostics outside Canvas, and route keyboard/pointer/touch inputs into normalized runtime events.

- [ ] **Step 4: Convert current and local play routes**

The MySQL route converts fetched legacy data with `convertLegacyProject` before rendering `RuntimePlayer`. The local route is a client boundary that loads by route ID from `ProjectRepository`, shows loading/not-found/storage-error states, and renders the same `RuntimePlayer` in standalone mode.

Delete the old per-object block loop, default character controls, and component-local gravity from `GamePlayer.tsx` after parity tests prove the shared runtime handles them. Keep a thin compatibility export if existing imports require it.

- [ ] **Step 5: Run component/runtime tests and type-check**

Run: `npm test -- test/runtime test/editor/RuntimePlayer.test.tsx && npm run type-check`

Expected: PASS; `rg "Process logic blocks|Fallback: Default keyboard controls" components/player/GamePlayer.tsx` returns no matches.

- [ ] **Step 6: Commit checkpoint when Git is available**

```bash
git add components/player app/play app/local/play test/editor/RuntimePlayer.test.tsx
git commit -m "refactor: use shared runtime in game player"
```

### Task 10: Build the Responsive Local-First Editor Shell

**Files:**
- Create: `components/editor/EditorShell.tsx`
- Create: `components/editor/EditorTopBar.tsx`
- Create: `components/editor/SceneWorkspace.tsx`
- Create: `components/editor/ObjectLibrary.tsx`
- Create: `components/editor/RuntimeDiagnostics.tsx`
- Create: `components/editor/TouchControls.tsx`
- Create: `app/local/editor/[id]/page.tsx`
- Modify: `components/editor/GameEditor.tsx`
- Modify: `components/editor/ObjectsPanel.tsx`
- Modify: `components/editor/PropertiesPanel.tsx`
- Modify: `components/editor/SceneView.tsx`
- Modify: `app/globals.css`
- Test: `test/editor/EditorShell.test.tsx`
- Test: `test/editor/GameEditor.test.tsx`

**Interfaces:**
- Consumes: project store, `BlockWorkspace`, `RuntimePlayer`, and project repository.
- Produces: adaptive `EditorShell` and local editor route with identical commands on all breakpoints.

- [ ] **Step 1: Write failing layout and capability tests**

Mock `matchMedia` for desktop, tablet, and phone. Assert desktop renders three regions; tablet trays are toggleable; phone renders 44-pixel Stage/Blocks/Objects/Play tabs and only one active region; all modes expose add, transform, duplicate, delete, blocks, undo, redo, Play, Stop, and Reset through visible controls or the active mode.

- [ ] **Step 2: Write failing editor isolation and diagnostics tests**

Assert Play passes an immutable snapshot to `RuntimePlayer`, runtime movement does not change the project store, Stop restores the scene, compilation errors focus the Blocks tab and select the diagnostic's `blockId`, and a failed save displays `Not saved — Export now` instead of a success state.

- [ ] **Step 3: Verify editor tests fail**

Run: `npm test -- test/editor/EditorShell.test.tsx test/editor/GameEditor.test.tsx`

Expected: FAIL on missing shell and old component behavior.

- [ ] **Step 4: Implement the adaptive shell and split editor responsibilities**

Use CSS media queries plus a small `useEditorLayout()` hook based on `(max-width: 767px)` and `(max-width: 1100px)`. Do not maintain separate project logic per breakpoint. Move top-bar controls, stage, block workspace, object library, diagnostics, and touch controls into the focused files above. Keep transforms in `SceneWorkspace`, issuing `beginGroup/updateObject/endGroup` commands.

Phone tabs use `role="tablist"`; active content uses `role="tabpanel"`. Tablet trays use labeled buttons with `aria-expanded`. Add `.touch-target { min-width:44px; min-height:44px; }` and reduced-motion rules.

- [ ] **Step 5: Implement the local editor loading boundary**

Load the project once from IndexedDB, compare clean and recovery timestamps, prompt to restore/discard when recovery is newer, initialize the store, and flush on `visibilitychange`. Route not-found and repository failures to friendly panels with Back, Retry, and Import actions.

- [ ] **Step 6: Run editor tests, type-check, and build**

Run: `npm test -- test/editor && npm run type-check && npm run build`

Expected: all tests PASS, type-check exits 0, and Next production build succeeds.

- [ ] **Step 7: Commit checkpoint when Git is available**

```bash
git add components/editor app/local/editor app/globals.css test/editor
git commit -m "feat: add responsive local-first game editor"
```

### Task 11: Add Local Projects, Starters, Import/Export, and Coach Marks

**Files:**
- Create: `components/projects/LocalProjects.tsx`
- Create: `components/editor/ImportExportMenu.tsx`
- Create: `components/onboarding/CoachMarks.tsx`
- Create: `app/local/page.tsx`
- Modify: `app/page.tsx`
- Test: `test/editor/LocalProjects.test.tsx`
- Test: `test/editor/ImportExportMenu.test.tsx`
- Test: `test/editor/CoachMarks.test.tsx`

**Interfaces:**
- Consumes: starter factories, repository, `exportProject`, and `importProject`.
- Produces: no-setup entry flow and accessible recovery/import/export UI.

- [ ] **Step 1: Write failing starter and recent-project UI tests**

Assert **Start an Obstacle Course** and **Blank 3D World** create, save, and navigate to `/local/editor/:id`; recent cards show saved title/update time; delete requires confirmation; an empty repository shows starter choices rather than sign-in.

- [ ] **Step 2: Write failing import/export and coach-mark tests**

Assert exported filenames end in `.ling3d`; invalid/oversized files preserve the open document and show the storage error; imported projects appear as new recent projects; coach marks cover Build, Blocks, and Play, can be skipped, and store completion locally without modifying the project document.

- [ ] **Step 3: Verify tests fail**

Run: `npm test -- test/editor/LocalProjects.test.tsx test/editor/ImportExportMenu.test.tsx test/editor/CoachMarks.test.tsx`

Expected: FAIL because the components/routes are absent.

- [ ] **Step 4: Implement the local projects page and make it the primary CTA**

Home's **Start Creating** link goes to `/local`. Keep Sign In as an optional secondary path. The local page lists projects newest first, creates starter documents through factories, awaits the first clean save before navigating, and provides Import.

- [ ] **Step 5: Implement safe file UI and three-step coach marks**

Use a hidden `accept=".ling3d,application/vnd.lingcode.project+json,application/json"` file input, surface typed import errors, create downloads with `URL.createObjectURL`, and always revoke the URL. Coach marks use a modal/dialog pattern with focus containment and buttons Back, Next, Skip, and Done.

- [ ] **Step 6: Run UI tests and build**

Run: `npm test -- test/editor && npm run type-check && npm run build`

Expected: PASS and no local flow request reaches `/api/projects`.

- [ ] **Step 7: Commit checkpoint when Git is available**

```bash
git add components/projects components/onboarding components/editor/ImportExportMenu.tsx app/local/page.tsx app/page.tsx test/editor
git commit -m "feat: add local starters and project portability ui"
```

### Task 12: Complete Accessibility, Missing-Asset Recovery, and WebGL Recovery

**Files:**
- Create: `components/common/WebGLRecovery.tsx`
- Create: `components/editor/MissingAsset.tsx`
- Modify: `components/common/ErrorBoundary.tsx`
- Modify: `components/editor/SceneView.tsx`
- Modify: `components/player/RuntimeObject.tsx`
- Modify: `components/editor/BlockHelp.tsx`
- Modify: `app/globals.css`
- Test: `test/editor/accessibility.test.tsx`
- Test: `test/editor/recovery.test.tsx`

**Interfaces:**
- Consumes: runtime diagnostics and repository/storage error states.
- Produces: accessible recovery panels and visible non-fatal asset placeholders.

- [ ] **Step 1: Write failing keyboard, speech, and reduced-motion tests**

Use Testing Library to tab through primary controls in logical order, verify visible accessible names for icon buttons, confirm Read Aloud cancels existing speech before speaking, and verify reduced-motion CSS removes bounce/scale transitions.

- [ ] **Step 2: Write failing missing-asset and WebGL-loss tests**

Assert a failed model load renders a labeled magenta wireframe placeholder with object name, while other objects remain. Dispatch `webglcontextlost`, verify `preventDefault`, render **3D view paused**, and assert **Try again** remounts only the scene canvas without replacing project-store state.

- [ ] **Step 3: Verify recovery tests fail**

Run: `npm test -- test/editor/accessibility.test.tsx test/editor/recovery.test.tsx`

Expected: FAIL on absent recovery behavior and unmet accessibility names.

- [ ] **Step 4: Implement recovery components and accessibility corrections**

Keep recovery boundaries around the 3D canvas, not the full editor. Missing assets must retain object selection/transform affordances. Add `aria-live="polite"` for save status and ordinary diagnostics, `role="alert"` for errors that block Play, visible focus rings, non-color diagnostic icons/text, and a speech-unavailable fallback that leaves written help visible.

- [ ] **Step 5: Run editor tests, type-check, and build**

Run: `npm test -- test/editor && npm run type-check && npm run build`

Expected: PASS; no accessibility test reports unnamed primary controls.

- [ ] **Step 6: Commit checkpoint when Git is available**

```bash
git add components/common components/editor components/player/RuntimeObject.tsx app/globals.css test/editor
git commit -m "fix: add accessible editor recovery states"
```

### Task 13: Add Browser Acceptance Tests and Performance Guardrails

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.ts`
- Create: `test/e2e/core-creation-loop.spec.ts`
- Create: `test/e2e/accessibility.spec.ts`
- Create: `test/e2e/performance.spec.ts`
- Create: `lib/performance/budgets.ts`
- Create: `components/editor/CapacityWarning.tsx`
- Modify: `.gitignore`
- Create: `docs/local-development.md`

**Interfaces:**
- Consumes: completed local product flow.
- Produces: repeatable desktop/tablet/phone acceptance evidence and surfaced capacity warnings.

- [ ] **Step 1: Install and configure Playwright**

Run:

```bash
npm install --save-dev @playwright/test axe-core
npx playwright install chromium
```

Configure `playwright.config.ts` with `baseURL: 'http://127.0.0.1:3000'`, `webServer.command: 'npm run dev'`, retries `1` in CI, trace on first retry, and desktop Chrome, iPad-size touch, and Pixel-size touch projects.

- [ ] **Step 2: Write the failing complete creation-loop test**

The test must:

```ts
test('child can build, program, save, reopen, export, import, and play', async ({ page }) => {
  await page.goto('/local');
  await page.getByRole('button', { name: 'Start an Obstacle Course' }).click();
  await page.getByRole('tab', { name: 'Objects' }).click();
  await page.getByRole('button', { name: 'Add platform' }).click();
  await page.getByRole('tab', { name: 'Blocks' }).click();
  await expect(page.getByLabel('Block workspace')).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByText('Score')).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await page.reload();
  await expect(page.getByText('My Obstacle Course')).toBeVisible();
});
```

Use a test-only Blockly helper exposed only when `process.env.NEXT_PUBLIC_E2E === '1'` to insert exact block fixtures; do not rely on pixel dragging in the semantic product test. Add a separate pointer/touch smoke test for actual Blockly drag-and-snap.

- [ ] **Step 3: Write responsive and accessibility acceptance tests**

For each Playwright project, verify the correct shell; 44-pixel touch targets; touch controls move/jump the hero; no horizontal page overflow; keyboard focus reaches editor modes; and an axe scan has no critical/serious violations in local projects, editor Stage, editor Blocks, and Play.

- [ ] **Step 4: Measure and codify guardrails**

Run the obstacle fixture on the available development machine/tablet emulation, record baseline p50 values in the test output, then set explicit first guardrails in `lib/performance/budgets.ts`:

```ts
export const PERFORMANCE_BUDGETS = {
  maxProjectBytes: 10 * 1024 * 1024,
  maxObjectsPerScene: 500,
  maxBlocksPerScript: 2_000,
  maxConcurrentTasks: 1_000,
  maxAutosaveMs: 500,
  minPlayFps: 30,
} as const;
```

`CapacityWarning` must warn before object/task limits and block actions that would exceed hard safety limits. Performance tests fail if autosave or a 100-object obstacle fixture crosses the recorded budgets in two consecutive samples.

- [ ] **Step 5: Document no-setup local development and ignore generated artifacts**

Document `npm ci`, `npm run dev`, `/local`, `npm test`, `npm run test:e2e`, `npm run type-check`, and `npm run build`. Add `playwright-report/`, `test-results/`, and `.superpowers/` to `.gitignore`.

- [ ] **Step 6: Run the full verification suite**

Run:

```bash
npm test
npm run type-check
npm run build
npm run test:e2e
```

Expected: all unit/component tests PASS, type-check exits 0, production build succeeds, and Playwright passes on desktop, tablet, and phone projects.

- [ ] **Step 7: Perform the manual acceptance journey**

On a desktop browser and one real touch device, complete all ten acceptance steps in the design specification. Record device/browser, result, and any deviations in `docs/verification/2026-08-09-core-creation-loop.md`. No milestone item may be marked complete with an unexplained deviation.

- [ ] **Step 8: Commit checkpoint when Git is available**

```bash
git add package.json package-lock.json playwright.config.ts test/e2e lib/performance components/editor/CapacityWarning.tsx .gitignore docs
git commit -m "test: verify 3d scratch creation loop"
```

## Final Verification Gate

Before reporting completion, run exactly:

```bash
npm test
npm run type-check
npm run build
npm run test:e2e
```

Then manually confirm:

- local creation and reopening work with all database environment variables unset;
- editor preview and standalone play produce the same score/lives/win behavior;
- Stop and Reset restore authored transforms, variables, visibility, physics, and sound state;
- exported/imported copies preserve internal references and receive a new project ID;
- desktop, tablet, and phone expose the same authoring commands through their respective layouts;
- invalid imports, missing assets, compilation errors, runtime budgets, storage failures, and WebGL loss each produce a recoverable child-friendly state;
- no active local-first code imports `lib/supabase/*` or requires `/api/projects`;
- `rg "eval\\(|new Function|javascriptGenerator" lib/runtime lib/blocks` returns no executable-code path.

If Git metadata is available at execution time, finish with a clean `git status --short` containing only intentionally uncommitted user work. If it remains unavailable, preserve the verification log and report that commits could not be created.
