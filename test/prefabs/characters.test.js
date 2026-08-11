const { matchCharacterPrefab, extractColor, CHARACTER_TEMPLATES, BASIC_SHAPES } = require('../.build/lib/prefabs/characters.js');

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
// dragon used to be a non-match; now covered by the creature archetypes below.
eq(matchCharacterPrefab(''), null, 'empty prompt → null');
eq(matchCharacterPrefab('   '), null, 'whitespace-only → null');

// --- word-boundary safety: "heroic" should not match hero as a whole word ---
// (the alias-substring rules for single-word keywords require whole-word match)
eq(matchCharacterPrefab('heroic'), null, 'substring "heroic" is not whole-word match for hero');
eq(matchCharacterPrefab('robotic'), null, 'substring "robotic" is not whole-word match for robot');

// --- creature archetypes (new) ---
eq(matchCharacterPrefab('dragon')?.id, 'dragon', 'dragon');
eq(matchCharacterPrefab('a fire-breathing dragon')?.id, 'dragon', 'dragon inside phrase');
eq(matchCharacterPrefab('wyvern')?.id, 'dragon', 'alias wyvern → dragon');
eq(matchCharacterPrefab('ghost')?.id, 'ghost', 'ghost');
eq(matchCharacterPrefab('a spooky phantom')?.id, 'ghost', 'phantom → ghost');
eq(matchCharacterPrefab('goldfish')?.id, 'fish', 'goldfish → fish');
eq(matchCharacterPrefab('a puppy')?.id, 'dog', 'puppy → dog');
eq(matchCharacterPrefab('kitty')?.id, 'cat', 'kitty → cat');
eq(matchCharacterPrefab('sparrow')?.id, 'bird', 'sparrow → bird');
eq(matchCharacterPrefab('pine')?.id, 'tree', 'pine → tree');
eq(matchCharacterPrefab('a pebble')?.id, 'rock', 'pebble → rock');
eq(matchCharacterPrefab('a big scary monster')?.id, 'monster', 'monster');
eq(matchCharacterPrefab('an ogre')?.id, 'monster', 'ogre → monster');

// --- extractColor ---
eq(extractColor('a red dragon'), '#EF4444', 'red');
eq(extractColor('a fire-red creature'), '#EF4444', 'red inside compound word not required — whole word red');
eq(extractColor('sky blue orb'), '#3B82F6', 'blue');
eq(extractColor('emerald forest'), '#22C55E', 'emerald → green');
eq(extractColor('a golden knight'), '#FACC15', 'golden → yellow');
eq(extractColor('crimson wizard'), '#EF4444', 'crimson → red');
eq(extractColor('violet potion'), '#8B5CF6', 'violet → purple');
eq(extractColor('teal fish'), '#06B6D4', 'teal');
eq(extractColor('nothing colorful here'), null, 'no color word → null');
eq(extractColor(''), null, 'empty → null');

// --- library sanity ---
eq(CHARACTER_TEMPLATES.length, 17, 'templates count (added 9 creature archetypes)');
eq(BASIC_SHAPES.length, 7, 'basic shapes count');
eq(CHARACTER_TEMPLATES.every(t => t.aliases && t.aliases.length > 0), true, 'every template has aliases');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
