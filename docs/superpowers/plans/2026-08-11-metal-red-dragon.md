# Metal-Generated Red Dragon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate one stylized red dragon through an offline Apple Metal compute pipeline, export it as a local GLB, and present it as an interactive 3D web showcase.

**Architecture:** A small macOS-only Swift command-line tool compiles and dispatches a Metal compute kernel that creates transformed procedural dragon parts in GPU buffers, then writes those buffers into a deterministic binary glTF asset. A dedicated React Three Fiber client component loads the checked-in GLB at `/models/red-metal-dragon.glb`, applies red metallic materials, and presents it on a new `/dragon` route with orbit controls and graceful loading/error states.

**Tech Stack:** Swift 5, Apple Metal Shading Language, binary glTF 2.0, Node.js test runner, Next.js 14, React 18, React Three Fiber, Drei, Three.js, TypeScript, Tailwind CSS.

## Global Constraints

- Metal is an offline generation dependency only; normal web development and production rendering must not require macOS or Metal.
- The first version contains exactly one lightweight stylized dragon with a recognizable torso, neck, head, snout, horns, wings, four legs, and tapered tail.
- Use a deep-red metallic PBR body, darker horns, and darker wing membranes.
- Include orbit/zoom interaction, presentation lighting, shadows, and slow automatic rotation.
- Do not add skeletal animation, fire effects, Meshy generation, or additional dragon variants.
- Generated geometry must be deterministic and must contain only finite vertex positions and normals.

---

## File Structure

- `tools/metal-dragon/DragonGenerator.metal` — Metal compute kernel and shared GPU structs for generating transformed ellipsoid/tapered-part vertices and normals.
- `tools/metal-dragon/main.swift` — dragon part declarations, Metal dispatch, triangle-index construction, GLB serialization, and command-line error reporting.
- `tools/metal-dragon/generate.sh` — reproducible `xcrun`/`swiftc` build-and-run entry point that writes the checked-in asset.
- `public/models/red-metal-dragon.glb` — deterministic generated model consumed by the browser.
- `test/assets/red-metal-dragon.test.js` — structural GLB assertions for mesh data, finite attributes, required material slots, and named anatomical nodes.
- `components/showcase/RedMetalDragon.tsx` — model loading, material assignment, shadow setup, and slow rotation.
- `components/showcase/DragonShowcase.tsx` — Canvas, camera, lighting, controls, loading, and WebGL error boundary.
- `app/dragon/page.tsx` — server-rendered page shell and copy for the standalone showcase.
- `test/showcase/red-metal-dragon-page.test.js` — source-level route contract that guards the model URL, Canvas controls, fallback, and accessible page text without adding a new browser-test dependency.
- `package.json` — asset-generation and focused test scripts.

---

### Task 1: Metal Geometry Generator and Deterministic GLB Asset

**Files:**
- Create: `test/assets/red-metal-dragon.test.js`
- Create: `tools/metal-dragon/DragonGenerator.metal`
- Create: `tools/metal-dragon/main.swift`
- Create: `tools/metal-dragon/generate.sh`
- Create: `public/models/red-metal-dragon.glb` (generated output)
- Modify: `package.json`

**Interfaces:**
- Consumes: macOS `MTLDevice`, `MTLCommandQueue`, and a compiled `dragon.metallib` containing `generateDragonVertices`.
- Produces: `public/models/red-metal-dragon.glb`, glTF 2.0 binary, with named nodes `Torso`, `Neck`, `Head`, `Snout`, `HornLeft`, `HornRight`, `WingLeft`, `WingRight`, `LegFrontLeft`, `LegFrontRight`, `LegBackLeft`, `LegBackRight`, and tail segment nodes; materials are named `Dragon Red Metal`, `Dark Horn`, and `Dark Wing`.
- Produces: package scripts `generate:dragon` and `test:dragon-asset`.

- [ ] **Step 1: Write the failing GLB structure test**

Create `test/assets/red-metal-dragon.test.js`. Parse the 12-byte GLB header, JSON chunk, and BIN chunk using only Node built-ins. Assert:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const assetPath = 'public/models/red-metal-dragon.glb';

function readGlb(path) {
  const file = fs.readFileSync(path);
  assert.equal(file.toString('utf8', 0, 4), 'glTF');
  assert.equal(file.readUInt32LE(4), 2);
  assert.equal(file.readUInt32LE(8), file.length);
  const jsonLength = file.readUInt32LE(12);
  assert.equal(file.toString('utf8', 16, 20), 'JSON');
  const json = JSON.parse(file.toString('utf8', 20, 20 + jsonLength).trim());
  const binHeader = 20 + jsonLength;
  assert.equal(file.toString('utf8', binHeader + 4, binHeader + 8), 'BIN\0');
  return { file, json, binOffset: binHeader + 8 };
}

test('Metal-generated dragon has the required anatomy and materials', () => {
  const { json } = readGlb(assetPath);
  const names = new Set(json.nodes.map((node) => node.name));
  for (const name of ['Torso', 'Neck', 'Head', 'Snout', 'HornLeft', 'HornRight',
    'WingLeft', 'WingRight', 'LegFrontLeft', 'LegFrontRight',
    'LegBackLeft', 'LegBackRight']) assert.ok(names.has(name), name);
  assert.deepEqual(json.materials.map((m) => m.name),
    ['Dragon Red Metal', 'Dark Horn', 'Dark Wing']);
});

test('all POSITION and NORMAL floats are finite', () => {
  const { file, json, binOffset } = readGlb(assetPath);
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    for (const semantic of ['POSITION', 'NORMAL']) {
      const accessor = json.accessors[primitive.attributes[semantic]];
      const view = json.bufferViews[accessor.bufferView];
      for (let index = 0; index < accessor.count * 3; index += 1) {
        const value = file.readFloatLE(binOffset + (view.byteOffset || 0) + index * 4);
        assert.ok(Number.isFinite(value), `${semantic}[${index}]`);
      }
    }
  }
});
```

- [ ] **Step 2: Add scripts and run the test to verify it fails**

Add to `package.json`:

```json
"generate:dragon": "bash tools/metal-dragon/generate.sh",
"test:dragon-asset": "node --test test/assets/red-metal-dragon.test.js"
```

Run: `npm run test:dragon-asset`

Expected: FAIL with `ENOENT` for `public/models/red-metal-dragon.glb`.

- [ ] **Step 3: Implement the Metal vertex kernel**

Create `tools/metal-dragon/DragonGenerator.metal` with these exact public GPU contracts:

```metal
#include <metal_stdlib>
using namespace metal;

struct Part {
  packed_float3 center;
  packed_float3 radius;
  packed_float3 rotation;
  uint rings;
  uint segments;
  uint vertexOffset;
};

struct Vertex {
  packed_float3 position;
  packed_float3 normal;
};

kernel void generateDragonVertices(
  device const Part *parts [[buffer(0)]],
  device Vertex *vertices [[buffer(1)]],
  constant uint &partCount [[buffer(2)]],
  uint id [[thread_position_in_grid]]);
```

Each thread must find its owning part from `vertexOffset`, derive its ring/segment coordinates, generate a UV-sphere point, apply `radius`, XYZ Euler rotation, and `center`, then write the transformed position and inverse-scale-corrected normalized normal. Clamp pole inputs before normalization so every float remains finite.

- [ ] **Step 4: Implement the Swift Metal dispatch and GLB exporter**

Create `tools/metal-dragon/main.swift` with matching packed `Part` and `Vertex` layouts and these focused interfaces:

```swift
struct DragonPart {
  let name: String
  let center: SIMD3<Float>
  let radius: SIMD3<Float>
  let rotation: SIMD3<Float>
  let rings: UInt32
  let segments: UInt32
  let material: Int
}

func makeDragonParts() -> [DragonPart]
func makeTriangleIndices(rings: Int, segments: Int, baseVertex: UInt32) -> [UInt32]
func generateVertices(parts: [DragonPart], libraryURL: URL) throws -> [Vertex]
func writeGLB(parts: [DragonPart], vertices: [Vertex], outputURL: URL) throws
```

`makeDragonParts()` must return deterministic entries for all required nodes plus three progressively smaller tail segments. Use symmetric left/right values, with a broad torso, elevated neck/head, flattened swept wings, four vertical legs, and thin horns. Use at least 10 rings and 16 segments for body parts, and 6 rings and 10 segments for horns/tail sections.

`generateVertices` must create the default Metal device, load `dragon.metallib`, dispatch exactly one thread per output vertex, wait for completion, reject command-buffer errors, and reject any vertex whose position or normal contains a non-finite value.

`writeGLB` must:

1. Interleave each part's positions and normals in one aligned BIN buffer section.
2. Append its `UInt32` indices in a separate aligned section.
3. Emit one mesh and one node per part, with POSITION/NORMAL/index accessors.
4. Emit the three material names in test order using PBR factors: body `[0.55, 0.012, 0.018, 1]`, metallic `0.82`, roughness `0.24`; horns `[0.055, 0.018, 0.022, 1]`, metallic `0.58`, roughness `0.3`; wings `[0.19, 0.012, 0.02, 1]`, metallic `0.35`, roughness `0.42`.
5. Pad JSON with spaces and BIN with zero bytes to four-byte alignment and write GLB magic, version `2`, and exact total length.

At program entry, accept `--library <path>` and `--output <path>`, print the output vertex/triangle counts on success, and print `Metal dragon generation failed: <message>` to stderr with exit code 1 on failure.

- [ ] **Step 5: Add the reproducible generator entry point**

Create executable `tools/metal-dragon/generate.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${TMPDIR:-/tmp}/lingplay-metal-dragon"
OUTPUT_PATH="${1:-$SCRIPT_DIR/../../public/models/red-metal-dragon.glb}"
mkdir -p "$BUILD_DIR" "$(dirname "$OUTPUT_PATH")"
xcrun -sdk macosx metal -c "$SCRIPT_DIR/DragonGenerator.metal" -o "$BUILD_DIR/DragonGenerator.air"
xcrun -sdk macosx metallib "$BUILD_DIR/DragonGenerator.air" -o "$BUILD_DIR/dragon.metallib"
xcrun -sdk macosx swiftc "$SCRIPT_DIR/main.swift" -framework Metal -o "$BUILD_DIR/metal-dragon"
"$BUILD_DIR/metal-dragon" --library "$BUILD_DIR/dragon.metallib" --output "$OUTPUT_PATH"
```

Run: `chmod +x tools/metal-dragon/generate.sh && npm run generate:dragon`

Expected: exit 0, a generated `public/models/red-metal-dragon.glb`, and a summary with non-zero vertex and triangle counts.

- [ ] **Step 6: Run asset validation**

Run: `npm run test:dragon-asset`

Expected: 2 tests PASS. Also run `npm run generate:dragon && shasum public/models/red-metal-dragon.glb && npm run generate:dragon && shasum public/models/red-metal-dragon.glb`; expected: both SHA-1 values are identical.

- [ ] **Step 7: Commit the generator and asset**

```bash
git add package.json tools/metal-dragon public/models/red-metal-dragon.glb test/assets/red-metal-dragon.test.js
git commit -m "feat: generate red dragon with Metal"
```

---

### Task 2: Interactive Dragon Web Showcase

**Files:**
- Create: `test/showcase/red-metal-dragon-page.test.js`
- Create: `components/showcase/RedMetalDragon.tsx`
- Create: `components/showcase/DragonShowcase.tsx`
- Create: `app/dragon/page.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: local GLB URL `/models/red-metal-dragon.glb` produced by Task 1.
- Produces: `RedMetalDragon({ autoRotate?: boolean })`, which loads the GLB, clones its scene, applies material properties by material name, enables mesh shadow flags, and rotates only its containing group.
- Produces: default `DragonShowcase`, a client component rendering a full presentation Canvas with fallback UI and accessible control instructions.
- Produces: `/dragon`, a public standalone route.

- [ ] **Step 1: Write the failing showcase contract test**

Create `test/showcase/red-metal-dragon-page.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('dragon route owns an interactive local-asset showcase', () => {
  const model = fs.readFileSync('components/showcase/RedMetalDragon.tsx', 'utf8');
  const scene = fs.readFileSync('components/showcase/DragonShowcase.tsx', 'utf8');
  const page = fs.readFileSync('app/dragon/page.tsx', 'utf8');
  assert.match(model, /\/models\/red-metal-dragon\.glb/);
  assert.match(model, /useFrame/);
  assert.match(model, /castShadow/);
  assert.match(scene, /<Canvas/);
  assert.match(scene, /<OrbitControls/);
  assert.match(scene, /Suspense/);
  assert.match(page, /Red Metal Dragon/);
  assert.match(page, /Drag to orbit/);
});
```

Add `"test:dragon-page": "node --test test/showcase/red-metal-dragon-page.test.js"` to `package.json`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:dragon-page`

Expected: FAIL with `ENOENT` for `components/showcase/RedMetalDragon.tsx`.

- [ ] **Step 3: Implement the focused GLB model component**

Create `components/showcase/RedMetalDragon.tsx` as a client component. Load the asset with `useGLTF('/models/red-metal-dragon.glb')`, deep-clone with `SkeletonUtils.clone(scene)` inside `useMemo`, traverse only the clone, clone every mesh material before editing it, set `castShadow`/`receiveShadow`, and set body/horn/wing material colors, metalness, and roughness according to Task 1.

Use this public API and rotation behavior:

```tsx
export function RedMetalDragon({ autoRotate = true }: { autoRotate?: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (autoRotate && group.current) group.current.rotation.y += delta * 0.18;
  });
  return <group ref={group} position={[0, -1.15, 0]} rotation={[0, -0.45, 0]}>
    <primitive object={dragonScene} />
  </group>;
}

useGLTF.preload('/models/red-metal-dragon.glb');
```

- [ ] **Step 4: Implement Canvas composition and failure states**

Create `components/showcase/DragonShowcase.tsx` as a client component containing:

- an `ErrorBoundary` with a visible `Unable to load the dragon model.` fallback;
- `<Canvas shadows dpr={[1, 2]} camera={{ position: [6.5, 3.6, 8], fov: 42 }}>`;
- dark red-brown `color` background and light fog;
- hemisphere, key directional, red rim point, and low fill lights;
- a shadow-receiving circular ground mesh;
- `<Suspense fallback={<Html center>Forging dragon…</Html>}>` around `RedMetalDragon`;
- `<OrbitControls enablePan={false} minDistance={5} maxDistance={14} minPolarAngle={0.55} maxPolarAngle={1.55} target={[0, 0.7, 0]} />`.

Keep the component height responsive with a minimum of 520px and do not couple it to editor or database state.

- [ ] **Step 5: Add the showcase route**

Create `app/dragon/page.tsx` with metadata title `Red Metal Dragon — lingplay`, a dark full-height page, a small `Back to lingplay` link to `/`, heading `Red Metal Dragon`, a one-sentence statement that it was pre-generated with Apple Metal and is rendered interactively in the browser, the `DragonShowcase`, and the visible instruction `Drag to orbit · Scroll to zoom`.

- [ ] **Step 6: Run focused and static verification**

Run: `npm run test:dragon-page && npm run type-check`

Expected: the focused test passes and TypeScript exits 0.

- [ ] **Step 7: Commit the web showcase**

```bash
git add package.json app/dragon/page.tsx components/showcase test/showcase/red-metal-dragon-page.test.js
git commit -m "feat: render Metal dragon showcase"
```

---

### Task 3: End-to-End Build and Browser Validation

**Files:**
- Modify only files from Tasks 1–2 if validation exposes a concrete defect.

**Interfaces:**
- Consumes: `npm run generate:dragon`, `public/models/red-metal-dragon.glb`, and `/dragon`.
- Produces: a verified production-buildable route and recorded visual acceptance through command output; no new runtime API.

- [ ] **Step 1: Run the complete automated verification set**

Run:

```bash
npm run generate:dragon
npm run test:dragon-asset
npm run test:dragon-page
npm run test:all
npm run type-check
npm run build
```

Expected: every command exits 0; the Next.js build lists `/dragon` as a generated route.

- [ ] **Step 2: Start the production server and inspect the route**

Run: `npm run start` after the successful build, then open `http://localhost:3000/dragon` in the in-app browser.

Expected visual result: one centered red metallic dragon appears above the ground; head, paired horns, two wings, four legs, and a tail are distinguishable; the body slowly turns; highlights move across the red metal surface; no asset or WebGL error appears.

- [ ] **Step 3: Verify interaction and responsive framing**

Drag horizontally and vertically, scroll in and out, then inspect once at a narrow mobile viewport and once at a desktop viewport.

Expected: orbit and constrained zoom respond; panning is disabled; the dragon remains visible and unclipped; the heading and instructions remain readable; browser console has no uncaught errors or failed request for the GLB.

- [ ] **Step 4: Correct only validation defects and re-run affected checks**

If a requirement from Steps 1–3 fails, make the smallest correction in the owning Task 1 or Task 2 file, re-run that task's focused test, then repeat `npm run type-check && npm run build`. Do not add animation, fire, variants, editor integration, or remote assets while correcting the first showcase.

- [ ] **Step 5: Commit validation fixes if any**

If files changed during validation:

```bash
git add package.json tools/metal-dragon/DragonGenerator.metal tools/metal-dragon/main.swift tools/metal-dragon/generate.sh public/models/red-metal-dragon.glb components/showcase/RedMetalDragon.tsx components/showcase/DragonShowcase.tsx app/dragon/page.tsx test/assets/red-metal-dragon.test.js test/showcase/red-metal-dragon-page.test.js
git commit -m "fix: polish red dragon showcase"
```

If no files changed, do not create an empty commit.
