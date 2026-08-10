/**
 * Pure keyword scanner used as the local-only tier of moderation. Kept in its
 * own module (no I/O, no imports) so it can be unit-tested and reused from
 * client code if needed.
 *
 * Categories mirror OpenAI moderation category names so downstream severity
 * mapping in lib/safety/moderation.ts works identically for API vs local hits.
 */

export type KeywordSeverity = 'medium' | 'high' | 'critical';

export interface KeywordEntry {
  pattern: RegExp;
  category: string;
  severity: KeywordSeverity;
}

// Kept intentionally short — the OpenAI Moderation API is the primary defence.
// This list is a defence-in-depth safety net for when the API is missing,
// slow, or the request originates from a guest before we've paid for a call.
export const KEYWORD_BLOCKLIST: KeywordEntry[] = [
  { pattern: /\b(kill|murder|shoot|stab)\s+(myself|yourself|him|her|them)\b/i, category: 'violence', severity: 'critical' },
  { pattern: /\b(suicide|self[- ]?harm|cut\s+myself)\b/i, category: 'self-harm', severity: 'critical' },
  { pattern: /\b(porn|nude|naked)\b/i, category: 'sexual', severity: 'critical' },
  { pattern: /\b(fuck\w*|shit\w*|bitch\w*|ass?hole\w*|cunt\w*)\b/i, category: 'profanity', severity: 'medium' },
  { pattern: /\b(bomb|explosive|terrorist)\s+(make|build|how)\b/i, category: 'violence', severity: 'high' },
];

export interface KeywordScanResult {
  flagged: boolean;
  categories: Record<string, boolean>;
}

export function keywordScan(text: string, blocklist: KeywordEntry[] = KEYWORD_BLOCKLIST): KeywordScanResult {
  const rec: Record<string, boolean> = {};
  for (const entry of blocklist) {
    if (entry.pattern.test(text)) rec[entry.category] = true;
  }
  return { flagged: Object.keys(rec).length > 0, categories: rec };
}
