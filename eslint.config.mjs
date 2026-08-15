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

      // React Compiler rules, newly enabled by eslint-config-next 16. They
      // report 67 pre-existing violations across the editor — none of them
      // regressions, all of them older than this upgrade. Fixing them is a
      // real refactor (mostly refs read during render in the 3D components),
      // and folding it into a version bump would make the diff impossible to
      // review and the rollback impossible to reason about.
      //
      // Warnings so they stay visible and countable. They should come back to
      // 'error' one directory at a time.
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
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
