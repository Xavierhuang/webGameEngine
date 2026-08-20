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

// Namespaces exempt from the completeness check while their translations are
// staged. The `translate()` fallback (locale -> en -> key) still renders these
// gracefully in English for locales that haven't caught up. Remove a namespace
// from this list once every locale has real translations for it.
const PENDING_TRANSLATION_NAMESPACES = ['home.'];
// Locales that DO have real translations for the pending namespaces above.
// Any locale not listed here is allowed to be missing those keys.
const FULLY_TRANSLATED = new Set(['en', 'zh']);

const isPendingKey = (k) =>
  PENDING_TRANSLATION_NAMESPACES.some((prefix) => k.startsWith(prefix));

for (const locale of LOCALES) {
  const keys = Object.keys(MESSAGES[locale]).sort();
  const missingAll = baseKeys.filter((k) => !keys.includes(k));
  const missing = FULLY_TRANSLATED.has(locale)
    ? missingAll
    : missingAll.filter((k) => !isPendingKey(k));
  const extra = keys.filter((k) => !baseKeys.includes(k));
  eq(missing.length, 0, `${locale}: no missing keys${missing.length ? ` (${missing.join(', ')})` : ''}`);
  eq(extra.length, 0, `${locale}: no orphan keys${extra.length ? ` (${extra.join(', ')})` : ''}`);
}

// --- no empty or untranslated-looking strings -------------------------------
for (const locale of LOCALES) {
  const blanks = Object.entries(MESSAGES[locale]).filter(([, v]) => typeof v !== 'string' || v.trim() === '');
  eq(blanks.length, 0, `${locale}: no blank translations`);
}

/**
 * Words that are legitimately identical to the English. Listing them
 * explicitly keeps the echo check strict everywhere else — the alternative,
 * loosening the rule, would let real copy-paste stubs through.
 */
const SAME_AS_ENGLISH = new Set([
  'fr:toolbar.obstacle',   // "Obstacle" is the same word in French
  'pt:project.remixes',    // "remixes" is used as-is in Portuguese
  'es:editor.color',       // "Color" is spelled the same in Spanish
  'fr:editor.type',        // "Type" is the same word in French
  'fr:editor.position',    // "Position (X, Y, Z)" is identical in French
  'fr:editor.costumes',    // "Costumes" is the same word in French
  'de:editor.name',        // "Name" is the same word in German
  'de:editor.position',    // "Position (X, Y, Z)" is identical in German
  'id:project.remix',      // "Remix" is used as-is in Indonesian
  'id:auth.email',         // "Email" is used as-is in Indonesian
  'id:toolbar.platform',   // "Platform" is used as-is in Indonesian
  'vi:editor.logic',       // "Logic" is used as-is in Vietnamese
  'vi:auth.email',         // "Email" is used as-is in Vietnamese
  'tr:toolbar.platform',   // "Platform" is used as-is in Turkish
  'it:auth.email',         // "Email" is used as-is in Italian
  'it:auth.password',      // "Password" is used as-is in Italian
  'nl:toolbar.particles',  // "Effect" is the same word in Dutch
  'nl:toolbar.platform',   // "Platform" is the same word in Dutch
  'sv:editor.position',    // "Position (X, Y, Z)" is identical in Swedish
  'zh:home.gallery.tag.askAi',  // "ask_ai" is a block identifier, kept as-is in Chinese
  'zh:home.footer.link.github', // "GitHub" is a brand name, kept as-is in Chinese
]);

// No locale may simply echo the English string — that is what a half-finished
// translation looks like, and it is invisible without this check.
for (const locale of LOCALES) {
  if (locale === 'en') continue;
  const echoed = Object.keys(MESSAGES.en).filter(
    (k) =>
      MESSAGES[locale][k] === MESSAGES.en[k] &&
      /[a-z]/i.test(MESSAGES.en[k]) &&
      !SAME_AS_ENGLISH.has(`${locale}:${k}`)
  );
  eq(echoed.length, 0, `${locale}: no untranslated copies${echoed.length ? ` (${echoed.slice(0, 3).join(', ')})` : ''}`);
}

// --- translate() ------------------------------------------------------------
eq(translate('en', 'nav.explore'), 'Explore', 'translate returns the English string');
eq(translate('zh', 'nav.explore'), '发现', 'translate returns the Chinese string');
eq(translate('en', 'not.a.key'), 'not.a.key', 'unknown key falls back to the key itself');
// An unknown locale falls back to English rather than throwing.
eq(translate('sw', 'nav.explore'), 'Explore', 'unknown locale falls back to English');

// --- resolveLocale ----------------------------------------------------------
eq(resolveLocale('zh'), 'zh', 'exact locale');
eq(resolveLocale('zh-CN'), 'zh', 'regional variant narrows to base locale');
eq(resolveLocale('ZH-Hans'), 'zh', 'case-insensitive');
eq(resolveLocale('en-GB'), 'en', 'en-GB narrows to en');
eq(resolveLocale('sw'), DEFAULT_LOCALE, 'unsupported locale falls back to the default');
eq(resolveLocale('fr'), 'fr', 'newly supported locale resolves');
eq(resolveLocale('ja-JP'), 'ja', 'regional Japanese narrows to ja');
eq(resolveLocale(null), DEFAULT_LOCALE, 'null falls back to the default');
eq(resolveLocale(''), DEFAULT_LOCALE, 'empty string falls back to the default');
// A locale must never be inferred from a substring match.
eq(resolveLocale('zhuang'), DEFAULT_LOCALE, 'a longer word starting with a locale code is not matched');

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll i18n tests passed');
