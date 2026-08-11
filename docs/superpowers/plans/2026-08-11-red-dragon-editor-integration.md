# Red Dragon Editor Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the local Red Metal Dragon GLB to the editor's Starter Characters so users can insert one or more independently rendered dragons at a useful default scale.

**Architecture:** The shared prefab entry carries optional local-model metadata. A small pure payload helper converts a selected prefab into the editor's persisted sprite/properties representation, while the selector preview and runtime renderer each clone the cached GLTF scene before use. The existing character API and editor object flow remain the only insertion path.

**Tech Stack:** TypeScript, React 18, Next.js 14, React Three Fiber, Drei, Three.js, Node.js test runner.

## Global Constraints

- Use only the checked-in `/models/red-metal-dragon.glb`; do not add remote generation or credentials.
- Preserve selection, transforms, properties, deletion, and logic-block behavior by inserting a normal `character` object.
- Multiple copies of the same GLB must render independently.
- Primitive prefabs and imported models without explicit size metadata must retain current behavior.
- Do not add animation, fire, color variants, schema changes, or a new asset marketplace.

---

### Task 1: Model-Aware Dragon Prefab and Insertion Payload

**Files:**
- Modify: `lib/prefabs/characters.ts`
- Create: `lib/prefabs/characterPayload.ts`
- Create: `test/prefabs/dragon-editor.test.js`
- Modify: `components/editor/GameEditor.tsx`
- Modify: `package.json`

**Interfaces:**
- Extends `CharacterPrefab` with `model_url?: string` and retains numeric `size` as the persisted percentage scale.
- Produces `buildCharacterVisual(character): { spriteData: Record<string, unknown>; properties: Record<string, unknown> }`.
- Dragon metadata: `name: 'Red Metal Dragon'`, `model_url: '/models/red-metal-dragon.glb'`, and numeric `size: 28` (the approximately six-unit-wide source becomes about 1.7 editor units wide).

- [ ] **Step 1: Write the failing behavior test**

Create `test/prefabs/dragon-editor.test.js`. Compile `characters.ts` and `characterPayload.ts` into `test/.build` in the package script, then assert:

```js
const assert = require('node:assert/strict');
const test = require('node:test');
const { matchCharacterPrefab } = require('../.build/lib/prefabs/characters.js');
const { buildCharacterVisual } = require('../.build/lib/prefabs/characterPayload.js');

test('dragon aliases resolve to the checked-in model prefab', () => {
  for (const prompt of ['dragon', 'red dragon', 'wyvern']) {
    const dragon = matchCharacterPrefab(prompt);
    assert.equal(dragon.name, 'Red Metal Dragon');
    assert.equal(dragon.model_url, '/models/red-metal-dragon.glb');
    assert.ok(dragon.size > 1);
  }
});

test('model prefab size flows to sprite data and properties', () => {
  const visual = buildCharacterVisual({ id: 'dragon', model_url: '/models/red-metal-dragon.glb', size: 28 });
  assert.equal(visual.spriteData.size, 28);
  assert.equal(visual.properties.size, 28);
});

test('an imported model without a size retains the fallback', () => {
  const visual = buildCharacterVisual({ id: 'import', model_url: '/uploads/model.glb' });
  assert.equal(visual.spriteData.size, 1);
  assert.equal(visual.properties.size, 1);
});
```

- [ ] **Step 2: Add and run the focused script to verify RED**

Add:

```json
"test:dragon-editor": "tsc lib/prefabs/characters.ts lib/prefabs/characterPayload.ts --outDir test/.build --rootDir . --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck && node --test test/prefabs/dragon-editor.test.js"
```

Run `npm run test:dragon-editor`. Expected: compilation fails because `characterPayload.ts` does not exist, or the first assertion fails before production metadata is added.

- [ ] **Step 3: Implement model metadata and the pure payload helper**

Add optional `model_url` to `CharacterPrefab`, update the existing dragon entry rather than adding a duplicate, and implement:

```ts
export function buildCharacterVisual(character: CharacterVisualInput) {
  if (character.model_url) {
    const size = character.size ?? 1;
    const model = { shape: 'model', model_url: character.model_url, thumbnail_url: character.thumbnail_url, size };
    return { spriteData: model, properties: { ...model, characterType: character.id } };
  }
  const primitive = { shape: character.shape || 'box', color: character.color, size: character.size || 50 };
  return { spriteData: primitive, properties: { ...(character.properties || {}), ...primitive, characterType: character.id } };
}
```

Replace the duplicated model/primitive branches in `GameEditor` with this helper without changing the API payload shape.

- [ ] **Step 4: Verify GREEN and regression behavior**

Run `npm run test:dragon-editor && npm run test:prefabs && npm run type-check`.

Expected: all pass; existing primitive counts and aliases remain unchanged.

- [ ] **Step 5: Commit**

```bash
git add package.json lib/prefabs/characters.ts lib/prefabs/characterPayload.ts components/editor/GameEditor.tsx test/prefabs/dragon-editor.test.js
git commit -m "feat: add dragon model prefab to editor"
```

---

### Task 2: Real Model Preview and Independent GLTF Instances

**Files:**
- Modify: `components/editor/CharacterSelector.tsx`
- Modify: `components/editor/ShapePreview.tsx`
- Modify: `components/editor/AnimatedModel.tsx`
- Create: `test/editor/dragon-model-rendering.test.js`
- Modify: `package.json`

**Interfaces:**
- Extends `ShapePreviewProps` with `modelUrl?: string`.
- Produces a preview-only `PreviewModel` that deep-clones the `useGLTF` scene and frames it with a preview-specific scale/rotation.
- `GLTFAnimatedModel` deep-clones the loaded scene per mounted runtime instance; animation lookup/mixer behavior continues to operate on that instance.

- [ ] **Step 1: Write the failing rendering contract test**

Create `test/editor/dragon-model-rendering.test.js` using Node built-ins to read the three component sources and assert:

```js
test('dragon tile passes the local model into the preview', () => {
  assert.match(selector, /modelUrl=\{c\.model_url\}/);
  assert.match(preview, /useGLTF\(modelUrl\)/);
});

test('preview and runtime clone cached GLTF scenes', () => {
  assert.match(preview, /SkeletonUtils\.clone/);
  assert.match(animated, /SkeletonUtils\.clone/);
  assert.doesNotMatch(animated, /<primitive object=\{scene\}/);
});
```

Add `"test:dragon-rendering": "node --test test/editor/dragon-model-rendering.test.js"`.

- [ ] **Step 2: Run the contract test to verify RED**

Run `npm run test:dragon-rendering`. Expected: assertions fail because model preview and cloned runtime instance wiring are absent.

- [ ] **Step 3: Implement the GLB preview**

Pass `c.model_url` into each starter `ShapePreview`. In `ShapePreview`, add a Suspense-wrapped `PreviewModel` which calls `useGLTF(modelUrl)`, memoizes `SkeletonUtils.clone(scene)`, traverses the clone to enable normal material rendering, and returns a scaled/centered primitive. Keep the current primitive `ShapeMesh` path when `modelUrl` is absent. Add a small preview error boundary around the Canvas whose fallback is the existing capsule preview, plus a compact loading fallback inside the tile.

- [ ] **Step 4: Clone runtime GLTF instances**

In `GLTFAnimatedModel`, rename the cached loader result to `sourceScene`, create `const scene = useMemo(() => SkeletonUtils.clone(sourceScene), [sourceScene])`, and pass this clone to `useAnimations` and `<primitive>`. Dispose only instance-owned cloned materials if added; never dispose shared loader geometry.

- [ ] **Step 5: Verify focused and project checks**

Run `npm run test:dragon-rendering && npm run test:dragon-editor && npm run type-check && npm run build`.

Expected: focused tests pass, TypeScript passes, and `/dragon` plus editor routes build successfully.

- [ ] **Step 6: Commit**

```bash
git add package.json components/editor/CharacterSelector.tsx components/editor/ShapePreview.tsx components/editor/AnimatedModel.tsx test/editor/dragon-model-rendering.test.js
git commit -m "feat: preview and clone dragon model instances"
```

---

### Task 3: Editor Browser Validation

**Files:**
- Modify only Task 1–2 files if a concrete validation defect is found.

**Interfaces:**
- Consumes the existing Add Character flow and local dragon GLB.
- Produces browser evidence that two independent dragons can be added and manipulated in one editor scene.

- [ ] **Step 1: Run the final automated set**

Run:

```bash
npm run test:dragon-asset
npm run test:dragon-editor
npm run test:dragon-rendering
npm run test:all
npm run type-check
npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Validate the selector and first insertion**

Start the built app, open an existing or new project editor, choose Add Character → Starters, and confirm the Red Metal Dragon tile shows the real model. Select it and confirm the dragon loads near the standard scene spawn at a usable scale, can be selected, translated, rotated, and resized, and produces no GLB/WebGL/console error.

- [ ] **Step 3: Validate independent instances**

Add a second Red Metal Dragon. Move it away from the first, rotate it separately, and confirm both remain visible and independently selectable. Reload the editor and confirm both persisted models return.

- [ ] **Step 4: Correct only concrete integration defects**

For any defect, add a failing focused test where automatable, make the smallest correction in the owning file, and repeat the focused test, type-check, build, and affected browser step. Do not broaden scope.

- [ ] **Step 5: Commit validation fixes if needed**

Stage only the relevant Task 1–2 files and commit `fix: polish dragon editor integration`. Do not create an empty commit.
