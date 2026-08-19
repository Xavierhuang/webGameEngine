/**
 * Right-to-left languages need `dir`, not just `lang`.
 *
 * Arabic text inside a left-to-right layout renders with punctuation on the
 * wrong side and the whole interface mirrored away from the reading eye. The
 * document was hardcoded to `<html lang={locale}>` with no `dir` at all, so
 * adding Arabic to the picker would have produced a page that is technically
 * in the language and unusable in it.
 */

const fs = require('fs');
const assert = require('assert');
const { directionFor, isRTL, RTL_LOCALES } = require('../.build/lib/i18n/direction');

let passed = 0;
function test(name, fn) {
  try { fn(); } catch (e) { console.error(`FAIL ${name}\n  ${e.message}`); process.exit(1); }
  passed++;
  console.log(`ok   ${name}`);
}

test('right-to-left languages are marked as such', () => {
  for (const locale of ['ar', 'he', 'fa', 'ur']) {
    assert.strictEqual(directionFor(locale), 'rtl', `${locale} should be rtl`);
    assert.strictEqual(isRTL(locale), true);
  }
});

test('left-to-right languages are left alone', () => {
  for (const locale of ['en', 'zh', 'hi', 'ja', 'ru', 'es']) {
    assert.strictEqual(directionFor(locale), 'ltr', `${locale} should be ltr`);
  }
});

test('regional tags resolve like their base language', () => {
  // Accept-Language and the locale cookie both carry regions.
  assert.strictEqual(directionFor('ar-EG'), 'rtl');
  assert.strictEqual(directionFor('AR_SA'), 'rtl');
  assert.strictEqual(directionFor('en-GB'), 'ltr');
});

test('an absent or unknown locale is left to right', () => {
  for (const value of [null, undefined, '', 'xx']) {
    assert.strictEqual(directionFor(value), 'ltr');
  }
});

test('the document actually sets dir', () => {
  // The module is useless if the layout never calls it.
  const layout = fs.readFileSync('app/layout.tsx', 'utf8');
  assert.ok(
    /<html lang=\{locale\} dir=\{directionFor\(locale\)\}>/.test(layout),
    'app/layout.tsx no longer sets dir from the locale — RTL languages would render mirrored'
  );
});

test('every right-to-left language we might add is listed', () => {
  // A locale added to the picker but missing here silently renders wrong.
  for (const code of ['ar', 'he', 'fa', 'ur']) {
    assert.ok(RTL_LOCALES.has(code), `${code} missing from RTL_LOCALES`);
  }
});

console.log(`\ndirection: ${passed} checks passed`);
