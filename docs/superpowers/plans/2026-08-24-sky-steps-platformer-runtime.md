# Sky Steps Platformer Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing player with reusable raised-platform collision and coordinates, then deliver a genuinely playable Sky Steps v2 without changing legacy projects or private-world policy.

**Architecture:** A pure platformer-world module becomes the single source of truth for converting persisted design positions, legacy placement, platform surfaces, and character landing/touch math. `GamePlayer` consumes that module for rendering and per-frame physics. Only after that runtime contract is proven does the catalog receive an active Sky Steps v2 and the picker select the latest template version.

**Tech Stack:** Next.js 16, TypeScript, React Three Fiber player, existing lightweight player physics, Blockly runtime, Node test runner, MySQL World Builder service tests, Playwright journey.

**Spec:** `docs/superpowers/specs/2026-08-24-platformer-runtime-for-sky-steps-design.md`

## Global Constraints

- Use the existing player and physics stack; do not add a new rigid-body engine.
- One pure coordinate converter is used by player rendering, character physics, platform surfaces, and touch checks.
- Platform collision covers only top surfaces and grounded jumps; no slope, side-wall, movable-collider, checkpoint, or score work.
- Existing version-1 and non-platformer worlds preserve legacy ground placement and behavior.
- New picker-created Sky Steps worlds use active platformer version 2; every World Builder project remains private-only.
- Missions are baseline-aware object/block/play actions only; outcomes remain non-completing.
- Every changed behavior starts with a focused failing test, then minimal implementation and green verification.

---

### Task 1: Pure coordinate and platform-surface contract

**Files:**
- Create: `lib/player/platformerWorld.ts`
- Create: `test/player/platformer-world.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `toPlayerPosition(position, options)`, `platformTopSurface(object, options)`, `findLandingSurface(character, previousY, nextY, surfaces)`, and `touchesSphere(a, b, radius)`.
- Consumes: persisted `position`, object type/shape/size, a `legacyGround` flag, and current game physics constants.
- Used by: Task 2 player rendering and physics; Task 3 Sky Steps reachability tests.

- [ ] **Step 1: Write failing coordinate/landing tests**

Create `test/player/platformer-world.test.js` and add `test:platformer-world` to compile the pure module. Test literal fixtures:

```js
assert.deepEqual(toPlayerPosition([2, 1, -3], { legacyGround: false }), { x: 2, y: 1, z: -3 });
assert.equal(toPlayerPosition([2, 7, -3], { legacyGround: true }).y, GROUND_Y);
const surface = platformTopSurface({ type: 'platform', position: [2, 1, 0], size: 2 }, { legacyGround: false });
assert.equal(surface.topY, 1);
assert.equal(findLandingSurface({ x: 2, radius: 0.35 }, 1.4, 0.8, [surface])?.id, surface.id);
assert.equal(findLandingSurface({ x: 9, radius: 0.35 }, 1.4, 0.8, [surface]), null);
assert.equal(touchesSphere({ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }, 0.6), true);
```

- [ ] **Step 2: Verify RED**

Run: `npm run test:platformer-world`

Expected: FAIL because `lib/player/platformerWorld.ts` does not exist.

- [ ] **Step 3: Implement pure mechanics**

Create `lib/player/platformerWorld.ts` with no React/database imports. Define exact exported structural types and implementation:

```ts
export const LEGACY_GROUND_Y = -2;
export interface PlayerPoint { x: number; y: number; z: number }
export interface PlatformSurface { id: string; minX: number; maxX: number; minZ: number; maxZ: number; topY: number }
export function toPlayerPosition(position: [number, number, number], options: { legacyGround: boolean }): PlayerPoint;
export function platformTopSurface(object: PlatformObject, options: { legacyGround: boolean }): PlatformSurface | null;
export function findLandingSurface(character: { x: number; z: number; radius: number }, previousY: number, nextY: number, surfaces: PlatformSurface[]): PlatformSurface | null;
export function touchesSphere(a: PlayerPoint, b: PlayerPoint, radius: number): boolean;
```

Landing must require a downward crossing of `topY`, inclusive horizontal footprint overlap, and choose the highest crossed surface. Legacy platforms always return `LEGACY_GROUND_Y`; versioned worlds use their persisted `y` as top height.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:platformer-world && npm run type-check`

Expected: coordinates, legacy compatibility, landing overlap, and touch radius pass with no UI dependency.

- [ ] **Step 5: Commit**

```bash
git add lib/player/platformerWorld.ts test/player/platformer-world.test.js package.json
git commit -m "feat: add platformer world coordinates"
```

### Task 2: Raised platform physics in GamePlayer

**Files:**
- Modify: `components/player/GamePlayer.tsx`
- Create: `lib/player/platformerMotion.ts`
- Create: `test/player/platformer-motion.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `PlatformSurface`, `findLandingSurface`, `LEGACY_GROUND_Y` from Task 1 and existing `GRAVITY`/`JUMP_FORCE` constants.
- Produces: `advancePlatformerMotion(state, delta, surfaces): MotionState`, with grounded top-surface snap behavior.
- Preserves: legacy no-surface ground behavior, current arrow-key motion, and no double jump while airborne.

- [ ] **Step 1: Write failing motion tests**

Create `test/player/platformer-motion.test.js`. Use a literal raised platform at `topY: 1`, then test:

```js
assert.equal(advancePlatformerMotion(falling, 0.1, [raised]).groundedSurfaceId, 'raised');
assert.equal(result.position.y, 1);
assert.equal(result.velocity.y, 0);
assert.equal(requestJump(result).velocity.y, JUMP_FORCE);
assert.equal(requestJump({ ...result, grounded: false }).velocity.y, result.velocity.y);
assert.equal(advancePlatformerMotion(fallingPastMiss, 0.1, [raised]).position.y < 1, true);
```

- [ ] **Step 2: Verify RED**

Run: `npm run test:platformer-motion`

Expected: FAIL because `platformerMotion.ts` does not exist.

- [ ] **Step 3: Implement isolated motion step**

Create `lib/player/platformerMotion.ts`. It applies gravity, calls `findLandingSurface` while descending, snaps to the selected top surface, and exports `requestPlatformerJump` that only changes velocity while grounded. It owns no React refs and no rendering.

- [ ] **Step 4: Integrate the module into GamePlayer**

Replace only the current vertical gravity/ground check in `GamePlayer.tsx` with `advancePlatformerMotion`. Build platform surfaces from scene `platform` objects using Task 1’s converter. Use `toPlayerPosition` when rendering platform meshes and when deriving object/player points for touch detection. Set `legacyGround` unless the loaded project has `project_worlds.template_id === 'platformer'` and `template_version >= 2`.

Keep fixed-ground behavior as the fallback when no raised platform surface catches a falling character. Do not add side collisions.

- [ ] **Step 5: Verify GREEN**

Run: `npm run test:platformer-motion && npm run test:platformer-world && npm run test:runtime && npm run type-check`

Expected: pure raised landing/jump behavior passes; legacy interpreter/runtime and type checks remain green.

- [ ] **Step 6: Commit**

```bash
git add components/player/GamePlayer.tsx lib/player/platformerMotion.ts test/player/platformer-motion.test.js package.json
git commit -m "feat: let players land on raised platforms"
```

### Task 3: Reachable active Sky Steps v2 catalog

**Files:**
- Modify: `lib/worlds/templates.ts`
- Modify: `lib/worlds/templateValidation.ts`
- Create: `lib/worlds/skyStepsContract.ts`
- Modify: `test/worlds/sky-steps-template.test.js`
- Create: `test/worlds/sky-steps-contract.test.js`
- Modify: `test/worlds/templates.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 coordinate/surface math and Task 2 physics constants.
- Produces: version-2 active Sky Steps level with `validateSkyStepsFlagship(template): string[]` plus catalog `active: true` metadata.
- Preserves: all platformer v1 data; v1 remains accessible by exact version lookup.

- [ ] **Step 1: Write failing playable-level contract tests**

Create the contract test asserting the real v2 template has:

```js
assert.deepEqual(validateSkyStepsFlagship(getWorldTemplate('platformer', 2)), []);
assert.match(validateSkyStepsFlagship(withUnreachableStep).join('\n'), /reachable/);
assert.match(validateSkyStepsFlagship(withStarAboveSurface).join('\n'), /reachable star/);
assert.match(validateSkyStepsFlagship(withoutSpaceJump).join('\n'), /SPACE jump/);
assert.match(validateSkyStepsFlagship(withoutPortalTouchWin).join('\n'), /portal win/);
assert.match(validateSkyStepsFlagship(withRenameMission).join('\n'), /post-baseline/);
```

Update the earlier v2 tests so portal/stars are reachable according to the converted platform top surfaces and measured `JUMP_FORCE`/gravity envelope, not an arbitrary raw gap.

- [ ] **Step 2: Verify RED**

Run: `npm run test:sky-steps-contract`

Expected: FAIL because the contract module does not exist and/or current v2 geometry is not reachable.

- [ ] **Step 3: Implement contract and corrected v2 data**

Create the pure contract module. Require all candidate step landings to be reachable under Task 2’s maximum horizontal jump envelope and vertical apex. Require each star and portal center to overlap a reachable platform top within character touch radius. Require three stars, visual-only moving cloud, `SPACE → jump`, `when_touches Hero → you_win`, local assets, and baseline-aware add-platform/add-collectible/play missions.

Replace only platformer v2 data with platform heights/spacings that meet this contract. Each star gets non-terminal visual feedback. Add local sound feedback only if its exact named sound works through current `GamePlayer` sound loading; otherwise tests and copy must not promise sound.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:sky-steps-contract && npm run test:sky-steps-template && npm run test:world-templates && npm run test:world-missions`

Expected: v2 is real-physics reachable, v1 remains unchanged, all assets/blocks validate, and missions remain truthful.

- [ ] **Step 5: Commit**

```bash
git add lib/worlds/templates.ts lib/worlds/templateValidation.ts lib/worlds/skyStepsContract.ts test/worlds/sky-steps-template.test.js test/worlds/sky-steps-contract.test.js test/worlds/templates.test.js package.json
git commit -m "feat: build reachable Sky Steps level"
```

### Task 4: Active-template picker, player guidance, and end-to-end proof

**Files:**
- Modify: `lib/worlds/templateService.ts`
- Modify: `app/api/world-templates/route.ts`
- Modify: `components/worlds/WorldTemplatePicker.tsx`
- Modify: `components/player/GamePlayer.tsx`
- Modify: `lib/i18n/messages.ts`
- Modify: `lib/i18n/locales/*.ts`
- Modify: `test/worlds/template-service.integration.mjs`
- Modify: `test/worlds/template-picker.test.mjs`
- Modify: `test/worlds/mission-service.integration.mjs`
- Modify: `test/visual/journey.mjs`

**Interfaces:**
- Consumes: active `WorldTemplate` metadata, private `createWorldFromTemplate`, and Task 2 player graph inspection.
- Produces: picker DTOs with one active/latest entry per template ID, v2 Sky Steps creation, a localized Space jump hint, and browser proof.

- [ ] **Step 1: Write failing active-version and journey tests**

Assert `GET /api/world-templates` returns exactly one `platformer` DTO with `version: 2`, while direct existing-version service compatibility remains intact. Assert the picker renders only one Sky Steps card. Add materialization assertions for raised Sky Step platforms, three stars, cloud, portal, and v2 metadata. Extend the journey to create Sky Steps, reload, see the private draft v2 status and `Space to jump` hint, and verify expected objects in the player graph.

- [ ] **Step 2: Verify RED**

Run: `npm run test:world-template-picker && npm run test:world-template-service`

Expected: FAIL because the catalog response still returns both platformer versions.

- [ ] **Step 3: Implement active catalog filtering and guidance**

Add a boolean `active` to template catalog metadata; mark platformer v2 active and platformer v1 inactive. `GET /api/world-templates` returns only active versions, one per template ID. The create route still validates the request against the approved catalog version but rejects inactive versions from ordinary picker/API creation. Preserve old project read/play because they already persist their template version.

In `GamePlayer`, show a localized `Space to jump` hint only when the active player object includes `on_key_press` key `SPACE` followed by `jump`. Add every visible string to all locale catalogs under the same completeness rule as `worlds.*`.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:world-template-picker && npm run test:world-template-service && npm run test:world-mission-service && npm run test:i18n && npm run test:platformer-world && npm run test:platformer-motion && npm run test:sky-steps-contract && npm run type-check`

With a clean test database and local server: `npm run test:journey`.

Expected: new worlds choose only v2, old v1 projects stay readable, materialized v2 level is raised/reachable, truthful missions stay baseline-aware, and the browser journey observes Space guidance and the portal/stars.

- [ ] **Step 5: Commit**

```bash
git add lib/worlds/templateService.ts app/api/world-templates/route.ts components/worlds/WorldTemplatePicker.tsx components/player/GamePlayer.tsx lib/i18n test/worlds/template-service.integration.mjs test/worlds/template-picker.test.mjs test/worlds/mission-service.integration.mjs test/visual/journey.mjs
git commit -m "feat: launch active Sky Steps flagship"
```

## Final verification

- [ ] Run all focused platformer, template, service, mission, i18n, runtime, type, and private-boundary tests.
- [ ] Run `npm run build`; record any environmental limitation separately from application failures.
- [ ] Run the fresh-server Sky Steps journey, including creation, reload, Space jump guidance, raised platform landing, star touch, portal win feedback, and v1/Blank Game regression checks.
- [ ] Independently review every task and the combined diff for legacy compatibility, coordinate consistency, physics correctness, active-version filtering, mission truthfulness, and private-only policy.
