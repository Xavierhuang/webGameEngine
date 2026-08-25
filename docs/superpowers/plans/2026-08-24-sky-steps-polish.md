# Sky Steps Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lively, accessible animation, feedback, HUD, camera presentation, and level polish to playable private Sky Steps v2.

**Architecture:** Pure helpers define procedural model motion and Sky Steps presentation state, while `GamePlayer` consumes them without changing gameplay coordinates or collision surfaces. The existing particle/effect and animation paths are reused; presentation is gated by reduced-motion preference and source-backed Sky Steps v2 identity.

**Tech Stack:** Next.js 16, React Three Fiber, existing `useFrame` player/effects, TypeScript, Node tests, Playwright journey, localization catalog.

**Spec:** `docs/superpowers/specs/2026-08-24-sky-steps-polish-design.md`

## Global Constraints

- Do not change private-world, publication, mission, coordinate, collision, or legacy-v1 behavior.
- Presentation never changes player collider/world positions or touch results.
- Reuse local assets and existing particle/effect primitives; no external assets/packages.
- Reduced motion disables continuous decorative movement, camera bumps, and nonessential particles while preserving state feedback.
- All visible strings are localized across every supported locale; aria-live text contains child-readable names only.

---

### Task 1: Pure procedural motion and Sky Steps presentation state

**Files:**
- Create: `lib/player/presentationMotion.ts`
- Create: `lib/player/skyStepsPresentation.ts`
- Create: `test/player/presentation-motion.test.js`
- Create: `test/player/sky-steps-presentation.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `proceduralMotion(state, time, reducedMotion)`, which returns render-only transform offsets; `deriveSkyStepsPresentation(objects, outcome)` returning collected star count, goal state, and child-readable status.
- Consumes: animation states, visible static Sky Steps object names, and current outcome only.

- [ ] **Step 1: Write failing pure tests**

Assert idle/walk/jump/fall produce bounded visual-only offsets; reduced motion returns identity transforms; source position is never mutated. Assert presentation recognizes three named stars, counts only hidden collected stars, reports `Stars 2/3`, portal goal while incomplete, and win status after the existing game outcome.

- [ ] **Step 2: Verify RED**

Run: `npm run test:presentation-motion && npm run test:sky-steps-presentation`

Expected: FAIL because the pure modules do not exist.

- [ ] **Step 3: Implement pure helpers**

Create render-only transform output:

```ts
export interface PresentationTransform { positionY: number; rotationZ: number; scaleY: number }
export function proceduralMotion(state: 'idle'|'walk'|'jump'|'fall', time: number, reducedMotion: boolean): PresentationTransform;
```

Keep offsets bounded (`abs(positionY) <= .08`, `abs(rotationZ) <= .12`, `.94 <= scaleY <= 1.06`). Create Sky Steps semantic presentation without UUIDs.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm run test:presentation-motion && npm run test:sky-steps-presentation && npm run type-check`

```bash
git add lib/player/presentationMotion.ts lib/player/skyStepsPresentation.ts test/player/presentation-motion.test.js test/player/sky-steps-presentation.test.js package.json
git commit -m "feat: add Sky Steps presentation state"
```

### Task 2: Player animation, effects, HUD, and reduced motion

**Files:**
- Modify: `components/player/GamePlayer.tsx`
- Modify: `components/editor/AnimatedModel.tsx`
- Modify: `lib/i18n/messages.ts`
- Modify: `lib/i18n/locales/*.ts`
- Create: `test/player/sky-steps-polish.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 helpers and existing runtime visibility/outcome callbacks.
- Produces: procedural fallback animation only when authored clip unavailable, one-time star effect/count, portal win effect/card, accessible localized HUD, and reduced-motion behavior.

- [ ] **Step 1: Write failing UI/source behavior tests**

Assert Sky Steps v2 renders a localized star HUD, conditional portal hint, semantic aria-live state, reduced-motion guard, star collection effect path, and win card/effect path. Assert procedural transforms wrap only visual model rendering rather than physics/collider position.

- [ ] **Step 2: Verify RED**

Run: `npm run test:sky-steps-polish`

Expected: FAIL because no polish UI/effect integration exists.

- [ ] **Step 3: Implement the minimal presentation pass**

Use `useFrame` with Task 1 transforms around models lacking a matching clip; keep outer gameplay groups unchanged. Reuse existing particle/effect component for capped sparkle/confetti, triggered by visibility change/outcome once. Add localized `Stars {count}/3`, goal/win card and screen-reader status. Read `prefers-reduced-motion` in a small client-safe hook; turn off decorative animation/effects/camera bump under it.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm run test:sky-steps-polish && npm run test:runtime && npm run test:i18n && npm run type-check`

```bash
git add components/player/GamePlayer.tsx components/editor/AnimatedModel.tsx lib/i18n test/player/sky-steps-polish.test.js package.json
git commit -m "feat: polish Sky Steps gameplay"
```

### Task 3: Flagship journey and final verification

**Files:**
- Modify: `test/visual/journey.mjs`
- Modify: `test/player/sky-steps-polish.test.js`

**Interfaces:**
- Consumes: polished runtime UI/state from Task 2.
- Produces: browser proof of star count, one-time feedback, portal win, reduced-motion compatibility, and unaffected v1/Blank/private paths.

- [ ] **Step 1: Write failing journey assertions**

After the existing real Sky Steps landing/star/portal journey, assert HUD changes from `Stars 0/3` to `Stars 1/3`, collection feedback is one-time, and win card/status is visible. Add a reduced-motion browser context or unit-level equivalent asserting no continuous decorative transform/effect is active.

- [ ] **Step 2: Verify RED, implement, and GREEN**

Run focused player tests, then with fresh server/test DB run `npm run test:journey`. Run `npm run build`, `npm run type-check`, platformer contracts, and private-boundary tests.

- [ ] **Step 3: Commit and review**

```bash
git add test/visual/journey.mjs test/player/sky-steps-polish.test.js
git commit -m "test: prove polished Sky Steps journey"
```

Independently review full polish diff for coordinate/collision isolation, one-time feedback, localization, reduced motion, legacy compatibility, and private-only policy before deployment.
