const {
  matchCharacterPrefab,
  extractColor,
  buildCharacterVisualData,
  CHARACTER_TEMPLATES,
  BASIC_SHAPES,
  PICKER_CHARACTERS,
} = require('../.build/lib/prefabs/characters.js');

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
eq(matchCharacterPrefab('minion')?.id, 'minion', 'exact Minion match');
eq(matchCharacterPrefab('a cheerful yellow minion')?.id, 'minion', 'descriptive Minion prompt');

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
// A multi-word alias is more specific than a single-word id: the catalog also
// contains a character whose id is literally "explorer", and it must not
// hijack astronaut's "space explorer" alias.
eq(matchCharacterPrefab('an explorer')?.id, 'explorer', 'bare "explorer" still matches the explorer');

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
// dragon and unicorn used to be non-matches; now covered by the creature archetypes below.
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
eq(matchCharacterPrefab('a puppy')?.id, 'puppy', 'puppy has its own prefab');
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
const minion = CHARACTER_TEMPLATES.find((template) => template.id === 'minion');
eq(minion?.shape, 'model', 'Minion uses a model shape');
eq(minion?.model_url, '/models/minion/FBX/Minion_FBX.fbx', 'Minion uses local FBX URL');
eq(minion?.preview_scale, 0.14, 'Minion preview scale');
eq(Array.isArray(minion?.preview_rotation), true, 'Minion preview rotation is defined');

eq(typeof buildCharacterVisualData, 'function', 'character selections expose persisted visual data');
if (typeof buildCharacterVisualData === 'function') {
  const minionVisualData = buildCharacterVisualData(minion);
  eq(minionVisualData.sprite_data.size, 14, 'Minion size reaches persisted sprite data');
  eq(minionVisualData.properties.size, 14, 'Minion size reaches persisted object properties');

  const uploadedModelVisualData = buildCharacterVisualData({
    shape: 'model',
    model_url: '/uploads/custom.fbx',
  });
  eq(uploadedModelVisualData.sprite_data.size, 1, 'generic uploaded models retain the default size');
  eq(uploadedModelVisualData.properties.size, 1, 'generic uploaded model properties retain the default size');
}

eq(CHARACTER_TEMPLATES.length, 60, 'templates count');

// The picker shows the same characters in a different order. Reordering the
// matcher pool itself would change which prefab an ambiguous AI prompt wins,
// because the matcher breaks ties by array position.
eq(PICKER_CHARACTERS.length, CHARACTER_TEMPLATES.length, 'picker shows every character');
eq(new Set(PICKER_CHARACTERS.map(c => c.id)).size, CHARACTER_TEMPLATES.length, 'no duplicates or drops in the picker order');
eq(CHARACTER_TEMPLATES[0].id, 'hero', 'matcher pool order is unchanged');
{
  // The whole point of the reorder: the first screenful must not be one shape
  // repeated. Twelve tiles is roughly what fits before a child has to scroll.
  const firstScreen = PICKER_CHARACTERS.slice(0, 12).map(c => c.id);
  const humanoids = ['hero','knight','wizard','princess','astronaut','ninja','superhero','pirate','chef','doctor','explorer','queen','king','witch','diver'];
  const humanoidCount = firstScreen.filter(id => humanoids.includes(id)).length;
  eq(humanoidCount <= 4, true, `first screen is ${humanoidCount}/12 humanoids — too repetitive`);
}
eq(BASIC_SHAPES.length, 7, 'basic shapes count');
eq(CHARACTER_TEMPLATES.every(t => t.aliases && t.aliases.length > 0), true, 'every template has aliases');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
