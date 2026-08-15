const { TRANSLATE_LANGUAGES, TRANSLATE_PROMPT_NAMES, languageOptions, isSupportedLanguage } =
  require('../.build/lib/i18n/languages.js');
const { LOCALES } = require('../.build/lib/i18n/messages.js');

let failures = 0;
function eq(a, b, label) {
  if (!Object.is(a, b)) { failures++; console.log(`FAIL ${label}: expected ${b}, got ${a}`); }
  else console.log(`ok   ${label}`);
}
function ok(c, label) { eq(Boolean(c), true, label); }

ok(Object.keys(TRANSLATE_LANGUAGES).length >= 16, `${Object.keys(TRANSLATE_LANGUAGES).length} languages offered`);

// Every UI locale must be translatable, or a child could read the interface in
// a language the translate block can't produce.
for (const locale of LOCALES) {
  ok(isSupportedLanguage(locale), `UI locale '${locale}' is translatable`);
}

// The dropdown must be [label, value] pairs Blockly accepts.
for (const [label, value] of languageOptions()) {
  ok(typeof label === 'string' && label.length > 0, `option '${value}' has a label`);
  ok(isSupportedLanguage(value), `option '${value}' is supported`);
}
eq(languageOptions().length, Object.keys(TRANSLATE_LANGUAGES).length, 'every language is offered');

// The prompt name may differ from the menu label — "Chinese" reads better in a
// dropdown, but the model needs "Chinese (Simplified)" to be unambiguous.
eq(TRANSLATE_LANGUAGES.zh, 'Chinese', 'menu shows the short name');
eq(TRANSLATE_PROMPT_NAMES.zh, 'Chinese (Simplified)', 'prompt uses the precise name');
for (const code of Object.keys(TRANSLATE_LANGUAGES)) {
  ok(TRANSLATE_PROMPT_NAMES[code], `'${code}' has a prompt name`);
}

// Unknown codes must be rejected — the route interpolates the name into a
// model prompt.
eq(isSupportedLanguage('xx'), false, 'unknown code rejected');
eq(isSupportedLanguage(''), false, 'empty code rejected');
eq(isSupportedLanguage('constructor'), false, 'prototype key is not treated as a language');

if (failures > 0) { console.log(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nAll language tests passed');
