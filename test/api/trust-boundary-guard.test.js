const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');

// Task 3 records the full protected-surface inventory. Task 4 intentionally
// upgrades this same test to assert each surface imports a canonical guard or
// delegates to an approved guarded service after its call sites are converted.
const PROTECTED_SURFACES = Object.freeze({
  project: [
    'app/projects/page.tsx',
    'app/projects/[id]/page.tsx',
    'app/editor/[id]/page.tsx',
    'app/api/projects/route.ts',
    'app/api/projects/[id]/route.ts',
    'app/api/projects/[id]/export/route.ts',
    'app/api/projects/explore/route.ts',
    'app/api/projects/[id]/like/route.ts',
  ],
  nestedResource: [
    'app/api/scenes/route.ts',
    'app/api/scenes/[id]/route.ts',
    'app/api/game-objects/[id]/route.ts',
    'app/api/game-objects/[id]/logic-blocks/route.ts',
    'app/api/game-objects/reorder/route.ts',
  ],
  upload: [
    'app/api/uploads/audio/route.ts',
    'app/api/uploads/model/route.ts',
    'app/api/uploads/texture/route.ts',
  ],
  playerAndTest: [
    'app/play/[id]/page.tsx',
    'app/test/[projectId]/page.tsx',
  ],
  importAndRemix: [
    'app/api/projects/import/route.ts',
    'app/api/projects/[id]/remix/route.ts',
  ],
  adminAndReport: [
    'app/admin/page.tsx',
    'app/admin/reports/page.tsx',
    'app/api/admin/users/route.ts',
    'app/api/admin/reports/route.ts',
    'app/api/reports/route.ts',
  ],
  ai: [
    'app/api/ai/apply-update/route.ts',
    'app/api/ai/ask/route.ts',
    'app/api/ai/chat/route.ts',
    'app/api/ai/generate-character/route.ts',
    'app/api/ai/translate/route.ts',
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

test('protected-surface manifest is complete, unique, and points to real files', () => {
  const inventory = Object.values(PROTECTED_SURFACES).flat();
  assert.equal(inventory.length, 30);
  assert.equal(new Set(inventory).size, inventory.length, 'manifest contains duplicate paths');

  for (const relativePath of inventory) {
    assert.equal(
      fs.existsSync(path.join(ROOT, relativePath)),
      true,
      `missing protected surface: ${relativePath}`
    );
  }
});
