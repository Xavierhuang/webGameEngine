# Minion Material Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the supplied Minion FBX's gray V-Ray fallbacks with recognizable standard Three.js colors in the picker, editor, and player.

**Architecture:** A pure `lib/models/minionMaterials.ts` module recognizes only the built-in Minion URL and clones/replaces known materials on a cloned FBX scene. `FBXAnimatedModel` calls it after cloning the cached model and before attaching that clone, keeping the cache and every other model untouched.

**Tech Stack:** TypeScript, Three.js r160 materials and FBXLoader, React Three Fiber, existing Node test harness.

## Global Constraints

- Repair only `/models/minion/FBX/Minion_FBX.fbx`.
- Preserve the existing jeans texture and neutral-white denim tint.
- Do not mutate the cached source FBX or unrelated model instances.
- Do not modify geometry, UVs, rigging, animations, generic FBX loading, or source files under `models/Minion/`.
- Do not add dependencies or convert the model to GLB.
- Unknown mesh/material names must remain unchanged and must never prevent loading.

---

## File Structure

- `lib/models/minionMaterials.ts` — exact URL guard, material palette, cloning, and repair traversal.
- `test/prefabs/minion-materials.test.mjs` — parses the real FBX and verifies visible material outcomes, isolation, and idempotence.
- `components/editor/AnimatedModel.tsx` — invokes repair on the per-render cloned FBX.
- `package.json` — compiles the repair module and runs the focused test with the prefab suite.

### Task 1: Pure Minion Material Repair

**Files:**
- Create: `lib/models/minionMaterials.ts`
- Create: `test/prefabs/minion-materials.test.mjs`
- Modify: `package.json:17-20`

**Interfaces:**
- Produces: `MINION_MODEL_URL: '/models/minion/FBX/Minion_FBX.fbx'` and `repairMinionMaterials(root: THREE.Object3D, modelUrl: string): boolean`.
- Return value: `true` only when the exact Minion URL is eligible and traversal is attempted; `false` for every other URL.

- [ ] **Step 1: Write the failing real-FBX material tests**

Create `test/prefabs/minion-materials.test.mjs`. Reuse the small DOM stub and `FBXLoader.parse` setup from `minion-assets.test.mjs`, then import the compiled repair module and assert these hand-derived outcomes:

```js
const source = new FBXLoader(manager).parse(buffer, '/models/minion/FBX/');
const repaired = source.clone(true);
const sourceBody = source.getObjectByName('polySurface31');
const repairedBody = repaired.getObjectByName('polySurface31');

eq(repairMinionMaterials(repaired, MINION_MODEL_URL), true, 'Minion URL is repaired');
eq(material(repairedBody).color.getHexString(), 'f5d328', 'body becomes Minion yellow');
eq(material(repaired.getObjectByName('pCylinder13')).color.getHexString(), 'f5d328', 'left arm becomes yellow');
eq(material(repaired.getObjectByName('Minion_Hand_Left')).color.getHexString(), '20242b', 'left glove becomes charcoal');
eq(material(repaired.getObjectByName('pCube20')).color.getHexString(), 'f7f7f2', 'teeth become white');
eq(material(repaired.getObjectByName('pCylinder15')).type, 'MeshStandardMaterial', 'goggles use a standard metallic material');
eq(material(repaired.getObjectByName('pCylinder15')).metalness, 0.75, 'goggles are metallic');

const eyeMaterials = repaired.getObjectByName('Minion_Eye_polySurface19_polySurface20').material;
eq(eyeMaterials[0].color.getHexString(), 'f7f7f2', 'eye white is restored');
eq(eyeMaterials[1].color.getHexString(), '704214', 'iris becomes warm brown');
eq(eyeMaterials[2].color.getHexString(), '171717', 'pupil remains near-black');

const denim = material(repaired.getObjectByName('polySurface32'));
eq(Boolean(denim.map), true, 'denim texture remains attached');
eq(denim.color.getHexString(), 'ffffff', 'denim uses a neutral-white tint');
eq(material(sourceBody).color.getHexString(), '808080', 'cached source material stays gray');
eq(material(sourceBody) === material(repairedBody), false, 'repaired material is not shared with source');
```

Also clone a fresh source, call the repair with `/uploads/models/other.fbx`, and assert `false`, the original color, and the original material identity. Apply the repair twice to a Minion clone and assert the same colors, maps, material names, and PBR values after both calls.

Add to `package.json`:

```json
"test:minion-materials": "tsc lib/models/minionMaterials.ts --outDir test/.build --rootDir . --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck && node test/prefabs/minion-materials.test.mjs"
```

Append `npm run test:minion-materials` to `test:all`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test:minion-materials`

Expected: FAIL because `lib/models/minionMaterials.ts` and its compiled exports do not exist.

- [ ] **Step 3: Implement the exact URL guard and material traversal**

Create `lib/models/minionMaterials.ts` with:

```ts
import * as THREE from 'three';

export const MINION_MODEL_URL = '/models/minion/FBX/Minion_FBX.fbx';

const COLORS = {
  yellow: 0xf5d328,
  charcoal: 0x20242b,
  white: 0xf7f7f2,
  brown: 0x704214,
  black: 0x171717,
  silver: 0xb8bec7,
} as const;

export function repairMinionMaterials(root: THREE.Object3D, modelUrl: string): boolean {
  if (modelUrl !== MINION_MODEL_URL) return false;

  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const originals = Array.isArray(object.material) ? object.material : [object.material];
    const repaired = originals.map((original) => repairMaterial(original));
    object.material = Array.isArray(object.material) ? repaired : repaired[0];
  });
  return true;
}
```

Implement `repairMaterial` as a total function: clone unknown materials unchanged; keep `lambert3`'s map and set its tint to `0xffffff`; map the named V-Ray/Lambert materials to the palette above. Use `MeshStandardMaterial` for `VRayMtl7` with `metalness: 0.75` and `roughness: 0.3`, copying `name`, `map`, `side`, `transparent`, `opacity`, `alphaTest`, `depthTest`, and `depthWrite`. Use cloned compatible materials with updated colors for the remaining mappings. Preserve each material's name so a second repair produces the same state.

Eye slots use their material names: `VRayMtl5 → white`, `VRayMtl6 → brown`, `lambert9 → black`.

- [ ] **Step 4: Verify GREEN and all material edge cases**

Run: `npm run test:minion-materials`

Expected: every exact color, denim map, isolation, non-Minion, and idempotence assertion reports `ok`, followed by `ALL PASS`.

Run: `npx tsc --noEmit`

Expected: exit `0` with no diagnostics.

- [ ] **Step 5: Commit the pure repair slice**

```bash
git add lib/models/minionMaterials.ts test/prefabs/minion-materials.test.mjs package.json
git commit -m "feat: restore Minion materials"
```

### Task 2: Shared FBX Integration and Browser Acceptance

**Files:**
- Modify: `components/editor/AnimatedModel.tsx:1-15,189-200`

**Interfaces:**
- Consumes: `repairMinionMaterials(root, modelUrl): boolean` from Task 1.
- Produces: the repaired per-render FBX clone used by starter preview, editor, and player.

- [ ] **Step 1: Integrate repair immediately after cloning**

Import the helper:

```ts
import { repairMinionMaterials } from '../../lib/models/minionMaterials';
```

In `FBXAnimatedModel`'s `onLoad`, insert exactly after `const fbx = model.clone() as THREE.Group;`:

```ts
repairMinionMaterials(fbx, url);
```

Do not repair the cached `model` before cloning and do not add Minion branches elsewhere.

- [ ] **Step 2: Run complete automated verification**

Run:

```bash
npm run test:all
npx tsc --noEmit
npm run build
git diff --check
```

Expected: all tests report `ALL PASS`, TypeScript/build exit `0`, and diff check has no output.

- [ ] **Step 3: Restart development server after production build**

Stop the active dev server, move the generated `.next` directory to a unique temporary directory, then run `npm run dev -- -p 3002`. This prevents production-build artifacts from mixing with dev bundles.

- [ ] **Step 4: Verify the real UI**

In a fresh editor tab:

1. Open **Character → Starters** and confirm the Minion tile has yellow skin, blue denim, dark gloves/shoes, silver goggles, white/brown/black eye, and no gray fallback body.
2. Select Minion and confirm the editor scene shows the same palette.
3. Open Play mode and confirm the same palette.
4. Confirm network requests include the FBX and jeans JPEG with `200` responses and console logs contain no FBX, texture, shader, or material errors.

- [ ] **Step 5: Commit the integration**

```bash
git add components/editor/AnimatedModel.tsx
git commit -m "feat: apply Minion materials in all renderers"
```
