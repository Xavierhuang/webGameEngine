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

const text = (name: string, value = '') => ({ type: 'field_input', name, text: value });
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
    type: 'when_touches', message0: 'when touching %1', args0: [text('target')],
    nextStatement: null, colour: COLOUR.event,
  },
  {
    type: 'when_receive', message0: 'when I receive %1', args0: [text('message', 'message1')],
    nextStatement: null, colour: COLOUR.event,
  },
  { type: 'when_clone_start', message0: 'when I start as a clone', nextStatement: null, colour: COLOUR.clone },
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
  // Sound dropdown options match AudioManager.playSfx's built-in synthesized
  // types (lib/audio/AudioManager.ts). Adding a new sound? Add the case in
  // AudioManager first, then add its [label, value] here — both blocks stay in
  // lockstep.
  {
    type: 'play_sound', message0: 'play sound %1',
    args0: [dropdown('sound', [
      ['click', 'click'],
      ['confirm', 'confirm'],
      ['error', 'error'],
      ['pickup', 'pickup'],
      ['jump', 'jump'],
      ['hit', 'hit'],
    ])],
    previousStatement: null, nextStatement: null, colour: COLOUR.sound,
  },
  {
    type: 'play_sound_until_done', message0: 'play sound %1 until done',
    args0: [dropdown('sound', [
      ['click', 'click'],
      ['confirm', 'confirm'],
      ['error', 'error'],
      ['pickup', 'pickup'],
      ['jump', 'jump'],
      ['hit', 'hit'],
    ])],
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
    type: 'broadcast', message0: 'broadcast %1', args0: [text('message', 'message1')],
    previousStatement: null, nextStatement: null, colour: COLOUR.event,
  },
  {
    type: 'broadcast_and_wait', message0: 'broadcast %1 and wait', args0: [text('message', 'message1')],
    previousStatement: null, nextStatement: null, colour: COLOUR.event,
  },

  // Variables
  {
    type: 'set_variable', message0: 'set %1 to %2 %3',
    args0: [text('name', 'score'), value('value'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.variable,
  },
  {
    type: 'change_variable', message0: 'change %1 by %2 %3',
    args0: [text('name', 'score'), value('value'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.variable,
  },
  {
    type: 'show_variable', message0: 'show variable %1 %2',
    args0: [text('name', 'score'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.variable,
  },
  {
    type: 'hide_variable', message0: 'hide variable %1 %2',
    args0: [text('name', 'score'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.variable,
  },

  // Lists
  {
    type: 'add_to_list', message0: 'add %1 to list %2 %3',
    args0: [value('item'), text('name', 'my list'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },
  {
    type: 'delete_from_list', message0: 'delete item %1 of list %2 %3',
    args0: [value('index'), text('name', 'my list'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },
  {
    type: 'insert_into_list', message0: 'insert %1 at %2 of list %3 %4',
    args0: [value('item'), value('index'), text('name', 'my list'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },
  {
    type: 'replace_in_list', message0: 'replace item %1 of list %2 with %3 %4',
    args0: [value('index'), text('name', 'my list'), value('item'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },
  {
    type: 'delete_all_of_list', message0: 'delete all of list %1 %2',
    args0: [text('name', 'my list'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },
  {
    type: 'show_list', message0: 'show list %1 %2',
    args0: [text('name', 'my list'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },
  {
    type: 'hide_list', message0: 'hide list %1 %2',
    args0: [text('name', 'my list'), dropdown('scope', SCOPE_OPTIONS)],
    previousStatement: null, nextStatement: null, colour: COLOUR.list,
  },

  // Clones
  {
    type: 'create_clone_of', message0: 'create clone of %1', args0: [text('target', 'myself')],
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
    type: 'goto_object', message0: 'go to object %1', args0: [text('target')],
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
    type: 'point_towards', message0: 'point towards %1', args0: [text('target')],
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
  ['and', '%1 and %2'], ['or', '%1 or %2'], ['join', 'join %1 %2'],
];

const UNARY_OPS: [string, string][] = [
  ['not', 'not %1'], ['abs', 'abs %1'], ['floor', 'floor %1'],
  ['ceiling', 'ceiling %1'], ['sqrt', 'sqrt %1'], ['round', 'round %1'],
];

const exprDefs: object[] = [
  { type: 'expr_number', message0: '%1', args0: [num('NUM', 0)], output: null, colour: COLOUR.operator },
  { type: 'expr_text', message0: '%1', args0: [text('TEXT', 'hello')], output: null, colour: COLOUR.operator },
  { type: 'expr_var', message0: '%1', args0: [text('value', 'score')], output: null, colour: COLOUR.variable },
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
  { type: 'expr_touching', message0: 'touching %1 ?', args0: [text('value')], output: null, colour: COLOUR.sensing },
  { type: 'expr_distance_to', message0: 'distance to %1', args0: [text('value')], output: null, colour: COLOUR.sensing },
  { type: 'expr_key_pressed', message0: 'key %1 pressed ?', args0: [dropdown('value', KEY_OPTIONS)], output: null, colour: COLOUR.sensing },
  { type: 'expr_timer', message0: 'timer', output: null, colour: COLOUR.sensing },
  // List reporters
  {
    type: 'expr_list_item', message0: 'item %2 of list %1', args0: [text('value', 'my list'), value('arg0')],
    output: null, colour: COLOUR.list,
  },
  { type: 'expr_list_length', message0: 'length of list %1', args0: [text('value', 'my list')], output: null, colour: COLOUR.list },
  {
    type: 'expr_list_contains', message0: 'list %1 contains %2 ?', args0: [text('value', 'my list'), value('arg0')],
    output: null, colour: COLOUR.list,
  },
  {
    type: 'expr_list_index_of', message0: 'item # of %2 in list %1', args0: [text('value', 'my list'), value('arg0')],
    output: null, colour: COLOUR.list,
  },
  // Phase 5a: motion reporters
  { type: 'expr_position_x', message0: 'x position', output: null, colour: COLOUR.sensing },
  { type: 'expr_position_y', message0: 'y position', output: null, colour: COLOUR.sensing },
  { type: 'expr_position_z', message0: 'z position', output: null, colour: COLOUR.sensing },
  { type: 'expr_rotation_x', message0: 'x rotation', output: null, colour: COLOUR.sensing },
  { type: 'expr_rotation_y', message0: 'y rotation', output: null, colour: COLOUR.sensing },
  { type: 'expr_rotation_z', message0: 'z rotation', output: null, colour: COLOUR.sensing },
  { type: 'expr_object_x', message0: 'x of %1', args0: [text('value')], output: null, colour: COLOUR.sensing },
  { type: 'expr_object_y', message0: 'y of %1', args0: [text('value')], output: null, colour: COLOUR.sensing },
  { type: 'expr_object_z', message0: 'z of %1', args0: [text('value')], output: null, colour: COLOUR.sensing },
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
        blk('switch_to_scene'),
        blk('next_scene'),
        blk('switch_costume_to'),
        blk('next_costume'),
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
        blk('expr_touching'),
        blk('expr_distance_to'),
        blk('expr_key_pressed'),
        blk('expr_timer'),
        blk('expr_position_x'),
        blk('expr_position_y'),
        blk('expr_position_z'),
        blk('expr_rotation_x'),
        blk('expr_rotation_y'),
        blk('expr_rotation_z'),
        blk('expr_object_x'),
        blk('expr_object_y'),
        blk('expr_object_z'),
      ],
    },
    { kind: 'category', name: 'My Blocks', colour: '290', custom: 'PROCEDURE' },
  ],
};
