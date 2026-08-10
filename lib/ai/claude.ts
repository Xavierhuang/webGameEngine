import Anthropic from '@anthropic-ai/sdk';

// Get API key and trim whitespace
const apiKey = (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)?.trim();

if (!apiKey) {
  console.warn('ANTHROPIC_API_KEY not found. Claude AI features will be disabled.');
} else if (!apiKey.startsWith('sk-ant-')) {
  console.warn('ANTHROPIC_API_KEY format appears invalid. Keys should start with "sk-ant-"');
}

const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

export interface GameGenerationRequest {
  prompt: string;
  age: number;
  complexity?: 'simple' | 'medium' | 'advanced';
  projectContext?: {
    title?: string;
    description?: string;
    scenes?: any[];
    gameObjects?: any[];
    logicBlocks?: any[];
  };
}

export interface GameUpdate {
  type: 'create' | 'update' | 'delete' | 'suggest';
  target: 'scene' | 'gameObject' | 'logicBlock' | 'asset' | 'project';
  data?: any;
  explanation: string;
  changes?: Array<{
    action: 'add' | 'modify' | 'remove';
    path: string;
    value?: any;
  }>;
}

/**
 * Main AI chat function - Lovable-style iterative game building
 */
export async function chatWithAI(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  projectContext: GameGenerationRequest['projectContext'],
  age: number
): Promise<{
  message: string;
  update?: GameUpdate;
  suggestions?: string[];
}> {
  const systemPrompt = `You are a friendly AI game building assistant helping a ${age}-year-old create their game. 
You work like Lovable - users can keep prompting you to build and refine their game iteratively.

Your job:
1. Understand what they want to add/change/remove
2. Actually BUILD it by returning structured updates
3. Explain what you did in kid-friendly language
4. Suggest next steps to keep building

You can:
- Create new scenes, game objects, characters
- Add logic blocks (movement, events, conditions) to existing objects
- Modify existing game elements
- Generate sprites/characters (describe them, we'll generate)
- Fix bugs and improve gameplay

IMPORTANT: When adding controls/movement to an existing object, use this format:
{
  "type": "add_logic_blocks",
  "target_object": "Object Name",
  "logic_blocks": [
    {
      "block_type": "on_key_press",
      "category": "input",
      "block_data": {
        "key": "ArrowUp",
        "action": "move_up"
      }
    }
  ],
  "enable_physics": true
}

For arrow keys, use: "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
For actions, use: "move_up", "move_down", "move_left", "move_right", "jump"

Always be encouraging, use simple language, and make games fun!

Return your response as JSON with:
- message: Friendly explanation of what you did/will do
- update: Structured update to apply to the game (if applicable)
- suggestions: Array of 2-3 short suggestions for what to build next

Current game context:
${JSON.stringify(projectContext || {}, null, 2)}`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((msg) => ({
      role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user' as const,
      content: message,
    },
  ];

  if (!anthropic) {
    return {
      message: "I'd love to help you build your game! Please add your ANTHROPIC_API_KEY to the .env file to enable AI features.",
      suggestions: [
        'Get your API key from https://console.anthropic.com/',
        'Add it to your .env file as ANTHROPIC_API_KEY',
        'Restart the dev server',
      ],
    };
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929', // Latest and smartest model for complex agents and coding
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages as any,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      // Try to parse JSON from the response
      const text = content.text;
      
      // Look for JSON in the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            message: parsed.message || text,
            update: parsed.update,
            suggestions: parsed.suggestions,
          };
        } catch (e) {
          // If JSON parsing fails, return as plain message
        }
      }
      
      return {
        message: text,
        suggestions: [
          'Add a character that moves',
          'Create a collectible item',
          'Add a win condition',
        ],
      };
    }

    return {
      message: 'I understand! Let me help you build that.',
    };
  } catch (error: any) {
    console.error('Claude API error:', error);
    
    // Provide helpful error messages
    if (error.status === 401 || error.error?.type === 'authentication_error') {
      const keyFormat = apiKey?.substring(0, 7) || 'missing';
      return {
        message: `I can't connect to Claude. Your API key appears invalid (starts with "${keyFormat}"). Anthropic API keys should start with "sk-ant-".`,
        suggestions: [
          'Get a valid API key from https://console.anthropic.com/',
          'Make sure the key starts with "sk-ant-"',
          'Update .env file: ANTHROPIC_API_KEY=sk-ant-...',
          'Restart the dev server after updating',
        ],
      };
    }
    
    if (error.status === 404 || error.error?.type === 'not_found_error') {
      return {
        message: "I'm having trouble with the AI model. Let me try a different approach.",
        suggestions: [
          'Try asking again',
          'The model might be updating - try in a moment',
        ],
      };
    }
    
    if (error.status === 429) {
      return {
        message: "I'm getting too many requests right now. Please try again in a moment!",
        suggestions: [
          'Wait a few seconds',
          'Try again',
        ],
      };
    }
    
    // Generic error fallback
    return {
      message: "I had trouble understanding that. Can you try asking in a different way?",
      suggestions: [
        'Try: "Create a jumping character"',
        'Try: "Add collectible coins"',
        'Try: "Make a background"',
      ],
    };
  }
}

/**
 * Generate complete game structure from description
 */
export async function generateFullGame(
  request: GameGenerationRequest
): Promise<{
  title: string;
  description: string;
  scenes: Array<{
    name: string;
    background_color: string;
    game_objects: Array<{
      type: string;
      name: string;
      position_x: number;
      position_y: number;
      logic_blocks?: any[];
    }>;
  }>;
}> {
  const systemPrompt = `You are a game design assistant for kids. Create a complete simple game based on their description.
Return valid JSON with: title, description, and scenes array.
Each scene should have: name, background_color, and game_objects array.
Make it fun, educational, and age-appropriate for ${request.age} year olds.`;

  if (!anthropic) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929', // Latest and smartest model for complex agents and coding
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Create a ${request.complexity || 'simple'} game: ${request.prompt}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type === 'text') {
    const text = content.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Fallback structure
      }
    }
  }

  // Fallback structure
  return {
    title: 'My Awesome Game',
    description: request.prompt,
    scenes: [
      {
        name: 'Main Scene',
        background_color: '#87CEEB',
        game_objects: [],
      },
    ],
  };
}

/**
 * Generate sprite/character description (we'll use this to generate images)
 */
export async function generateSpriteDescription(
  description: string,
  style: string = 'cartoon'
): Promise<string> {
  if (!anthropic) {
    return description; // Return original description if API not available
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929', // Latest and smartest model for complex agents and coding
    max_tokens: 500,
    system: 'You are a sprite description generator. Create detailed, kid-friendly descriptions for game characters.',
    messages: [
      {
        role: 'user',
        content: `Describe a ${style} style character: ${description}. Make it simple, colorful, and appropriate for children.`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type === 'text') {
    return content.text;
  }
  return description;
}

export default anthropic;

