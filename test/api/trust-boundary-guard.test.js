const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');

const enforced = (surfacePath, evidence) => Object.freeze({
  path: surfacePath,
  state: 'current',
  enforcedBy: 'Task 4',
  evidence,
});
const deferredAi = (surfacePath) => Object.freeze({
  path: surfacePath,
  state: 'current',
  deferredTo: 'Task 7',
});

const ACCESS = /from ['"]@\/lib\/auth\/access['"][\s\S]*\b(?:requireProjectView|requireProjectEdit|requireResourceView|requireResourceEdit)\s*\(/;
const ACTOR_SCOPED = /from ['"]@\/lib\/auth\/actor['"][\s\S]*\bresolve(?:Current)?Actor\s*\(/;
const ADMIN = /from ['"]@\/lib\/auth\/admin['"][\s\S]*\brequireAdmin\s*\(/;
const PUBLIC_SERVICE = /from ['"]@\/lib\/auth\/publicProjects['"][\s\S]*\blistPublicProjects\s*\(/;

const PROTECTED_SURFACES = Object.freeze({
  project: [
    enforced('app/projects/page.tsx', ACTOR_SCOPED),
    enforced('app/projects/[id]/page.tsx', ACCESS),
    enforced('app/editor/[id]/page.tsx', ACCESS),
    enforced('app/explore/page.tsx', PUBLIC_SERVICE),
    enforced('app/api/projects/route.ts', ACTOR_SCOPED),
    enforced('app/api/projects/[id]/route.ts', ACCESS),
    enforced('app/api/projects/[id]/export/route.ts', ACCESS),
    enforced('app/api/projects/explore/route.ts', PUBLIC_SERVICE),
    enforced('app/api/projects/[id]/like/route.ts', ACCESS),
  ],
  nestedResource: [
    enforced('app/api/scenes/route.ts', ACCESS),
    enforced('app/api/scenes/[id]/route.ts', ACCESS),
    enforced('app/api/game-objects/[id]/route.ts', ACCESS),
    enforced('app/api/game-objects/[id]/logic-blocks/route.ts', ACCESS),
    enforced('app/api/game-objects/reorder/route.ts', ACCESS),
  ],
  upload: [
    enforced('app/api/uploads/audio/route.ts', ACCESS),
    enforced('app/api/uploads/model/route.ts', ACCESS),
    enforced('app/api/uploads/texture/route.ts', ACCESS),
  ],
  playerAndTest: [
    enforced('app/play/[id]/page.tsx', ACCESS),
    enforced('app/test/[projectId]/page.tsx', ACCESS),
  ],
  importAndRemix: [
    enforced('app/api/projects/import/route.ts', ACTOR_SCOPED),
    enforced('app/api/projects/[id]/remix/route.ts', ACCESS),
  ],
  adminAndReport: [
    enforced('app/admin/page.tsx', ADMIN),
    enforced('app/admin/reports/page.tsx', ADMIN),
    enforced('app/api/admin/users/route.ts', ADMIN),
    enforced('app/api/admin/reports/route.ts', ADMIN),
    enforced('app/api/reports/route.ts', ACCESS),
  ],
  // Task 7 owns the ordered actor/access/capability/budget/moderation pipeline.
  // Keeping this exception exact prevents unrelated surfaces from hiding here.
  ai: [
    deferredAi('app/api/ai/apply-update/route.ts'),
    deferredAi('app/api/ai/ask/route.ts'),
    deferredAi('app/api/ai/chat/route.ts'),
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

test('Task 7 is the only deferral and contains exactly the five AI routes', () => {
  const deferred = Object.values(PROTECTED_SURFACES)
    .flat()
    .filter((entry) => 'deferredTo' in entry);
  assert.deepEqual(
    deferred.map(({ path, deferredTo }) => ({ path, deferredTo })),
    [
      { path: 'app/api/ai/apply-update/route.ts', deferredTo: 'Task 7' },
      { path: 'app/api/ai/ask/route.ts', deferredTo: 'Task 7' },
      { path: 'app/api/ai/chat/route.ts', deferredTo: 'Task 7' },
      { path: 'app/api/ai/generate-character/route.ts', deferredTo: 'Task 7' },
      { path: 'app/api/ai/translate/route.ts', deferredTo: 'Task 7' },
    ]
  );
  assert.deepEqual(PROTECTED_SURFACES.ai, deferred, 'only the AI category may be deferred');
});

test('every Task 4 surface contains canonical guard or guarded-service evidence', () => {
  const missing = [];
  const enforcedEntries = Object.values(PROTECTED_SURFACES)
    .flat()
    .filter((entry) => entry.enforcedBy === 'Task 4');
  assert.equal(enforcedEntries.length, 26);

  for (const entry of enforcedEntries) {
    const source = fs.readFileSync(path.join(ROOT, entry.path), 'utf8');
    if (!entry.evidence.test(source)) missing.push(entry.path);
  }

  assert.deepEqual(missing, [], `unguarded Task 4 surfaces:\n  ${missing.join('\n  ')}`);
});

test('every Task 4 handler and page resolves one actor and invokes its guard', () => {
  const problems = [];
  const entries = Object.values(PROTECTED_SURFACES)
    .flat()
    .filter((entry) => entry.enforcedBy === 'Task 4');

  for (const entry of entries) {
    const source = fs.readFileSync(path.join(ROOT, entry.path), 'utf8');
    const isRoute = entry.path.endsWith('/route.ts');
    const bodies = isRoute
      ? source.split(/export async function (?=GET|POST|PUT|PATCH|DELETE)/).slice(1)
      : [source];
    if (bodies.length === 0) problems.push(`${entry.path}: no protected entry point found`);

    for (const body of bodies) {
      const label = isRoute ? `${entry.path}:${body.slice(0, body.indexOf('('))}` : entry.path;
      const actorCalls = body.match(/\bresolve(?:Current)?Actor\s*\(/g) ?? [];
      if (actorCalls.length !== 1) {
        problems.push(`${label}: expected one actor resolution, found ${actorCalls.length}`);
      }

      let guardCall;
      if (entry.path.includes('/admin')) guardCall = /\brequireAdmin\s*\(actor\)/;
      else if (entry.path.includes('/explore')) guardCall = /\blistPublicProjects\s*\(/;
      else if (
        entry.path === 'app/projects/page.tsx' ||
        entry.path === 'app/api/projects/route.ts' ||
        entry.path === 'app/api/projects/import/route.ts'
      ) guardCall = /\bresolve(?:Current)?Actor\s*\(/;
      else guardCall = /\brequire(?:Project|Resource)(?:View|Edit)\s*\(/;

      if (!guardCall.test(body)) problems.push(`${label}: canonical guard call missing`);
    }
  }

  assert.deepEqual(problems, [], `handler-level authorization gaps:\n  ${problems.join('\n  ')}`);
});

test('deprecated implicit-actor authorization APIs are gone at the Task 4 boundary', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib/auth/access.ts'), 'utf8');
  assert.doesNotMatch(source, /getActorProfileId/);
  assert.doesNotMatch(source, /getProjectAccess\s*\(project\s*:/);
  assert.doesNotMatch(source, /@deprecated Task 4/);

  let callers = '';
  try {
    callers = execFileSync(
      'rg',
      ['-l', 'getActorProfileId|getProjectAccess\\s*\\(project\\)', 'app', 'lib'],
      { cwd: ROOT, encoding: 'utf8' }
    ).trim();
  } catch (error) {
    if (error.status !== 1) throw error;
  }
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
  assert.match(publicService, /toPublicProjectDto\(/);
});
