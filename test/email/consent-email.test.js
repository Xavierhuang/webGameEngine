const { parentalConsentEmail } = require('../.build/lib/email/send.js');

let failures = 0;
function ok(cond, label) {
  if (!cond) { failures++; console.log(`FAIL ${label}`); }
  else console.log(`ok   ${label}`);
}

const url = 'https://play.lingcode.dev/parent/consent?token=abc123';
const mail = parentalConsentEmail({ childName: 'Sam', consentUrl: url });

ok(mail.subject.includes('Sam'), 'subject names the child');
ok(mail.subject.toLowerCase().includes('permission'), 'subject says what it wants');

// A plain-text part is required — HTML-only mail is heavily spam-filtered, and
// this message must reach a parent.
ok(typeof mail.text === 'string' && mail.text.length > 100, 'has a substantive plain-text body');
ok(mail.text.includes(url), 'plain text contains the consent link');
ok(mail.html.includes(url), 'html contains the consent link');
ok(mail.text.includes('under 13'), 'explains why permission is needed');
ok(mail.text.includes('expires'), 'states that the link expires');
ok(mail.text.includes('/privacy'), 'links the privacy policy');
ok(/ignore this email/i.test(mail.text), 'tells an unexpecting recipient what to do');

// The child's name is attacker-controlled and lands inside HTML.
{
  const evil = parentalConsentEmail({
    childName: '<script>alert(1)</script>',
    consentUrl: url,
  });
  ok(!evil.html.includes('<script>'), 'child name is HTML-escaped in the html body');
  ok(evil.html.includes('&lt;script&gt;'), 'escaped form is present instead');
}

// A crafted URL must not break out of the href attribute.
{
  const evil = parentalConsentEmail({
    childName: 'Sam',
    consentUrl: 'https://x.test/"><script>alert(1)</script>',
  });
  ok(!evil.html.includes('"><script>'), 'consent url is escaped inside the href');
}

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll consent-email tests passed');
