/**
 * Parent-first capability lookup.
 *
 * `agePolicy` (in `coppa.ts`) returns a policy record that older code
 * translated into scattered ad-hoc booleans (`can_share`, `can_publish`,
 * `parental_approval`). Task 5 replaces that scattering with a single
 * `capabilitiesFor(...)` reducer so every route consults exactly one
 * function to decide what a given actor + profile may do.
 *
 * The truth table is *deny by default*. An under-13 account whose parent
 * has not yet responded ("pending") gets *only* private editing; every
 * other bit is off. Granting flips the community/publish/share bits.
 * Denial / expiry pin the child at the pending state (nothing negative
 * is granted; the child can keep building privately). Teens and adults
 * default to the full set — the consent state is irrelevant for them.
 *
 * The plan is careful about `personalMedia` and `creationAI`: neither is
 * unlocked by mere parental consent. They require a second explicit
 * capability decision so a parent who says "yes, sharing is fine" is
 * not accidentally opting in to microphone recording or AI content.
 */

export type AgeBand = 'under_13' | 'teen' | 'adult';

export type ConsentState =
  | 'not_required'
  | 'pending'
  | 'granted'
  | 'denied'
  | 'expired';

export interface Capabilities {
  editPrivate: boolean;
  publish: boolean;
  share: boolean;
  creationAI: boolean;
  personalMedia: boolean;
  community: boolean;
}

export interface CapabilityInput {
  ageBand: AgeBand;
  consent: ConsentState;
}

const NONE: Capabilities = Object.freeze({
  editPrivate: false,
  publish: false,
  share: false,
  creationAI: false,
  personalMedia: false,
  community: false,
});

const PRIVATE_ONLY: Capabilities = Object.freeze({
  editPrivate: true,
  publish: false,
  share: false,
  creationAI: false,
  personalMedia: false,
  community: false,
});

const CHILD_WITH_CONSENT: Capabilities = Object.freeze({
  editPrivate: true,
  publish: true,
  share: true,
  // creationAI + personalMedia require a separate, more specific consent
  // per the plan's global constraints. Approving general sharing does not
  // authorize microphone recording or AI-generated content.
  creationAI: false,
  personalMedia: false,
  community: true,
});

const TEEN_FULL: Capabilities = Object.freeze({
  editPrivate: true,
  publish: true,
  share: true,
  creationAI: true,
  personalMedia: true,
  community: true,
});

const ADULT_FULL: Capabilities = Object.freeze({ ...TEEN_FULL });

export function capabilitiesFor(input: CapabilityInput): Capabilities {
  const { ageBand, consent } = input;

  if (ageBand === 'adult') return { ...ADULT_FULL };
  if (ageBand === 'teen') return { ...TEEN_FULL };

  // ageBand === 'under_13' — deny-by-default; only 'granted' unlocks share.
  switch (consent) {
    case 'granted':
      return { ...CHILD_WITH_CONSENT };
    case 'pending':
    case 'denied':
    case 'expired':
      return { ...PRIVATE_ONLY };
    case 'not_required':
      // A record can only get here through a schema bug — an under-13 whose
      // consent is 'not_required' is a contradiction. Return the most
      // restrictive possible capabilities so the bug does not open a hole
      // while we chase it down.
      return { ...NONE };
  }
}

// Derive the age band from a `YYYY-MM` birth month stored in profiles.
// `birth_month` (migration 008) replaces the deprecated `age` column so
// the server never has to store a raw age. Callers pass the string that
// came from the DB; a null / malformed value degrades to the strictest
// band the same way `agePolicy` does.
export function ageBandFromBirthMonth(
  birthMonth: string | null | undefined,
  now: Date = new Date(),
): AgeBand {
  if (typeof birthMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(birthMonth)) {
    return 'under_13';
  }
  const [yearStr, monthStr] = birthMonth.split('-');
  const birthYear = Number(yearStr);
  const birthMonthIndex = Number(monthStr) - 1;
  let ageYears = now.getFullYear() - birthYear;
  if (now.getMonth() < birthMonthIndex) ageYears -= 1;
  if (ageYears < 0) return 'under_13';
  if (ageYears < 13) return 'under_13';
  if (ageYears < 18) return 'teen';
  return 'adult';
}
