/**
 * Who may administer the site, and what they may do to accounts.
 *
 * These rules are the security boundary of the whole admin surface, so they
 * live in a pure module and are exercised branch by branch here rather than
 * only through a route handler nobody can call in a test.
 *
 * The self-demotion and self-delete cases matter most: an owner who removes
 * their own access locks everyone out of the only page that can grant it back,
 * and the recovery is an SSH session and a hand-written UPDATE — which is
 * exactly the situation this console was built to end.
 */

const assert = require('assert');
const {
  parseOwnerEmails, isAdmin, isOwner, canChangeRole, canDeleteAccount, isDisposableAccount,
} = require('../.build/lib/auth/adminAccess');

let passed = 0;
function test(name, fn) {
  try { fn(); } catch (e) { console.error(`FAIL ${name}\n  ${e.message}`); process.exit(1); }
  passed++; console.log(`ok   ${name}`);
}

const OWNERS = ['owner@example.org'];
const owner = { id: 'p-owner', role: 'parent', email: 'Owner@Example.org' };
const admin = { id: 'p-admin', role: 'admin', email: 'mod@site.test' };
const child = { id: 'p-kid', role: 'child', email: 'kid@site.test' };

test('the owner list tolerates real-world formatting', () => {
  assert.deepStrictEqual(parseOwnerEmails('a@b.com, c@d.com'), ['a@b.com', 'c@d.com']);
  assert.deepStrictEqual(parseOwnerEmails(' A@B.com \n c@d.com '), ['a@b.com', 'c@d.com']);
  assert.deepStrictEqual(parseOwnerEmails(''), []);
  assert.deepStrictEqual(parseOwnerEmails(null), []);
  assert.deepStrictEqual(parseOwnerEmails('not-an-email'), [], 'entries without @ are ignored');
});

test('an env-listed owner is an admin whatever the database says', () => {
  // The bootstrap: the two accounts holding role='admin' in production were
  // seeders with no password, so role alone could not let a person in.
  assert.strictEqual(isAdmin(owner, OWNERS), true);
  assert.strictEqual(isOwner(owner, OWNERS), true);
});

test('role=admin is enough without being an owner', () => {
  assert.strictEqual(isAdmin(admin, OWNERS), true);
  assert.strictEqual(isOwner(admin, OWNERS), false);
});

test('everyone else is refused', () => {
  assert.strictEqual(isAdmin(child, OWNERS), false);
  assert.strictEqual(isAdmin(null, OWNERS), false);
  assert.strictEqual(isAdmin({ role: 'parent', email: 'x@y.z' }, []), false);
});

test('nobody may change their own role', () => {
  const d = canChangeRole(admin, { id: admin.id, email: admin.email, role: 'admin' }, 'child', OWNERS);
  assert.strictEqual(d.ok, false);
  assert.match(d.reason, /your own role/i);
});

test('an owner cannot be demoted through the console', () => {
  const d = canChangeRole(admin, { id: owner.id, email: owner.email, role: 'admin' }, 'child', OWNERS);
  assert.strictEqual(d.ok, false, 'demoting an owner would lock the site out of its own console');
});

test('unknown roles are rejected', () => {
  assert.strictEqual(canChangeRole(admin, child, 'superuser', OWNERS).ok, false);
  assert.strictEqual(canChangeRole(admin, child, '', OWNERS).ok, false);
});

test('a normal promotion is allowed', () => {
  assert.strictEqual(canChangeRole(admin, child, 'admin', OWNERS).ok, true);
  assert.strictEqual(canChangeRole(owner, child, 'parent', OWNERS).ok, true);
});

test('a non-admin may change nothing', () => {
  assert.strictEqual(canChangeRole(child, admin, 'child', OWNERS).ok, false);
  assert.strictEqual(canDeleteAccount(child, admin, OWNERS).ok, false);
});

test('deleting is refused for self, owners and admins', () => {
  assert.strictEqual(canDeleteAccount(admin, { ...admin }, OWNERS).ok, false, 'self');
  assert.strictEqual(canDeleteAccount(admin, owner, OWNERS).ok, false, 'owner');
  assert.strictEqual(
    canDeleteAccount(owner, { id: 'p2', role: 'admin', email: 'other@mod.test' }, OWNERS).ok,
    false,
    'an admin must be demoted first — one deliberate step before a destructive one'
  );
});

test('deleting an ordinary account is allowed', () => {
  assert.strictEqual(canDeleteAccount(admin, child, OWNERS).ok, true);
});

test('throwaway test accounts are recognisable', () => {
  // The suites sign up against production; grouping them lets the console
  // offer one tidy-up instead of twenty individual deletes.
  assert.strictEqual(isDisposableAccount('journey123@example.com'), true);
  assert.strictEqual(isDisposableAccount('guest-f88d@temp.local'), true);
  assert.strictEqual(isDisposableAccount('real.person@gmail.com'), false);
  assert.strictEqual(isDisposableAccount(null), false);
});

console.log(`\nadmin access: ${passed} checks passed`);
