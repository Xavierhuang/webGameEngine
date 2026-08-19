const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { analyzeSource } = require('../helpers/trust-boundary-ast.cjs');

const ROOT = path.resolve(__dirname, '../..');
const EXPECTATIONS = Object.freeze({
  'app/api/admin/reports/route.ts': { GET: 'requireAdmin', PATCH: 'requireAdmin' },
  'app/api/admin/users/route.ts': {
    GET: 'requireAdmin',
    PATCH: 'requireAdmin',
    DELETE: 'requireAdmin',
  },
});

function routeFiles(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) routeFiles(fullPath, output);
    else if (/route\.tsx?$/.test(entry.name)) output.push(path.relative(ROOT, fullPath));
  }
  return output;
}

test('every admin route is explicitly covered by the AST authorization gate', () => {
  assert.deepEqual(
    routeFiles(path.join(ROOT, 'app/api/admin')).sort(),
    Object.keys(EXPECTATIONS).sort()
  );
});

test('every admin handler resolves one Actor and orders requireAdmin before database work', () => {
  const problems = [];
  for (const [file, expectations] of Object.entries(EXPECTATIONS)) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    problems.push(...analyzeSource(source, file, expectations).map((problem) => `${file}:${problem}`));
  }
  assert.deepEqual(problems, [], `admin authorization gaps:\n  ${problems.join('\n  ')}`);
});

test('destructive account actions delegate to behavior-tested shared services', () => {
  const source = fs.readFileSync(path.join(ROOT, 'app/api/admin/users/route.ts'), 'utf8');
  assert.match(source, /canChangeRole\(/, 'role changes bypass canChangeRole');
  assert.match(source, /deleteAdminAccount\(/, 'deletes bypass the atomic deletion service');
  assert.match(source, /confirmEmail/, 'account deletion has no server-side confirmation');
  assert.doesNotMatch(source, /DELETE FROM (?:projects|profiles|users)/, 'route performs direct partial deletes');
});
