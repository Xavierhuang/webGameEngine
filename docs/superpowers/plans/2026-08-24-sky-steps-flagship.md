# Sky Steps Flagship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new Sky Steps worlds a genuinely playable, editable flagship platformer while preserving existing version-1 projects.

**Architecture:** The approved template catalog gains a second immutable `platformer` version with all level objects, logic blocks, and truthful guided-mission metadata expressed as local, validated data. Pure contract tests verify the designed level’s gameplay requirements; the existing transactional template service then materializes that exact graph without a new runtime or publication system. The existing player renders the supplied keys, controls, collisions, collectibles, hazards, and final goal using only supported blocks.

**Tech Stack:** Next.js 16 App Router, React/React Three Fiber player, TypeScript, Blockly-style logic blocks, Node test runner, MySQL template-world materialization tests.

**Spec:** `docs/superpowers/specs/2026-08-24-sky-steps-flagship-design.md`

## Global Constraints

- Modify only `platformer` version 2; `getWorldTemplate('platformer', 1)` must remain valid and unchanged for existing projects.
- Use only packaged `/models/` and `/backdrops/` assets, current conservative budgets, and block types declared in `BLOCK_SPECS`.
- New worlds remain private drafts; do not add a share, publish, Explore, moderation, or parent-consent bypass.
- Do not introduce a new physics engine, server-authoritative game simulation, score economy, checkpoint persistence, or public marketplace.
- Version-2 guided missions must exactly match server-verified post-creation object/block/play predicates; client outcome assertions must remain non-completing.
- Follow test-driven development: each behavior begins with a focused failing test, then minimal implementation, then green verification.

---

### Task 1: Versioned flagship Sky Steps template

**Files:**
- Modify: `lib/worlds/templates.ts`
- Modify: `test/worlds/templates.test.js`
- Create: `test/worlds/sky-steps-template.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `WorldTemplate`, `WorldTemplateObject`, `WorldTemplateBlock`, `WORLD_TEMPLATES`, `getWorldTemplate(id, version)` from `lib/worlds/templates.ts`.
- Produces: `getWorldTemplate('platformer', 2): WorldTemplate` with a 3–4 minute playable level and exact source-backed world graph.
- Preserves: `getWorldTemplate('platformer', 1)` and its version-1 object/mission graph unchanged.

- [ ] **Step 1: Write failing version and level-shape tests**

Create `test/worlds/sky-steps-template.test.js`. Compile it via `test:sky-steps-template` with `templates.ts`, `templateValidation.ts`, and `definitions.ts`. Assert:

```js
const v1 = getWorldTemplate('platformer', 1);
const v2 = getWorldTemplate('platformer', 2);
assert.ok(v1);
assert.ok(v2);
assert.equal(v1.version, 1);
assert.equal(v2.version, 2);
assert.notDeepEqual(v2, v1);
assert.equal(v2.scenes.length, 1);
assert.equal(v2.scenes[0].objects.filter((o) => o.type === 'platform').length >= 4, true);
assert.equal(v2.scenes[0].objects.filter((o) => o.type === 'collectible').length >= 3, true);
assert.equal(v2.scenes[0].objects.some((o) => o.name === 'Sky Portal'), true);
assert.equal(v2.scenes[0].objects.some((o) => o.name === 'Moving Cloud'), true);
assert.deepEqual(validateWorldTemplate(v2), []);
```

Also update `test/worlds/templates.test.js` so it asserts the catalog has both `platformer:1` and `platformer:2`, while the four other template IDs retain exactly one version.

- [ ] **Step 2: Verify RED**

Run: `npm run test:sky-steps-template`

Expected: FAIL because `getWorldTemplate('platformer', 2)` returns `null`.

- [ ] **Step 3: Add the version-2 source graph**

In `lib/worlds/templates.ts`, retain the current platformer entry as version 1 and add a second `platformer` entry with `version: 2`. Its one Sky Steps scene must contain:

```ts
// Required player controls, including the new explicit Space jump behavior.
{ id: 'sky-hero-space', block_type: 'on_key_press', inputs: { key: 'SPACE' } },
{ id: 'sky-hero-jump', block_type: 'jump' },

// A visible animated cloud hazard using existing runtime blocks.
{ id: 'sky-cloud-loop', block_type: 'forever', children: [
  { id: 'sky-cloud-slide', block_type: 'move', inputs: { direction: 'left', distance: 1 } },
] },

// Each collectible gives existing supported feedback without ending the game.
{ id: 'sky-star-one-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
{ id: 'sky-star-one-say', block_type: 'say', inputs: { text: 'Star collected!' } },

// Only the portal ends the game.
{ id: 'sky-portal-touch', block_type: 'when_touches', inputs: { target: 'Hero' } },
{ id: 'sky-portal-win', block_type: 'you_win', inputs: { message: 'You climbed every Sky Step!' } },
```

Use four platform objects including the start island, at conservative ascending coordinates no farther than 2.5 horizontal world units and no higher than 1 vertical world unit between the intended landing surfaces. Include three stars, `Moving Cloud`, and `Sky Portal`, with local model/backdrop assets only.

- [ ] **Step 4: Make guided missions truthful**

Set exactly these version-2 missions:

```ts
{ id: 'sky-steps-add-platform', title: 'Build a new step', description: 'Add a new platform after the starting steps.', kind: 'object_present', objectId: 'sky-extra-platform' },
{ id: 'sky-steps-add-star', title: 'Add a sky star', description: 'Add a new collectible after the starting stars.', kind: 'object_present', objectId: 'sky-extra-star' },
{ id: 'sky-steps-play', title: 'Play Sky Steps', description: 'Press Play and try the new steps.', kind: 'play_started' },
```

Adjust `lib/worlds/missions.ts` only if its predicate maps the mission’s object type from template source and accepts these target IDs as “add a post-baseline object of this type.” Do not use object names or client supplied titles as evidence.

- [ ] **Step 5: Verify GREEN**

Run: `npm run test:sky-steps-template && npm run test:world-templates && npm run test:world-missions`

Expected: both platformer versions validate; version 1 remains intact; version 2 contains the complete level graph and its object/block missions stay baseline-aware.

- [ ] **Step 6: Commit**

```bash
git add lib/worlds/templates.ts lib/worlds/missions.ts test/worlds/templates.test.js test/worlds/sky-steps-template.test.js package.json
git commit -m "feat: make Sky Steps a flagship platformer"
```

### Task 2: Player-ready flagship gameplay contract

**Files:**
- Create: `lib/worlds/skyStepsContract.ts`
- Create: `test/worlds/sky-steps-contract.test.js`
- Modify: `lib/worlds/templates.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `WorldTemplate` and `WorldTemplateBlock` from `lib/worlds/templates.ts`.
- Produces: `validateSkyStepsFlagship(template: WorldTemplate): string[]`, returning named violations for controls, route spacing, collectibles, hazard, portal, and mission truthfulness.
- Used by: the Task 2 test only initially; no client bundle imports this test contract.

- [ ] **Step 1: Write failing gameplay-contract tests**

Create `test/worlds/sky-steps-contract.test.js` and compile `skyStepsContract.ts`, `templates.ts`, and `definitions.ts`. Assert the real v2 template returns no violations. Clone it and independently prove each failure:

```js
assert.deepEqual(validateSkyStepsFlagship(v2), []);
assert.match(validateSkyStepsFlagship(withoutSpaceJump).join('\n'), /SPACE jump/);
assert.match(validateSkyStepsFlagship(withFarGap).join('\n'), /reachable platform route/);
assert.match(validateSkyStepsFlagship(withoutThirdStar).join('\n'), /three collectibles/);
assert.match(validateSkyStepsFlagship(withoutCloudLoop).join('\n'), /moving cloud/);
assert.match(validateSkyStepsFlagship(withoutPortalWin).join('\n'), /portal win/);
assert.match(validateSkyStepsFlagship(withOldRenameMission).join('\n'), /post-baseline/);
```

- [ ] **Step 2: Verify RED**

Run: `npm run test:sky-steps-contract`

Expected: FAIL because `lib/worlds/skyStepsContract.ts` does not exist.

- [ ] **Step 3: Implement the pure gameplay validator**

Create `lib/worlds/skyStepsContract.ts` as a pure module. Implement `validateSkyStepsFlagship` by flattening the single scene, recursively walking `children`/`elseChildren`, and returning literal, child-readable violation strings. It must check:

```ts
export function validateSkyStepsFlagship(template: WorldTemplate): string[] {
  // 1. character has `on_key_press` SPACE followed by `jump`
  // 2. named Sky Steps route has four platforms and each intended adjacent
  //    platform is <= 2.5 x/z units away and <= 1 y unit higher
  // 3. exactly at least three collectible stars exist
  // 4. Moving Cloud contains a `forever` block with a movement child
  // 5. Sky Portal contains `when_touches Hero` and nested/following `you_win`
  // 6. mission ids/descriptions identify add-platform, add-collectible, play;
  //    none describe renaming/viewing existing content
}
```

Do not couple it to React, the database, or a hidden production write; it is an executable content-quality specification.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:sky-steps-contract && npm run test:runtime && npm run type-check`

Expected: real v2 catalog passes, every independent mutation fails with the intended named violation, and existing runtime behavior remains green.

- [ ] **Step 5: Commit**

```bash
git add lib/worlds/skyStepsContract.ts lib/worlds/templates.ts test/worlds/sky-steps-contract.test.js package.json
git commit -m "test: lock Sky Steps gameplay quality"
```

### Task 3: Materialization and child-facing flagship journey

**Files:**
- Modify: `test/worlds/template-service.integration.mjs`
- Modify: `test/worlds/missions.test.js`
- Modify: `test/worlds/mission-service.integration.mjs`
- Modify: `test/visual/journey.mjs`
- Modify: `components/player/GamePlayer.tsx`
- Modify: `lib/i18n/messages.ts`
- Modify: `lib/i18n/locales/*.ts`

**Interfaces:**
- Consumes: `createWorldFromTemplate({ actor, templateId: 'platformer', templateVersion: 2, title, description })`, baseline-aware mission service, and current `GamePlayer` props.
- Produces: a v2 materialized project graph, truthful mission progress, and child-visible control guidance for Space jump without changing public/private policy.

- [ ] **Step 1: Write failing materialization and journey assertions**

Extend `test/worlds/template-service.integration.mjs` with a version-2 creation test that asserts materialized names include `Hero`, `Sky Step 1`, `Sky Step 2`, `Sky Step 3`, `Star 1`, `Star 2`, `Star 3`, `Moving Cloud`, and `Sky Portal`, and all logic rows use only catalog blocks. Extend mission integration tests to prove starter platforms/stars do not complete v2 add missions, while a later platform and later collectible do.

Extend `test/visual/journey.mjs` after private Sky Steps creation to assert the editor’s private draft badge shows version 2, Play shows `Arrow keys to move` and `Space to jump`, and the loaded player graph contains the portal and all three stars. Do not assert a client-reported win completes a mission.

- [ ] **Step 2: Verify RED**

Run: `npm run test:world-template-service && npm run test:world-mission-service`

Expected: version-2 graph assertions fail until Task 1 data is materialized.

- [ ] **Step 3: Add child-visible jump guidance**

In `components/player/GamePlayer.tsx`, reuse the current local control-hint area and show a localized Space-to-jump instruction whenever the active player graph contains a `SPACE` `on_key_press` plus `jump` pair. Add a new `player.spaceJump` message to `lib/i18n/messages.ts` and every locale module using the same completeness convention as `worlds.*`.

The hint must describe existing controls only; it must not create a manual movement fallback or change authored runtime behavior.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:world-template-service && npm run test:world-mission-service && npm run test:sky-steps-template && npm run test:sky-steps-contract && npm run test:i18n && npm run type-check`

With `gameengine_test` and a fresh local server: `npm run test:journey`

Expected: new v2 projects materialize the full graph, honest add actions advance only their matching mission, the player shows the Space hint, reload preserves graph/status, and Version 1/Blank Game checks remain green.

- [ ] **Step 5: Commit**

```bash
git add test/worlds/template-service.integration.mjs test/worlds/missions.test.js test/worlds/mission-service.integration.mjs test/visual/journey.mjs components/player/GamePlayer.tsx lib/i18n/messages.ts lib/i18n/locales
git commit -m "feat: guide kids through flagship Sky Steps"
```

## Final verification

- [ ] Run `npm run test:world-templates && npm run test:sky-steps-template && npm run test:sky-steps-contract && npm run test:world-template-service && npm run test:world-missions && npm run test:world-mission-service && npm run test:runtime && npm run test:i18n && npm run type-check`.
- [ ] Run `npm run build`; if it is environment-blocked, capture the exact error and verify the production deploy build separately before claiming deployment readiness.
- [ ] Run the Sky Steps browser journey on a fresh local server/test database, inspect the level manually, and confirm current user-created version-1 World Builder projects are unaffected.
- [ ] Independently review all implementation commits for platform reachability, truthful missions, runtime compatibility, private-only boundary preservation, and inaccessible child-facing controls.
