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
];

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
