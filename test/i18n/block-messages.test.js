/**
 * Translated block labels.
 *
 * The dangerous failure here is silent: `%1`/`%2` map to a block's inputs by
 * position, so a translation that drops one produces a block missing an input
 * — in a language the author cannot read. Blockly does not complain, the build
 * passes, and only a child speaking that language ever finds out.
 *
 * So the placeholder checks matter more than the coverage ones.
 */

const assert = require('assert');
const {
  BLOCK_MESSAGES,
  CATEGORY_MESSAGES,
  DROPDOWN_MESSAGES,
  blockLabel,
  categoryLabel,
  dropdownLabel,
} = require('../.build/lib/i18n/blockMessages');
// The locales the app actually offers, which is what the block catalogs must
// keep up with.
const { LOCALES: SHIPPED_LOCALES } = require('../.build/lib/i18n/messages');
const { BLOCK_DEFINITIONS, TOOLBOX, localizedBlockDefinitions, localizedToolbox } =
  require('../.build/lib/blockly/definitions');

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

const LOCALES = Object.keys(BLOCK_MESSAGES);
/** English labels by block type. */
const english = Object.fromEntries(
  BLOCK_DEFINITIONS.filter((d) => d.type && typeof d.message0 === 'string').map((d) => [
    d.type,
    d.message0,
  ])
);

/** `%1`, `%2`, … and `%%`, sorted — order may change, the set may not. */
const placeholders = (s) => (s.match(/%\d+|%%/g) || []).sort();

test('every language the app offers has translated blocks', () => {
  /*
   * This used to assert against a frozen list of six locale codes, which meant
   * adding a language broke the test for the wrong reason and taught whoever
   * hit it to edit the literal.
   *
   * The guarantee worth having is the one this module's own header argues for:
   * translated chrome wrapped around an English programming language is the
   * wrong half done. So every locale the app *ships* — every entry in LOCALES
   * bar English — must have a block catalog. Adding a language to the picker
   * without translating its blocks now fails here.
   */
  const shipped = SHIPPED_LOCALES.filter((l) => l !== 'en');
  const untranslated = shipped.filter((l) => !LOCALES.includes(l));
  assert.deepStrictEqual(
    untranslated,
    [],
    `these locales are offered to children with English blocks: ${untranslated.join(', ')}`
  );
  assert.ok(Object.keys(english).length > 100, `only ${Object.keys(english).length} English labels found`);
});

test('every translation preserves its placeholders exactly', () => {
  const broken = [];
  for (const locale of LOCALES) {
    for (const [type, translated] of Object.entries(BLOCK_MESSAGES[locale])) {
      const source = english[type];
      if (!source) continue; // covered by the orphan check below
      const want = placeholders(source);
      const got = placeholders(translated);
      if (want.join() !== got.join()) {
        broken.push(`${locale}/${type}: "${source}" [${want}] -> "${translated}" [${got}]`);
      }
    }
  }
  assert.deepStrictEqual(broken, [], `these would render a block with missing or extra inputs:\n  ${broken.join('\n  ')}`);
});

test('no translation refers to a block that does not exist', () => {
  // An orphan is a typo'd key: the real block silently stays English.
  const orphans = [];
  for (const locale of LOCALES) {
    for (const type of Object.keys(BLOCK_MESSAGES[locale])) {
      if (!(type in english)) orphans.push(`${locale}/${type}`);
    }
  }
  assert.deepStrictEqual(orphans, [], `these keys match no block:\n  ${orphans.join('\n  ')}`);
});

test('the blocks a child meets first are translated in every language', () => {
  // Not every block is translated yet, and untranslated ones fall back to
  // English rather than showing a key. But the core vocabulary — the blocks in
  // the first tutorial — has to be covered, or the fallback is the experience.
  const core = ['on_start', 'on_key_press', 'move', 'say', 'repeat', 'forever',
                'if_then', 'wait', 'set_variable', 'change_variable', 'show', 'hide',
                'play_sound', 'broadcast', 'create_clone_of', 'ask_and_wait'];
  const missing = [];
  for (const locale of LOCALES) {
    for (const type of core) {
      if (!BLOCK_MESSAGES[locale][type]) missing.push(`${locale}/${type}`);
    }
  }
  assert.deepStrictEqual(missing, [], `core blocks left in English:\n  ${missing.join('\n  ')}`);
});

test('the only untranslated blocks are the language-neutral ones', () => {
  // Pure symbols (%1 + %2, ≠, ≤) and international function names (sin, ln,
  // e^) are the same in every language; Scratch does not translate them
  // either. Everything else must be covered — this is what catches a new
  // translatable block being added with no translations, which would otherwise
  // silently fall back to English for every child.
  const NEUTRAL = new Set([
    'expr_number', 'expr_text', 'expr_var',
    'expr_add', 'expr_sub', 'expr_mul', 'expr_div',
    'expr_lt', 'expr_gt', 'expr_eq', 'expr_neq', 'expr_lte', 'expr_gte',
    'expr_sin', 'expr_cos', 'expr_tan', 'expr_asin', 'expr_acos', 'expr_atan',
    'expr_ln', 'expr_log', 'expr_exp', 'expr_exp10',
  ]);
  for (const locale of LOCALES) {
    const untranslated = Object.keys(english).filter((t) => !BLOCK_MESSAGES[locale][t]);
    const unexpected = untranslated.filter((t) => !NEUTRAL.has(t));
    assert.deepStrictEqual(
      unexpected,
      [],
      `${locale} leaves these in English:\n  ${unexpected.map((t) => `${t} = ${english[t]}`).join('\n  ')}`
    );
  }
});

test('translating a dropdown never changes its stored value', () => {
  // The value is what the serializer writes into a saved project. If a
  // translation reached it, a game saved in Spanish would not open in English.
  for (const locale of [...LOCALES, 'xx']) {
    const defs = localizedBlockDefinitions(locale);
    for (let i = 0; i < defs.length; i++) {
      const before = (BLOCK_DEFINITIONS[i].args0 || []).filter((a) => a.type === 'field_dropdown');
      const after = (defs[i].args0 || []).filter((a) => a.type === 'field_dropdown');
      assert.strictEqual(after.length, before.length, `${locale} added or dropped a dropdown`);
      for (let j = 0; j < before.length; j++) {
        assert.deepStrictEqual(
          after[j].options.map(([, v]) => v),
          before[j].options.map(([, v]) => v),
          `${locale} changed the stored values of ${defs[i].type}.${before[j].name}`
        );
        assert.strictEqual(
          after[j].options.length,
          before[j].options.length,
          `${locale} changed the number of choices in ${defs[i].type}`
        );
      }
    }
  }
});

test('every dropdown label a child reads is translated', () => {
  // Single letters (w, a, s, d) are keys, not words, and stay as they are.
  const LETTERS = new Set(['w', 'a', 's', 'd']);
  const labels = new Set();
  for (const d of BLOCK_DEFINITIONS) {
    for (const arg of d.args0 || []) {
      if (arg.type === 'field_dropdown') for (const [label] of arg.options || []) labels.add(label);
    }
  }
  assert.ok(labels.size > 40, `only ${labels.size} dropdown labels found`);
  for (const locale of LOCALES) {
    const missing = [...labels].filter((l) => !LETTERS.has(l) && !DROPDOWN_MESSAGES[locale][l]);
    assert.deepStrictEqual(missing, [], `${locale} leaves these dropdown choices in English:\n  ${missing.join('\n  ')}`);
  }
});

test('an unknown locale leaves dropdown labels alone', () => {
  assert.strictEqual(dropdownLabel('up arrow', 'xx'), 'up arrow');
  assert.strictEqual(dropdownLabel('up arrow', 'es'), 'flecha arriba');
});

test('every toolbox category is translated in every language', () => {
  const names = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    if (n.kind === 'category' && typeof n.name === 'string') names.push(n.name);
    if (Array.isArray(n.contents)) n.contents.forEach(walk);
  };
  walk(TOOLBOX);
  assert.ok(names.length >= 10, `only ${names.length} categories found`);
  const missing = [];
  for (const locale of LOCALES) {
    for (const name of names) {
      if (!CATEGORY_MESSAGES[locale][name]) missing.push(`${locale}/${name}`);
    }
  }
  assert.deepStrictEqual(missing, [], `untranslated categories:\n  ${missing.join('\n  ')}`);
});

test('English is untouched, so saved projects never depend on a language', () => {
  // The serializer reads BLOCK_DEFINITIONS. If a translation could reach it, a
  // project saved in Spanish could differ from the same project saved in
  // English.
  assert.strictEqual(localizedBlockDefinitions('en'), BLOCK_DEFINITIONS, 'English must be the identical array');
  const es = localizedBlockDefinitions('es');
  const byType = Object.fromEntries(es.filter((d) => d.type).map((d) => [d.type, d]));
  assert.strictEqual(byType['move'].message0, BLOCK_MESSAGES.es.move, 'Spanish labels must be applied');
  assert.strictEqual(english['move'], 'move %1 %2', 'the English source array must not be mutated');
});

test('translating preserves block structure, not just text', () => {
  for (const locale of [...LOCALES, 'en']) {
    const defs = localizedBlockDefinitions(locale);
    assert.strictEqual(defs.length, BLOCK_DEFINITIONS.length, `${locale} changed the block count`);
    for (let i = 0; i < defs.length; i++) {
      const a = BLOCK_DEFINITIONS[i];
      const b = defs[i];
      assert.strictEqual(b.type, a.type, `${locale} reordered blocks`);
      // args0 legitimately differs now — dropdown labels are translated — so
      // compare the parts that must never move: input names, types and order.
      const shape = (args) =>
        (args || []).map((x) => `${x.type}:${x.name}:${(x.options || []).length}`);
      assert.deepStrictEqual(shape(b.args0), shape(a.args0), `${locale} changed inputs of ${a.type}`);
    }
  }
});

test('an unknown locale falls back to English rather than breaking', () => {
  assert.strictEqual(blockLabel('move', 'move %1 %2', 'xx'), 'move %1 %2');
  assert.strictEqual(categoryLabel('Motion', 'xx'), 'Motion');
  assert.strictEqual(localizedBlockDefinitions('xx').length, BLOCK_DEFINITIONS.length);
});

test('the toolbox keeps its shape when translated', () => {
  const es = localizedToolbox('es');
  assert.strictEqual(es.kind, TOOLBOX.kind);
  assert.strictEqual(es.contents.length, TOOLBOX.contents.length);
  const motion = es.contents.find((c) => c.colour === TOOLBOX.contents[0].colour);
  assert.strictEqual(motion.name, 'Movimiento');
  assert.strictEqual(
    motion.contents.length,
    TOOLBOX.contents[0].contents.length,
    'translating must not drop blocks from a category'
  );
  assert.strictEqual(TOOLBOX.contents[0].name, 'Motion', 'the English toolbox must not be mutated');
});

console.log(`\nblock messages: ${passed} checks passed`);
