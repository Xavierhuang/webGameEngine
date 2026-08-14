const {
  LOCALES,
  MESSAGES,
  DEFAULT_LOCALE,
  translate,
  resolveLocale,
} = require('../.build/lib/i18n/messages.js');

let failures = 0;
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}

// --- every locale must cover every key --------------------------------------
const baseKeys = Object.keys(MESSAGES[DEFAULT_LOCALE]).sort();
eq(baseKeys.length > 0, true, 'the default catalog has keys');

for (const locale of LOCALES) {
  const keys = Object.keys(MESSAGES[locale]).sort();
  const missing = baseKeys.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !baseKeys.includes(k));
  eq(missing.length, 0, `${locale}: no missing keys${missing.length ? ` (${missing.join(', ')})` : ''}`);
  eq(extra.length, 0, `${locale}: no orphan keys${extra.length ? ` (${extra.join(', ')})` : ''}`);
}

// --- no empty or untranslated-looking strings -------------------------------
for (const locale of LOCALES) {
  const blanks = Object.entries(MESSAGES[locale]).filter(([, v]) => typeof v !== 'string' || v.trim() === '');
  eq(blanks.length, 0, `${locale}: no blank translations`);
}

// zh must not simply echo the English string (catches copy-paste stubs).
{
  const echoed = Object.keys(MESSAGES.en).filter(
    (k) => MESSAGES.zh[k] === MESSAGES.en[k] && /[a-z]/i.test(MESSAGES.en[k])
  );
  eq(echoed.length, 0, `zh: no untranslated copies${echoed.length ? ` (${echoed.slice(0, 3).join(', ')})` : ''}`);
}

// --- translate() ------------------------------------------------------------
eq(translate('en', 'nav.explore'), 'Explore', 'translate returns the English string');
eq(translate('zh', 'nav.explore'), '发现', 'translate returns the Chinese string');
eq(translate('en', 'not.a.key'), 'not.a.key', 'unknown key falls back to the key itself');
// An unknown locale falls back to English rather than throwing.
eq(translate('de', 'nav.explore'), 'Explore', 'unknown locale falls back to English');

// --- resolveLocale ----------------------------------------------------------
eq(resolveLocale('zh'), 'zh', 'exact locale');
eq(resolveLocale('zh-CN'), 'zh', 'regional variant narrows to base locale');
eq(resolveLocale('ZH-Hans'), 'zh', 'case-insensitive');
eq(resolveLocale('en-GB'), 'en', 'en-GB narrows to en');
eq(resolveLocale('fr'), DEFAULT_LOCALE, 'unsupported locale falls back to the default');
eq(resolveLocale(null), DEFAULT_LOCALE, 'null falls back to the default');
eq(resolveLocale(''), DEFAULT_LOCALE, 'empty string falls back to the default');
// A locale must never be inferred from a substring match.
eq(resolveLocale('zhuang'), DEFAULT_LOCALE, 'a longer word starting with a locale code is not matched');

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll i18n tests passed');
