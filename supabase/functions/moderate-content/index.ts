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

    const { content, contentType, contentId } = await req.json();

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    // Moderate with OpenAI
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: content }),
    });

    const moderation = await response.json();
    const result = moderation.results[0];

    const flaggedCategories: string[] = [];
    let severity = 'low';
    let actionTaken = 'none';

    if (result.flagged) {
      Object.entries(result.categories).forEach(([category, isFlagged]) => {
        if (isFlagged) {
          flaggedCategories.push(category);
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

    // Log moderation event
    await supabaseClient.from('moderation_events').insert({
      user_id: user.id,
      content_type: contentType,
      content_id: contentId,
      content: content.substring(0, 1000),
      flagged: result.flagged,
      flag_reason: flaggedCategories.join(', '),
      severity,
      auto_action_taken: actionTaken,
    });

    return new Response(
      JSON.stringify({
        safe: !result.flagged,
        flagged: result.flagged,
        categories: flaggedCategories,
        severity,
        actionTaken,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

