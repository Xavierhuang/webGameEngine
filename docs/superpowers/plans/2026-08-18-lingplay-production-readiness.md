# LingPlay Inclusive Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the complete LingPlay journey responsive, accessible, localized, low-end-device-safe, operationally observable, truthfully documented, and enforced by zero-warning CI.

**Architecture:** Shared semantic UI primitives and one responsive editor shell replace ad hoc modals and fixed panels without changing project commands. Locale metadata and a capability inventory become authoritative data. Performance limits, nonce CSP, configuration validation, privacy-safe operational events, module boundaries, and complete Playwright/axe gates close the production-readiness loop.

**Tech Stack:** React 19, Next.js 16 Proxy/App Router, Radix Dialog, Tailwind CSS, TypeScript, React Three Fiber, `@axe-core/playwright`, MySQL, Node tests, Playwright.

## Global Constraints

- Depend on completed trust, durable-work, and creation-experience plans.
- Touch targets are at least 44 CSS pixels.
- Preserve identical project capabilities across desktop, tablet, and phone.
- Keep canvas-only decoration hidden from assistive technology while exposing essential state/actions through semantic DOM.
- Record locale review status as `machine_draft`, `native_review_pending`, or `native_reviewed`; never imply native review without evidence.
- Arabic receives complete RTL journeys.
- Disable `preserveDrawingBuffer` except during explicit capture.
- Use existing limits as shared defaults: 50 scenes, 500 objects, 5,000 blocks, 300 clones, 20 MiB models, 10 MiB textures, and 10 MiB audio; reject before commit/play.
- Operational events never contain birth dates, emails, raw IPs, prompts, dialogue, titles, recordings, uploads, or direct actor IDs.
- Production must fail startup for unsafe secrets, database, proxy, storage, moderation, or backup configuration.
- Burn lint down to 0 warnings and enforce `--max-warnings=0`; do not disable rules broadly or replace types with `any`.
- No live deployment occurs without a separate instruction.

---

### Task 1: Semantic Fields and Dialog Primitive

**Files:**
- Create: `components/ui/Field.tsx`
- Create: `components/ui/Dialog.tsx`
- Modify: `app/auth/signup/page.tsx`
- Modify: `app/auth/login/page.tsx`
- Modify: `app/projects/new/page.tsx`
- Modify: `components/editor/SelectorModal.tsx`
- Modify: `components/editor/AIAssistant.tsx`
- Modify: `components/editor/ShareDialog.tsx`
- Modify: `components/editor/PaintEditor.tsx`
- Modify: `components/editor/AnimationEditor.tsx`
- Modify: `components/editor/ModelBuilder.tsx`
- Modify: `components/projects/ReportButton.tsx`
- Modify: `components/editor/ObjectsPanel.tsx`
- Modify: `components/editor/SoundRecorder.tsx`
- Create: `test/accessibility/ui-primitives.test.js`
- Create: `test/visual/accessibility-journey.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- `Field` always associates label/help/error with a generated or supplied ID.
- `Dialog` wraps Radix with title/description, initial focus, trap, Escape, background inertness, and trigger focus restoration.

- [ ] **Step 1: Write failing semantic source and browser tests**

```js
test('Field binds visible label and error to its control', () => {
  const html = renderField({ label: 'Game name', error: 'Required' });
  assert.match(html, /<label[^>]+for="[^"]+"/);
  assert.match(html, /aria-describedby="[^"]+"/);
  assert.match(html, /aria-invalid="true"/);
});
```

Browser tests open each modal, assert `role=dialog`, accessible name, initial/trapped focus, Escape close, restoration, and visible keyboard actions. Placeholder-only labels fail.

- [ ] **Step 2: Install axe adapter and verify RED**

Run `npm install --save-dev @axe-core/playwright`, add `test:a11y-journey`, and run focused tests. Expected: current fields/dialogs fail semantics/focus.

- [ ] **Step 3: Implement primitives and migrate every listed surface**

Use Radix primitives already installed. Add `focus-visible`/`focus-within` to object actions; label SoundRecorder name. Preserve existing styling/behavior while replacing overlays.

- [ ] **Step 4: Verify GREEN**

Run UI primitive tests, accessibility journey, type-check, and relevant visual flows.

- [ ] **Step 5: Commit**

Stage Task 1 files and commit `feat: make forms and dialogs accessible`.

---

### Task 2: Responsive Navigation and Editor Shell

**Files:**
- Modify: `components/common/AppNav.tsx`
- Modify: `components/common/LocaleSwitcher.tsx`
- Create: `components/editor/ResponsiveEditorShell.tsx`
- Create: `components/editor/EditorMobileTabs.tsx`
- Modify: `components/editor/GameEditor.tsx`
- Modify: `components/editor/Toolbar.tsx`
- Modify: `components/editor/PropertiesPanel.tsx`
- Modify: `components/editor/SceneTabs.tsx`
- Create: `test/editor/responsive-shell.test.js`
- Create: `test/visual/responsive-editor.mjs`
- Modify: `package.json`

**Interfaces:**
- Phone surfaces: `stage|blocks|objects|properties`; tablet uses focus-managed drawers; desktop uses existing panels.
- Overflow contains Play, Share, Undo, Redo, Help, and project navigation.

- [ ] **Step 1: Write failing breakpoint/navigation tests**

At 390×844, 820×1180, and 1440×900 assert every global route and editor action is reachable, no horizontal overflow, phone shows one primary surface, tablet drawers return focus, desktop retains side-by-side stage/blocks where intended, and touch targets are at least 44×44.

- [ ] **Step 2: Run responsive tests to verify RED**

Expected: hidden global links have no mobile replacement and fixed editor panels overflow.

- [ ] **Step 3: Implement adaptive shell without duplicating editor state**

All presentations consume the creation project store and ephemeral selection. Hide/unmount obscured focus regions. Locale remains in the mobile menu.

- [ ] **Step 4: Verify GREEN**

Run responsive shell/browser tests, accessibility journey, stage-panel, type-check, and build.

- [ ] **Step 5: Commit**

Stage Task 2 files and commit `feat: adapt the editor to phones and tablets`.

---

### Task 3: Complete Locale Inventory, Review Status, and RTL Journeys

**Files:**
- Create: `lib/i18n/localeMetadata.ts`
- Modify: `lib/i18n/messages.ts`
- Modify: `lib/i18n/locales/index.ts`
- Modify: `lib/i18n/locales/ar.ts`
- Modify: `lib/i18n/locales/hi.ts`
- Modify: `lib/i18n/locales/id.ts`
- Modify: `lib/i18n/locales/it.ts`
- Modify: `lib/i18n/locales/ko.ts`
- Modify: `lib/i18n/locales/nl.ts`
- Modify: `lib/i18n/locales/pl.ts`
- Modify: `lib/i18n/locales/ru.ts`
- Modify: `lib/i18n/locales/sv.ts`
- Modify: `lib/i18n/locales/tr.ts`
- Modify: `lib/i18n/locales/uk.ts`
- Modify: `lib/i18n/locales/vi.ts`
- Modify: `app/page.tsx`
- Modify: `app/projects/new/page.tsx`
- Modify: `app/learn/page.tsx`
- Modify: `app/auth/signup/page.tsx`
- Modify: `app/auth/login/page.tsx`
- Modify: `components/editor/AIAssistant.tsx`
- Modify: `components/editor/AnimationEditor.tsx`
- Modify: `components/editor/BackdropSelector.tsx`
- Modify: `components/editor/BlockEditor.tsx`
- Modify: `components/editor/CharacterSelector.tsx`
- Modify: `components/editor/CollectibleSelector.tsx`
- Modify: `components/editor/GameEditor.tsx`
- Modify: `components/editor/ModelBuilder.tsx`
- Modify: `components/editor/ObjectsPanel.tsx`
- Modify: `components/editor/ObstacleSelector.tsx`
- Modify: `components/editor/PaintEditor.tsx`
- Modify: `components/editor/PropertiesPanel.tsx`
- Modify: `components/editor/SceneTabs.tsx`
- Modify: `components/editor/SelectorModal.tsx`
- Modify: `components/editor/ShareDialog.tsx`
- Modify: `components/editor/SoundRecorder.tsx`
- Modify: `components/editor/SoundSelector.tsx`
- Modify: `components/editor/Toolbar.tsx`
- Modify: `components/tutorials/TutorialPanel.tsx`
- Modify: `components/player/GamePlayer.tsx`
- Modify: `components/player/PlayerActions.tsx`
- Modify: `components/player/SpeechOverlay.tsx`
- Modify: `components/player/TouchControls.tsx`
- Modify: `components/common/LocaleSwitcher.tsx`
- Create: `test/i18n/ui-key-inventory.test.js`
- Modify: `test/i18n/messages.test.js`
- Modify: `test/i18n/direction.test.js`
- Create: `test/visual/rtl-journey.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces review metadata for every locale and structured localized control instructions.
- UI inventory fails on child-facing hard-coded English literals in the enumerated surfaces, excluding code examples, proper nouns, and test IDs through an explicit allowlist.

- [ ] **Step 1: Write failing catalog completeness and RTL tests**

Assert every English key exists in every locale, every locale has review status, mobile switcher remains reachable, and Arabic signup→create→edit→Play→share uses RTL direction, correct icon/panel mirroring, readable Blockly/mixed code text, and no English fallback.

- [ ] **Step 2: Run inventory/RTL tests to verify RED**

Expected: landing, creation, tutorials, and modal copy remain hard-coded English.

- [ ] **Step 3: Extract all enumerated copy and mark honest review states**

Mark only substantiated locales `native_reviewed`; mark current generated/unverified locale files `machine_draft` or `native_review_pending`. Use localized fragments rather than English string concatenation.

- [ ] **Step 4: Verify GREEN**

Run messages/languages/direction/UI inventory tests, Arabic browser journey, type-check, and build.

- [ ] **Step 5: Commit**

Stage locale/catalog/surface/test files and commit `feat: complete localized creation journeys`.

---

### Task 4: Shared Project Budgets and Low-End Rendering Path

**Files:**
- Create: `lib/projects/budgets.ts`
- Create: `lib/performance/qualityTier.ts`
- Create: `lib/performance/frameMetrics.ts`
- Modify: `app/api/projects/import/route.ts`
- Modify: `lib/projects/commandSchema.ts`
- Modify: `lib/runtime/interpreter.ts`
- Modify: `components/player/GamePlayer.tsx`
- Modify: `components/editor/CharacterSelector.tsx`
- Modify: `components/editor/ShapePreview.tsx`
- Modify: `lib/utils/modelCache.ts`
- Create: `test/projects/budgets.test.js`
- Create: `test/performance/quality-tier.test.js`
- Create: `test/performance/render-contract.test.js`
- Create: `test/visual/performance-budget.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces one budget table used by import, normal commands, clone runtime, uploads, AI, and Play.
- Produces adaptive `low|medium|high` quality with DPR caps 1, 1.5, and 2.

- [ ] **Step 1: Write failing shared-budget and render-contract tests**

Assert ordinary creation cannot exceed import limits, `preserveDrawingBuffer` is false unless capture is active, parsed object data/bounds are not recomputed per frame, preview models load only when visible under the existing canvas budget, and oversized content fails before mutation/play.

- [ ] **Step 2: Run focused performance tests to verify RED**

Expected: player always preserves the drawing buffer, standard creation lacks shared limits, and starter models eagerly preload.

- [ ] **Step 3: Implement shared limits and adaptive quality**

Move JSON parsing/bounds validation to snapshot preparation. Replace per-frame React state with refs or a 4 Hz publication where visible UI requires it. Apply conservative low tier for coarse pointer, device memory ≤4 GiB, or DPR >2 until measured performance upgrades it.

- [ ] **Step 4: Verify GREEN and automated fixture budgets**

Use representative small/limit/oversized fixtures. At mobile emulation, require no WebGL context loss, no unbounded resource growth over a 60-second loop, and at least 30 rendered frames/second after warmup for the standard fixture. Run runtime/model lifecycle tests too.

- [ ] **Step 5: Commit**

Stage Task 4 files and commit `perf: bound projects and low-end rendering`.

---

### Task 5: Nonce CSP, Security Headers, and Required Configuration

**Files:**
- Modify: `proxy.ts`
- Modify: `next.config.js`
- Create: `lib/config/production.ts`
- Modify: `app/layout.tsx`
- Create: `test/config/production.test.js`
- Create: `test/api/security-headers.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces a fresh per-request nonce through Next 16 Proxy and dynamic rendering.
- Produces CSP plus `Referrer-Policy`, `X-Content-Type-Options`, and route-scoped `Permissions-Policy`.

- [ ] **Step 1: Write failing configuration and live-header tests**

Assert production rejects placeholder/short JWT secret, root/empty DB, missing trusted proxy, asset store, moderation mode, backup destination/key, and unsafe external origins. Live tests assert nonce changes per request, framework scripts carry it, `frame-ancestors 'none'`, `object-src 'none'`, strict referrer/MIME headers, and camera/microphone are disabled except explicit media routes.

- [ ] **Step 2: Run config/header tests to verify RED**

Expected: current config has no CSP/guardrails and DB defaults root/empty.

- [ ] **Step 3: Implement nonce Proxy and startup validation**

Merge with legacy-cookie clearing in the existing `proxy.ts`. Follow local Next 16 CSP guidance: set nonce in request/response CSP headers and force dynamic rendering where necessary. Development alone permits `'unsafe-eval'`; production does not.

- [ ] **Step 4: Verify GREEN**

Run configuration/header tests, production build/start smoke, and core browser journeys under CSP.

- [ ] **Step 5: Commit**

Stage Task 5 files and commit `security: add production browser guardrails`.

---

### Task 6: Privacy-Safe Operations, Status, and Product Truth

**Files:**
- Create: `lib/monitoring/operationalEvents.ts`
- Create: `app/api/events/operations/route.ts`
- Modify: `lib/monitoring/errors.ts`
- Modify: `app/api/health/route.ts`
- Create: `app/status/page.tsx`
- Create: `lib/product/capabilities.ts`
- Modify: `app/page.tsx`
- Modify: `app/privacy/page.tsx`
- Create: `app/community-guidelines/page.tsx`
- Modify: `README.md`
- Create: `docs/operations/monitoring-and-alerts.md`
- Create: `test/monitoring/operational-events.test.js`
- Create: `test/product/capability-inventory.test.js`
- Create: `test/visual/status-page.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces allowlisted operational events and rotating pseudonymous actor keys.
- Produces one capability inventory for block/locale/starter counts, monitoring, backup, consent, storage/deletion, and device support.
- Persists through migration 010's `product_events` table; this task adds no competing telemetry schema.

- [ ] **Step 1: Write failing privacy and product-truth tests**

Reject disallowed content/direct identifiers from events. Assert homepage, privacy, status, community links, and README-derived checked values match the inventory; fail hard-coded “all systems normal,” generic GitHub, stale locale/block/monitoring statements, or missing backup/deletion truth.

- [ ] **Step 2: Run focused tests to verify RED**

Expected: current marketing/README values disagree and status is static.

- [ ] **Step 3: Implement operations sink, status surface, and capability inventory**

Telemetry failure never blocks product flows and has bounded buffering. Health includes redacted database, asset, moderation backlog, deletion backlog, backup age, restore-verification age, and build version. Status renders those states without internal addresses or counts that expose child activity.

- [ ] **Step 4: Verify GREEN**

Run monitoring, capability, status, privacy, type-check, and build tests.

- [ ] **Step 5: Commit**

Stage Task 6 files and commit `feat: make operations and product claims truthful`.

---

### Task 7: Focused Module Splits and Zero-Warning Lint

**Files:**
- Modify: `components/editor/GameEditor.tsx`
- Modify: `components/player/GamePlayer.tsx`
- Create: `components/editor/EditorWorkspace.tsx`
- Create: `components/player/RuntimeScene.tsx`
- Create: `components/player/RuntimeObject.tsx`
- Create: `components/player/PlayerOverlays.tsx`
- Modify: API, editor, player, library, and type files currently reported by ESLint
- Modify: `package.json`
- Create: `test/quality/module-boundaries.test.js`
- Create: `test/quality/lint-gate.test.js`

**Interfaces:**
- Keeps approved boundaries: actor/access, transactions/commands, editor store/shell, player control/speech/runtime/overlays, storage/deletion, monitoring.
- Lint script becomes `eslint . --max-warnings=0`.

- [ ] **Step 1: Write failing module-boundary and lint-gate tests**

Assert editor components do not call project write APIs outside the store, player overlays do not own runtime stepping, auth actor types are not duplicated, no production file exceeds the agreed boundary without an explicit allowlist, and package lint contains `--max-warnings=0`.

- [ ] **Step 2: Run boundary test and `npm run lint -- --max-warnings=0` to verify RED**

Expected: 453 warnings and oversized mixed-responsibility modules fail.

- [ ] **Step 3: Split only approved responsibilities and burn warnings down in batches**

Batch order: route/request schemas and `unknown` error narrowing; auth/safety/database types; editor/player props and runtime unions; remaining libraries/tests; unused imports/variables/console calls. Run affected focused tests after each batch. Do not use new `any`, blanket disables, or anonymous catch swallowing.

- [ ] **Step 4: Enable and verify the permanent gate**

Run module-boundary test, `npm run lint`, `npm run type-check`, runtime/editor/player focused tests, and build. Expected: 0 errors and 0 warnings.

- [ ] **Step 5: Commit**

Stage only reviewed boundary/warning files and commit `refactor: enforce typed module boundaries`.

---

### Task 8: Complete Accessibility, RTL, Performance, and Production CI

**Files:**
- Replace: `scripts/a11y.js`
- Create: `playwright.config.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Create: `docs/accessibility/screen-reader-acceptance.md`
- Create: `docs/performance/low-end-device-acceptance.md`
- Modify: all browser scripts to use shared fixtures/configuration

**Interfaces:**
- Produces one production-build Playwright configuration with desktop/tablet/phone, keyboard/axe, Arabic RTL, security-header, and performance projects.

- [ ] **Step 1: Write a failing CI-manifest test**

Assert CI applies migrations fatally, builds once, starts production once, and runs trust, durable, creation, zero-warning lint, authenticated accessibility, RTL, header, status, and performance projects. Placeholder does not count as a form label; focus traversal is complete rather than 12 Tab presses.

- [ ] **Step 2: Replace ad hoc page audit with authenticated Playwright projects**

Create deterministic users/guest/projects in `gameengine_test`, run full signup/guest→create→edit→Play→save→reload→share→remix→report journeys, and preserve existing specialized visual scripts as focused helpers or migrated specs.

- [ ] **Step 3: Add manual acceptance documents**

Screen-reader checklist names VoiceOver and NVDA journeys, focus/announcement expectations, tester/date/build fields, and issue blocking rules. Low-end device checklist records device/browser/build, startup, frame stability, context loss, memory trend, thermal/battery observations, and release verdict.

- [ ] **Step 4: Run the final repository gate**

```bash
npm run test:trust
npm run test:durable
npm run test:creation
npm run test:all
npm run type-check
npm run lint
npm run build
npx playwright test
```

Expected: every automated command exits 0 with zero lint warnings. Release documentation remains honest about outstanding privacy counsel, native-translation, screen-reader-user, low-end-device, and child usability reviews.

- [ ] **Step 5: Commit**

Stage Task 8 files and commit `test: enforce inclusive production readiness`.
