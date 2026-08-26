# Creator Platform Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair broken creator flows and make releases safer while featuring the maintained starter worlds.

**Architecture:** Add a pure shared model-asset policy that the picker, command schema, and upload route use. Preserve the active production build while compiling a staged `.next` directory, then swap only a verified build. Discovery reuses the existing immutable starter-world catalog rather than duplicating projects.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, MySQL, Node test runner, Playwright, Bash/systemd deployment.

**Spec:** `docs/superpowers/specs/2026-08-26-creator-platform-hardening-design.md`

## Global Constraints

- Preserve Minion FBX, built-in starter GLBs, and approved AI-generated model URLs.
- Do not make World Builder projects public in this release.
- Keep user uploads durable across deploys.
- Do not stop the live service before the candidate build succeeds.
- Every production behavior change has a regression test that fails before the implementation.

---

### Task 1: Restore reliable release gates

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [x] Reproduce the lint failure on `test/helpers/trust-boundary-ast.cjs`.
- [x] Scope plugin-dependent rules to the extension set registered by Next's React plugins, then rerun lint.
- [x] Add `test:critical` for model policy, AI-update, world builder, publication/privacy, and consent coverage.
- [x] Run the critical suite in CI after the existing suite.

### Task 2: Repair and protect model import

**Files:**
- Create: `lib/models/modelPolicy.ts`
- Modify: `components/editor/CharacterSelector.tsx`
- Modify: `app/api/uploads/model/route.ts`
- Modify: `lib/projects/commandSchema.ts`
- Create: `test/models/model-policy.test.js`

- [x] Write failing tests for allowed packaged/uploaded/trusted URLs, rejected arbitrary/insecure/traversal URLs, and valid FBX/GLB signatures.
- [x] Implement the pure URL and model-file validators.
- [x] Use the policy in the picker, command schema (including nested costume/sprite aliases), and model upload route; send `projectId` with the multipart upload and show client-visible errors.
- [x] Run the model-policy and project-command tests against the checked-in Minion FBX.

### Task 3: Stage builds before switching the live output

**Files:**
- Modify: `deploy.sh`

- [x] Build from an isolated temporary sibling directory with a separate dependency tree and durable uploads excluded.
- [x] Swap `.next` and `node_modules` only after a successful build, restore the previous release if restart fails, then clean only the validated temporary directory.
- [x] Run the shell syntax check. The production deployment below is the end-to-end staged-release verification.

### Task 4: Make maintained starter worlds the clear first choice

**Files:**
- Create: `components/worlds/FeaturedWorldTemplates.tsx`
- Modify: `app/explore/page.tsx`

- [x] Write a failing catalog test asserting that all current world templates are featured without hardcoded IDs.
- [x] Render compact, accessible cards from the existing template catalog ahead of legacy examples.
- [x] Reuse the translated World Builder copy and add a direct creation call to action.
- [x] Run the catalog test and production build; browser smoke is part of release verification.

### Task 5: Verify and release

**Files:**
- Modify: none unless verification finds a defect

- [ ] Run lint, type-check, `test:critical`, relevant existing tests, build, smoke, and accessibility checks.
- [ ] Review the diff and confirm no untracked build artifacts or secrets are included.
- [ ] Commit the release with its spec and plan.
- [ ] Deploy through `./deploy.sh`, then run the browser smoke against `https://play.lingcode.dev`.
