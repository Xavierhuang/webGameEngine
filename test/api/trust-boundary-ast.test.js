const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzeSource } = require('../helpers/trust-boundary-ast.cjs');

const header = `
  import { resolveActor as identify } from '@/lib/auth/actor';
  import { requireProjectEdit as authorize } from '@/lib/auth/access';
  import { deleteAdminAccount as deleteAccount } from '@/lib/auth/adminDeletion';
  import { reorderSceneObjects as mutate } from '@/lib/auth/reorder';
  import { futureMutation } from '@/lib/future-boundary-helper';
  import { query as load } from '@/lib/mysql/server';
`;

test('bound import aliases and ordered Actor/guard/query calls pass', () => {
  const source = `${header}
    export async function GET(request) {
      const subject = await identify(request);
      await authorize(subject, 'project');
      return load('SELECT 1');
    }
  `;
  assert.deepEqual(analyzeSource(source, 'fixture.ts', { GET: 'requireProjectEdit' }), []);
});

test('comments and dead or nested guard calls cannot satisfy the gate', () => {
  for (const body of [
    `// identify(request); authorize(subject, 'project');\nreturn load('SELECT 1');`,
    `const subject = await identify(request); if (false) await authorize(subject, 'project'); return load('SELECT 1');`,
    `const subject = await identify(request); async function unused() { await authorize(subject, 'project'); } return load('SELECT 1');`,
  ]) {
    const problems = analyzeSource(`${header} export async function GET(request) { ${body} }`, 'fixture.ts', {
      GET: 'requireProjectEdit',
    });
    assert.ok(problems.length > 0, `fixture unexpectedly passed: ${body}`);
  }
});

test('a query or write before the guard fails even when a later guard exists', () => {
  const source = `${header}
    export async function GET(request) {
      const subject = await identify(request);
      await load('UPDATE projects SET title = title');
      await authorize(subject, 'project');
    }
  `;
  assert.match(
    analyzeSource(source, 'fixture.ts', { GET: 'requireProjectEdit' }).join('\n'),
    /before authorization/
  );
});

test('a guard in an unrelated handler does not protect another entry point', () => {
  const source = `${header}
    export async function GET(request) {
      const subject = await identify(request);
      return load('SELECT 1');
    }
    export async function POST(request) {
      const subject = await identify(request);
      await authorize(subject, 'project');
      return load('UPDATE projects SET title = title');
    }
  `;
  const problems = analyzeSource(source, 'fixture.ts', {
    GET: 'requireProjectEdit',
    POST: 'requireProjectEdit',
  });
  assert.ok(problems.some((problem) => problem.startsWith('GET:')));
  assert.ok(!problems.some((problem) => problem.startsWith('POST:')));
});

test('duplicate Actor resolution fails', () => {
  const source = `${header}
    export async function GET(request) {
      const subject = await identify(request);
      await identify(request);
      await authorize(subject, 'project');
      return load('SELECT 1');
    }
  `;
  assert.match(
    analyzeSource(source, 'fixture.ts', { GET: 'requireProjectEdit' }).join('\n'),
    /exactly one canonical actor call, found 2/
  );
});

test('admin aliases receive the same Actor binding and ordering checks', () => {
  const source = `
    import { resolveActor as identify } from '@/lib/auth/actor';
    import { requireAdmin as authorizeAdmin } from '@/lib/auth/admin';
    import { query as destroy } from '@/lib/mysql/server';
    export async function DELETE(request) {
      const subject = await identify(request);
      await authorizeAdmin(subject);
      return destroy('DELETE FROM users');
    }
  `;
  assert.deepEqual(analyzeSource(source, 'fixture.ts', { DELETE: 'requireAdmin' }), []);
});

test('a guard nested under a runtime conditional cannot dominate a later query', () => {
  const source = `${header}
    export async function GET(request) {
      const subject = await identify(request);
      if (request.headers.has('x-allowed')) await authorize(subject, 'project');
      return load('SELECT 1');
    }
  `;
  assert.match(
    analyzeSource(source, 'fixture.ts', { GET: 'requireProjectEdit' }).join('\n'),
    /conditional|dominate/i
  );
});

test('delegated and future local mutations before the guard are privileged effects', () => {
  for (const effect of [
    `await mutate('scene', ['object']);`,
    `await deleteAccount(subject, request);`,
    `await futureMutation(request);`,
  ]) {
    const source = `${header}
      export async function POST(request) {
        const subject = await identify(request);
        ${effect}
        await authorize(subject, 'project');
      }
    `;
    assert.match(
      analyzeSource(source, 'fixture.ts', { POST: 'requireProjectEdit' }).join('\n'),
      /before authorization/,
      `fixture unexpectedly passed: ${effect}`
    );
  }
});

test('exported const HEAD and OPTIONS handlers cannot bypass manifest coverage', () => {
  const source = `${header}
    export const HEAD = async (request) => {
      const subject = await identify(request);
      await authorize(subject, 'project');
      return load('SELECT 1');
    };
    export const OPTIONS = async function (request) {
      const subject = await identify(request);
      await authorize(subject, 'project');
      return load('SELECT 1');
    };
  `;
  const problems = analyzeSource(source, 'fixture.ts', {});
  assert.ok(problems.includes('HEAD: exported entry point is missing from the manifest'));
  assert.ok(problems.includes('OPTIONS: exported entry point is missing from the manifest'));
});

test('canonical Actor and boundary calls must be unconditionally entered', () => {
  const conditionalBodies = [
    `const subject = await identify(request); request.ok && await authorize(subject, 'project');`,
    `const subject = await identify(request); for (const item of request.items) await authorize(subject, item);`,
    `const subject = await identify(request); switch (request.mode) { case 'ok': await authorize(subject, 'project'); }`,
    `const subject = await identify(request); try { throw new Error('x'); } catch { await authorize(subject, 'project'); }`,
    `const subject = await identify(request); request.ok ? await authorize(subject, 'project') : undefined;`,
  ];
  for (const body of conditionalBodies) {
    const source = `${header} export async function GET(request) { ${body} return load('SELECT 1'); }`;
    assert.match(
      analyzeSource(source, 'fixture.ts', { GET: 'requireProjectEdit' }).join('\n'),
      /conditional|dominate/i,
      `fixture unexpectedly passed: ${body}`
    );
  }

  const conditionalActor = `${header}
    export async function GET(request) {
      let subject;
      if (request.ok) subject = await identify(request);
      await authorize(subject, 'project');
      return load('SELECT 1');
    }
  `;
  assert.match(
    analyzeSource(conditionalActor, 'fixture.ts', { GET: 'requireProjectEdit' }).join('\n'),
    /actor call is conditional/i
  );
});

test('a straight-line Actor and guard inside an unconditionally entered try block pass', () => {
  const source = `${header}
    export async function GET(request) {
      try {
        const subject = await identify(request);
        await authorize(subject, 'project');
        return load('SELECT 1');
      } catch (error) {
        throw error;
      }
    }
  `;
  assert.deepEqual(analyzeSource(source, 'fixture.ts', { GET: 'requireProjectEdit' }), []);
});

test('an exported const handler is analyzed when it is in the manifest', () => {
  const source = `${header}
    export const GET = async (request) => {
      const subject = await identify(request);
      await authorize(subject, 'project');
      return load('SELECT 1');
    };
  `;
  assert.deepEqual(analyzeSource(source, 'fixture.ts', { GET: 'requireProjectEdit' }), []);
});
