import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { prompt, age, complexity } = await req.json();

    // Moderate the prompt first
    const moderationResponse = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: prompt }),
    });

    const moderation = await moderationResponse.json();
    if (moderation.results[0].flagged) {
      return new Response(
        JSON.stringify({ error: 'Content not appropriate for kids' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Generate game using OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are a game design assistant for kids aged ${age}. Create a complete simple game.
Include: title, description, scenes with game objects, and logic blocks.
Return valid JSON only.`,
          },
          {
            role: 'user',
            content: `Create a ${complexity || 'simple'} game: ${prompt}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
      }),
    });

    const openaiData = await openaiResponse.json();
    const gameData = JSON.parse(openaiData.choices[0].message.content);

    // Log generation
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
      await supabaseClient.from('ai_generations').insert({
        user_id: user.id,
        generation_type: 'full_game',
        prompt,
        result: gameData,
        model_used: 'gpt-4-turbo-preview',
        tokens_used: openaiData.usage?.total_tokens,
        success: true,
      });
    }

    return new Response(JSON.stringify(gameData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

