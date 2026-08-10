import { query } from '@/lib/mysql/server';
import { keywordScan } from './keyword-scan';

// The moderation pipeline has two tiers:
//   1. OpenAI Moderation API (preferred, when key is configured) — nuanced,
//      category-tagged results with severity heuristics downstream.
//   2. Local keyword blocklist (always) — a cheap defence-in-depth check that
//      runs before/instead of the API. When the API is unreachable we still
//      have the local list, so unauthenticated content isn't a silent bypass.
const useModerationAPI = process.env.OPENAI_API_KEY || process.env.OPENAI_MODERATION_KEY;

interface ModerationApiResult {
  flagged: boolean;
  categories: Record<string, boolean> | string[];
}

async function callModerationAPI(text: string): Promise<ModerationApiResult> {
  // Always run keyword scan first — this is our safety net for when the API
  // is missing, slow, or errors. A local hit short-circuits the network call.
  const local = keywordScan(text);
  if (local.flagged) return local;

  if (!useModerationAPI) return local; // no API configured → keyword result stands

  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${useModerationAPI}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: text }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.results[0];
    }
  } catch (error) {
    console.error('Moderation API error:', error);
  }

  // API failed; fall back to keyword result (which is already known to be safe here).
  return local;
}

export type ModerationResult = {
  safe: boolean;
  flagged: boolean;
  categories: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  actionTaken: 'none' | 'flagged' | 'blocked' | 'hidden';
  reason?: string;
};

/**
 * Moderate text content for kid safety.
 *
 * Pass EITHER `userId` (auth users — we look up their profile) OR `profileId`
 * (guests — we already know it). Passing neither still runs the check but
 * skips DB logging, useful for pre-flight validation.
 */
export async function moderateText(
  text: string,
  userId?: string | null,
  profileId?: string | null
): Promise<ModerationResult> {
  try {
    const result = await callModerationAPI(text);
    const flaggedCategories: string[] = [];
    let severity: ModerationResult['severity'] = 'low';
    let actionTaken: ModerationResult['actionTaken'] = 'none';

    // Check flagged categories
    if (result.flagged) {
      const entries = Array.isArray(result.categories)
        ? result.categories.map((c) => [c, true] as [string, boolean])
        : Object.entries(result.categories);
      entries.forEach(([category, isFlagged]) => {
        if (isFlagged) {
          flaggedCategories.push(category);

          // Determine severity
          if (
            category.includes('sexual') ||
            category.includes('violence') ||
            category.includes('self-harm')
          ) {
            severity = 'critical';
            actionTaken = 'blocked';
          } else if (category.includes('hate') || category.includes('harassment')) {
            severity = 'high';
            actionTaken = 'hidden';
          } else {
            severity = 'medium';
            actionTaken = 'flagged';
          }
        }
      });
    }

    // Log moderation event (best-effort — never let a logging failure block the caller)
    if (userId || profileId) {
      await logModerationEvent({
        userId,
        profileId,
        contentType: 'text',
        content: text,
        flagged: result.flagged,
        flagReason: flaggedCategories.join(', '),
        severity,
        autoActionTaken: actionTaken,
      });
    }

    return {
      safe: !result.flagged,
      flagged: result.flagged,
      categories: flaggedCategories,
      severity,
      actionTaken,
      reason: flaggedCategories.length > 0 ? flaggedCategories.join(', ') : undefined,
    };
  } catch (error) {
    console.error('Moderation error:', error);
    // Fail safe - block on error
    return {
      safe: false,
      flagged: true,
      categories: ['error'],
      severity: 'high',
      actionTaken: 'blocked',
      reason: 'Moderation service error',
    };
  }
}

/**
 * Moderate image content
 */
export async function moderateImage(
  imageUrl: string,
  userId: string
): Promise<ModerationResult> {
  // For production, integrate with a service like AWS Rekognition or Google Vision API
  // For now, basic check
  try {
    // Log the attempt
    await logModerationEvent({
      userId,
      contentType: 'image',
      content: imageUrl,
      flagged: false,
      severity: 'low',
      autoActionTaken: 'none',
    });

    return {
      safe: true,
      flagged: false,
      categories: [],
      severity: 'low',
      actionTaken: 'none',
    };
  } catch (error) {
    console.error('Image moderation error:', error);
    return {
      safe: false,
      flagged: true,
      categories: ['error'],
      severity: 'high',
      actionTaken: 'blocked',
      reason: 'Image moderation error',
    };
  }
}

/**
 * Check if content is age-appropriate
 */
export async function checkAgeAppropriateness(
  content: string,
  targetAge: number
): Promise<{ appropriate: boolean; reason?: string }> {
  // Simple age-appropriateness check
  // In production, you can use Claude or another AI service
  const inappropriateWords = ['violence', 'weapon', 'death']; // Add more as needed
  const lowerContent = content.toLowerCase();
  
  const hasInappropriate = inappropriateWords.some(word => lowerContent.includes(word));
  
  return {
    appropriate: !hasInappropriate,
    reason: hasInappropriate ? 'Content may not be age-appropriate' : undefined,
  };
}

/**
 * Log moderation event to database. Best-effort: swallows all errors so
 * logging failures never break the calling request.
 */
async function logModerationEvent(event: {
  userId?: string | null;
  profileId?: string | null;
  contentType: string;
  contentId?: string;
  content?: string;
  flagged: boolean;
  flagReason?: string;
  severity: string;
  autoActionTaken: string;
}): Promise<void> {
  try {
    const { randomUUID } = await import('crypto');
    const { queryOne } = await import('@/lib/mysql/server');

    // Prefer explicit profileId; otherwise resolve from userId.
    let profileId = event.profileId ?? null;
    if (!profileId && event.userId) {
      const profile = await queryOne<{ id: string }>(
        'SELECT id FROM profiles WHERE user_id = ?',
        [event.userId]
      );
      profileId = profile?.id ?? null;
    }

    if (!profileId) {
      console.error('logModerationEvent: no profile id resolved (userId=%s)', event.userId);
      return;
    }

    await query(
      `INSERT INTO moderation_events
       (id, user_id, content_type, content_id, content, flagged, flag_reason, severity, auto_action_taken)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        profileId,
        event.contentType,
        event.contentId || null,
        event.content?.substring(0, 1000) || null,
        event.flagged,
        event.flagReason || null,
        event.severity,
        event.autoActionTaken,
      ]
    );
  } catch (error) {
    console.error('Failed to log moderation event:', error);
  }
}

/**
 * Sanitize user input
 */
export function sanitizeUserInput(input: string): string {
  // Remove potentially harmful patterns
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .substring(0, 5000); // Limit length
}

/**
 * Check parent approval for sensitive actions
 */
export async function requireParentApproval(
  childId: string,
  action: string,
  details: string
): Promise<{ approved: boolean; parentId?: string }> {
  const { queryOne } = await import('@/lib/mysql/server');

  // Get child's parent (childId is profile id)
  const profile = await queryOne<{
    parent_id: string | null;
    parental_approval: boolean;
  }>(
    'SELECT parent_id, parental_approval FROM profiles WHERE id = ?',
    [childId]
  );

  if (!profile || !profile.parental_approval) {
    return { approved: false };
  }

  // In production, send notification to parent and wait for approval
  // For now, we check if parent has approved this type of action

  return {
    approved: profile.parental_approval,
    parentId: profile.parent_id || undefined,
  };
}

/**
 * Filter content for kids
 */
export const contentFilters = {
  // Block certain words/patterns
  blockedWords: [
    // Add age-inappropriate words
  ],

  // Safe color palette for kids
  safeColors: [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#FFA07A',
    '#98D8C8',
    '#F7DC6F',
    '#BB8FCE',
    '#85C1E2',
    '#F8B4D9',
    '#A8E6CF',
  ],

  // Maximum limits
  maxProjectNameLength: 50,
  maxDescriptionLength: 500,
  maxAssetsPerProject: 100,
  maxScenesPerProject: 10,
};

export default {
  moderateText,
  moderateImage,
  checkAgeAppropriateness,
  sanitizeUserInput,
  requireParentApproval,
  contentFilters,
};

