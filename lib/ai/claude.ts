import Anthropic from '@anthropic-ai/sdk';
import { blockVocabulary } from './blockVocabulary';

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
    // LingCode's inference proxy WAF blocks the SDK's default
    // `User-Agent: Anthropic/JS ...` (same class of block that hit the
    // LingCodeBaby Quinny bundle's Python UA). Announce ourselves as LingPlay
    // so the WAF lets us through — the request otherwise 403s "Your request
    // was blocked" with no other diagnostic.
    defaultHeaders: {
      'User-Agent': 'LingPlay/1.0 (+https://lingcode.dev)',
    },
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

When you want to add one new object, return this exact update format:
{
  "type": "add_game_object",
  "scene_id": "an existing scene id when needed",
  "game_object": {
    "type": "character|platform|collectible|obstacle|sprite|sound|particles",
    "name": "Short friendly name",
    "position": { "x": 0, "y": 0, "z": 0 },
    "color": "#60A5FA",
    "shape": "box|sphere|cylinder|cone|pyramid|torus|capsule|plane|model|circle|particles",
    "size": 50
  }
}

Return at most one change in the update field. Do not include logic_blocks inside a
new game object: add the object first, then add its controls in a later turn.

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
- goto_xyz {x, y, z} — teleport to absolute world position
- goto_object {target} — teleport to another named object
- change_xyz {dx, dy, dz} — add to current position
- set_x {value} / set_y {value} / set_z {value} — write one axis
- glide_to_xyz {x, y, z, seconds} — smooth move over N seconds (yields until done)
- point_towards {target} — rotate Y to face named object on the XZ plane
- set_rotation {x, y, z degrees} — absolute rotation
- set_variable {name, value, scope?} / change_variable {name, value, scope?} (scope: "global" default, or "object")
- show_variable {name, scope?} / hide_variable {name, scope?} (on-screen watcher)
- broadcast {message} / broadcast_and_wait {message}
- create_clone_of {target?} — spawns a copy of this object (or the named object) at its position;
  max 300 clones. Clones run when_clone_start scripts, not on_start.
- delete_clone — deletes this clone (no-op on the original object)

Looks:
- show / hide — toggle mesh visibility
- set_size {pct} (100 = default) / change_size_by {delta}
- say {text, seconds?} / think {text, seconds?} — billboard bubble; seconds omitted = persistent
- clear_bubble — hide the bubble
- set_color {hex} — runtime tint (e.g. "#ff8800")

AI (yields until the response returns; writes result into the named variable):
- ask_ai {prompt, into_var, scope?} — freeform, short answer
- ai_decide {prompt, choices: "yes,no", into_var, scope?} — constrained to one of the choices

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
- Self position/rotation: {"op":"position_x"}, position_y, position_z,
  rotation_x, rotation_y, rotation_z, {"op":"size"}, {"op":"visible"}
- Other-object position/rotation: {"op":"object_x","value":"Enemy"} (and _y, _z, _rotation_x/y/z)
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

${blockVocabulary()}

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
 * Runtime AI call used by ask_ai / ai_decide blocks. Single-turn, no history.
 * When `choices` is provided, the model is constrained to reply with exactly one
 * of those options — useful for `ai_decide` where the game reads the answer as
 * a discrete branch.
 */
export async function askAI(prompt: string, choices?: string[]): Promise<string> {
  if (!ai) return '';
  const system = choices?.length
    ? `You are an in-game AI called from a Scratch-style block. Answer with EXACTLY ONE of these options, verbatim, with no explanation or punctuation: ${choices.join(' | ')}`
    : 'You are an in-game AI called from a Scratch-style block. Answer in one short sentence — under 20 words. No preamble, no markdown.';

  try {
    const response = await ai.messages.create({
      model: activeModel,
      // These budgets have to cover the `thinking` block the upstream emits
      // before any text, not just the answer. They were 32 (choices) and 200,
      // sized for the answer alone: `ai_decide` spent its whole 32 on thinking,
      // returned no text block at all, and every such block in every child's
      // game silently evaluated to ''. Measured thinking alone at 69-211 tokens
      // on one-word decisions, so 256 is already too tight. Raise these rather
      // than trimming them back — the answer is short, the preamble is not.
      max_tokens: choices?.length ? 512 : 1024,
      system,
      messages: [{ role: 'user', content: prompt }],
    });
    const content = response.content.find((b: any) => b.type === 'text') as
      | { type: 'text'; text: string }
      | undefined;
    const raw = (content?.text ?? '').trim();
    if (!choices?.length) return raw;
    // Constrain: pick the choice whose lowercase form matches, else fall back to raw.
    const lower = raw.toLowerCase();
    const match = choices.find((c) => c.toLowerCase() === lower)
      ?? choices.find((c) => lower.includes(c.toLowerCase()));
    return match ?? raw;
  } catch (error: any) {
    console.error(`${providerName} askAI error:`, error?.message ?? error);
    return '';
  }
}

export default ai;
