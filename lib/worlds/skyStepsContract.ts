import { createModelRenderContract } from '../models/modelRenderContract';
import { GRAVITY, JUMP_FORCE } from '../player/platformerMotion';
import {
  platformTopSurface,
  toPlayerPosition,
  touchesSphere,
  type PlatformSurface,
} from '../player/platformerWorld';
import { movementRateForKey } from '../runtime/interpreter';
import type { WorldTemplate, WorldTemplateObject } from './templates';

const ROUTE_PLATFORM_IDS = [
  'sky-start-island',
  'sky-step-one',
  'sky-step-two',
  'sky-extra-platform',
] as const;

const STAR_IDS = ['sky-star-one', 'sky-star-two', 'sky-extra-star'] as const;

/** The Hero has scale 1 and no persisted bounds, matching GamePlayer's fallback collider. */
const HERO_TOUCH_RADIUS = createModelRenderContract(1).touchRadius;

function objects(template: WorldTemplate): WorldTemplateObject[] {
  return template.scenes.flatMap((scene) => scene.objects);
}

function objectById(template: WorldTemplate, id: string): WorldTemplateObject | undefined {
  return objects(template).find((object) => object.id === id);
}

function blockTargetsHero(block: { block_type: string; inputs?: Record<string, unknown> }): boolean {
  return block.block_type === 'when_touches' && block.inputs?.target === 'Hero';
}

function horizontalLandingDistance(from: PlatformSurface, to: PlatformSurface): number {
  // `findLandingSurface` keeps a player grounded while its radius overlaps a
  // platform edge, so both source and target landing areas are expanded by the
  // exact character collider radius used by GamePlayer.
  const xGap = Math.max(
    from.minX - (to.maxX + HERO_TOUCH_RADIUS * 2),
    to.minX - (from.maxX + HERO_TOUCH_RADIUS * 2),
    0,
  );
  const zGap = Math.max(
    from.minZ - (to.maxZ + HERO_TOUCH_RADIUS * 2),
    to.minZ - (from.maxZ + HERO_TOUCH_RADIUS * 2),
    0,
  );
  return Math.hypot(xGap, zGap);
}

function landingEnvelope(from: PlatformSurface, to: PlatformSurface): { apex: number; horizontal: number } | null {
  const height = to.topY - from.topY;
  const apex = (JUMP_FORCE ** 2) / (2 * GRAVITY);
  if (height > apex) return null;

  // The positive descending root is when a jump crosses the destination top.
  const flightSeconds = (JUMP_FORCE + Math.sqrt(JUMP_FORCE ** 2 - 2 * GRAVITY * height)) / GRAVITY;
  return { apex, horizontal: flightSeconds };
}

function pointTouchesSurface(point: { x: number; y: number; z: number }, surface: PlatformSurface): boolean {
  return touchesSphere(point, {
    x: Math.min(surface.maxX, Math.max(surface.minX, point.x)),
    y: surface.topY,
    z: Math.min(surface.maxZ, Math.max(surface.minZ, point.z)),
  }, HERO_TOUCH_RADIUS);
}

function hasSpaceJump(hero: WorldTemplateObject | undefined): boolean {
  if (!hero) return false;
  return hero.blocks.some((block, index) =>
    block.block_type === 'on_key_press'
    && block.inputs?.key === 'SPACE'
    && hero.blocks[index + 1]?.block_type === 'jump',
  );
}

function hasPortalWin(portal: WorldTemplateObject | undefined): boolean {
  if (!portal) return false;
  return portal.blocks.some((block, index) =>
    blockTargetsHero(block)
    && portal.blocks[index + 1]?.block_type === 'you_win',
  );
}

function hasPostBaselineObjectMission(
  template: WorldTemplate,
  missionId: string,
  objectType: WorldTemplateObject['type'],
): boolean {
  const mission = template.missions.find((candidate) => candidate.id === missionId);
  // MissionService verifies the submitted object's persisted type, baseline ID,
  // and revision. A Sky Steps mission must declare that desired new type rather
  // than refer to one of the template's baseline object IDs.
  return mission?.kind === 'object_present' && mission.objectType === objectType;
}

/**
 * Validate the one playable flagship graph that sits on top of the generic
 * template validator. This stays pure so authored level data can be checked
 * without mounting React or simulating a frame loop.
 */
export function validateSkyStepsFlagship(template: WorldTemplate): string[] {
  const issues: string[] = [];
  if (template.id !== 'platformer' || template.version !== 2) {
    issues.push('Sky Steps flagship must be platformer version 2');
    return issues;
  }
  if (template.active !== true) issues.push('Sky Steps v2 must be the active catalog template');

  const hero = objectById(template, 'sky-hero');
  if (!hero || hero.type !== 'character' || hero.playerControlled !== true) {
    issues.push('Sky Steps needs its playable Hero');
  }
  if (!hasSpaceJump(hero)) issues.push('Sky Steps requires a SPACE jump script');
  const heroRunSpeed = hero ? movementRateForKey(hero.blocks, 'ArrowRight') : 0;
  if (heroRunSpeed <= 0) issues.push('Sky Steps requires a generated Hero ArrowRight movement script');

  const route: PlatformSurface[] = [];
  for (const id of ROUTE_PLATFORM_IDS) {
    const platform = objectById(template, id);
    const surface = platform && platformTopSurface(platform, { legacyGround: false });
    if (!surface) {
      issues.push(`Sky Steps requires route platform ${id}`);
      continue;
    }
    route.push(surface);
  }

  const reachableRoute: PlatformSurface[] = route.length > 0 ? [route[0]] : [];
  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1];
    const to = route[index];
    const envelope = landingEnvelope(from, to);
    if (!envelope || horizontalLandingDistance(from, to) > envelope.horizontal * heroRunSpeed) {
      issues.push(`Sky Steps route platform ${to.id} is not reachable from ${from.id}`);
      continue;
    }
    reachableRoute.push(to);
  }

  const stars = STAR_IDS.map((id) => objectById(template, id));
  if (stars.some((star) => !star || star.type !== 'collectible') || stars.length !== 3) {
    issues.push('Sky Steps requires three collectible stars');
  }
  for (const star of stars) {
    if (!star) continue;
    const center = toPlayerPosition(star.position, { legacyGround: false });
    if (!reachableRoute.some((surface) => pointTouchesSurface(center, surface))) {
      issues.push(`Sky Steps has an unreachable star: ${star.id}`);
    }
    if (!star.blocks.some(blockTargetsHero) || star.blocks.some((block) => block.block_type === 'you_win')) {
      issues.push(`Sky Steps star ${star.id} needs non-terminal Hero feedback`);
    }
    if (!star.blocks.some((block) => block.block_type === 'say') || !star.blocks.some((block) => block.block_type === 'hide')) {
      issues.push(`Sky Steps star ${star.id} needs one-time visible collection feedback`);
    }
  }

  const cloud = objectById(template, 'sky-moving-cloud');
  if (!cloud || cloud.type !== 'obstacle' || !cloud.blocks.some((block) => block.block_type === 'forever')
    || cloud.blocks.some(blockTargetsHero)) {
    issues.push('Sky Steps requires a visual-only moving cloud');
  }

  const portal = objectById(template, 'sky-portal');
  if (!portal || !hasPortalWin(portal)) {
    issues.push('Sky Steps requires a portal win triggered by touching Hero');
  } else {
    const center = toPlayerPosition(portal.position, { legacyGround: false });
    if (!reachableRoute.some((surface) => pointTouchesSurface(center, surface))) {
      issues.push('Sky Steps portal is not reachable from a route platform');
    }
  }

  if (!hasPostBaselineObjectMission(template, 'sky-steps-add-platform', 'platform')) {
    issues.push('Sky Steps requires a post-baseline platform mission');
  }
  if (!hasPostBaselineObjectMission(template, 'sky-steps-add-star', 'collectible')) {
    issues.push('Sky Steps requires a post-baseline collectible mission');
  }
  if (template.missions.find((mission) => mission.id === 'sky-steps-play')?.kind !== 'play_started') {
    issues.push('Sky Steps requires a revision-pinned play mission');
  }

  return issues;
}
