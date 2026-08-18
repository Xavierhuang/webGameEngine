const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');

// Task 3 records the full protected-surface inventory. Task 4 intentionally
// upgrades this same test to assert each surface imports a canonical guard or
// delegates to an approved guarded service after its call sites are converted.
const current = (surfacePath) => Object.freeze({ path: surfacePath, state: 'current' });
const planned = (surfacePath) => Object.freeze({
  path: surfacePath,
  state: 'planned',
  requiredBy: 'Task 4',
});

const PROTECTED_SURFACES = Object.freeze({
  project: [
    current('app/projects/page.tsx'),
    current('app/projects/[id]/page.tsx'),
    current('app/editor/[id]/page.tsx'),
    current('app/explore/page.tsx'),
    current('app/api/projects/route.ts'),
    current('app/api/projects/[id]/route.ts'),
    current('app/api/projects/[id]/export/route.ts'),
    current('app/api/projects/explore/route.ts'),
    current('app/api/projects/[id]/like/route.ts'),
  ],
  nestedResource: [
    current('app/api/scenes/route.ts'),
    current('app/api/scenes/[id]/route.ts'),
    current('app/api/game-objects/[id]/route.ts'),
    current('app/api/game-objects/[id]/logic-blocks/route.ts'),
    current('app/api/game-objects/reorder/route.ts'),
  ],
  upload: [
    current('app/api/uploads/audio/route.ts'),
    current('app/api/uploads/model/route.ts'),
    current('app/api/uploads/texture/route.ts'),
  ],
  playerAndTest: [
    current('app/play/[id]/page.tsx'),
    current('app/test/[projectId]/page.tsx'),
  ],
  importAndRemix: [
    current('app/api/projects/import/route.ts'),
    current('app/api/projects/[id]/remix/route.ts'),
  ],
  adminAndReport: [
    planned('app/admin/page.tsx'),
    current('app/admin/reports/page.tsx'),
    planned('app/api/admin/users/route.ts'),
    current('app/api/admin/reports/route.ts'),
    current('app/api/reports/route.ts'),
  ],
  ai: [
    current('app/api/ai/apply-update/route.ts'),
    current('app/api/ai/ask/route.ts'),
    current('app/api/ai/chat/route.ts'),
    current('app/api/ai/generate-character/route.ts'),
    current('app/api/ai/translate/route.ts'),
  ],
});

test('protected-surface manifest covers every trust-boundary category', () => {
  assert.deepEqual(Object.keys(PROTECTED_SURFACES), [
    'project',
    'nestedResource',
    'upload',
    'playerAndTest',
    'importAndRemix',
    'adminAndReport',
    'ai',
  ]);
});

test('protected-surface manifest is complete, unique, and honest about planned files', () => {
  const inventory = Object.values(PROTECTED_SURFACES).flat();
  const paths = inventory.map((entry) => entry.path);
  assert.equal(inventory.length, 31);
  assert.equal(new Set(paths).size, inventory.length, 'manifest contains duplicate paths');

  const trackedPaths = new Set(
    execFileSync('git', ['ls-files', '--', 'app'], { cwd: ROOT, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
  );
  const currentEntries = inventory.filter((entry) => entry.state === 'current');
  const plannedEntries = inventory.filter((entry) => entry.state === 'planned');

  assert.equal(currentEntries.length, 29);
  assert.deepEqual(plannedEntries, [
    { path: 'app/admin/page.tsx', state: 'planned', requiredBy: 'Task 4' },
    { path: 'app/api/admin/users/route.ts', state: 'planned', requiredBy: 'Task 4' },
  ]);

  for (const entry of currentEntries) {
    assert.equal(
      fs.existsSync(path.join(ROOT, entry.path)),
      true,
      `missing current protected surface: ${entry.path}`
    );
    assert.equal(trackedPaths.has(entry.path), true, `current surface is not tracked: ${entry.path}`);
  }

  for (const entry of plannedEntries) {
    assert.equal(entry.requiredBy, 'Task 4');
    assert.equal(
      trackedPaths.has(entry.path),
      false,
      `tracked surface must be promoted from planned to current: ${entry.path}`
    );
  }
});
