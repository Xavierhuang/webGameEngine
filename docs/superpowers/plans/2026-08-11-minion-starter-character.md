# Minion Starter Character Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the supplied textured FBX Minion as one model-backed starter character without changing the existing starters.

**Architecture:** Publish the jeans texture at the basename URL Three.js `FBXLoader` actually derives beside the FBX, then describe Minion in the shared prefab catalog so manual and AI selection use the same local model. Add a focused preview component that chooses between the existing primitive preview and a live `AnimatedModel`, with explicit load/error callbacks providing a visible fallback.

**Tech Stack:** Next.js 14, React 18, TypeScript, React Three Fiber, Three.js `FBXLoader`, existing Node-based prefab test harness.

## Global Constraints

- Keep every existing starter character unchanged and add exactly one `minion` starter.
- Serve the original FBX directly; do not convert it to GLB.
- Keep source files under `models/Minion/` unchanged.
- Keep `jeans_texture4807.jpg` beside `FBX/Minion_FBX.fbx`; Three.js strips the FBX's stored `..\Textures\` prefix before resolving the texture URL.
- Do not ship `brown-eye.png`: the supplied FBX does not reference it.
- Do not change the database schema, upload flow, rig, materials, or animations.
- Do not add runtime dependencies.

---

## File Structure

- `lib/prefabs/characters.ts` — owns the shared Minion prefab metadata used by the picker and AI matching.
- `components/editor/AnimatedModel.tsx` — reports optional model load and error events while retaining existing runtime behavior.
- `components/editor/CharacterPreview.tsx` — owns primitive-versus-model preview selection and the model-preview fallback.
- `components/editor/CharacterSelector.tsx` — delegates starter tiles to `CharacterPreview`.
- `test/prefabs/characters.test.js` — verifies Minion matching, metadata, catalog count, and deployable assets.
- `public/models/minion/FBX/Minion_FBX.fbx` — browser-served FBX copied from the supplied source.
- `public/models/minion/FBX/jeans_texture4807.jpg` — the browser-served texture at the exact URL `FBXLoader` derives.

### Task 1: Public Assets and Shared Minion Prefab

**Files:**
- Modify: `test/prefabs/characters.test.js:10-81`
- Create: `test/prefabs/minion-assets.test.mjs`
- Modify: `lib/prefabs/characters.ts:11-179`
- Create: `public/models/minion/FBX/Minion_FBX.fbx`
- Create: `public/models/minion/FBX/jeans_texture4807.jpg`

**Interfaces:**
- Consumes: source assets at `models/Minion/FBX/Minion_FBX.fbx` and `models/Minion/Maya/Textures/jeans_texture4807.jpg`.
- Produces: `CharacterPrefab.model_url?: string`, `CharacterPrefab.preview_scale?: number`, `CharacterPrefab.preview_rotation?: [number, number, number]`, and a `minion` prefab whose URL is `/models/minion/FBX/Minion_FBX.fbx`.

- [ ] **Step 1: Write failing prefab and asset tests**

Add these prefab assertions to `test/prefabs/characters.test.js`:

```js
eq(matchCharacterPrefab('minion')?.id, 'minion', 'exact Minion match');
eq(matchCharacterPrefab('a cheerful yellow minion')?.id, 'minion', 'descriptive Minion prompt');

const minion = CHARACTER_TEMPLATES.find((template) => template.id === 'minion');
eq(minion?.shape, 'model', 'Minion uses a model shape');
eq(minion?.model_url, '/models/minion/FBX/Minion_FBX.fbx', 'Minion uses local FBX URL');
eq(minion?.preview_scale, 0.14, 'Minion preview scale');
eq(Array.isArray(minion?.preview_rotation), true, 'Minion preview rotation is defined');

```

Create `test/prefabs/minion-assets.test.mjs` with independent expected hashes and the real loader behavior check:

```js
// A focused loader test parses the real FBX through Three.js FBXLoader and
// asserts that its sole external request is exactly:
// /models/minion/FBX/jeans_texture4807.jpg
// It also checks non-zero sizes and exact SHA-256 hashes for the FBX and JPEG.
```

Change the catalog assertion to:

```js
eq(CHARACTER_TEMPLATES.length, 18, 'templates count (added Minion starter)');
```

- [ ] **Step 2: Run the prefab suite and verify the new assertions fail**

Run: `npm run test:prefabs`

Expected: FAIL because `matchCharacterPrefab('minion')` is `null`, the Minion metadata is absent, the catalog count is `17`, and the public files do not exist.

- [ ] **Step 3: Copy the source model and textures into the public layout**

Run:

```bash
mkdir -p public/models/minion/FBX
cp models/Minion/FBX/Minion_FBX.fbx public/models/minion/FBX/Minion_FBX.fbx
cp models/Minion/Maya/Textures/jeans_texture4807.jpg public/models/minion/FBX/jeans_texture4807.jpg
```

Confirm byte-for-byte copies:

```bash
cmp models/Minion/FBX/Minion_FBX.fbx public/models/minion/FBX/Minion_FBX.fbx
cmp models/Minion/Maya/Textures/jeans_texture4807.jpg public/models/minion/FBX/jeans_texture4807.jpg
```

Expected: both `cmp` commands exit `0` with no output.

- [ ] **Step 4: Add model metadata and the Minion prefab**

Extend `CharacterPrefab` in `lib/prefabs/characters.ts`:

```ts
export interface CharacterPrefab {
  id: string;
  name: string;
  color: string;
  shape: string;
  size: number;
  description: string;
  aliases?: string[];
  model_url?: string;
  preview_scale?: number;
  preview_rotation?: [number, number, number];
}
```

Insert this starter after Astronaut and before the primitive creature stand-ins:

```ts
{
  id: 'minion',
  name: 'Minion',
  color: '#FACC15',
  shape: 'model',
  size: 14,
  description: 'Cheerful yellow helper',
  aliases: ['yellow helper', 'banana buddy'],
  model_url: '/models/minion/FBX/Minion_FBX.fbx',
  preview_scale: 0.14,
  preview_rotation: [0, 0, 0],
},
```

- [ ] **Step 5: Run the prefab tests and verify they pass**

Run: `npm run test:prefabs`

Expected: `ALL PASS`, including the new Minion and asset assertions.

- [ ] **Step 6: Commit the asset and prefab slice**

```bash
git add lib/prefabs/characters.ts test/prefabs/characters.test.js public/models/minion
git commit -m "feat: add Minion starter prefab assets"
```

### Task 2: Model Preview Loading and Fallback

**Files:**
- Create: `components/editor/CharacterPreview.tsx`
- Modify: `components/editor/AnimatedModel.tsx:10-235`
- Modify: `lib/utils/modelCache.ts`
- Create: `lib/utils/asyncResourceLifecycle.ts`
- Create: `test/utils/model-resource-lifecycle.test.mjs`

**Interfaces:**
- Consumes: `CharacterPrefab` and the existing `ShapePreview` and `AnimatedModel` components.
- Produces: `CharacterPreview({ character }: { character: CharacterPrefab }): JSX.Element`; optional `AnimatedModelProps.onLoad?: () => void` and `AnimatedModelProps.onError?: (error: unknown) => void` callbacks.

- [ ] **Step 1: Create the preview consumer before callbacks exist**

Create `components/editor/CharacterPreview.tsx` with a primitive fast path and a model path that expects `AnimatedModel` load callbacks:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { CharacterPrefab } from '../../lib/prefabs/characters';
import AnimatedModel from './AnimatedModel';
import ShapePreview from './ShapePreview';

export default function CharacterPreview({ character }: { character: CharacterPrefab }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [character.model_url]);

  if (!character.model_url) {
    return <ShapePreview shape={character.shape} color={character.color} />;
  }

  return (
    <div className="relative h-full w-full">
      {(!loaded || failed) && (
        <div className="absolute inset-0">
          <ShapePreview shape="capsule" color={character.color} />
        </div>
      )}
      {!failed && (
        <Canvas camera={{ position: [0, 1, 4], fov: 35 }} gl={{ alpha: true, antialias: true }}>
          <ambientLight intensity={1.2} />
          <directionalLight position={[4, 6, 5]} intensity={1.4} />
          <group rotation={character.preview_rotation ?? [0, 0, 0]}>
            <AnimatedModel
              url={character.model_url}
              position={[0, -1, 0]}
              rotation={[0, 0, 0]}
              scale={Array(3).fill(character.preview_scale ?? 1) as [number, number, number]}
              playAnimation={false}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          </group>
        </Canvas>
      )}
      {failed && (
        <span className="absolute inset-x-0 bottom-1 text-center text-[10px] font-medium text-slate-500">
          Preview unavailable
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript and verify the callback contract fails**

Run: `npx tsc --noEmit`

Expected: FAIL because `onLoad` and `onError` are not members of `AnimatedModelProps`.

- [ ] **Step 3: Add optional callbacks to every animated loader path**

In `components/editor/AnimatedModel.tsx`, add to `AnimatedModelProps`:

```ts
onLoad?: () => void;
onError?: (error: unknown) => void;
```

Destructure and forward both props from `AnimatedModel` to `GLTFAnimatedModel` and `FBXAnimatedModel`. In the GLTF component, report successful availability once the scene exists:

```ts
useEffect(() => {
  onLoad?.();
}, [onLoad, scene]);
```

In `FBXAnimatedModel`, keep the latest callbacks in a ref and make the acquisition effect depend only on `url`. Acquire a reference-counted cache lease for that URL, call the latest `onLoad` after attaching the clone, call the latest `onError` on failure, and release the lease exactly once on URL change or unmount. Share concurrent loads for the same URL so React development remounts cannot overwrite each other's reference counts. Do not change animation selection, scale, or runtime rendering.

Cover the lifecycle contract in `test/utils/model-resource-lifecycle.test.mjs`: concurrent acquisitions perform one underlying load while owning distinct references; releases are idempotent; callback-ref changes do not reacquire; and a load resolving after unmount is ignored and released.

- [ ] **Step 4: Run TypeScript and production compilation**

Run: `npx tsc --noEmit`

Expected: exit `0` with no TypeScript errors.

Run: `npm run build`

Expected: exit `0`; the new client component compiles without server/client boundary errors.

- [ ] **Step 5: Commit the reusable preview slice**

```bash
git add components/editor/AnimatedModel.tsx components/editor/CharacterPreview.tsx
git commit -m "feat: add model-backed character previews"
```

### Task 3: Starter Picker Integration and End-to-End Verification

**Files:**
- Modify: `components/editor/CharacterSelector.tsx:3-9,123-165`

**Interfaces:**
- Consumes: `CharacterPreview({ character })` from Task 2 and Minion's shared prefab metadata from Task 1.
- Produces: starter and primitive tiles that consistently delegate their visual rendering to `CharacterPreview` while preserving existing selection callbacks.

- [ ] **Step 1: Replace direct shape previews with the character preview boundary**

In `components/editor/CharacterSelector.tsx`, replace:

```ts
import ShapePreview from './ShapePreview';
```

with:

```ts
import CharacterPreview from './CharacterPreview';
```

Replace both tile preview calls:

```tsx
<ShapePreview shape={c.shape} color={c.color} />
<ShapePreview shape={s.shape} color={s.color} />
```

with:

```tsx
<CharacterPreview character={c} />
<CharacterPreview character={s} />
```

Do not alter `onSelect`, `onClose`, tab state, AI generation, or import behavior.

- [ ] **Step 2: Run all automated verification**

Run:

```bash
npm run test:all
npx tsc --noEmit
npm run build
git diff --check
```

Expected: every test reports success, TypeScript and build exit `0`, and `git diff --check` produces no output.

- [ ] **Step 3: Start the app and verify public asset responses**

Run: `npm run dev`

In another terminal, run:

```bash
curl -I http://localhost:3000/models/minion/FBX/Minion_FBX.fbx
curl -I http://localhost:3000/models/minion/FBX/jeans_texture4807.jpg
```

Expected: both responses are `200 OK` with non-zero `Content-Length` values.

- [ ] **Step 4: Perform browser acceptance checks**

Open an existing project editor, choose **Add object → Character → Starters**, and confirm:

1. The existing 17 starter tiles are still present.
2. A new **Minion** tile appears with the live textured model framed in the tile.
3. Selecting Minion closes the picker and adds a Minion model to the scene.
4. The same Minion renders in Play mode.
5. The browser console contains no FBX or texture-loading errors.
6. Temporarily changing the preview URL to an invalid path shows the yellow capsule and “Preview unavailable”; restore the valid URL before committing.

- [ ] **Step 5: Commit the picker integration**

```bash
git add components/editor/CharacterSelector.tsx
git commit -m "feat: show Minion in starter picker"
```

- [ ] **Step 6: Confirm the final commit scope**

Run:

```bash
git status --short
git log -4 --oneline
```

Expected: only pre-existing user-owned changes remain uncommitted; the latest three implementation commits correspond to Tasks 1-3.
