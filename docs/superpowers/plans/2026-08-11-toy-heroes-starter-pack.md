# Toy Heroes Starter Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate ten deterministic, kid-friendly Metal-built GLB characters and integrate them as local starter assets with correct editor/play behavior.

**Architecture:** Extract the dragon's Metal UV-mesh kernel and GLB primitives into a reusable offline generator, then define ten characters as declarative transformed-part catalogs. Generation writes each GLB plus one checked-in TypeScript metadata catalog derived from actual accessor bounds. Existing prefab, preview, model-ownership, canvas-budget, editor, and player contracts consume that metadata without adding new runtime services.

**Tech Stack:** Swift 5, Apple Metal Shading Language, binary glTF 2.0, Node.js test runner, TypeScript, Next.js 14, React Three Fiber, Drei, Three.js.

## Global Constraints

- Produce exactly Dinosaur, Unicorn, Robot, Knight, Wizard, Princess, Astronaut, Ninja, Puppy, and Superhero as additional local GLBs.
- Every model remains static, toy-like, friendly, texture-free, deterministic, under 300 KB, and under 12,000 triangles.
- The complete ten-model pack remains under 2.5 MB.
- Metal remains offline-only; checked-in GLBs and metadata are the browser runtime inputs.
- Upgrade matching primitive starter entries instead of creating duplicates.
- Preserve imported-model fallbacks, primitive behavior, multi-instance material isolation, editor/play scale parity, grounding, and bounds-aware collision.
- Do not add animation, fire, combat systems, alternate costumes/colors, remote generation, schema changes, marketplace features, or upload changes.

---

## File Structure

- `tools/metal-starters/ProceduralParts.metal` — shared Metal kernel for transformed ellipsoid parts.
- `tools/metal-starters/StarterCatalog.swift` — declarative character, part, and material definitions.
- `tools/metal-starters/GLBWriter.swift` — index generation, buffer/accessor assembly, validation, and deterministic GLB serialization.
- `tools/metal-starters/main.swift` — `--character`, `--all`, output-directory, and generated-metadata CLI.
- `tools/metal-starters/generate.sh` — isolated build wrapper and atomic output staging.
- `public/models/starters/*.glb` — ten checked-in runtime assets.
- `lib/prefabs/generatedStarterModels.ts` — checked-in exact URL/bounds/origin/size metadata produced from generated GLBs.
- `test/assets/starter-models.test.js` — black-box pack validation.
- `test/tools/metal-starters-generate.test.js` — CLI, determinism, atomicity, and concurrent-build behavior.
- Existing prefab/editor/player files — consume generated metadata through current contracts.

---

### Task 1: Reusable Metal Starter Generator

**Files:**
- Create: `tools/metal-starters/ProceduralParts.metal`
- Create: `tools/metal-starters/StarterCatalog.swift`
- Create: `tools/metal-starters/GLBWriter.swift`
- Create: `tools/metal-starters/main.swift`
- Create: `tools/metal-starters/generate.sh`
- Create: `test/tools/metal-starters-generate.test.js`
- Modify: `package.json`

**Interfaces:**
- CLI: `generate.sh --character <id> --output-dir <dir>` and `generate.sh --all --output-dir <dir> --metadata <file>`.
- Supported identifiers are the ten lowercase ids from Global Constraints; unknown ids exit nonzero and print `Unknown starter character: <id>`.
- `StarterCharacter` owns `id`, `displayName`, `description`, `aliases`, `defaultSize`, `materials`, and `parts`.
- `StarterPart` owns `name`, `center`, `radius`, `rotation`, tessellation, and material index.

- [ ] **Step 1: Write failing CLI behavior tests**

Create a Node test that runs `generate.sh` with deterministic local `xcrun`/compiler doubles, reusing the process-spawn and temporary-directory pattern from `test/tools/metal-dragon-generate.test.js`. The test cases and exact assertions are:

```js
const expectedIds = ['dinosaur', 'unicorn', 'robot', 'knight', 'wizard',
  'princess', 'astronaut', 'ninja', 'puppy', 'superhero'];

assert.deepEqual(parseCatalogIds(swiftCatalogSource), expectedIds);
assert.deepEqual(await run(['--character', 'spaceship']), {
  code: 1,
  stderr: 'Unknown starter character: spaceship\n',
});
assert.deepEqual(await generatedNames(['--character', 'robot']), ['robot.glb']);
assert.deepEqual(await generatedNames(['--all']), [
  'astronaut.glb', 'dinosaur.glb', 'knight.glb', 'ninja.glb', 'princess.glb',
  'puppy.glb', 'robot.glb', 'superhero.glb', 'unicorn.glb', 'wizard.glb',
]);
assert.deepEqual(await outputsAfterForcedFailure(), outputsBeforeForcedFailure);
assert.equal(new Set(await concurrentBuildDirectories()).size, 2);
assert.deepEqual(await remainingBuildDirectories(), []);
```

- [ ] **Step 2: Add script and verify RED**

Add `test:starter-generator` to run the new Node test. Run it and confirm failure because `tools/metal-starters/generate.sh` is missing.

- [ ] **Step 3: Extract the shared Metal kernel**

Implement the same outward-normal UV ellipsoid generation contract as the corrected dragon kernel, with packed GPU structs and exact ABI stride checks. Keep outward triangle order `[topLeft, topRight, bottomLeft]` and `[topRight, bottomRight, bottomLeft]` in Swift index generation.

- [ ] **Step 4: Implement focused Swift units**

Use these interfaces:

```swift
struct StarterMaterial { let name: String; let color: SIMD4<Float>; let metallic: Float; let roughness: Float }
struct StarterPart { let name: String; let center: SIMD3<Float>; let radius: SIMD3<Float>; let rotation: SIMD3<Float>; let rings: UInt32; let segments: UInt32; let material: Int }
struct StarterCharacter { let id: String; let displayName: String; let description: String; let aliases: [String]; let defaultSize: Float; let materials: [StarterMaterial]; let parts: [StarterPart] }
struct GeneratedBounds: Codable { let min: [Float]; let max: [Float] }

func starterCatalog() -> [StarterCharacter]
func generateVertices(character: StarterCharacter, libraryURL: URL) throws -> [Vertex]
func writeGLB(character: StarterCharacter, vertices: [Vertex], outputURL: URL) throws -> GeneratedBounds
func writeMetadata(results: [(StarterCharacter, GeneratedBounds)], outputURL: URL) throws
```

`GLBWriter` must align chunks/views, honor interleaved POSITION/NORMAL accessors, use one node/mesh per part, validate finite vertices/normals and every index, and atomically replace each completed output.

- [ ] **Step 5: Implement atomic shell orchestration**

Use `mktemp -d`, an EXIT cleanup trap, and a staging output directory. `--all` publishes only after all ten generated outputs and metadata complete. Never recursively remove an unresolved user path; cleanup only the explicit `mktemp` directory.

- [ ] **Step 6: Verify GREEN**

Run `npm run test:starter-generator`, `bash -n tools/metal-starters/generate.sh`, `npm run type-check`, and `git diff --check`.

- [ ] **Step 7: Commit**

```bash
git add package.json tools/metal-starters test/tools/metal-starters-generate.test.js
git commit -m "feat: add reusable Metal starter generator"
```

---

### Task 2: Ten Toy Heroes GLBs and Exact Metadata

**Files:**
- Modify: `tools/metal-starters/StarterCatalog.swift`
- Create: `public/models/starters/dinosaur.glb`
- Create: `public/models/starters/unicorn.glb`
- Create: `public/models/starters/robot.glb`
- Create: `public/models/starters/knight.glb`
- Create: `public/models/starters/wizard.glb`
- Create: `public/models/starters/princess.glb`
- Create: `public/models/starters/astronaut.glb`
- Create: `public/models/starters/ninja.glb`
- Create: `public/models/starters/puppy.glb`
- Create: `public/models/starters/superhero.glb`
- Create: `lib/prefabs/generatedStarterModels.ts`
- Create: `test/assets/starter-models.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces `STARTER_MODEL_METADATA`, keyed by the ten ids, with `{ model_url, size, model_bounds, model_origin_offset }` matching the current dragon render-contract property names.
- Each GLB uses at most four named PBR materials and contains named nodes listed below.

**Required node silhouettes:**

| ID | Required named nodes |
|---|---|
| dinosaur | Body, Head, Snout, LegFrontLeft, LegFrontRight, LegBackLeft, LegBackRight, TailBase, TailTip, BackPlate |
| unicorn | Body, Head, Horn, Mane, Tail, LegFrontLeft, LegFrontRight, LegBackLeft, LegBackRight |
| robot | Torso, HeadScreen, Antenna, ArmLeft, ArmRight, LegLeft, LegRight |
| knight | TorsoArmor, Helmet, Plume, Shield, ToySword, ArmLeft, ArmRight, LegLeft, LegRight |
| wizard | Robe, Head, HatBrim, HatTip, Beard, Staff |
| princess | Gown, Head, Crown, HairLeft, HairRight |
| astronaut | SuitTorso, Helmet, Backpack, ArmLeft, ArmRight, BootLeft, BootRight |
| ninja | Torso, MaskedHead, HeadbandTail, ArmLeft, ArmRight, LegLeft, LegRight |
| puppy | Body, Head, EarLeft, EarRight, LegFrontLeft, LegFrontRight, LegBackLeft, LegBackRight, CurledTail |
| superhero | Torso, Head, Cape, ChestEmblem, ArmLeft, ArmRight, BootLeft, BootRight |

- [ ] **Step 1: Write the failing pack validator**

Generalize the existing GLB reader into `test/helpers/read-glb.js`, preserving correct accessor offset/stride/component handling. Test exact file set, GLB validity, finite attributes, outward winding, required nodes/materials, per-model size/triangle budgets, total size budget, and generated metadata bounds equality.

- [ ] **Step 2: Run validator to verify RED**

Add `test:starter-assets` and run it. Expected: ten missing-file failures.

- [ ] **Step 3: Define deterministic character catalogs**

Use symmetric rounded ellipsoid parts with 8–12 rings and 12–20 segments; small accessories may use 6 rings and 10 segments. Give each catalog the required named nodes and no unlisted weapon except Knight's short rounded `ToySword`. Use a maximum of four materials per model.

Use these default sizes and palettes:

| ID | size | primary palette |
|---|---:|---|
| dinosaur | 30 | green/lime/cream |
| unicorn | 28 | white/pink/gold |
| robot | 32 | blue/silver/cyan |
| knight | 30 | blue/silver/red |
| wizard | 30 | purple/navy/gold |
| princess | 30 | pink/lavender/gold |
| astronaut | 30 | white/blue/orange |
| ninja | 30 | charcoal/red/slate |
| puppy | 32 | amber/cream/brown |
| superhero | 30 | blue/red/yellow |

- [ ] **Step 4: Generate all assets and metadata**

Run `npm run generate:starters`. Confirm ten GLBs and `generatedStarterModels.ts` are published. Run twice and compare SHA-256 for every output; all hashes must match.

- [ ] **Step 5: Verify budgets and geometry**

Run `npm run test:starter-assets && npm run test:dragon-asset`. Expected: all pack and existing dragon checks pass, each model is under its limits, and pack bytes total under 2.5 MB.

- [ ] **Step 6: Commit**

```bash
git add tools/metal-starters/StarterCatalog.swift public/models/starters lib/prefabs/generatedStarterModels.ts test/assets test/helpers package.json
git commit -m "feat: generate Toy Heroes starter assets"
```

---

### Task 3: Prefab, Prompt, and Runtime Integration

**Files:**
- Modify: `lib/prefabs/characters.ts`
- Modify: `lib/prefabs/characterPayload.ts`
- Modify: `lib/models/modelRenderContract.ts`
- Modify: `app/api/ai/generate-character/route.ts` only if the existing response builder needs generic model metadata support
- Modify: `components/editor/CharacterSelector.tsx` only for copy/order necessary to expose the upgraded entries
- Modify: `test/prefabs/dragon-editor.test.js` or split to `test/prefabs/starter-models.test.js`
- Modify: `package.json`

**Interfaces:**
- Every model prefab spreads its corresponding `STARTER_MODEL_METADATA[id]`.
- Matching uses last-explicit-model-keyword semantics across the ten pack characters plus dragon; aliases remain whole-word only.
- Primitive-only prefabs retain existing first-match behavior when no model keyword exists.

- [ ] **Step 1: Write failing prefab and prompt-priority tests**

Assert every id/name/alias returns the local URL and exact generated metadata. Assert no duplicate ids/names. Test `friendly robot`, `wizard hero` → wizard, `astronaut princess` → princess, `ninja robot` → robot, and `dragon riding dinosaur` → dinosaur. Test whole-word boundaries and complete API response metadata.

- [ ] **Step 2: Run focused test to verify RED**

Run the prefab suite and confirm failures because pack entries still use primitives or do not exist.

- [ ] **Step 3: Upgrade prefabs without duplicates**

Upgrade Robot, Knight, Wizard, Princess, Astronaut, Ninja, and Dog-in-place (rename Dog to Puppy while retaining `dog`, `puppy`, `pup`, `doggy`, `hound`, `canine`). Add Dinosaur, Unicorn, and Superhero. Keep Dragon and unrelated primitive starter entries unchanged.

- [ ] **Step 4: Implement deterministic model-keyword priority**

Tokenize the prompt with source positions, match whole-word ids/names/aliases for model-backed entries, and select the match whose final occurrence ends latest in the prompt. Do not use template array order as a tiebreak unless endpoints are equal; for equal endpoints prefer the longer explicit phrase.

- [ ] **Step 5: Verify focused and aggregate tests**

Run prefab, payload, API, render-contract, material ownership, starter-asset, dragon, `test:all`, and type-check commands.

- [ ] **Step 6: Commit**

```bash
git add lib/prefabs lib/models app/api/ai/generate-character/route.ts components/editor/CharacterSelector.tsx test/prefabs package.json
git commit -m "feat: add Toy Heroes to starter picker"
```

---

### Task 4: Production Editor and Play Validation

**Files:**
- Modify only Task 1–3 files when a concrete validation defect requires a focused correction.

**Interfaces:**
- Consumes the ten local GLBs through the existing selector, editor, save/reload, and play flows.
- Produces no new API; supplies final automated and browser evidence.

- [ ] **Step 1: Run full automation**

Run:

```bash
npm run generate:starters
npm run test:starter-generator
npm run test:starter-assets
npm run test:all
npm run type-check
npm run build
```

Expected: all exit 0 and the production build lists editor/play routes.

- [ ] **Step 2: Validate every selector tile**

Open Add Character → Starters in the production app. Confirm all ten tiles show recognizable real models, no duplicate primitive/model entries, and no preview/GLB/WebGL console failures. Scroll the full list, switch tabs, and rapidly close/reopen five times; no context-capacity warning or editor context loss may occur.

- [ ] **Step 3: Validate insertions and persistence**

Insert all ten models into one large scene at separated positions. Confirm usable initial scale and ground contact. Move/rotate/scale at least Dinosaur, Robot, Wizard, Puppy, and Superhero. Save/reload and confirm all ten return independently.

- [ ] **Step 4: Validate play mode**

Enter play mode and compare representative visible sizes/grounding with the editor. Exercise touching logic with a wide model (Dinosaur or Unicorn) and a narrow upright model (Ninja or Astronaut). Confirm no model is double-scaled, buried, floating, or sharing another instance's mutable material.

- [ ] **Step 5: Validate prompt matching**

Use the AI character input for `red dragon warrior`, `friendly robot`, `wizard hero`, `astronaut princess`, and `ninja robot`. Confirm each inserts the expected local prefab without a remote generation wait.

- [ ] **Step 6: Fix only observed defects and reverify**

For each defect, add a failing focused test where automatable, make the smallest correction, rerun the owning focused tests, then repeat full automation and the affected browser step.

- [ ] **Step 7: Commit validation fixes if needed**

Stage only relevant files and commit `fix: polish Toy Heroes starter pack`. Do not create an empty commit.
