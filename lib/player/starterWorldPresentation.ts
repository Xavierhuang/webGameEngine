export interface StarterWorldIdentity {
  templateId: string;
  templateVersion: number | string;
}

export interface StarterWorldPresentation {
  title: string;
  eyebrow: 'Your quest';
  goal: string;
}

const STARTER_QUESTS: Record<string, StarterWorldPresentation> = {
  obby: {
    title: 'Rainbow Obby',
    eyebrow: 'Your quest',
    goal: 'Collect rainbow gems, steer around bumpers, and reach the finish star.',
  },
  racing: {
    title: 'Turbo Track',
    eyebrow: 'Your quest',
    goal: 'Grab turbo stars, avoid cones, and cross the finish flag.',
  },
  story: {
    title: 'Castle Story',
    eyebrow: 'Your quest',
    goal: 'Click the wizard, find royal stars, and open the treasure.',
  },
  pet: {
    title: 'Happy Pet Park',
    eyebrow: 'Your quest',
    goal: 'Meet your park pal, find treats, and fetch the sparkling ball.',
  },
};

/** Returns concise in-stage guidance only for the approved starter worlds. */
export function deriveStarterWorldPresentation(
  worldIdentity?: StarterWorldIdentity,
): StarterWorldPresentation | null {
  if (!worldIdentity || Number(worldIdentity.templateVersion) !== 1) return null;
  return STARTER_QUESTS[worldIdentity.templateId] ?? null;
}
