/**
 * COPPA / age-gating rules — pure, no imports, so node tests can require it.
 *
 * The schema has carried `profiles.age`, `parent_id`, `parental_approval`,
 * `content_filter_level`, `can_share` and `can_publish` since the first
 * migration, but nothing ever wrote or read them: age was never collected, the
 * parent link was never established, and the "are you a parent?" checkbox was
 * self-declared with no verification. This module is the single place those
 * rules now live.
 *
 * This encodes a defensible default posture, not legal advice — a real COPPA
 * programme also needs verifiable parental consent (COPPA §312.5(b)), a privacy
 * policy, and a data-deletion path. See /privacy and the consent flow.
 */

/** Below this age, US COPPA requires verifiable parental consent. */
export const COPPA_AGE = 13;

/** The product markets itself to this range; outside it we don't accept signups. */
export const MIN_AGE = 4;
export const MAX_AGE = 18;

export type AgeBand = 'under-13' | 'teen' | 'adult';

export interface AgePolicy {
  band: AgeBand;
  /** Needs a verified parent before any social feature unlocks. */
  requiresParentalConsent: boolean;
  /** May publish a project to the public gallery. */
  canShare: boolean;
  /** 1 (loosest) … 5 (strictest). Feeds the AI prompt and moderation posture. */
  contentFilterLevel: number;
}

export function isValidAge(age: unknown): age is number {
  return typeof age === 'number' && Number.isInteger(age) && age >= MIN_AGE && age <= MAX_AGE;
}

/**
 * Derive the account policy from age and whether a parent has actually
 * approved. Under-13s cannot share publicly until a parent approves — this is
 * the rule the gallery, remix and publish paths all consult.
 */
export function agePolicy(age: number | null | undefined, parentalApproval = false): AgePolicy {
  // Unknown age is treated as the strictest band, not the loosest.
  if (age === null || age === undefined || !isValidAge(age)) {
    return {
      band: 'under-13',
      requiresParentalConsent: true,
      canShare: false,
      contentFilterLevel: 5,
    };
  }

  if (age < COPPA_AGE) {
    return {
      band: 'under-13',
      requiresParentalConsent: true,
      canShare: parentalApproval === true,
      contentFilterLevel: 5,
    };
  }

  if (age < 18) {
    return {
      band: 'teen',
      requiresParentalConsent: false,
      canShare: true,
      contentFilterLevel: 3,
    };
  }

  return {
    band: 'adult',
    requiresParentalConsent: false,
    canShare: true,
    contentFilterLevel: 2,
  };
}

/** Convert a date of birth to age in whole years, or null if unparseable. */
export function ageFromDateOfBirth(dob: string, now = new Date()): number | null {
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed > now) return null;

  let age = now.getFullYear() - parsed.getFullYear();
  const monthDelta = now.getMonth() - parsed.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < parsed.getDate())) age--;

  return age >= 0 && age < 130 ? age : null;
}
