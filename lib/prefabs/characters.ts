/**
 * Built-in character library. Kept as a shared module so both the
 * CharacterSelector picker (client) and the /api/ai/generate-character route
 * (server) look up the SAME prefabs — the AI never invents a new shape when
 * we already have a matching one on the shelf.
 *
 * When a kid asks for "a wizard", we should return our Wizard cone in ~1ms
 * for free, not spend 30 seconds and dollars generating a novel 3D mesh.
 */

export interface CharacterPrefab {
  id: string;
  name: string;
  color: string;
  shape: string;
  size: number;
  description: string;
  /** Extra keywords that also count as a match (case-insensitive). */
  aliases?: string[];
  model_url?: string;
  preview_scale?: number;
  preview_rotation?: [number, number, number];
}

interface CharacterVisualInput {
  shape?: string;
  color?: string;
  size?: number;
  model_url?: string;
  thumbnail_url?: string;
  properties?: Record<string, unknown>;
}

/** Build the visual fields persisted when a picker character is selected. */
export function buildCharacterVisualData(character: CharacterVisualInput) {
  if (character.model_url) {
    const size = character.size || 1;
    const modelData = {
      shape: 'model',
      model_url: character.model_url,
      thumbnail_url: character.thumbnail_url,
      size,
    };
    return {
      sprite_data: modelData,
      properties: { ...modelData },
    };
  }

  const size = character.size || 50;
  return {
    sprite_data: {
      shape: character.shape || 'box',
      color: character.color,
      size,
    },
    properties: {
      ...(character.properties || {}),
      shape: character.shape || 'box',
      color: character.color,
      size,
    },
  };
}

/** Named starter characters. Order matters for the picker grid. */
export const CHARACTER_TEMPLATES: CharacterPrefab[] = [
  {
    id: 'hero',
    name: 'Hero',
    color: '#60A5FA',
    shape: 'capsule',
    size: 60,
    description: 'Standing hero',
    aliases: ['protagonist', 'main character', 'player', 'good guy'],
  },
  {
    id: 'knight',
    name: 'Knight',
    color: '#3B82F6',
    shape: 'box',
    size: 60,
    description: 'Armoured warrior',
    aliases: ['warrior', 'soldier', 'guard', 'paladin'],
  },
  {
    id: 'wizard',
    name: 'Wizard',
    color: '#8B5CF6',
    shape: 'cone',
    size: 60,
    description: 'Pointy-hatted mage',
    aliases: ['mage', 'sorcerer', 'witch', 'magician', 'spellcaster'],
  },
  {
    id: 'robot',
    name: 'Robot',
    color: '#6B7280',
    shape: 'box',
    size: 60,
    description: 'Mechanical body',
    aliases: ['bot', 'android', 'droid', 'mech', 'automaton', 'machine'],
  },
  {
    id: 'ninja',
    name: 'Ninja',
    color: '#1F2937',
    shape: 'capsule',
    size: 55,
    description: 'Stealthy runner',
    aliases: ['assassin', 'spy', 'stealth'],
  },
  {
    id: 'alien',
    name: 'Alien',
    color: '#10B981',
    shape: 'sphere',
    size: 55,
    description: 'Round friendly alien',
    aliases: ['extraterrestrial', 'ufo', 'martian', 'et'],
  },
  {
    id: 'princess',
    name: 'Princess',
    color: '#EC4899',
    shape: 'pyramid',
    size: 60,
    description: 'Regal pyramid gown',
    aliases: ['queen', 'royalty', 'monarch'],
  },
  {
    id: 'astronaut',
    name: 'Astronaut',
    color: '#F3F4F6',
    shape: 'capsule',
    size: 60,
    description: 'Space explorer',
    aliases: ['spaceman', 'cosmonaut', 'space explorer'],
  },
  {
    id: 'minion',
    name: 'Minion',
    color: '#FACC15',
    shape: 'model',
    size: 14,
    description: 'Cheerful yellow helper',
    aliases: ['yellow helper', 'banana buddy'],
    model_url: '/models/minion/FBX/Minion_FBX.fbx',
    preview_scale: 0.14,
    preview_rotation: [0, 0, 0],
  },
  // Creatures — best-effort shapes until real GLB models ship. Colors are
  // overridden by any color word in the prompt (see extractColor below).
  {
    id: 'dragon',
    name: 'Dragon',
    color: '#DC2626',
    shape: 'capsule',
    size: 65,
    description: 'Fire-breathing dragon',
    aliases: ['drake', 'wyrm', 'wyvern'],
  },
  {
    id: 'monster',
    name: 'Monster',
    color: '#7C3AED',
    shape: 'sphere',
    size: 60,
    description: 'Blob monster',
    aliases: ['creature', 'beast', 'ogre', 'troll', 'goblin', 'blob'],
  },
  {
    id: 'ghost',
    name: 'Ghost',
    color: '#E5E7EB',
    shape: 'capsule',
    size: 55,
    description: 'Floaty spirit',
    aliases: ['spirit', 'phantom', 'spook', 'boo'],
  },
  {
    id: 'fish',
    name: 'Fish',
    color: '#60A5FA',
    shape: 'capsule',
    size: 40,
    description: 'Tiny swimmer',
    aliases: ['minnow', 'guppy', 'goldfish', 'trout'],
  },
  {
    id: 'dog',
    name: 'Dog',
    color: '#F59E0B',
    shape: 'capsule',
    size: 45,
    description: 'Loyal pup',
    aliases: ['puppy', 'pup', 'doggy', 'hound', 'canine'],
  },
  {
    id: 'cat',
    name: 'Cat',
    color: '#F97316',
    shape: 'capsule',
    size: 45,
    description: 'Sneaky feline',
    aliases: ['kitten', 'kitty', 'feline'],
  },
  {
    id: 'bird',
    name: 'Bird',
    color: '#38BDF8',
    shape: 'sphere',
    size: 35,
    description: 'Small bird',
    aliases: ['sparrow', 'robin', 'chick', 'chirper'],
  },
  {
    id: 'tree',
    name: 'Tree',
    color: '#16A34A',
    shape: 'cone',
    size: 90,
    description: 'Leafy tree',
    aliases: ['bush', 'shrub', 'pine', 'fir'],
  },
  {
    id: 'rock',
    name: 'Rock',
    color: '#57534E',
    shape: 'sphere',
    size: 55,
    description: 'Boulder',
    aliases: ['stone', 'pebble'],
  },
];

/**
 * A tiny color-word extractor for prompt strings. Used by the AI-character
 * route when neither a prefab match nor Meshy nor Claude produces a real
 * color — instead of picking a random one, we honor the color word the kid
 * actually typed.
 *
 * Returns null when no color word is present.
 */
export function extractColor(prompt: string): string | null {
  const t = prompt.toLowerCase();
  const map: Array<[RegExp, string]> = [
    [/\bred\b|\bcrimson\b|\bruby\b|\bscarlet\b/, '#EF4444'],
    [/\borange\b|\bamber\b/, '#F97316'],
    [/\byellow\b|\bgold(en)?\b/, '#FACC15'],
    [/\bgreen\b|\bemerald\b|\blime\b/, '#22C55E'],
    [/\bblue\b|\bazure\b|\bsapphire\b|\bnavy\b/, '#3B82F6'],
    [/\bpurple\b|\bviolet\b|\bindigo\b|\bmagenta\b/, '#8B5CF6'],
    [/\bpink\b|\brose\b/, '#EC4899'],
    [/\bwhite\b|\bsnow\b|\bpale\b/, '#F3F4F6'],
    [/\bblack\b|\bshadow\b|\bdark\b/, '#111827'],
    [/\bgrey\b|\bgray\b|\bsilver\b/, '#9CA3AF'],
    [/\bbrown\b|\btan\b/, '#92400E'],
    [/\bcyan\b|\bturquoise\b|\bteal\b/, '#06B6D4'],
  ];
  for (const [re, hex] of map) if (re.test(t)) return hex;
  return null;
}

/** Raw primitive shapes — matched when the prompt names a shape directly. */
export const BASIC_SHAPES: CharacterPrefab[] = [
  { id: 'cube', name: 'Cube', color: '#60A5FA', shape: 'box', size: 60, description: 'Boxy character', aliases: ['box', 'block', 'square'] },
  { id: 'sphere', name: 'Ball', color: '#F59E0B', shape: 'sphere', size: 60, description: 'Round rolling ball', aliases: ['sphere', 'orb', 'globe'] },
  { id: 'cylinder', name: 'Barrel', color: '#34D399', shape: 'cylinder', size: 60, description: 'Barrel-shaped body', aliases: ['cylinder', 'tube', 'can'] },
  { id: 'cone', name: 'Cone', color: '#A78BFA', shape: 'cone', size: 60, description: 'Pointy top', aliases: ['pointy', 'triangle'] },
  { id: 'pyramid', name: 'Pyramid', color: '#F472B6', shape: 'pyramid', size: 60, description: 'Four-sided pyramid', aliases: ['tetrahedron'] },
  { id: 'torus', name: 'Ring', color: '#FBBF24', shape: 'torus', size: 60, description: 'Donut ring', aliases: ['donut', 'doughnut', 'ring'] },
  { id: 'capsule', name: 'Capsule', color: '#60A5FA', shape: 'capsule', size: 60, description: 'Standing pill', aliases: ['pill'] },
];

/**
 * Best-effort prefab match. Returns the closest CHARACTER_TEMPLATES or
 * BASIC_SHAPES entry, or null if nothing matches confidently.
 *
 * Match strategy (fastest → loosest):
 *   1. Exact id / name match
 *   2. Case-insensitive substring of id / name / alias in the prompt
 *   3. Prompt tokens overlap with name/description/aliases
 *
 * Returns null instead of guessing when confidence is low, so the caller can
 * fall through to Meshy or the AI-property path.
 */
export function matchCharacterPrefab(prompt: string): CharacterPrefab | null {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return null;

  const pool = [...CHARACTER_TEMPLATES, ...BASIC_SHAPES];

  // Tier 1: exact id or name.
  for (const p of pool) {
    if (p.id === normalized || p.name.toLowerCase() === normalized) return p;
  }

  // Tier 2: any keyword (id, name, alias) appears as a whole-word match.
  const words = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const wordSet = new Set(words);
  for (const p of pool) {
    const keywords = [p.id, p.name.toLowerCase(), ...(p.aliases ?? [])];
    for (const k of keywords) {
      const kLower = k.toLowerCase();
      // Whole-word check — "hero" matches "a brave hero" but not "heroic".
      if (kLower.includes(' ')) {
        if (normalized.includes(kLower)) return p;
      } else if (wordSet.has(kLower)) {
        return p;
      }
    }
  }

  return null;
}
