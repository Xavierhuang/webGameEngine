/**
 * Rate limiting, and telling the truth about it.
 *
 * Found by actually signing up as a user: the signup endpoint allowed 5
 * attempts per hour per IP and told anyone it blocked to "wait a few minutes".
 * This app is aimed at classrooms, where a whole class shares one NAT address.
 * The sixth child to sign up was locked out for an hour, as was everyone after
 * them, and the message sent them back to retry long before the window closed.
 */

const assert = require('assert');
const { readFileSync } = require('fs');
const { rateLimit, resetRateLimits, retryMessage, clientKey } = require('../.build/lib/safety/rateLimit');

let passed = 0;
function test(name, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`);
    process.exit(1);
  }
  passed++;
  console.log(`ok   ${name}`);
}

/** The limit the signup route actually enforces, read from the route. */
function signupLimit() {
  const src = readFileSync('app/api/auth/signup/route.ts', 'utf8');
  const m = src.match(/rateLimit\(\s*clientKey\(request,\s*'signup'\)\s*,\s*(\d+)\s*,\s*([^)]+)\)/);
  assert.ok(m, 'could not find the signup rate limit — has the call been renamed?');
  return { limit: parseInt(m[1], 10), windowExpr: m[2].trim() };
}

test('the signup route itself is sized for a classroom', () => {
  // Bound to the route rather than a copy of the number, so setting it back to
  // 5 fails here instead of passing a test that agrees with itself.
  const { limit } = signupLimit();
  assert.ok(
    limit >= 30,
    `signup allows ${limit} per window — a class of thirty behind one school ` +
      'NAT address would lock each other out'
  );
});

test('a class of thirty can all sign up from one address', () => {
  resetRateLimits();
  const HOUR = 60 * 60 * 1000;
  const { limit } = signupLimit();
  let blocked = 0;
  for (let i = 0; i < 30; i++) {
    if (!rateLimit('signup:school-nat', limit, HOUR).allowed) blocked++;
  }
  assert.strictEqual(blocked, 0, `${blocked} of 30 classmates were locked out`);
});

test('bulk account creation from one address is still bounded', () => {
  resetRateLimits();
  const HOUR = 60 * 60 * 1000;
  const { limit } = signupLimit();
  let allowed = 0;
  for (let i = 0; i < limit * 5; i++) {
    if (rateLimit('signup:spammer', limit, HOUR).allowed) allowed++;
  }
  assert.strictEqual(allowed, limit, 'the cap must still bite');
  assert.ok(limit <= 100, `${limit} per hour per IP is not a meaningful cap`);
});

test('the window is fixed, so being blocked does not extend the lockout', () => {
  resetRateLimits();
  const t0 = 1_000_000;
  for (let i = 0; i < 10; i++) rateLimit('k', 3, 60_000, t0);
  // Hammering during the block must not push resetAt further out.
  const late = rateLimit('k', 3, 60_000, t0 + 59_000);
  assert.strictEqual(late.allowed, false);
  assert.ok(late.retryAfter <= 1, `retryAfter grew to ${late.retryAfter}`);
  const after = rateLimit('k', 3, 60_000, t0 + 60_001);
  assert.strictEqual(after.allowed, true, 'the window must actually reopen');
});

test('separate scopes and IPs do not share a bucket', () => {
  resetRateLimits();
  for (let i = 0; i < 5; i++) rateLimit('signup:1.1.1.1', 5, 60_000);
  assert.strictEqual(rateLimit('signup:1.1.1.1', 5, 60_000).allowed, false);
  assert.strictEqual(rateLimit('login:1.1.1.1', 5, 60_000).allowed, true, 'scope leaked');
  assert.strictEqual(rateLimit('signup:2.2.2.2', 5, 60_000).allowed, true, 'IP leaked');
});

test('the message matches the actual wait', () => {
  // The specific defect: an hour-long window described as "a few minutes".
  assert.match(retryMessage(3600), /hour/, 'an hour must not be called minutes');
  assert.match(retryMessage(1800), /30 minutes/);
  assert.match(retryMessage(120), /2 minutes/);
  assert.match(retryMessage(30), /a minute/);
  assert.match(retryMessage(7200), /2 hours/);
  // Nothing may claim a short wait when the wait is long.
  for (const secs of [3600, 5400, 7200]) {
    assert.doesNotMatch(retryMessage(secs), /few minutes/, `${secs}s described as minutes`);
  }
});

test('clientKey prefers the forwarded address behind nginx', () => {
  const req = (headers) => ({ headers: new Map(Object.entries(headers)) });
  // Map has .get, which is all clientKey uses.
  assert.strictEqual(
    clientKey(req({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }), 'signup'),
    'signup:9.9.9.9',
    'must take the client, not the proxy'
  );
  assert.strictEqual(clientKey(req({}), 'signup'), 'signup:unknown');
});

console.log(`\nrate limiting: ${passed} checks passed`);
