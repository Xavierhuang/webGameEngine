const { TUTORIALS, getTutorial, referencedBlocks, LEVEL_LABELS } =
  require('../.build/lib/tutorials/catalog.js');
const { TUTORIAL_LOCALES, TUTORIAL_TABLES, localizeTutorial } =
  require('../.build/lib/tutorials/translations.js');
const { BLOCK_DEFINITIONS } = require('../.build/lib/blockly/definitions.js');

let failures = 0;
function eq(a, b, label) {
  if (!Object.is(a, b)) { failures++; console.log(`FAIL ${label}: expected ${b}, got ${a}`); }
  else console.log(`ok   ${label}`);
}
function ok(c, label) { eq(Boolean(c), true, label); }

ok(TUTORIALS.length >= 6, `${TUTORIALS.length} tutorials`);

// THE point of this test: a tutorial that tells a child to drag a block which
// doesn't exist is worse than no tutorial. Blocks drift; content doesn't.
const palette = new Set(BLOCK_DEFINITIONS.map((d) => d.type));
for (const blockType of referencedBlocks()) {
  ok(palette.has(blockType), `referenced block exists in the palette: ${blockType}`);
}

// Structure
const ids = new Set();
for (const t of TUTORIALS) {
  ok(t.id && !ids.has(t.id), `unique id: ${t.id}`);
  ids.add(t.id);
  ok(t.title && t.title.length < 60, `${t.id}: has a short title`);
  ok(t.summary && t.summary.length < 120, `${t.id}: has a one-line summary`);
  ok(t.emoji && [...t.emoji].length <= 2, `${t.id}: has an emoji`);
  ok(t.minutes > 0 && t.minutes <= 30, `${t.id}: realistic time estimate`);
  ok(LEVEL_LABELS[t.level], `${t.id}: valid level '${t.level}'`);
  // A tutorial should teach an idea, not just list clicks.
  ok(t.concept && t.concept.length > 20, `${t.id}: states the concept it teaches`);
  ok(t.steps.length >= 3, `${t.id}: has at least 3 steps`);

  for (const [i, s] of t.steps.entries()) {
    ok(s.title && s.title.length < 50, `${t.id} step ${i + 1}: short title`);
    ok(s.body && s.body.length > 20, `${t.id} step ${i + 1}: has real guidance`);
    // Written for children — keep steps digestible.
    ok(s.body.length < 320, `${t.id} step ${i + 1}: body stays brief`);
  }
}

// At least one tutorial must be an obvious entry point for a total beginner.
ok(TUTORIALS.some((t) => t.level === 'first'), "has a 'Start here' tutorial");

// Translations: every translated locale covers every field a child reads,
// and no key points at a tutorial or step that no longer exists.
for (const locale of TUTORIAL_LOCALES) {
  const table = TUTORIAL_TABLES[locale];
  const expected = new Set();
  for (const t of TUTORIALS) {
    for (const f of ['title', 'summary', 'concept']) expected.add(`${t.id}.${f}`);
    t.steps.forEach((s, i) => {
      expected.add(`${t.id}.step.${i}.title`);
      expected.add(`${t.id}.step.${i}.body`);
      if (s.hint) expected.add(`${t.id}.step.${i}.hint`);
    });
  }
  const missing = [...expected].filter((k) => !table[k]);
  const orphans = Object.keys(table).filter((k) => !expected.has(k));
  eq(missing.length, 0, `${locale}: every tutorial field is translated${missing.length ? ` (${missing.slice(0, 5).join(', ')})` : ''}`);
  eq(orphans.length, 0, `${locale}: no orphan tutorial keys${orphans.length ? ` (${orphans.slice(0, 5).join(', ')})` : ''}`);
  const localized = localizeTutorial(TUTORIALS[0], locale);
  ok(localized.title !== TUTORIALS[0].title, `${locale}: localizeTutorial changes the title`);
  eq(localized.steps.length, TUTORIALS[0].steps.length, `${locale}: localizeTutorial keeps every step`);
}
eq(localizeTutorial(TUTORIALS[0], 'xx').title, TUTORIALS[0].title, 'unknown locale falls back to English');

eq(getTutorial('first-game')?.id, 'first-game', 'lookup by id');
eq(getTutorial('nope'), undefined, 'unknown id returns undefined');

if (failures > 0) { console.log(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nAll tutorial tests passed');
