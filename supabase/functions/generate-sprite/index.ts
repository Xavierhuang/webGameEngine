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

    const { description, style, projectId } = await req.json();

    // Create kid-friendly safe prompt
    const safePrompt = `A kid-friendly ${style || 'cartoon'} style: ${description}. Simple, colorful, appropriate for children. No text, clean background.`;

    // Generate image with DALL-E
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: safePrompt,
        size: '1024x1024',
        quality: 'standard',
        n: 1,
      }),
    });

    const data = await response.json();
    const imageUrl = data.data[0].url;

    // Download and store in Supabase Storage
    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.blob();
    const fileName = `${crypto.randomUUID()}.png`;

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('assets')
      .upload(`${user.id}/${fileName}`, imageBlob, {
        contentType: 'image/png',
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabaseClient.storage
      .from('assets')
      .getPublicUrl(uploadData.path);

    // Save asset record
    const { data: asset } = await supabaseClient
      .from('assets')
      .insert({
        owner_id: user.id,
        project_id: projectId,
        asset_type: 'image',
        name: description,
        file_url: publicUrl,
        generated_by_ai: true,
        generation_prompt: description,
      })
      .select()
      .single();

    // Log generation
    await supabaseClient.from('ai_generations').insert({
      user_id: user.id,
      project_id: projectId,
      generation_type: 'image',
      prompt: description,
      result: { url: publicUrl, assetId: asset?.id },
      model_used: 'dall-e-3',
      success: true,
    });

    return new Response(
      JSON.stringify({ url: publicUrl, asset }),
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

