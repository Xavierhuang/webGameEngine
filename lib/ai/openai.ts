import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface GameGenerationRequest {
  prompt: string;
  age: number;
  complexity?: 'simple' | 'medium' | 'advanced';
}

export interface LogicBlockGeneration {
  blocks: Array<{
    type: string;
    category: string;
    data: any;
    children?: LogicBlockGeneration['blocks'];
  }>;
  explanation: string;
}

/**
 * Generate game logic blocks from natural language prompt
 */
export async function generateGameLogic(
  request: GameGenerationRequest
): Promise<LogicBlockGeneration> {
  const systemPrompt = `You are a helpful AI assistant that helps kids aged ${request.age} create games. 
Generate visual programming blocks (similar to Scratch) based on their description.
Make it age-appropriate, fun, and educational.

Available block types:
- event: when_game_starts, when_clicked, when_key_pressed
- condition: if_then, if_then_else, repeat, repeat_until
- action: move, rotate, change_color, play_sound, show_message
- variable: set_variable, change_variable

Return JSON with blocks array and a kid-friendly explanation.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: request.prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const result = JSON.parse(response.choices[0].message.content || '{}');
  return result as LogicBlockGeneration;
}

/**
 * Explain game logic to kids in simple terms
 */
export async function explainLogicForKids(
  code: string,
  age: number
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: `Explain this game code to a ${age} year old child in simple, fun language. Use analogies they understand.`,
      },
      { role: 'user', content: code },
    ],
    temperature: 0.8,
  });

  return response.choices[0].message.content || '';
}

/**
 * Help debug and fix game issues
 */
export async function fixGameBug(
  bugDescription: string,
  gameCode: any
): Promise<{ fix: any; explanation: string }> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content:
          'You are a patient coding teacher helping kids fix bugs in their games. Provide the fix and explain what went wrong in kid-friendly terms.',
      },
      {
        role: 'user',
        content: `Bug: ${bugDescription}\n\nGame code: ${JSON.stringify(gameCode)}`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}

/**
 * Generate sprite/character image using DALL-E
 */
export async function generateSprite(
  description: string,
  style: string = 'cartoon'
): Promise<string> {
  const safePrompt = `A kid-friendly ${style} style character: ${description}. Simple, colorful, appropriate for children. No text, transparent background preferred.`;

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: safePrompt,
    size: '1024x1024',
    quality: 'standard',
    n: 1,
  });

  return response.data[0].url || '';
}

/**
 * Convert voice command to game action
 */
export async function voiceToGameCommand(audioFile: File): Promise<{
  transcript: string;
  command: any;
}> {
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
  });

  const transcript = transcription.text;

  // Parse the transcript into a game command
  const commandResponse = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content:
          'Convert this voice command into a game creation action. Return JSON with action type and parameters.',
      },
      { role: 'user', content: transcript },
    ],
    response_format: { type: 'json_object' },
  });

  const command = JSON.parse(commandResponse.choices[0].message.content || '{}');

  return { transcript, command };
}

/**
 * Generate a complete game from description
 */
export async function generateFullGame(request: GameGenerationRequest): Promise<{
  title: string;
  description: string;
  scenes: any[];
  assets: any[];
}> {
  const systemPrompt = `You are a game design assistant for kids. Create a complete simple game based on their description.
Include: title, description, scenes, game objects, and logic blocks.
Make it fun, educational, and age-appropriate for ${request.age} year olds.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Create a game: ${request.prompt}. Complexity: ${request.complexity || 'simple'}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}

export default openai;

