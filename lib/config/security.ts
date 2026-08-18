export const AI_LIMITS = {
  maxPayloadBytes: 262144,
  maxInputTokens: 8000,
  maxOutputTokens: 2000,
  maxHistoryMessages: 20,
  maxConcurrentPerActor: 2,
  maxConcurrentPerProject: 4,
  dailyAsk: 50,
  dailyChat: 20,
  dailyCharacterJobs: 5,
} as const;

export const DEFAULT_CAPABILITIES = {
  aiProjectContext: false,
  aiMutation: false,
  personalMediaUpload: false,
  newPublication: false,
} as const;

export interface SecurityConfig {
  guestSessionDays: number;
  trustedProxyHops: number;
  ai: typeof AI_LIMITS;
  capabilities: typeof DEFAULT_CAPABILITIES;
}

function readTrustedProxyHops(value: string | undefined): number | null {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    return null;
  }

  if (!/^(?:0|[1-9]\d*)$/.test(value)) {
    return null;
  }

  const trustedProxyHops = Number(value);
  return Number.isSafeInteger(trustedProxyHops) ? trustedProxyHops : null;
}

export function readSecurityConfig(env: NodeJS.ProcessEnv): SecurityConfig {
  const trustedProxyHops = readTrustedProxyHops(env.TRUSTED_PROXY_HOPS);
  if (env.NODE_ENV === 'production' && trustedProxyHops === null) {
    throw new Error('TRUSTED_PROXY_HOPS is required in production and must be a non-negative integer');
  }

  return {
    guestSessionDays: 30,
    trustedProxyHops: trustedProxyHops ?? 0,
    ai: AI_LIMITS,
    capabilities: DEFAULT_CAPABILITIES,
  };
}
