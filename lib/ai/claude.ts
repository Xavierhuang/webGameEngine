import Anthropic from '@anthropic-ai/sdk';

// -----------------------------------------------------------------------------
// AI client — routes through LingModel by default, with a fallback to direct
// Anthropic for local dev / debugging. LingModel is Anthropic-wire compatible,
// so the whole file uses the @anthropic-ai/sdk; only the client construction
// swaps between (a) Bearer auth against the LingModel proxy and (b) x-api-key
// direct to api.anthropic.com.
//
// Env vars:
//   LINGMODEL_AUTH_TOKEN     LingCode account bearer token — enables LingModel mode
//   LINGMODEL_BASE_URL       default https://lingcode.dev/api/inference/anthropic
//   LINGMODEL_MODEL          default "kimi-k2.7" (internal identifier — never surface upstream branding to users)
//   ANTHROPIC_API_KEY        legacy fallback; used only if LINGMODEL_AUTH_TOKEN is absent
//   ANTHROPIC_MODEL          override for direct-Anthropic mode
// -----------------------------------------------------------------------------

const lingmodelToken = process.env.LINGMODEL_AUTH_TOKEN?.trim();
const anthropicKey = (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY)?.trim();

const USE_LINGMODEL = !!lingmodelToken;

const LINGMODEL_BASE_URL =
  process.env.LINGMODEL_BASE_URL?.trim() ||
  'https://lingcode.dev/api/inference/anthropic';

// Internal identifier for the LingModel upstream family. The LingCode proxy
// can rewrite this server-side, so it's effectively a family tag; do NOT
// surface it in user-visible copy.
const LINGMODEL_MODEL = process.env.LINGMODEL_MODEL?.trim() || 'kimi-k2.7';

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-5-20250929';

const activeModel = USE_LINGMODEL ? LINGMODEL_MODEL : ANTHROPIC_MODEL;
const providerName = USE_LINGMODEL ? 'LingModel' : 'Claude';

let ai: Anthropic | null = null;

if (USE_LINGMODEL) {
  ai = new Anthropic({
    authToken: lingmodelToken,
    baseURL: LINGMODEL_BASE_URL,
    // Explicitly omit apiKey so the SDK sends only the Authorization: Bearer
    // header (not X-Api-Key). Passing '' triggers "auth method unresolved".
    apiKey: null,
  });
  console.log(`[ai] LingModel enabled: ${LINGMODEL_BASE_URL} (model=${LINGMODEL_MODEL})`);
} else if (anthropicKey) {
  if (!anthropicKey.startsWith('sk-ant-')) {
    console.warn('ANTHROPIC_API_KEY format appears invalid. Keys should start with "sk-ant-"');
  }
  ai = new Anthropic({ apiKey: anthropicKey });
  console.log(`[ai] Anthropic direct enabled (model=${ANTHROPIC_MODEL})`);
} else {
  console.warn(
    'No AI credentials found. Set LINGMODEL_AUTH_TOKEN (preferred) or ANTHROPIC_API_KEY to enable AI features.'
  );
}

export interface GameGenerationRequest {
  prompt: string;
  age: number;
  complexity?: 'simple' | 'medium' | 'advanced';
  projectContext?: {
    projectId?: string;
    title?: string;
    description?: string | null;
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

function credentialsMissingResponse() {
  return {
    message: USE_LINGMODEL
      ? "I'd love to help you build your game! LingModel isn't reachable right now — please try again in a moment."
      : "I'd love to help you build your game! The AI backend isn't configured yet.",
    suggestions: USE_LINGMODEL
      ? ['Try again in a moment', 'Check your internet connection']
      : [
          'Set LINGMODEL_AUTH_TOKEN in the server .env to enable LingModel',
          'Or set ANTHROPIC_API_KEY for direct Claude access',
          'Restart the service after updating',
        ],
  };
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

You can also use the FULL block language below. New-style blocks put parameters in "inputs"
(literals are plain values; expressions are {"op": ..., "args": [...]}) and nested bodies in "children".

Event hats (start a script):
- on_start: runs once when the game starts
- on_key_press {key}: runs while the key is held
- when_clicked: runs when the player clicks this object
- when_touches {target}: runs while touching the object named target (omit target for any object)
- when_receive {message}: runs when a broadcast with that message is sent
- when_clone_start: runs once when this object is spawned as a clone (not on the original)

Actions:
- move {direction: "up"|"down"|"left"|"right", distance: number}
- jump, rotate {x,y,z degrees}, scale {factor}, play_sound {sound}
- set_variable {name, value, scope?} / change_variable {name, value, scope?} (scope: "global" default, or "object")
- show_variable {name, scope?} / hide_variable {name, scope?} (on-screen watcher)
- broadcast {message} / broadcast_and_wait {message}
- create_clone_of {target?} — spawns a copy of this object (or the named object) at its position;
  max 300 clones. Clones run when_clone_start scripts, not on_start.
- delete_clone — deletes this clone (no-op on the original object)

Lists (a named variable holding many items; same scope? input as variables):
- add_to_list {name, item, scope?}
- delete_from_list {name, index, scope?} — index is 1-based, or "last", or "all"
- insert_into_list {name, index, item, scope?}
- replace_in_list {name, index, item, scope?}
- show_variable on a list name shows its items on screen

Custom blocks (procedures — Scratch "My Blocks"):
- define_custom_block {name, params: ["param1", ...], children: [...body...]}
  defines a reusable block. It never runs on its own — only via calls.
  Inside the body, read a parameter with {"op":"var","value":"param1"}.
- call_custom_block {name, param1: <value>, ...} — runs the definition with
  arguments bound by parameter name. Names match case-insensitively.
  Procedures can call themselves (recursion) and can contain wait/loops.

Control:
- wait {seconds}
- wait_until {condition: <expr>}
- if_then {condition: <expr>, children: [...], elseChildren: [...]}
- repeat {times, children: [...]} — one iteration per frame
- repeat_until {condition, children: [...]}
- forever {children: [...]}
- stop {option: "this_script"|"other_scripts"|"all"}

Expressions (use anywhere an input accepts a value):
- {"op":"literal","value":N} or just a plain number/string
- {"op":"var","value":"score"} — variable reference
- Math: add sub mul div mod random round abs floor ceiling sqrt (args are exprs)
- Compare: lt gt eq — Logic: and or not — Text: join letter_of length contains
- Sensing: {"op":"touching","value":"Coin"}, {"op":"distance_to","value":"Enemy"},
  {"op":"key_pressed","value":"SPACE"}, {"op":"timer"}
- Lists: {"op":"list_item","value":"inventory","args":[<index expr>]},
  {"op":"list_length","value":"inventory"},
  {"op":"list_contains","value":"inventory","args":[<item expr>]}

Example — a coin that adds to the score and disappears when touched:
{
  "type": "add_logic_blocks",
  "target_object": "Coin",
  "logic_blocks": [
    { "block_type": "when_touches", "inputs": { "target": "Hero" } },
    { "block_type": "change_variable", "inputs": { "name": "score", "value": 1 } },
    { "block_type": "broadcast", "inputs": { "message": "collected" } },
    { "block_type": "play_sound", "inputs": { "sound": "coin" } },
    { "block_type": "scale", "inputs": { "factor": 0.01 } }
  ]
}

Example — enemy that chases forever:
[
  { "block_type": "on_start" },
  { "block_type": "forever", "children": [
    { "block_type": "if_then",
      "inputs": { "condition": { "op": "lt", "args": [ { "op": "distance_to", "value": "Hero" }, 8 ] } },
      "children": [ { "block_type": "move", "inputs": { "direction": "up", "distance": 30 } } ] }
  ]}
]

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

  if (!ai) {
    return credentialsMissingResponse();
  }

  try {
    const response = await ai.messages.create({
      model: activeModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages as any,
    });

    // LingModel can return interleaved `thinking` + `text` blocks; pick the first text block.
    const content = response.content.find((b: any) => b.type === 'text') as
      | { type: 'text'; text: string }
      | undefined;
    if (content && content.type === 'text') {
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
    console.error(`${providerName} API error:`, error);

    // Provide helpful error messages
    if (error.status === 401 || error.error?.type === 'authentication_error') {
      return {
        message: USE_LINGMODEL
          ? "I can't reach LingModel — the account token is invalid or expired."
          : "I can't connect to Claude — the API key is invalid.",
        suggestions: USE_LINGMODEL
          ? [
              'Server ops: refresh LINGMODEL_AUTH_TOKEN in .env',
              'Restart the service after updating',
            ]
          : [
              'Get a valid API key from https://console.anthropic.com/',
              'Make sure the key starts with "sk-ant-"',
              'Update .env: ANTHROPIC_API_KEY=sk-ant-...',
              'Restart the service after updating',
            ],
      };
    }

    if (error.status === 404 || error.error?.type === 'not_found_error') {
      return {
        message: "I'm having trouble reaching the AI model. Let me try again in a moment.",
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

  if (!ai) {
    throw new Error('AI backend not configured (set LINGMODEL_AUTH_TOKEN or ANTHROPIC_API_KEY)');
  }

  const response = await ai.messages.create({
    model: activeModel,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Create a ${request.complexity || 'simple'} game: ${request.prompt}`,
      },
    ],
  });

  const content = response.content.find((b: any) => b.type === 'text') as
    | { type: 'text'; text: string }
    | undefined;
  if (content) {
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
  if (!ai) {
    return description; // Return original description if AI not available
  }

  const response = await ai.messages.create({
    model: activeModel,
    max_tokens: 500,
    system: 'You are a sprite description generator. Create detailed, kid-friendly descriptions for game characters.',
    messages: [
      {
        role: 'user',
        content: `Describe a ${style} style character: ${description}. Make it simple, colorful, and appropriate for children.`,
      },
    ],
  });

  const content = response.content.find((b: any) => b.type === 'text') as
    | { type: 'text'; text: string }
    | undefined;
  if (content) {
    return content.text;
  }
  return description;
}

export default ai;
