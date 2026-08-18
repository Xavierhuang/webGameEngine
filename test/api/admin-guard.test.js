/**
 * Every admin route must actually check that the caller is an admin.
 *
 * The admin surface reads and deletes accounts, so a route that forgets its
 * check is the worst single bug this codebase could ship — and it would look
 * completely normal, because the page in front of it does check.
 *
 * Source-level because these are HTTP handlers behind a session cookie. It is
 * deliberately blunt: any new file under app/api/admin has to authorise.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0;
function test(name, fn) {
  try { fn(); } catch (e) { console.error(`FAIL ${name}\n  ${e.message}`); process.exit(1); }
  passed++; console.log(`ok   ${name}`);
}

function routeFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) routeFiles(full, out);
    else if (/route\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const files = routeFiles('app/api/admin');

test('there are admin routes to check', () => {
  assert.ok(files.length >= 2, `found only ${files.length} admin route file(s)`);
});

test('every exported handler authorises before doing anything', () => {
  const problems = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    // Each exported HTTP handler, up to the end of the file or the next export.
    const handlers = src.split(/export async function /).slice(1);
    for (const h of handlers) {
      const name = h.slice(0, h.indexOf('('));
      if (!/^(GET|POST|PATCH|PUT|DELETE)$/.test(name)) continue;
      if (!/requireAdmin\(actor\)/.test(h)) {
        problems.push(`${file}: ${name} never calls requireAdmin(actor)`);
        continue;
      }
      // The check must gate the work, not merely appear somewhere in the body.
      const beforeGuard = h.slice(0, h.indexOf('requireAdmin(actor)'));
      if (!/resolveActor\(request\)/.test(beforeGuard)) {
        problems.push(`${file}: ${name} does not resolve exactly one request actor before admin authorization`);
      }
      if (/\bawait query\(|\bawait queryOne\(/.test(beforeGuard)) {
        problems.push(`${file}: ${name} touches the database before authorising`);
      }
      const afterGuard = h.slice(h.indexOf('requireAdmin(actor)'));
      if (!/403/.test(afterGuard.slice(0, 400))) {
        problems.push(`${file}: ${name} does not refuse non-admins with 403`);
      }
    }
  }
  assert.deepStrictEqual(problems, [], `unauthorised admin handlers:\n  ${problems.join('\n  ')}`);
});

test('destructive account actions go through the shared rules', () => {
  // The rules are tested on their own; a handler that re-derives them by hand
  // is a second, untested copy of the security boundary.
  const users = files.find((f) => f.includes('users'));
  assert.ok(users, 'the users route has moved');
  const src = fs.readFileSync(users, 'utf8');
  assert.ok(/canChangeRole\(/.test(src), 'role changes bypass canChangeRole');
  assert.ok(/canDeleteAccount\(/.test(src), 'deletes bypass canDeleteAccount');
  assert.ok(/confirmEmail/.test(src), 'account deletion has no server-side confirmation');
});

console.log(`\nadmin guard: ${passed} checks passed`);
