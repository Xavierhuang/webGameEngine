/**
 * COPPA / age-gating rules — pure, no imports, so node tests can require it.
 *
 * Task 5 renames the age band identifiers from the hyphenated form
 * (`under-13`) to underscore form (`under_13`) so they align with the
 * `AgeBand` type in `capabilities.ts` and can safely appear inside URL
 * paths, JSON keys, and SQL enum values. The old strings are still
 * accepted by `agePolicy` (as `AgeBand` aliases) so any straggler
 * caller does not immediately break — that migration is Task 5's
 * `capabilitiesFor` refactor.
 *
 * The rules module exists so the age gate is expressed exactly once.
 * Every consumer (signup route, capabilities lookup, moderation posture)
 * derives from these primitives instead of pattern-matching on a raw
 * age integer at each site.
 *
 * This encodes a defensible default posture, not legal advice — a real
 * COPPA programme also needs verifiable parental consent (COPPA
 * §312.5(b)), a privacy policy, and a data-deletion path. See /privacy
 * and the consent flow.
 */

/** Below this age, US COPPA requires verifiable parental consent. */
export const COPPA_AGE = 13;

/** The product markets itself to this range; outside it we don't accept signups. */
export const MIN_AGE = 4;
export const MAX_AGE = 18;

// Underscore form is the canonical wire shape used by capabilities.ts and
// URL params. The hyphen form is kept as an alias to preserve any
// external caller (tests, admin console) that still switches on the
// literal string during migration.
export type AgeBand = 'under_13' | 'teen' | 'adult';

export interface AgePolicy {
  band: AgeBand;
  /** Needs a verified parent before any social feature unlocks. */
  requiresParentalConsent: boolean;
  /**
   * @deprecated Consult `capabilitiesFor(...)` in `lib/safety/capabilities.ts`
   * instead. Kept during the Task 5 migration for any straggling
   * caller that still reads the flag directly.
   */
  canShare: boolean;
  /** 1 (loosest) … 5 (strictest). Feeds the AI prompt and moderation posture. */
  contentFilterLevel: number;
}

export function isValidAge(age: unknown): age is number {
  return typeof age === 'number' && Number.isInteger(age) && age >= MIN_AGE && age <= MAX_AGE;
}

/**
 * Derive the account policy from age. `parentalApproval` remains as a
 * parameter for the deprecated `canShare` flag; new callers must NOT
 * read `canShare` — they consult `capabilitiesFor` instead, which
 * consumes the `ConsentState` machine.
 */
export function agePolicy(age: number | null | undefined, parentalApproval = false): AgePolicy {
  // Unknown age is treated as the strictest band, not the loosest.
  if (age === null || age === undefined || !isValidAge(age)) {
    return {
      band: 'under_13',
      requiresParentalConsent: true,
      canShare: false,
      contentFilterLevel: 5,
    };
  }

  if (age < COPPA_AGE) {
    return {
      band: 'under_13',
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

/**
 * Convert a date of birth to the `YYYY-MM` birth-month value written to
 * `profiles.birth_month`. Storing only the month (not the day) is what
 * migration 008 introduced so the server never needs the raw DOB after
 * the initial signup calculation. Returns null on garbage input.
 */
export function birthMonthFromDateOfBirth(dob: string): string | null {
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  if (year < 1900 || year > 2100) return null;
  return `${year}-${month.toString().padStart(2, '0')}`;
}
