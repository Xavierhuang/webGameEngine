export interface SkyStepsPresentationObject {
  name: string;
  type?: string;
  visible?: boolean;
  hidden?: boolean;
  isVisible?: boolean;
  visibility?: 'visible' | 'hidden' | string;
}

export interface SkyStepsOutcome {
  state: 'playing' | 'won' | 'lost' | 'win' | string;
  message?: string;
}

export interface SkyStepsPresentation {
  totalStars: 3;
  collectedStars: number;
  collectedStarCount: number;
  starsLabel: string;
  starStatus: string;
  goal: 'portal' | 'win' | 'lost';
  goalState: 'portal' | 'win' | 'lost';
  status: 'playing' | 'won' | 'lost';
  outcomeState: 'playing' | 'won' | 'lost';
  childReadableStatus: string;
  statusText: string;
}

const TOTAL_STARS = 3 as const;
const SKY_PORTAL_NAME = 'Sky Portal';
const STAR_NAME = /\bstar\b/i;

type PresentationObject = SkyStepsPresentationObject | string;

function objectName(object: PresentationObject): string {
  return typeof object === 'string' ? object : object.name;
}

function isStar(object: PresentationObject): boolean {
  if (typeof object === 'string') return STAR_NAME.test(object);
  if (!STAR_NAME.test(object.name)) return false;
  return !object.type || object.type.toLowerCase() === 'collectible';
}

function isExplicitlyHidden(object: PresentationObject): boolean {
  if (typeof object === 'string') return false;
  return object.hidden === true
    || object.visible === false
    || object.isVisible === false
    || object.visibility === 'hidden';
}

function hasVisibilityMetadata(object: PresentationObject): boolean {
  return typeof object !== 'string'
    && ('hidden' in object || 'visible' in object || 'isVisible' in object || 'visibility' in object);
}

function outcomeState(outcome: SkyStepsOutcome | null | undefined): 'playing' | 'won' | 'lost' {
  if (outcome?.state === 'won' || outcome?.state === 'win') return 'won';
  if (outcome?.state === 'lost') return 'lost';
  return 'playing';
}

/**
 * Derive child-readable Sky Steps HUD/goal state from visible scene objects.
 * Object IDs are intentionally ignored so announcements never expose UUIDs.
 */
export function deriveSkyStepsPresentation(
  objects: readonly PresentationObject[],
  outcome: SkyStepsOutcome | null | undefined,
): SkyStepsPresentation {
  const stars = objects.filter(isStar);
  const uniqueStarNames = new Set(stars.map((object) => objectName(object).trim().toLowerCase()));
  const hasVisibility = stars.some(hasVisibilityMetadata);
  const hiddenCount = hasVisibility
    ? stars.filter(isExplicitlyHidden).length
    : TOTAL_STARS - uniqueStarNames.size;
  const collectedStars = Math.max(0, Math.min(TOTAL_STARS, hiddenCount));
  const starsLabel = `Stars ${collectedStars}/${TOTAL_STARS}`;
  const state = outcomeState(outcome);
  const message = outcome?.message?.trim();

  if (state === 'won') {
    const childReadableStatus = message || 'You win!';
    return {
      totalStars: TOTAL_STARS,
      collectedStars,
      collectedStarCount: collectedStars,
      starsLabel,
      starStatus: starsLabel,
      goal: 'win',
      goalState: 'win',
      status: 'won',
      outcomeState: 'won',
      childReadableStatus,
      statusText: childReadableStatus,
    };
  }

  if (state === 'lost') {
    const childReadableStatus = message || 'Game over';
    return {
      totalStars: TOTAL_STARS,
      collectedStars,
      collectedStarCount: collectedStars,
      starsLabel,
      starStatus: starsLabel,
      goal: 'lost',
      goalState: 'lost',
      status: 'lost',
      outcomeState: 'lost',
      childReadableStatus,
      statusText: childReadableStatus,
    };
  }

  const childReadableStatus = `${starsLabel}. Reach the ${SKY_PORTAL_NAME}.`;
  return {
    totalStars: TOTAL_STARS,
    collectedStars,
    collectedStarCount: collectedStars,
    starsLabel,
    starStatus: starsLabel,
    goal: 'portal',
    goalState: 'portal',
    status: 'playing',
    outcomeState: 'playing',
    childReadableStatus,
    statusText: childReadableStatus,
  };
}
