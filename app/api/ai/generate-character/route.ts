import { NextRequest, NextResponse } from 'next/server';
import { chatWithAI } from '@/lib/ai/claude';
import { generateTextTo3D } from '@/lib/ai/meshy';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, projectId } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt required' }, { status: 400 });
    }

    // If Meshy API key is present, try to generate a real 3D model
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
          });
        }
      } catch (e) {
        console.warn('Meshy generation failed or pending, falling back to simple character:', e);
      }
    }

    // Otherwise use Claude to propose simple properties for a primitive-based character
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

    const response = await chatWithAI(
      characterPrompt,
      [],
      { projectId },
      10
    );

    // Parse the JSON from the AI response
    const messageText = response.message;
    const jsonMatch = messageText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const character = JSON.parse(jsonMatch[0]);
      return NextResponse.json(character);
    } else {
      // Fallback: generate a simple character
      const colors = ['#60A5FA', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#EF4444'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      
      return NextResponse.json({
        id: prompt.toLowerCase().replace(/\s+/g, '-'),
        name: prompt,
        color: randomColor,
        shape: 'box',
        size: 50,
        description: `A ${prompt}`,
      });
    }
  } catch (error: any) {
    console.error('Error generating character:', error);
    return NextResponse.json(
      { error: 'Failed to generate character' },
      { status: 500 }
    );
  }
}

