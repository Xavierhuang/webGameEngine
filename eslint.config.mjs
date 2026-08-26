/**
 * ESLint flat config.
 *
 * Replaces .eslintrc.json, which ESLint 9 no longer reads by default. The
 * upgrade to Next 16 forced this: eslint-config-next 16 requires ESLint 9.
 *
 * Worth knowing: Next 16 removed `next lint` entirely, and with it the
 * lint-on-build gate that `eslint.ignoreDuringBuilds: false` used to provide.
 * Linting is now only enforced by `npm run lint` and by CI. The rules below
 * are load-bearing — react/no-unstable-nested-components is the one that
 * catches the defect that left the animation viewport empty — so if CI stops
 * running lint, nothing catches them at all.
 */

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default [
  {
    // `next lint` only ever covered the app source. `eslint .` covers the
    // whole tree, which pulled in git worktrees, compiled test output and
    // generated assets — 393 files from .worktrees alone.
    ignores: [
      '.next/**',
      'node_modules/**',
      '.worktrees/**',
      'test/.build/**',
      'public/**',
      'next-env.d.ts',
      'tools/**/dist/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // eslint-config-next registers its React plugins for this source set.
    // Keep our React rules on the same files so CommonJS test helpers can be
    // linted without trying to resolve browser-only React plugins.
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // A component declared inside another is remounted on every parent
      // render, losing its refs and re-running its effects. That is what left
      // the animation editor's viewport empty while every test stayed green,
      // so it is an error, not a warning.
      'react/no-unstable-nested-components': ['error', { allowAsProps: true }],

      // React Compiler rules, enabled by eslint-config-next 16. Errors, so no
      // NEW code can introduce these patterns. The files that already contain
      // them are listed in the override below, each for a stated reason.
      'react-hooks/refs': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/purity': 'error',
    },
  },
  {
    /**
     * Files that predate these rules and where the flagged pattern is correct.
     *
     * Every violation has been read individually, twice. Two were real defects
     * and are fixed: FPSCounter seeded a ref with `performance.now()` during
     * render (an impure call that also read a server clock the client never
     * sees), and usePhysicsBody returned `bodyRef.current` — a snapshot that
     * was null on first render and never updated, stale by construction.
     * PhysicsProvider is off this list as a result.
     *
     * The remaining 65 are deliberate and, in this codebase, right:
     *
     * - `set-state-in-effect` in TutorialPanel, projects/new, PaintEditor and
     *   ShapePreview. Each reads something that only exists in the browser —
     *   localStorage, a random seed, a canvas, IntersectionObserver — and the
     *   effect is what keeps the server and client renders identical. Moving
     *   the read into a lazy useState initialiser would satisfy the rule and
     *   introduce a hydration mismatch: TutorialPanel's saved progress decides
     *   which tutorials render a "done" badge on the very first paint.
     *
     * - `refs` and `immutability` in the player, the 3D views and the
     *   collaboration provider. These are an imperative game runtime driven by
     *   useFrame. They lazily initialise refs (`if (!ref.current) ref.current =
     *   new RuntimeWorld()`, an idiom React's own docs recommend for expensive
     *   construction) and mirror React state into refs so the block
     *   interpreter can read it at 60fps without re-rendering. Restructuring
     *   that bridge is a rewrite of the game loop with real risk to gameplay,
     *   in exchange for lint cleanliness.
     *
     * One more category worth naming: TouchControls writes refs inside pointer
     * handlers, which is correct at runtime — the rule is conservative about
     * handlers defined in a component body. Restructuring working touch input
     * to satisfy a static analysis would trade a real risk for a cosmetic one.
     *
     * The cost of scoping it this way, stated plainly: new violations inside
     * these twelve files are not caught. Everywhere else in the app they are
     * errors and fail the build. Shrinking this list is worthwhile work; doing
     * it under cover of a version upgrade was not.
     */
    files: [
      'app/projects/new/page.tsx',
      'components/editor/AnimatedModel.tsx',
      'components/editor/AnimationEditor.tsx',
      'components/editor/GameEditor.tsx',
      'components/editor/PaintEditor.tsx',
      'components/editor/SceneView.tsx',
      'components/editor/ShapePreview.tsx',
      'components/player/GamePlayer.tsx',
      'components/player/TouchControls.tsx',
      'components/realtime/CollaborationProvider.tsx',
      'components/showcase/DragonShowcase.tsx',
      'components/tutorials/TutorialPanel.tsx',
    ],
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
    },
  },
  {
    // Node-side scripts and tests are CommonJS and print to stdout on purpose.
    files: ['scripts/**', 'tools/**', 'test/**', '*.config.{js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
