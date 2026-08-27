const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { analyzeSource } = require('../helpers/trust-boundary-ast.cjs');

const ROOT = path.resolve(__dirname, '../..');

/**
 * Recursively lists source files whose contents match `pattern`.
 *
 * This used to shell out to `rg`. Ripgrep is not installed on the GitHub
 * Actions runner, so that call threw ENOENT and failed this test on every CI
 * run — and because it sits inside `test:all`, it took every later CI step down
 * with it, including the build and the smoke tests. A trust-boundary guard that
 * cannot run in CI guards nothing, so the search is done in-process instead: no
 * undeclared system dependency, and it works for any developer too.
 */
function findFilesMatching(pattern, directories) {
  const matches = [];
  const visit = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        visit(full);
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        if (pattern.test(fs.readFileSync(full, 'utf8'))) matches.push(path.relative(ROOT, full));
      }
    }
  };
  for (const directory of directories) visit(path.join(ROOT, directory));
  return matches.sort();
}

const enforced = (surfacePath, entryPoints) => Object.freeze({
  path: surfacePath,
  state: 'current',
  enforcedBy: 'Task 4',
  entryPoints,
});
const deferredAi = (surfacePath) => Object.freeze({
  path: surfacePath,
  state: 'current',
  deferredTo: 'Task 7',
});

const PROTECTED_SURFACES = Object.freeze({
  project: [
    enforced('app/projects/page.tsx', { default: 'actorOnly' }),
    enforced('app/projects/[id]/page.tsx', { default: 'requireProjectView' }),
    enforced('app/editor/[id]/page.tsx', { default: 'requireProjectEdit' }),
    enforced('app/explore/page.tsx', { default: 'listPublicProjects' }),
    enforced('app/api/projects/route.ts', { GET: 'actorOnly', POST: 'actorOnly' }),
    enforced('app/api/projects/[id]/route.ts', {
      GET: 'requireProjectView',
      PATCH: 'requireProjectEdit',
      DELETE: 'requireProjectEdit',
    }),
    enforced('app/api/projects/[id]/export/route.ts', { GET: 'requireProjectView' }),
    enforced('app/api/projects/explore/route.ts', { GET: 'listPublicProjects' }),
    enforced('app/api/projects/[id]/like/route.ts', { POST: 'requireProjectView' }),
  ],
  nestedResource: [
    enforced('app/api/scenes/route.ts', { POST: 'requireProjectEdit' }),
    enforced('app/api/scenes/[id]/route.ts', {
      PATCH: 'requireResourceEdit',
      DELETE: 'requireResourceEdit',
    }),
    enforced('app/api/game-objects/[id]/route.ts', {
      GET: 'requireResourceView',
      PATCH: 'requireResourceEdit',
      DELETE: 'requireResourceEdit',
    }),
    enforced('app/api/game-objects/[id]/logic-blocks/route.ts', { PUT: 'requireResourceEdit' }),
    enforced('app/api/game-objects/reorder/route.ts', { POST: 'requireResourceEdit' }),
  ],
  upload: [
    enforced('app/api/uploads/audio/route.ts', { POST: 'requireProjectEdit' }),
    enforced('app/api/uploads/model/route.ts', { POST: 'requireProjectEdit' }),
    enforced('app/api/uploads/texture/route.ts', { POST: 'requireProjectEdit' }),
  ],
  playerAndTest: [
    enforced('app/play/[id]/page.tsx', { default: 'requireProjectView' }),
    enforced('app/test/[projectId]/page.tsx', { default: 'requireProjectEdit' }),
  ],
  importAndRemix: [
    enforced('app/api/projects/import/route.ts', { POST: 'actorOnly' }),
    enforced('app/api/projects/[id]/remix/route.ts', { POST: 'requireProjectView' }),
  ],
  adminAndReport: [
    enforced('app/admin/page.tsx', { default: 'requireAdmin' }),
    enforced('app/admin/reports/page.tsx', { default: 'requireAdmin' }),
    enforced('app/api/admin/users/route.ts', {
      GET: 'requireAdmin',
      PATCH: 'requireAdmin',
      DELETE: 'requireAdmin',
    }),
    enforced('app/api/admin/reports/route.ts', { GET: 'requireAdmin', PATCH: 'requireAdmin' }),
    enforced('app/api/reports/route.ts', { POST: 'submitReport' }),
  ],
  // Task 7 owns the ordered actor/access/capability/budget/moderation pipeline.
  // Runtime-only ask/translate/model-generation remain deferred, but project
  // context and project mutation now require the same edit guard as the
  // command route. Keeping the remaining exception exact prevents unrelated
  // surfaces from hiding here.
  ai: [
    enforced('app/api/ai/apply-update/route.ts', { POST: 'requireProjectEdit' }),
    deferredAi('app/api/ai/ask/route.ts'),
    enforced('app/api/ai/chat/route.ts', { POST: 'requireProjectEdit' }),
    deferredAi('app/api/ai/generate-character/route.ts'),
    deferredAi('app/api/ai/translate/route.ts'),
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

test('all 31 protected surfaces exist and are tracked current files', () => {
  const inventory = Object.values(PROTECTED_SURFACES).flat();
  const paths = inventory.map((entry) => entry.path);
  assert.equal(inventory.length, 31);
  assert.equal(new Set(paths).size, inventory.length, 'manifest contains duplicate paths');
  assert.ok(inventory.every((entry) => entry.state === 'current'));

  const trackedPaths = new Set(
    execFileSync('git', ['ls-files', '--', 'app'], { cwd: ROOT, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
  );

  for (const entry of inventory) {
    assert.equal(
      fs.existsSync(path.join(ROOT, entry.path)),
      true,
      `missing protected surface: ${entry.path}`
    );
    assert.equal(trackedPaths.has(entry.path), true, `protected surface is not tracked: ${entry.path}`);
  }
});

test('Task 7 is the only deferral and contains exactly the three runtime-only AI routes', () => {
  const deferred = Object.values(PROTECTED_SURFACES)
    .flat()
    .filter((entry) => 'deferredTo' in entry);
  assert.deepEqual(
    deferred.map(({ path, deferredTo }) => ({ path, deferredTo })),
    [
      { path: 'app/api/ai/ask/route.ts', deferredTo: 'Task 7' },
      { path: 'app/api/ai/generate-character/route.ts', deferredTo: 'Task 7' },
      { path: 'app/api/ai/translate/route.ts', deferredTo: 'Task 7' },
    ]
  );
  assert.ok(
    deferred.every((entry) => PROTECTED_SURFACES.ai.includes(entry)),
    'only the AI category may be deferred',
  );
});

test('every Task 4 entry point has one Actor and an ordered canonical guard or service', () => {
  const problems = [];
  const enforcedEntries = Object.values(PROTECTED_SURFACES)
    .flat()
    .filter((entry) => entry.enforcedBy === 'Task 4');
  assert.equal(enforcedEntries.length, 28);

  for (const entry of enforcedEntries) {
    const source = fs.readFileSync(path.join(ROOT, entry.path), 'utf8');
    problems.push(
      ...analyzeSource(source, entry.path, entry.entryPoints)
        .map((problem) => `${entry.path}:${problem}`)
    );
  }

  assert.deepEqual(problems, [], `AST authorization gaps:\n  ${problems.join('\n  ')}`);
});

test('deprecated implicit-actor authorization APIs are gone at the Task 4 boundary', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/auth/access.ts'), 'utf8');
  assert.doesNotMatch(source, /getActorProfileId/);
  assert.doesNotMatch(source, /getProjectAccess\s*\(project\s*:/);
  assert.doesNotMatch(source, /@deprecated Task 4/);

  const callers = findFilesMatching(
    /getActorProfileId|getProjectAccess\s*\(project\)/,
    ['app', 'lib'],
  ).join('\n');
  assert.equal(callers, '', `deprecated authorization callers remain:\n${callers}`);
});

test('public reads expose allowlisted graph fields and published rows only', () => {
  const objectRoute = fs.readFileSync(
    path.join(ROOT, 'app/api/game-objects/[id]/route.ts'),
    'utf8'
  );
  const objectGet = objectRoute.split('export async function PATCH')[0];
  assert.doesNotMatch(
    objectGet,
    /SELECT \* FROM game_objects/,
    'public object reads must not serialize every current or future database column'
  );

  const projectPage = fs.readFileSync(path.join(ROOT, 'app/projects/[id]/page.tsx'), 'utf8');
  assert.match(
    projectPage,
    /remixed_from = \?[\s\S]*moderation_status = 'published'/,
    'public remix links must use the canonical published state'
  );

  const publicService = fs.readFileSync(path.join(ROOT, 'lib/auth/publicProjects.ts'), 'utf8');
  assert.match(publicService, /p\.moderation_status = 'published'/);
  assert.match(publicService, /toPublicProjectListItem/);
});
