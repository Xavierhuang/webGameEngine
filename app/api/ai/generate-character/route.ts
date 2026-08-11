import { NextRequest, NextResponse } from 'next/server';
import { chatWithAI } from '@/lib/ai/claude';
import { generateTextTo3D } from '@/lib/ai/meshy';
import { matchCharacterPrefab } from '@/lib/prefabs/characters';

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
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, projectId } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt required' }, { status: 400 });
    }

    // 1. Prefab lookup — try our built-in library first.
    const prefab = matchCharacterPrefab(prompt);
    if (prefab) {
      return NextResponse.json({
        ...prefab,
        // Use the user's phrasing as the display name so their intent stays visible
        // (e.g. prompt="a brave hero" → name="a brave hero", but shape="capsule" from
        // the Hero prefab). Falls back to the prefab's own name for short prompts.
        name: prompt.length > 2 ? prompt : prefab.name,
        source: 'prefab',
      });
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
        return NextResponse.json({ ...character, source: 'ai' });
      } catch {
        // fall through to random-color box below
      }
    }

    // Final fallback: random-color box so the user always gets something usable.
    const colors = ['#60A5FA', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#EF4444'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    return NextResponse.json({
      id: prompt.toLowerCase().replace(/\s+/g, '-'),
      name: prompt,
      color: randomColor,
      shape: 'box',
      size: 50,
      description: `A ${prompt}`,
      source: 'fallback',
    });
  } catch (error: any) {
    console.error('Error generating character:', error);
    return NextResponse.json(
      { error: 'Failed to generate character' },
      { status: 500 }
    );
  }
}
