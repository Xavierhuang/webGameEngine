const { matchCharacterPrefab, CHARACTER_TEMPLATES, BASIC_SHAPES } = require('../.build/lib/prefabs/characters.js');

let failures = 0;
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}

// --- exact hits: id and name ---
eq(matchCharacterPrefab('wizard')?.id, 'wizard', 'exact id (lowercase)');
eq(matchCharacterPrefab('Wizard')?.id, 'wizard', 'exact name (title case)');
eq(matchCharacterPrefab('ROBOT')?.id, 'robot', 'exact id (uppercase)');
eq(matchCharacterPrefab('Hero')?.id, 'hero', 'exact name Hero');
eq(matchCharacterPrefab('astronaut')?.id, 'astronaut', 'exact astronaut');

// --- alias hits (case-insensitive whole-word) ---
eq(matchCharacterPrefab('mage')?.id, 'wizard', 'alias mage → wizard');
eq(matchCharacterPrefab('sorcerer')?.id, 'wizard', 'alias sorcerer → wizard');
eq(matchCharacterPrefab('android')?.id, 'robot', 'alias android → robot');
eq(matchCharacterPrefab('spaceman')?.id, 'astronaut', 'alias spaceman → astronaut');
eq(matchCharacterPrefab('extraterrestrial')?.id, 'alien', 'alias extraterrestrial → alien');
eq(matchCharacterPrefab('paladin')?.id, 'knight', 'alias paladin → knight');

// --- multi-word aliases ---
eq(matchCharacterPrefab('a space explorer stuck on mars')?.id, 'astronaut', 'multi-word alias inside prompt');
eq(matchCharacterPrefab('the main character of the game')?.id, 'hero', 'multi-word alias "main character"');

// --- primitive shape names ---
eq(matchCharacterPrefab('cube')?.id, 'cube', 'basic shape cube');
eq(matchCharacterPrefab('a rolling ball')?.id, 'sphere', 'ball inside phrase → sphere prefab');
eq(matchCharacterPrefab('donut')?.id, 'torus', 'donut alias → torus');

// --- prompt with descriptive words + a matching keyword ---
eq(matchCharacterPrefab('a wise old wizard with a long beard')?.id, 'wizard', 'wizard inside descriptive prompt');
eq(matchCharacterPrefab('friendly green alien')?.id, 'alien', 'alien inside phrase');
eq(matchCharacterPrefab('sneaky ninja assassin')?.id, 'ninja', 'ninja inside phrase');

// --- non-matches: prompt is too vague or doesn\'t hit any keyword ---
eq(matchCharacterPrefab('a shiny thing'), null, 'vague prompt → no match');
eq(matchCharacterPrefab('unicorn'), null, 'no prefab for unicorn');
eq(matchCharacterPrefab('dragon'), null, 'no prefab for dragon');
eq(matchCharacterPrefab(''), null, 'empty prompt → null');
eq(matchCharacterPrefab('   '), null, 'whitespace-only → null');

// --- word-boundary safety: "heroic" should not match hero as a whole word ---
// (the alias-substring rules for single-word keywords require whole-word match)
eq(matchCharacterPrefab('heroic'), null, 'substring "heroic" is not whole-word match for hero');
eq(matchCharacterPrefab('robotic'), null, 'substring "robotic" is not whole-word match for robot');

// --- library sanity ---
eq(CHARACTER_TEMPLATES.length, 8, 'templates count');
eq(BASIC_SHAPES.length, 7, 'basic shapes count');
eq(CHARACTER_TEMPLATES.every(t => t.aliases && t.aliases.length > 0), true, 'every template has aliases');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
