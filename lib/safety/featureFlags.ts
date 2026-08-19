/**
 * Server-only feature flag reader.
 *
 * Every kill-switch-worthy capability (creation AI, personal media capture,
 * community publishing, remote 3D-model imports) has a server flag whose
 * failing side returns 503 `feature_unavailable` from any route that
 * consults it. The flag reader lives here so route handlers cannot invent
 * their own env-var lookups and drift out of sync with operations.
 *
 * Rules baked in on purpose:
 *
 * 1. Flags are server-only. The exported module has no client entry point
 *    and no dependency on `next/headers` or `React`; a client bundle that
 *    imports it will fail to build. Bundling flag state to the browser
 *    turns an operator kill-switch into a client-side toggle the user
 *    can override with dev tools.
 *
 * 2. The truth table is "disabled unless explicitly enabled". A flag with
 *    no environment override reads as `disabled` in production and
 *    `enabled` in every other NODE_ENV so a fresh developer machine
 *    doesn't need a `.env` to run the editor.
 *
 * 3. Reason strings are wire-fixed. Callers switch on
 *    `FeatureFlagReason.Disabled`, so a change to the string is a wire
 *    break, not a UI copy tweak. Route handlers do:
 *
 *        const flag = readFeatureFlag('creation_ai');
 *        if (!flag.enabled) return NextResponse.json(
 *          { error: 'feature_unavailable', reason: flag.reason },
 *          { status: 503 },
 *        );
 *
 * 4. Env variable names are derived (`FEATURE_FLAG_<UPPER_SNAKE>`), not
 *    caller-supplied, so a route cannot accidentally shadow another
 *    route's flag or read a flag it doesn't own.
 */

export type FeatureFlagName =
  | 'creation_ai'
  | 'personal_media'
  | 'community_publishing'
  | 'remote_model_imports'
  | 'ai_moderation';

// Every flag known to the server. Adding a new capability means adding it
// here so `readFeatureFlag` can validate and so operators see the full
// truth table from one file. An unknown flag name is a programmer error,
// not a runtime `disabled` — we throw rather than default to a stale
// permissive value.
const KNOWN_FLAGS: ReadonlySet<FeatureFlagName> = new Set([
  'creation_ai',
  'personal_media',
  'community_publishing',
  'remote_model_imports',
  'ai_moderation',
]);

export const FeatureFlagReason = {
  // Flag is explicitly disabled via env or falls back to disabled in prod.
  Disabled: 'flag_disabled',
  // Flag is enabled and the request may proceed.
  Enabled: 'flag_enabled',
  // Prod requires an explicit env; the reader will throw before returning
  // this reason. Kept in the enum so tests can assert exhaustive coverage.
  MisconfiguredInProduction: 'flag_misconfigured_in_production',
} as const;

export type FeatureFlagReasonCode =
  (typeof FeatureFlagReason)[keyof typeof FeatureFlagReason];

export interface FeatureFlagResult {
  name: FeatureFlagName;
  enabled: boolean;
  reason: FeatureFlagReasonCode;
}

export interface ReadFeatureFlagOptions {
  env?: NodeJS.ProcessEnv;
}

const TRUE_VALUES: ReadonlySet<string> = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const FALSE_VALUES: ReadonlySet<string> = new Set(['0', 'false', 'no', 'off', 'disabled']);

function envVarNameFor(flag: FeatureFlagName): string {
  return `FEATURE_FLAG_${flag.toUpperCase()}`;
}

function parseFlagValue(raw: string | undefined): boolean | 'invalid' | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return 'invalid';
}

export function readFeatureFlag(
  name: FeatureFlagName,
  options: ReadFeatureFlagOptions = {},
): FeatureFlagResult {
  if (!KNOWN_FLAGS.has(name)) {
    throw new Error(`readFeatureFlag received unknown flag name: ${String(name)}`);
  }

  const env = options.env ?? process.env;
  const raw = env[envVarNameFor(name)];
  const parsed = parseFlagValue(raw);

  // Malformed env variable: throw. A silent fallback to disabled would let
  // a typo (`FEATURE_FLAG_CREATION_AI=truue`) look like an operator kill
  // during an audit. Loud is safer than silent when the env itself is wrong.
  if (parsed === 'invalid') {
    throw new Error(
      `Feature flag ${name} has an invalid ${envVarNameFor(name)} value; ` +
        `expected one of true/false/on/off/1/0/enabled/disabled, got: ${JSON.stringify(raw)}`,
    );
  }

  if (parsed === true) {
    return { name, enabled: true, reason: FeatureFlagReason.Enabled };
  }
  if (parsed === false) {
    return { name, enabled: false, reason: FeatureFlagReason.Disabled };
  }

  // Unset in the environment. Production defaults to disabled — a missing
  // flag is treated as "operator has not authorized this capability yet."
  // Non-production defaults to enabled so contributors don't need an env
  // file to hit the editor.
  const nodeEnv = env.NODE_ENV;
  if (nodeEnv === 'production') {
    return { name, enabled: false, reason: FeatureFlagReason.Disabled };
  }
  return { name, enabled: true, reason: FeatureFlagReason.Enabled };
}

export function knownFeatureFlags(): ReadonlyArray<FeatureFlagName> {
  return Array.from(KNOWN_FLAGS);
}
