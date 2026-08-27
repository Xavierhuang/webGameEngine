import { NextRequest, NextResponse } from 'next/server';
import { resolveActor } from '@/lib/auth/actor';
import { AccessError, requireProjectEdit } from '@/lib/auth/access';
import { readFeatureFlag } from '@/lib/safety/featureFlags';
import { rateLimit } from '@/lib/safety/rateLimit';
import { moderateText } from '@/lib/safety/moderation';
import { chatWithAI } from '@/lib/ai/claude';
import { generateTextTo3D } from '@/lib/ai/meshy';
import {
  buildPrefabCharacterResponse,
  extractColor,
  matchCharacterPrefab,
} from '@/lib/prefabs/characters';

/**
 * Character generation, cheapest-tier-first:
 *
 *   1. Prefab lookup — if the prompt names one of our built-in library
 *      entries ("wizard", "a friendly alien", "cube"), return it immediately.
 *      Zero cost, instant response, no third-party call.
 *   2. Meshy text-to-3D — real GLB model, when `MESHY_API_KEY` is set.
 *   3. Claude property suggestion — AI picks a color + primitive shape,
 *      falls back to a random-color box on parse failure.
 *
 * The library-first behaviour matters for cost + latency: most kid requests
 * ("hero", "ninja", "robot") map straight to a prefab and never hit an API.
 *
 * This route had **no guards at all** until trust-boundary Task 7: no actor,
 * no project access, no flag, no limit, no moderation — while tiers 2 and 3
 * spend real Meshy and Anthropic credits. Anyone on the internet could bill
 * this project by POSTing in a loop. The guard order below is the Task 7
 * order, and each step exists for a distinct reason:
 *
 *   actor → project edit   the caller must be able to edit the project they
 *                          claim to be adding a character to
 *   input moderation       what a child types reaches a third party; screen it
 *                          before it leaves this process, not after
 *   prefab                 free and local, so it stays available even when the
 *                          AI flag is off — turning off AI shouldn't take the
 *                          built-in library down with it
 *   flag → rate limit      the two operator controls over spend, in that order
 *                          so a disabled feature costs nothing to reject
 *   provider               only now
 *   output moderation      model text is rendered to a child
 *
 * The limit is keyed on the resolved actor, not the client IP. Forwarded-IP
 * authority is forgeable, and by this point we have a real identity.
 */
const CHARACTER_LIMIT_PER_HOUR = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, projectId } = body;

    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return NextResponse.json({ error: 'Prompt required' }, { status: 400 });
    }
    if (typeof projectId !== 'string' || projectId === '') {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    const actor = await resolveActor(request);
    const authorized = await requireProjectEdit(actor, projectId);
    const actorId = actor.kind === 'anonymous' ? null : actor.profileId;
    const userId = actor.kind === 'user' ? actor.userId : null;

    // Screen the prompt before it reaches any third party. A prefab match is
    // local, but the prompt is echoed back in the response either way.
    const inbound = await moderateText(prompt.trim(), userId, null);
    if (!inbound.safe) {
      return NextResponse.json(
        {
          error: 'blocked',
          reason: inbound.reason ?? 'Contains disallowed content',
          message: "Let's describe that a different way.",
        },
        { status: 422 },
      );
    }

    // 1. Prefab lookup — try our built-in library first. Free and local, so it
    //    runs before the flag and does not consume the limit.
    const prefab = matchCharacterPrefab(prompt);
    if (prefab) {
      return NextResponse.json(buildPrefabCharacterResponse(prompt, prefab));
    }

    // Everything past this point can cost money.
    const flag = readFeatureFlag('creation_ai');
    if (!flag.enabled) {
      return NextResponse.json(
        { error: 'feature_unavailable', reason: flag.reason },
        { status: 503 },
      );
    }

    const limit = rateLimit(
      `ai-character:${actorId ?? authorized.project.id}`,
      CHARACTER_LIMIT_PER_HOUR,
      60 * 60 * 1000,
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'rate_limited', retryAfter: limit.retryAfter },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
      );
    }

    // 2. Meshy text-to-3D generation.
    if (process.env.MESHY_API_KEY && process.env.MESHY_API_KEY.startsWith('msy_')) {
      try {
        const res = await generateTextTo3D({ prompt });
        if (res.status === 'succeeded' && res.modelUrl) {
          return NextResponse.json({
            id: prompt.toLowerCase().replace(/\s+/g, '-'),
            name: prompt,
            color: '#60A5FA',
            shape: 'model',
            size: 1,
            description: `3D model generated from "${prompt}"`,
            model_url: res.modelUrl,
            thumbnail_url: res.thumbnailUrl,
            source: 'meshy',
          });
        }
      } catch (e) {
        console.warn('Meshy generation failed or pending, falling back to Claude:', e);
      }
    }

    // 3. Claude picks a color + primitive shape.
    const characterPrompt = `Generate a game character based on this description: "${prompt}"

Return ONLY a JSON object with these fields:
{
  "id": "unique-lowercase-id",
  "name": "Character Name",
  "color": "#HEXCOLOR",
  "shape": "box",
  "size": 50,
  "description": "brief description"
}

Make the color vibrant and appropriate for the character. Keep it simple for a 3D game.`;

    const response = await chatWithAI(characterPrompt, [], { projectId }, 10);
    const jsonMatch = response.message.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const character = JSON.parse(jsonMatch[0]);
        // The model names and describes the character, and both strings are
        // rendered straight into the editor. Screen the output as well as the
        // input; falling through to the local box below is a safe answer.
        const outbound = await moderateText(
          [character?.name, character?.description].filter((v) => typeof v === 'string').join('\n'),
          userId,
          null,
        );
        if (outbound.safe) {
          return NextResponse.json({ ...character, source: 'ai' });
        }
        console.warn('[ai/generate-character] blocked unsafe model output:', outbound.reason);
      } catch {
        // fall through to random-color box below
      }
    }

    // Final fallback: something the user always gets. Try to honor a color
    // word from the prompt before falling back to a random palette pick.
    const colors = ['#60A5FA', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#EF4444'];
    const color =
      extractColor(prompt) ?? colors[Math.floor(Math.random() * colors.length)];
    return NextResponse.json({
      id: prompt.toLowerCase().replace(/\s+/g, '-'),
      name: prompt,
      color,
      shape: 'box',
      size: 50,
      description: prompt,
      source: 'fallback',
    });
  } catch (error: any) {
    // Same shape as every other project surface: an unauthorized caller learns
    // only that the project isn't there, not that it exists and is someone
    // else's.
    if (error instanceof AccessError) {
      return NextResponse.json({ error: 'Project not found' }, { status: error.status });
    }
    console.error('Error generating character:', error);
    return NextResponse.json(
      { error: 'Failed to generate character' },
      { status: 500 }
    );
  }
}
