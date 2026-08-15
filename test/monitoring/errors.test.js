const { fingerprint, redact } = require('../.build/lib/monitoring/errorFormat.js');

let failures = 0;
function eq(a, b, label) {
  if (!Object.is(a, b)) { failures++; console.log(`FAIL ${label}: expected ${b}, got ${a}`); }
  else console.log(`ok   ${label}`);
}
function ok(c, label) { eq(Boolean(c), true, label); }

// --- redaction. Errors routinely carry secrets in their messages. ----------
ok(!redact('Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123').includes('eyJhbGci'),
  'JWTs are redacted');
ok(!redact('key re_AbCdEfGh12345678 failed').includes('re_AbCdEfGh'),
  'Resend-style keys are redacted');
ok(!redact('using sk-abcdefghijklmnop').includes('sk-abcdefghijklmnop'),
  'sk- keys are redacted');
ok(redact('password: hunter2secret').includes('[redacted]'), 'passwords are redacted');
ok(redact('Authorization: sometokenvalue').includes('[redacted]'), 'auth headers are redacted');
// Ordinary messages must survive intact, or the log becomes useless.
eq(redact('Cannot read property x of undefined'), 'Cannot read property x of undefined',
  'ordinary messages are untouched');
eq(redact(''), '', 'empty string is safe');

// --- fingerprinting groups repeats without merging distinct bugs ----------
{
  const stackA = 'Error: boom\n    at foo (/app/a.js:1:1)\n    at bar (/app/b.js:2:2)';
  const stackB = 'Error: boom\n    at foo (/app/a.js:1:1)\n    at baz (/app/c.js:9:9)';
  eq(fingerprint('client', 'boom', stackA), fingerprint('client', 'boom', stackA),
    'same error fingerprints identically');
  // Only the top frame counts, so the same bug reached by different paths groups.
  eq(fingerprint('client', 'boom', stackA), fingerprint('client', 'boom', stackB),
    'same top frame groups despite differing callers');
  ok(fingerprint('client', 'boom', stackA) !== fingerprint('client', 'different', stackA),
    'different messages do not collide');
  ok(fingerprint('client', 'boom', stackA) !== fingerprint('server', 'boom', stackA),
    'client and server errors are distinct');
  ok(fingerprint('client', 'boom', null).length === 64, 'fingerprint is a sha256 hex digest');
  ok(fingerprint('client', 'boom') === fingerprint('client', 'boom', ''),
    'missing and empty stacks agree');
}

if (failures > 0) { console.log(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nAll monitoring tests passed');
