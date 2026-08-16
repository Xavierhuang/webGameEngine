/**
 * Blockly block definitions for the lingplay block language.
 * Pure data — no Blockly import — so the serializer and node tests can use it.
 *
 * Conventions that make the serializer generic:
 * - Statement block types are named exactly after LogicBlockType strings
 *   ('on_start', 'move', 'if_then', ...).
 * - Field/input names match the LogicBlock `inputs` keys exactly.
 * - Statement inputs are named 'children' / 'elseChildren'.
 * - Expression blocks are named 'expr_<op>' with value inputs arg0..argN
 *   and an optional 'value' field. Special leaves: expr_number, expr_text,
 *   expr_var.
 * - Custom blocks use Blockly's built-in procedures_defnoreturn /
 *   procedures_callnoreturn (special-cased in the serializer).
 */

// soundCatalog is pure data with no imports of its own, so pulling it in here
// keeps this module node-requirable for the serializer tests.
import { soundDropdownOptions } from '../audio/soundCatalog';
import { drumOptions, instrumentOptions } from '../audio/music';
import { languageOptions } from '../i18n/languages';
import { blockLabel, categoryLabel, dropdownLabel } from '../i18n/blockMessages';

export interface BlockSpec {
  fields: string[];
  values: string[];
  statements: string[];
}

const COLOUR = {
  event: 45,
  control: 120,
  action: 210,
  motion: 210,
  sound: 340,
  variable: 330,
  list: 260,
  clone: 290,
  operator: 160,
  sensing: 200,
  looks: 320,
  ai: 20,
  music: 300,
  pen: 175,
};

const KEY_OPTIONS: [string, string][] = [
  ['up arrow', 'ArrowUp'],
  ['down arrow', 'ArrowDown'],
  ['left arrow', 'ArrowLeft'],
  ['right arrow', 'ArrowRight'],
  ['space', 'SPACE'],
  ['w', 'w'],
  ['a', 'a'],
  ['s', 's'],
  ['d', 'd'],
];

const SCOPE_OPTIONS: [string, string][] = [
  ['for all objects', 'global'],
  ['for this object only', 'object'],
];

/**
 * Graphic effects. `ghost` is 0-100 transparency and `brightness` is -100..100,
 * both matching Scratch. `color` shifts hue by 0-200 (Scratch's range) rather
 * than replacing the tint outright — set_color already does replacement.
 */
const EFFECT_OPTIONS: [string, string][] = [
  ['ghost', 'ghost'],
  ['brightness', 'brightness'],
  ['color', 'color'],
];

const text = (name: string, value = '') => ({ type: 'field_input', name, text: value });
/**
 * A name picker backed by the names already used in the workspace, with a
 * "New…" option. Rendered by LingplayNameField (registered in the editor);
 * still plain data here so this module stays Blockly-free.
 */
const nameField = (name: string, kind: 'variable' | 'list' | 'broadcast' | 'object' | 'sound', value = '') =>
  ({ type: 'field_lingplay_name', name, kind, text: value });
const num = (name: string, value = 0) => ({ type: 'field_number', name, value });
const value = (name: string) => ({ type: 'input_value', name });
const statements = (name: string) => ({ type: 'input_statement', name });
const dropdown = (name: string, options: [string, string][]) => ({ type: 'field_dropdown', name, options });

// ---------------------------------------------------------------------------
// Statement blocks (hats + actions + control)
// ---------------------------------------------------------------------------

const statementDefs: object[] = [
  // Events — hats have no previousStatement.
  { type: 'on_start', message0: 'when game starts', nextStatement: null, colour: COLOUR.event },
  {
    type: 'on_key_press', message0: 'when %1 key held', args0: [dropdown('key', KEY_OPTIONS)],
    nextStatement: null, colour: COLOUR.event,
  },
  { type: 'when_clicked', message0: 'when this object clicked', nextStatement: null, colour: COLOUR.event },
  {
    type: 'when_touches', message0: 'when touching %1', args0: [nameField('target', 'object', '')],
    nextStatement: null, colour: COLOUR.event,
  },
  {
    type: 'when_receive', message0: 'when I receive %1', args0: [nameField('message', 'broadcast', 'message1')],
    nextStatement: null, colour: COLOUR.event,
  },
  { type: 'when_clone_start', message0: 'when I start as a clone', nextStatement: null, colour: COLOUR.clone },
  // Video sensing. The camera is off until a script turns it on — a game a
  // child shares must not open a stranger's webcam on load.
  {
    type: 'when_video_motion', message0: 'when video motion > %1',
    args0: [num('threshold', 10)], nextStatement: null, colour: COLOUR.sensing,
  },
  { type: 'when_scene_starts', message0: 'when scene starts', nextStatement: null, colour: COLOUR.event },

  // Scene switching (Scratch backdrop-switch analog)
  {
    type: 'switch_to_scene', message0: 'switch to scene %1', args0: [text('name', 'Scene 2')],
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },
  { type: 'next_scene', message0: 'next scene', previousStatement: null, nextStatement: null, colour: COLOUR.looks },

  // Costumes (Scratch costume analog — per-object alternate appearances)
  {
    type: 'switch_costume_to', message0: 'switch costume to %1', args0: [text('name', 'costume1')],
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },
  { type: 'next_costume', message0: 'next costume', previousStatement: null, nextStatement: null, colour: COLOUR.looks },

  // Plays an animation authored in the Animation Editor and saved onto the
  // object. 'stop' returns the model to its rest pose.
  {
    type: 'switch_animation_to', message0: 'switch animation to %1', args0: [text('name', 'walk')],
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },

  // Actions
  {
    type: 'move', message0: 'move %1 %2', args0: [
      dropdown('direction', [['forward', 'up'], ['backward', 'down'], ['left', 'left'], ['right', 'right']]),
      value('distance'),
    ],
    previousStatement: null, nextStatement: null, colour: COLOUR.action,
  },
  { type: 'jump', message0: 'jump', previousStatement: null, nextStatement: null, colour: COLOUR.action },
  {
    type: 'rotate', message0: 'rotate x %1 y %2 z %3', args0: [value('x'), value('y'), value('z')],
    previousStatement: null, nextStatement: null, colour: COLOUR.action,
  },
  {
    type: 'scale', message0: 'scale by %1', args0: [value('factor')],
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },
  // Sound options are generated from lib/audio/soundCatalog.ts, which is also
  // what AudioManager renders. They used to be two hand-maintained copies that
  // had to be kept in lockstep with a switch statement by hand.
  {
    type: 'play_sound', message0: 'play sound %1',
    args0: [nameField('sound', 'sound', 'click')],
    previousStatement: null, nextStatement: null, colour: COLOUR.sound,
  },
  {
    type: 'play_sound_until_done', message0: 'play sound %1 until done',
    args0: [nameField('sound', 'sound', 'click')],
    previousStatement: null, nextStatement: null, colour: COLOUR.sound,
  },
  {
    type: 'stop_all_sounds', message0: 'stop all sounds',
    previousStatement: null, nextStatement: null, colour: COLOUR.sound,
  },
  {
    type: 'set_volume', message0: 'set volume to %1 %%', args0: [value('value')],
    previousStatement: null, nextStatement: null, colour: COLOUR.sound,
  },
  {
    type: 'change_volume_by', message0: 'change volume by %1', args0: [value('value')],
    previousStatement: null, nextStatement: null, colour: COLOUR.sound,
  },
  {
    type: 'broadcast', message0: 'broadcast %1', args0: [nameField('message', 'broadcast', 'message1')],
    previousStatement: null, nextStatement: null, colour: COLOUR.event,
  },
  {
    type: 'broadcast_and_wait', message0: 'broadcast %1 and wait', args0: [nameField('message', 'broadcast', 'message1')],
    previousStatement: null, nextStatement: null, colour: COLOUR.event,
  },

  // Variables
  {
    type: 'set_variable', message0: 'set %1 to %2 %3',
    args0: [nameField('name', 'variable', 'score'), value('value'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.variable,
  },
  {
    type: 'change_variable', message0: 'change %1 by %2 %3',
    args0: [nameField('name', 'variable', 'score'), value('value'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.variable,
  },
  {
    type: 'show_variable', message0: 'show variable %1 %2',
    args0: [nameField('name', 'variable', 'score'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.variable,
  },
  {
    type: 'hide_variable', message0: 'hide variable %1 %2',
    args0: [nameField('name', 'variable', 'score'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.variable,
  },

  // Lists
  {
    type: 'add_to_list', message0: 'add %1 to list %2 %3',
    args0: [value('item'), nameField('name', 'list', 'my list'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },
  {
    type: 'delete_from_list', message0: 'delete item %1 of list %2 %3',
    args0: [value('index'), nameField('name', 'list', 'my list'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },
  {
    type: 'insert_into_list', message0: 'insert %1 at %2 of list %3 %4',
    args0: [value('item'), value('index'), nameField('name', 'list', 'my list'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },
  {
    type: 'replace_in_list', message0: 'replace item %1 of list %2 with %3 %4',
    args0: [value('index'), nameField('name', 'list', 'my list'), value('item'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },
  {
    type: 'delete_all_of_list', message0: 'delete all of list %1 %2',
    args0: [nameField('name', 'list', 'my list'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },
  {
    type: 'show_list', message0: 'show list %1 %2',
    args0: [nameField('name', 'list', 'my list'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },
  {
    type: 'hide_list', message0: 'hide list %1 %2',
    args0: [nameField('name', 'list', 'my list'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },

  // Clones
  {
    type: 'create_clone_of', message0: 'create clone of %1', args0: [nameField('target', 'object', 'myself')],
    previousStatement: null, nextStatement: null, colour: COLOUR.clone,
  },
  {
    type: 'delete_clone', message0: 'delete this clone',
    previousStatement: null, nextStatement: null, colour: COLOUR.clone,
  },

  // Control
  {
    type: 'wait', message0: 'wait %1 seconds', args0: [value('seconds')],
    previousStatement: null, nextStatement: null, colour: COLOUR.control,
  },
  {
    type: 'wait_until', message0: 'wait until %1', args0: [value('condition')],
    previousStatement: null, nextStatement: null, colour: COLOUR.control,
  },
  {
    type: 'if_then', message0: 'if %1 then', args0: [value('condition')],
    message1: '%1', args1: [statements('children')],
    message2: 'else %1', args2: [statements('elseChildren')],
    previousStatement: null, nextStatement: null, colour: COLOUR.control,
  },
  {
    type: 'repeat', message0: 'repeat %1', args0: [value('times')],
    message1: '%1', args1: [statements('children')],
    previousStatement: null, nextStatement: null, colour: COLOUR.control,
  },
  {
    type: 'repeat_until', message0: 'repeat until %1', args0: [value('condition')],
    message1: '%1', args1: [statements('children')],
    previousStatement: null, nextStatement: null, colour: COLOUR.control,
  },
  {
    type: 'forever', message0: 'forever %1', args0: [statements('children')],
    previousStatement: null, nextStatement: null, colour: COLOUR.control,
  },
  {
    type: 'stop', message0: 'stop %1', args0: [
      dropdown('option', [['this script', 'this_script'], ['other scripts in object', 'other_scripts'], ['all scripts', 'all']]),
    ],
    previousStatement: null, nextStatement: null, colour: COLOUR.control,
  },

  // Phase 5a: motion writers
  {
    type: 'goto_xyz', message0: 'go to x %1 y %2 z %3', args0: [value('x'), value('y'), value('z')],
    previousStatement: null, nextStatement: null, colour: COLOUR.action,
  },
  {
    type: 'goto_object', message0: 'go to object %1', args0: [nameField('target', 'object', '')],
    previousStatement: null, nextStatement: null, colour: COLOUR.action,
  },
  {
    type: 'change_xyz', message0: 'change x %1 y %2 z %3', args0: [value('dx'), value('dy'), value('dz')],
    previousStatement: null, nextStatement: null, colour: COLOUR.action,
  },
  { type: 'set_x', message0: 'set x to %1', args0: [value('value')], previousStatement: null, nextStatement: null, colour: COLOUR.action },
  { type: 'set_y', message0: 'set y to %1', args0: [value('value')], previousStatement: null, nextStatement: null, colour: COLOUR.action },
  { type: 'set_z', message0: 'set z to %1', args0: [value('value')], previousStatement: null, nextStatement: null, colour: COLOUR.action },
  {
    type: 'glide_to_xyz', message0: 'glide %1 secs to x %2 y %3 z %4',
    args0: [value('seconds'), value('x'), value('y'), value('z')],
    previousStatement: null, nextStatement: null, colour: COLOUR.action,
  },
  {
    type: 'point_towards', message0: 'point towards %1', args0: [nameField('target', 'object', '')],
    previousStatement: null, nextStatement: null, colour: COLOUR.action,
  },
  {
    type: 'set_rotation', message0: 'set rotation x %1 y %2 z %3', args0: [value('x'), value('y'), value('z')],
    previousStatement: null, nextStatement: null, colour: COLOUR.action,
  },

  // Phase 5b: looks basics
  { type: 'show', message0: 'show', previousStatement: null, nextStatement: null, colour: COLOUR.looks },
  { type: 'hide', message0: 'hide', previousStatement: null, nextStatement: null, colour: COLOUR.looks },
  { type: 'set_size', message0: 'set size to %1 %%', args0: [value('pct')], previousStatement: null, nextStatement: null, colour: COLOUR.looks },
  { type: 'change_size_by', message0: 'change size by %1', args0: [value('delta')], previousStatement: null, nextStatement: null, colour: COLOUR.looks },
  {
    type: 'say', message0: 'say %1 for %2 secs', args0: [value('text'), value('seconds')],
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },
  {
    type: 'think', message0: 'think %1 for %2 secs', args0: [value('text'), value('seconds')],
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },
  { type: 'clear_bubble', message0: 'clear bubble', previousStatement: null, nextStatement: null, colour: COLOUR.looks },
  { type: 'set_color', message0: 'set color to %1', args0: [text('hex', '#ffcc00')], previousStatement: null, nextStatement: null, colour: COLOUR.looks },

  // Graphic effects. Scratch's fisheye/whirl/pixelate/mosaic are 2D-canvas
  // filters with no meaningful 3D analog; ghost (opacity) and brightness do,
  // and colour shifts hue.
  {
    type: 'set_effect', message0: 'set %1 effect to %2',
    args0: [dropdown('effect', EFFECT_OPTIONS), value('value')],
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },
  {
    type: 'change_effect_by', message0: 'change %1 effect by %2',
    args0: [dropdown('effect', EFFECT_OPTIONS), value('delta')],
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },
  { type: 'clear_effects', message0: 'clear graphic effects', previousStatement: null, nextStatement: null, colour: COLOUR.looks },

  // Layer ordering — controls draw order for overlapping objects.
  {
    type: 'go_to_layer', message0: 'go to %1 layer',
    args0: [dropdown('layer', [['front', 'front'], ['back', 'back']])],
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },
  {
    type: 'change_layer_by', message0: 'go %1 %2 layers',
    args0: [dropdown('direction', [['forward', 'forward'], ['backward', 'backward']]), value('amount')],
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },

  // Sensing statements
  {
    type: 'ask_and_wait', message0: 'ask %1 and wait', args0: [value('prompt')],
    previousStatement: null, nextStatement: null, colour: COLOUR.sensing,
  },
  // Particle effects. Presets rather than parameters: a child wants sparkles,
  // not an emission rate.
  {
    type: 'burst_particles', message0: 'burst %1',
    args0: [dropdown('effect', [
      ['sparkles', 'sparkle'], ['smoke', 'smoke'], ['fire', 'fire'], ['confetti', 'confetti'],
      ['bubbles', 'bubbles'], ['magic', 'magic'], ['explosion', 'explosion'], ['snow', 'snow'],
    ])],
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },
  {
    type: 'start_particles', message0: 'start %1 trail',
    args0: [dropdown('effect', [
      ['sparkles', 'sparkle'], ['smoke', 'smoke'], ['fire', 'fire'], ['confetti', 'confetti'],
      ['bubbles', 'bubbles'], ['magic', 'magic'], ['snow', 'snow'],
    ])],
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },
  {
    type: 'stop_particles', message0: 'stop my trail',
    previousStatement: null, nextStatement: null, colour: COLOUR.looks,
  },
  // Camera. Scratch has no equivalent — its stage is fixed — so this is the
  // difference between a diorama and a game.
  {
    type: 'camera_follow', message0: 'camera follow %1',
    args0: [nameField('target', 'object', 'Hero')],
    previousStatement: null, nextStatement: null, colour: COLOUR.motion,
  },
  {
    type: 'camera_stop_following', message0: 'camera stop following',
    previousStatement: null, nextStatement: null, colour: COLOUR.motion,
  },
  {
    type: 'camera_shake', message0: 'shake camera %1 for %2 secs',
    args0: [value('strength'), value('seconds')],
    previousStatement: null, nextStatement: null, colour: COLOUR.motion,
  },
  {
    type: 'camera_zoom', message0: 'set camera zoom to %1',
    args0: [value('value')],
    previousStatement: null, nextStatement: null, colour: COLOUR.motion,
  },
  {
    type: 'camera_zoom_by', message0: 'change camera zoom by %1',
    args0: [value('value')],
    previousStatement: null, nextStatement: null, colour: COLOUR.motion,
  },
  { type: 'reset_timer', message0: 'reset timer', previousStatement: null, nextStatement: null, colour: COLOUR.sensing },
  {
    type: 'set_video', message0: 'turn video %1',
    args0: [dropdown('state', [['on', 'on'], ['off', 'off'], ['on flipped', 'flipped']])],
    previousStatement: null, nextStatement: null, colour: COLOUR.sensing,
  },
  {
    type: 'set_video_transparency', message0: 'set video transparency to %1',
    args0: [value('value')], previousStatement: null, nextStatement: null, colour: COLOUR.sensing,
  },

  // --- Music extension (Scratch parity) ---
  {
    type: 'play_note', message0: 'play note %1 for %2 beats', args0: [value('note'), value('beats')],
    previousStatement: null, nextStatement: null, colour: COLOUR.music,
  },
  {
    type: 'play_drum', message0: 'play drum %1 for %2 beats',
    args0: [dropdown('drum', drumOptions()), value('beats')],
    previousStatement: null, nextStatement: null, colour: COLOUR.music,
  },
  {
    type: 'rest_for_beats', message0: 'rest for %1 beats', args0: [value('beats')],
    previousStatement: null, nextStatement: null, colour: COLOUR.music,
  },
  {
    type: 'set_instrument', message0: 'set instrument to %1',
    args0: [dropdown('instrument', instrumentOptions())],
    previousStatement: null, nextStatement: null, colour: COLOUR.music,
  },
  {
    type: 'set_tempo', message0: 'set tempo to %1 bpm', args0: [value('tempo')],
    previousStatement: null, nextStatement: null, colour: COLOUR.music,
  },
  {
    type: 'change_tempo_by', message0: 'change tempo by %1', args0: [value('delta')],
    previousStatement: null, nextStatement: null, colour: COLOUR.music,
  },

  // --- Text-to-speech. Uses the browser's built-in SpeechSynthesis, so unlike
  // Scratch's TTS there is no external service or API key involved. ---
  {
    type: 'speak', message0: 'speak %1', args0: [value('text')],
    previousStatement: null, nextStatement: null, colour: COLOUR.music,
  },
  {
    type: 'speak_until_done', message0: 'speak %1 until done', args0: [value('text')],
    previousStatement: null, nextStatement: null, colour: COLOUR.music,
  },

  // --- Pen extension. In 3D a "trail" is a ribbon of points the object leaves
  // behind, rather than marks on a 2D canvas. ---
  { type: 'pen_down', message0: 'pen down', previousStatement: null, nextStatement: null, colour: COLOUR.pen },
  { type: 'pen_up', message0: 'pen up', previousStatement: null, nextStatement: null, colour: COLOUR.pen },
  { type: 'pen_clear', message0: 'erase all pen', previousStatement: null, nextStatement: null, colour: COLOUR.pen },
  {
    type: 'pen_set_color', message0: 'set pen color to %1', args0: [text('hex', '#ff3b30')],
    previousStatement: null, nextStatement: null, colour: COLOUR.pen,
  },
  {
    type: 'pen_set_size', message0: 'set pen size to %1', args0: [value('size')],
    previousStatement: null, nextStatement: null, colour: COLOUR.pen,
  },

  // --- Translate extension ---
  // A statement rather than a reporter: translation is a network round trip and
  // expression evaluation here is synchronous, so it stores into a variable the
  // same way ask_ai does.
  {
    type: 'translate_to', message0: 'translate %1 to %2 store in %3',
    args0: [value('text'), dropdown('language', languageOptions()), nameField('into_var', 'variable', 'translation')],
    previousStatement: null, nextStatement: null, colour: COLOUR.ai,
  },

  // Phase 5c: AI blocks
  {
    type: 'ask_ai', message0: 'ask AI %1 store in %2', args0: [value('prompt'), text('into_var', 'answer')],
    previousStatement: null, nextStatement: null, colour: COLOUR.ai,
  },
  {
    type: 'ai_decide', message0: 'ask AI %1 choose from %2 store in %3',
    args0: [value('prompt'), text('choices', 'yes,no'), text('into_var', 'answer')],
    previousStatement: null, nextStatement: null, colour: COLOUR.ai,
  },
];

// ---------------------------------------------------------------------------
// Expression blocks (output blocks used inside value inputs)
// ---------------------------------------------------------------------------

const BINARY_OPS: [string, string][] = [
  ['add', '%1 + %2'], ['sub', '%1 - %2'], ['mul', '%1 × %2'], ['div', '%1 ÷ %2'],
  ['mod', '%1 mod %2'], ['lt', '%1 < %2'], ['gt', '%1 > %2'], ['eq', '%1 = %2'],
  ['neq', '%1 ≠ %2'], ['lte', '%1 ≤ %2'], ['gte', '%1 ≥ %2'],
  ['and', '%1 and %2'], ['or', '%1 or %2'], ['join', 'join %1 %2'],
];

// Every entry here auto-generates both the block definition and its toolbox
// entry, so exposing a runtime operator is a one-line change. The trig/log set
// was already implemented in lib/runtime/operators.ts but unreachable from the
// palette — only AI-generated JSON could produce it.
const UNARY_OPS: [string, string][] = [
  ['not', 'not %1'], ['abs', 'abs %1'], ['floor', 'floor %1'],
  ['ceiling', 'ceiling %1'], ['sqrt', 'sqrt %1'], ['round', 'round %1'],
  ['sin', 'sin %1'], ['cos', 'cos %1'], ['tan', 'tan %1'],
  ['asin', 'asin %1'], ['acos', 'acos %1'], ['atan', 'atan %1'],
  ['ln', 'ln %1'], ['log', 'log %1'], ['exp', 'e^ %1'], ['exp10', '10^ %1'],
];

const exprDefs: object[] = [
  { type: 'expr_number', message0: '%1', args0: [num('NUM', 0)], output: null, colour: COLOUR.operator },
  { type: 'expr_text', message0: '%1', args0: [text('TEXT', 'hello')], output: null, colour: COLOUR.operator },
  { type: 'expr_var', message0: '%1', args0: [nameField('value', 'variable', 'score')], output: null, colour: COLOUR.variable },
  ...BINARY_OPS.map(([op, msg]) => ({
    type: `expr_${op}`, message0: msg, args0: [value('arg0'), value('arg1')], output: null, colour: COLOUR.operator,
  })),
  ...UNARY_OPS.map(([op, msg]) => ({
    type: `expr_${op}`, message0: msg, args0: [value('arg0')], output: null, colour: COLOUR.operator,
  })),
  {
    type: 'expr_random', message0: 'random from %1 to %2', args0: [value('arg0'), value('arg1')],
    output: null, colour: COLOUR.operator,
  },
  {
    type: 'expr_letter_of', message0: 'letter %1 of %2', args0: [value('arg0'), value('arg1')],
    output: null, colour: COLOUR.operator,
  },
  { type: 'expr_length', message0: 'length of %1', args0: [value('arg0')], output: null, colour: COLOUR.operator },
  {
    type: 'expr_contains', message0: '%1 contains %2 ?', args0: [value('arg0'), value('arg1')],
    output: null, colour: COLOUR.operator,
  },
  // Sensing
  { type: 'expr_touching', message0: 'touching %1 ?', args0: [nameField('value', 'object', '')], output: null, colour: COLOUR.sensing },
  { type: 'expr_distance_to', message0: 'distance to %1', args0: [nameField('value', 'object', '')], output: null, colour: COLOUR.sensing },
  { type: 'expr_key_pressed', message0: 'key %1 pressed ?', args0: [dropdown('value', KEY_OPTIONS)], output: null, colour: COLOUR.sensing },
  { type: 'expr_video_motion', message0: 'video motion', output: null, colour: COLOUR.sensing },
  { type: 'expr_video_direction', message0: 'video direction', output: null, colour: COLOUR.sensing },
  { type: 'expr_timer', message0: 'timer', output: null, colour: COLOUR.sensing },
  // List reporters
  {
    type: 'expr_list_item', message0: 'item %2 of list %1', args0: [nameField('value', 'list', 'my list'), value('arg0')],
    output: null, colour: COLOUR.list,
  },
  { type: 'expr_list_length', message0: 'length of list %1', args0: [nameField('value', 'list', 'my list')], output: null, colour: COLOUR.list },
  {
    type: 'expr_list_contains', message0: 'list %1 contains %2 ?', args0: [nameField('value', 'list', 'my list'), value('arg0')],
    output: null, colour: COLOUR.list,
  },
  {
    type: 'expr_list_index_of', message0: 'item # of %2 in list %1', args0: [nameField('value', 'list', 'my list'), value('arg0')],
    output: null, colour: COLOUR.list,
  },
  // Phase 5a: motion reporters
  { type: 'expr_position_x', message0: 'x position', output: null, colour: COLOUR.sensing },
  { type: 'expr_position_y', message0: 'y position', output: null, colour: COLOUR.sensing },
  { type: 'expr_position_z', message0: 'z position', output: null, colour: COLOUR.sensing },
  { type: 'expr_rotation_x', message0: 'x rotation', output: null, colour: COLOUR.sensing },
  { type: 'expr_rotation_y', message0: 'y rotation', output: null, colour: COLOUR.sensing },
  { type: 'expr_rotation_z', message0: 'z rotation', output: null, colour: COLOUR.sensing },
  { type: 'expr_object_x', message0: 'x of %1', args0: [nameField('value', 'object', '')], output: null, colour: COLOUR.sensing },
  { type: 'expr_object_y', message0: 'y of %1', args0: [nameField('value', 'object', '')], output: null, colour: COLOUR.sensing },
  { type: 'expr_object_z', message0: 'z of %1', args0: [nameField('value', 'object', '')], output: null, colour: COLOUR.sensing },
  // Already implemented in the interpreter (object_rotation_*) but had no block.
  { type: 'expr_object_rotation_x', message0: 'x rotation of %1', args0: [nameField('value', 'object', '')], output: null, colour: COLOUR.sensing },
  { type: 'expr_object_rotation_y', message0: 'y rotation of %1', args0: [nameField('value', 'object', '')], output: null, colour: COLOUR.sensing },
  { type: 'expr_object_rotation_z', message0: 'z rotation of %1', args0: [nameField('value', 'object', '')], output: null, colour: COLOUR.sensing },
  // Sensing additions
  { type: 'expr_answer', message0: 'answer', output: null, colour: COLOUR.sensing },
  { type: 'expr_mouse_x', message0: 'mouse x', output: null, colour: COLOUR.sensing },
  { type: 'expr_mouse_y', message0: 'mouse y', output: null, colour: COLOUR.sensing },
  { type: 'expr_mouse_down', message0: 'mouse down?', output: null, colour: COLOUR.sensing },
  // Scratch's "language" reporter — the language the player is using.
  { type: 'expr_language', message0: 'language', output: null, colour: COLOUR.sensing },
  // Phase 5b: looks reporters
  { type: 'expr_size', message0: 'size', output: null, colour: COLOUR.looks },
  { type: 'expr_volume', message0: 'volume', output: null, colour: COLOUR.sound },
  { type: 'expr_visible', message0: 'visible ?', output: null, colour: COLOUR.looks },
  { type: 'expr_costume_number', message0: 'costume #', output: null, colour: COLOUR.looks },
  { type: 'expr_costume_name', message0: 'costume name', output: null, colour: COLOUR.looks },
];

export const BLOCK_DEFINITIONS: object[] = [...statementDefs, ...exprDefs];

/** Derived per-type input layout, used by the serializer. */
export const BLOCK_SPECS: Record<string, BlockSpec> = Object.fromEntries(
  BLOCK_DEFINITIONS.map((def: any) => {
    const spec: BlockSpec = { fields: [], values: [], statements: [] };
    for (const argsKey of ['args0', 'args1', 'args2', 'args3']) {
      for (const arg of def[argsKey] ?? []) {
        if (arg.type?.startsWith('field_')) spec.fields.push(arg.name);
        else if (arg.type === 'input_value') spec.values.push(arg.name);
        else if (arg.type === 'input_statement') spec.statements.push(arg.name);
      }
    }
    return [def.type, spec];
  })
);

// ---------------------------------------------------------------------------
// Toolbox
// ---------------------------------------------------------------------------

const numShadow = (n: number) => ({ shadow: { type: 'expr_number', fields: { NUM: n } } });
const textShadow = (t: string) => ({ shadow: { type: 'expr_text', fields: { TEXT: t } } });
const blk = (type: string, inputs?: Record<string, unknown>) => ({ kind: 'block', type, ...(inputs ? { inputs } : {}) });

export const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'Motion', colour: String(COLOUR.motion),
      contents: [
        blk('move', { distance: numShadow(200) }),
        blk('jump'),
        blk('goto_xyz', { x: numShadow(0), y: numShadow(0), z: numShadow(0) }),
        blk('goto_object'),
        blk('change_xyz', { dx: numShadow(1), dy: numShadow(0), dz: numShadow(0) }),
        blk('set_x', { value: numShadow(0) }),
        blk('set_y', { value: numShadow(0) }),
        blk('set_z', { value: numShadow(0) }),
        blk('glide_to_xyz', { seconds: numShadow(1), x: numShadow(0), y: numShadow(0), z: numShadow(0) }),
        blk('rotate', { x: numShadow(0), y: numShadow(90), z: numShadow(0) }),
        blk('set_rotation', { x: numShadow(0), y: numShadow(0), z: numShadow(0) }),
        blk('point_towards'),
        blk('camera_follow'),
        blk('camera_stop_following'),
        blk('camera_shake', { strength: numShadow(1), seconds: numShadow(0.4) }),
        blk('camera_zoom', { value: numShadow(1) }),
        blk('camera_zoom_by', { value: numShadow(0.2) }),
      ],
    },
    {
      kind: 'category', name: 'Looks', colour: String(COLOUR.looks),
      contents: [
        blk('show'),
        blk('hide'),
        blk('say', { text: textShadow('Hello!'), seconds: numShadow(2) }),
        blk('think', { text: textShadow('Hmm...'), seconds: numShadow(2) }),
        blk('clear_bubble'),
        blk('set_size', { pct: numShadow(100) }),
        blk('change_size_by', { delta: numShadow(10) }),
        blk('scale', { factor: numShadow(2) }),
        blk('set_color'),
        blk('set_effect', { value: numShadow(50) }),
        blk('change_effect_by', { delta: numShadow(25) }),
        blk('clear_effects'),
        blk('burst_particles'),
        blk('start_particles'),
        blk('stop_particles'),
        blk('go_to_layer'),
        blk('change_layer_by', { amount: numShadow(1) }),
        blk('switch_to_scene'),
        blk('next_scene'),
        blk('switch_costume_to'),
        blk('next_costume'),
        blk('switch_animation_to'),
        blk('expr_size'),
        blk('expr_visible'),
        blk('expr_costume_number'),
        blk('expr_costume_name'),
      ],
    },
    {
      kind: 'category', name: 'Sound', colour: String(COLOUR.sound),
      contents: [
        blk('play_sound'),
        blk('play_sound_until_done'),
        blk('stop_all_sounds'),
        blk('set_volume', { value: numShadow(100) }),
        blk('change_volume_by', { value: numShadow(-10) }),
        blk('expr_volume'),
      ],
    },
    {
      kind: 'category', name: 'Events', colour: String(COLOUR.event),
      contents: [
        ...['on_start', 'on_key_press', 'when_clicked', 'when_touches', 'when_receive', 'when_clone_start', 'when_scene_starts'].map((t) => blk(t)),
        // No shadow: `threshold` is a field on this block, not a value input,
        // and attaching a shadow block to a field leaves Blockly unable to
        // build the entry — which collapsed the whole Events flyout on top of
        // itself.
        blk('when_video_motion'),
        blk('broadcast'),
        blk('broadcast_and_wait'),
      ],
    },
    {
      kind: 'category', name: 'Control', colour: String(COLOUR.control),
      contents: [
        blk('wait', { seconds: numShadow(1) }),
        blk('wait_until'),
        blk('if_then'),
        blk('repeat', { times: numShadow(4) }),
        blk('repeat_until'),
        blk('forever'),
        blk('stop'),
      ],
    },
    {
      kind: 'category', name: 'AI', colour: String(COLOUR.ai),
      contents: [
        blk('ask_ai', { prompt: textShadow('What should I do next?') }),
        blk('ai_decide', { prompt: textShadow('Should I attack or flee?') }),
      ],
    },
    {
      kind: 'category', name: 'Variables', colour: String(COLOUR.variable),
      contents: [
        blk('set_variable', { value: numShadow(0) }),
        blk('change_variable', { value: numShadow(1) }),
        blk('show_variable'),
        blk('hide_variable'),
        blk('expr_var'),
      ],
    },
    {
      kind: 'category', name: 'Lists', colour: String(COLOUR.list),
      contents: [
        blk('add_to_list', { item: textShadow('apple') }),
        blk('delete_from_list', { index: numShadow(1) }),
        blk('delete_all_of_list'),
        blk('insert_into_list', { index: numShadow(1), item: textShadow('apple') }),
        blk('replace_in_list', { index: numShadow(1), item: textShadow('apple') }),
        blk('show_list'),
        blk('hide_list'),
        blk('expr_list_item', { arg0: numShadow(1) }),
        blk('expr_list_length'),
        blk('expr_list_contains', { arg0: textShadow('apple') }),
        blk('expr_list_index_of', { arg0: textShadow('apple') }),
      ],
    },
    {
      kind: 'category', name: 'Clones', colour: String(COLOUR.clone),
      contents: [blk('create_clone_of'), blk('delete_clone')],
    },
    {
      kind: 'category', name: 'Operators', colour: String(COLOUR.operator),
      contents: [
        blk('expr_number'),
        blk('expr_text'),
        ...BINARY_OPS.map(([op]) => blk(`expr_${op}`, { arg0: numShadow(0), arg1: numShadow(0) })),
        ...UNARY_OPS.map(([op]) => blk(`expr_${op}`, { arg0: numShadow(0) })),
        blk('expr_random', { arg0: numShadow(1), arg1: numShadow(10) }),
        blk('expr_letter_of', { arg0: numShadow(1), arg1: textShadow('abc') }),
        blk('expr_length', { arg0: textShadow('abc') }),
        blk('expr_contains', { arg0: textShadow('abc'), arg1: textShadow('a') }),
      ],
    },
    {
      kind: 'category', name: 'Sensing', colour: String(COLOUR.sensing),
      contents: [
        blk('ask_and_wait', { prompt: textShadow("What's your name?") }),
        blk('expr_answer'),
        blk('expr_touching'),
        blk('expr_distance_to'),
        blk('expr_key_pressed'),
        blk('expr_mouse_x'),
        blk('expr_mouse_y'),
        blk('expr_mouse_down'),
        blk('expr_language'),
        blk('expr_timer'),
        blk('reset_timer'),
        blk('set_video'),
        blk('set_video_transparency', { value: numShadow(50) }),
        blk('expr_video_motion'),
        blk('expr_video_direction'),
        blk('expr_position_x'),
        blk('expr_position_y'),
        blk('expr_position_z'),
        blk('expr_rotation_x'),
        blk('expr_rotation_y'),
        blk('expr_rotation_z'),
        blk('expr_object_x'),
        blk('expr_object_y'),
        blk('expr_object_z'),
        blk('expr_object_rotation_x'),
        blk('expr_object_rotation_y'),
        blk('expr_object_rotation_z'),
      ],
    },
    {
      kind: 'category', name: 'Music', colour: String(COLOUR.music),
      contents: [
        blk('play_note', { note: numShadow(60), beats: numShadow(1) }),
        blk('play_drum', { beats: numShadow(0.25) }),
        blk('rest_for_beats', { beats: numShadow(1) }),
        blk('set_instrument'),
        blk('set_tempo', { tempo: numShadow(60) }),
        blk('change_tempo_by', { delta: numShadow(20) }),
        blk('speak', { text: textShadow('Hello!') }),
        blk('speak_until_done', { text: textShadow('Hello!') }),
      ],
    },
    {
      kind: 'category', name: 'Pen', colour: String(COLOUR.pen),
      contents: [
        blk('pen_down'),
        blk('pen_up'),
        blk('pen_clear'),
        blk('pen_set_color'),
        blk('pen_set_size', { size: numShadow(4) }),
      ],
    },
    { kind: 'category', name: 'My Blocks', colour: '290', custom: 'PROCEDURE' },
  ],
};


/**
 * The same blocks with their labels translated.
 *
 * BLOCK_DEFINITIONS stays English and is what the serializer and every node
 * test read: those care about `args0` names and block structure, never about
 * the label text, and keeping them on a fixed language means a translation can
 * never change how a project is saved.
 *
 * Only `message0` is swapped. A locale that has not translated a given block
 * falls back to English rather than showing a key.
 */
export function localizedBlockDefinitions(locale: string): object[] {
  if (locale === 'en') return BLOCK_DEFINITIONS;

  /**
   * Dropdown options are [label, value]. Only the label is translated: the
   * value is what the serializer writes into a saved project, so translating
   * it would make a project saved in one language unreadable in another.
   */
  const localizeArgs = (args: any[] | undefined) =>
    Array.isArray(args)
      ? args.map((arg: any) =>
          arg?.type === 'field_dropdown' && Array.isArray(arg.options)
            ? {
                ...arg,
                options: arg.options.map(([label, value]: [string, string]) => [
                  dropdownLabel(label, locale),
                  value,
                ]),
              }
            : arg
        )
      : args;

  return BLOCK_DEFINITIONS.map((def: any) => {
    if (typeof def?.type !== 'string') return def;
    const next: any = { ...def };
    if (typeof def.message0 === 'string') {
      next.message0 = blockLabel(def.type, def.message0, locale);
    }
    if (Array.isArray(def.args0)) next.args0 = localizeArgs(def.args0);
    return next;
  });
}

/** The toolbox with its category names translated. */
export function localizedToolbox(locale: string): typeof TOOLBOX {
  if (locale === 'en') return TOOLBOX;
  const translate = (node: any): any => {
    if (Array.isArray(node)) return node.map(translate);
    if (!node || typeof node !== 'object') return node;
    const out: any = { ...node };
    if (out.kind === 'category' && typeof out.name === 'string') {
      out.name = categoryLabel(out.name, locale);
    }
    if (Array.isArray(out.contents)) out.contents = out.contents.map(translate);
    return out;
  };
  return translate(TOOLBOX);
}
