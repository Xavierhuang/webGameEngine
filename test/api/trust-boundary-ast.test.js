const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzeSource } = require('../helpers/trust-boundary-ast.cjs');

const header = `
  import { resolveActor as identify } from '@/lib/auth/actor';
  import { requireProjectEdit as authorize } from '@/lib/auth/access';
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
