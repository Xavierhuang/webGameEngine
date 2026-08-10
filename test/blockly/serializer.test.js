const { blocklyToLogic, logicToBlockly, normalizeDbBlocks } = require('../.build/lib/blockly/serializer.js');

let failures = 0;
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}
function deepEq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log(`FAIL ${label}:\n  expected ${e}\n  got      ${a}`); }
  else console.log(`ok   ${label}`);
}

// Canonical form for round-trip comparison: literal exprs collapse to plain
// values, empty inputs/children dropped, block ids ignored.
function canon(blocks) {
  return blocks.map((b) => {
    const out = { block_type: b.block_type };
    const inputs = {};
    for (const k of Object.keys(b.inputs ?? {}).sort()) {
      const v = b.inputs[k];
      if (k === 'params') { inputs[k] = v; continue; }
      inputs[k] = canonValue(v);
    }
    if (Object.keys(inputs).length) out.inputs = inputs;
    if (b.children?.length) out.children = canon(b.children);
    if (b.elseChildren?.length) out.elseChildren = canon(b.elseChildren);
    return out;
  });
}
function canonValue(v) {
  if (v && typeof v === 'object') {
    if (v.op === 'literal') return v.value;
    const out = { op: v.op };
    if (v.value !== undefined) out.value = v.value;
    if (v.args?.length) out.args = v.args.map(canonValue);
    return out;
  }
  return v;
}

function roundTrip(blocks, label) {
  const json = logicToBlockly(blocks);
  const back = blocklyToLogic(json);
  deepEq(canon(back), canon(blocks), label);
  return json;
}

// --- full-language corpus round trip ---
const corpus = [
  { id: 'h1', block_type: 'on_start' },
  { id: 'm1', block_type: 'move', inputs: { direction: 'up', distance: 200 } },
  { id: 'w1', block_type: 'wait', inputs: { seconds: 1 } },
  { id: 'i1', block_type: 'if_then',
    inputs: { condition: { op: 'lt', args: [{ op: 'var', value: 'hp' }, { op: 'literal', value: 3 }] } },
    children: [
      { id: 's1', block_type: 'set_variable', inputs: { name: 'score', value: 0, scope: 'global' } },
      { id: 'b1', block_type: 'broadcast', inputs: { message: 'dead' } },
    ],
    elseChildren: [
      { id: 'c1', block_type: 'change_variable', inputs: { name: 'score', value: 1, scope: 'object' } },
    ],
  },
  { id: 'r1', block_type: 'repeat', inputs: { times: 3 }, children: [
    { id: 'j1', block_type: 'jump' },
    { id: 'a1', block_type: 'add_to_list', inputs: { name: 'inv', item: 'coin', scope: 'global' } },
  ]},
  { id: 'f1', block_type: 'forever', children: [
    { id: 'i2', block_type: 'if_then',
      inputs: { condition: { op: 'touching', value: 'Coin' } },
      children: [{ id: 'p1', block_type: 'play_sound', inputs: { sound: 'coin' } }] },
  ]},
  { id: 'h2', block_type: 'on_key_press', inputs: { key: 'ArrowRight' } },
  { id: 'm2', block_type: 'move', inputs: { direction: 'right', distance: 500 } },
  { id: 'h3', block_type: 'when_receive', inputs: { message: 'go' } },
  { id: 'cc1', block_type: 'create_clone_of', inputs: { target: 'myself' } },
  { id: 'h4', block_type: 'when_clone_start' },
  { id: 'dc1', block_type: 'delete_clone' },
  { id: 'st1', block_type: 'stop', inputs: { option: 'other_scripts' } },
  { id: 'wu1', block_type: 'wait_until', inputs: { condition: { op: 'gt', args: [{ op: 'timer' }, 5] } } },
  { id: 'ru1', block_type: 'repeat_until', inputs: { condition: { op: 'key_pressed', value: 'SPACE' } }, children: [
    { id: 'ro1', block_type: 'rotate', inputs: { x: 0, y: 90, z: 0 } },
  ]},
  { id: 'd1', block_type: 'define_custom_block', inputs: { name: 'add score', params: ['amount'] }, children: [
    { id: 'cv1', block_type: 'change_variable', inputs: { name: 'score', value: { op: 'var', value: 'amount' }, scope: 'global' } },
  ]},
  { id: 'h5', block_type: 'when_clicked' },
  { id: 'call1', block_type: 'call_custom_block', inputs: { name: 'add score', amount: { op: 'mul', args: [2, 3] } } },
  { id: 'li1', block_type: 'set_variable', inputs: { name: 'first', value: { op: 'list_item', value: 'inv', args: [1] }, scope: 'global' } },
  { id: 'll1', block_type: 'set_variable', inputs: { name: 'n', value: { op: 'list_length', value: 'inv' }, scope: 'global' } },
  { id: 'lc1', block_type: 'set_variable', inputs: { name: 'has', value: { op: 'list_contains', value: 'inv', args: ['gem'] }, scope: 'global' } },
  { id: 'rp1', block_type: 'replace_in_list', inputs: { name: 'inv', index: 2, item: 'gem', scope: 'object' } },
  { id: 'dl1', block_type: 'delete_from_list', inputs: { name: 'inv', index: 1, scope: 'global' } },
  { id: 'in1', block_type: 'insert_into_list', inputs: { name: 'inv', index: 1, item: 'map', scope: 'global' } },
  { id: 'sc1', block_type: 'scale', inputs: { factor: 2 } },
  { id: 'sv1', block_type: 'show_variable', inputs: { name: 'score', scope: 'global' } },
  { id: 'hv1', block_type: 'hide_variable', inputs: { name: 'score', scope: 'object' } },
  { id: 'ex1', block_type: 'set_variable', inputs: { name: 'x', value: { op: 'random', args: [1, 10] }, scope: 'global' } },
  { id: 'ex2', block_type: 'set_variable', inputs: { name: 'y', value: { op: 'letter_of', args: [1, 'abc'] }, scope: 'global' } },
  { id: 'ex3', block_type: 'set_variable', inputs: { name: 'z', value: { op: 'contains', args: ['hello', 'ell'] }, scope: 'global' } },
];
roundTrip(corpus, 'round trip: full corpus');

// --- stack grouping: hat starts a new stack, following blocks chain via next ---
{
  const json = logicToBlockly(corpus);
  const tops = json.blocks.blocks;
  eq(tops[0].type, 'on_start', 'stack: first top is on_start');
  eq(tops[0].next.block.type, 'move', 'stack: move chained under on_start');
  eq(tops[1].type, 'on_key_press', 'stack: next top is the key hat');
  eq(tops.some((t) => t.type === 'procedures_defnoreturn'), true, 'stack: define is its own top block');
  const call = tops.find((t) => t.type === 'when_clicked').next.block;
  eq(call.type, 'procedures_callnoreturn', 'stack: call follows when_clicked hat');
  eq(call.extraState.name, 'add score', 'stack: call name in extraState');
  eq(call.inputs.ARG0.block.type, 'expr_mul', 'stack: call arg0 is expr block');
}

// --- normalizeDbBlocks: legacy rows ---
{
  const rows = [
    { id: 'r1', block_type: 'on_key_press', order_index: 0, block_data: JSON.stringify({ key: 'RIGHT', action: 'move_right' }) },
    { id: 'r2', block_type: 'move', order_index: 1, block_data: { inputs: { direction: 'up', distance: 300 } } },
    { id: 'r3', block_type: 'if_then', order_index: 2, block_data: { inputs: { condition: { op: 'timer' } }, children: [{ id: 'k1', block_type: 'jump' }] } },
  ];
  const blocks = normalizeDbBlocks(rows);
  eq(blocks.length, 4, 'db: legacy hat synthesized a body block');
  eq(blocks[0].block_type, 'on_key_press', 'db: hat first');
  eq(blocks[0].inputs.key, 'RIGHT', 'db: legacy key folded into inputs');
  eq(blocks[1].block_type, 'move', 'db: synthesized move');
  eq(blocks[1].inputs.distance, 500, 'db: synthesized move keeps legacy speed (500)');
  eq(blocks[2].inputs.direction, 'up', 'db: new-style inputs read from block_data.inputs');
  eq(blocks[3].children[0].block_type, 'jump', 'db: nested children read from block_data');

  // legacy row survives a full editor round trip with its behavior explicit
  const back = blocklyToLogic(logicToBlockly(blocks));
  eq(back[1].block_type, 'move', 'db round trip: synthesized move persists as a real block');
}

// --- Phase 5: motion writers, looks, AI ---
const phase5 = [
  { id: 'h1', block_type: 'on_start' },
  { id: 'g1', block_type: 'goto_xyz', inputs: { x: 1, y: 2, z: 3 } },
  { id: 'g2', block_type: 'goto_object', inputs: { target: 'Flag' } },
  { id: 'c1', block_type: 'change_xyz', inputs: { dx: 1, dy: 0, dz: -1 } },
  { id: 'sx', block_type: 'set_x', inputs: { value: 5 } },
  { id: 'sy', block_type: 'set_y', inputs: { value: 0 } },
  { id: 'sz', block_type: 'set_z', inputs: { value: -2 } },
  { id: 'gl', block_type: 'glide_to_xyz', inputs: { seconds: 1, x: 10, y: 0, z: 0 } },
  { id: 'pt', block_type: 'point_towards', inputs: { target: 'Enemy' } },
  { id: 'sr', block_type: 'set_rotation', inputs: { x: 0, y: 90, z: 0 } },
  { id: 'sh', block_type: 'show' },
  { id: 'hd', block_type: 'hide' },
  { id: 'ss', block_type: 'set_size', inputs: { pct: 50 } },
  { id: 'cs', block_type: 'change_size_by', inputs: { delta: 25 } },
  { id: 'sa', block_type: 'say', inputs: { text: 'Hello', seconds: 2 } },
  { id: 'th', block_type: 'think', inputs: { text: 'Hmm', seconds: 1 } },
  { id: 'cb', block_type: 'clear_bubble' },
  { id: 'sc', block_type: 'set_color', inputs: { hex: '#ffcc00' } },
  { id: 'aa', block_type: 'ask_ai', inputs: { prompt: 'Where to?', into_var: 'answer' } },
  { id: 'ad', block_type: 'ai_decide', inputs: { prompt: 'attack?', choices: 'yes,no', into_var: 'choice' } },
  // Reporters exercised as expression args in a set_variable
  { id: 'e1', block_type: 'set_variable', inputs: { name: 'px', value: { op: 'position_x' }, scope: 'global' } },
  { id: 'e2', block_type: 'set_variable', inputs: { name: 'ox', value: { op: 'object_x', value: 'Enemy' }, scope: 'global' } },
  { id: 'e3', block_type: 'set_variable', inputs: { name: 'sz2', value: { op: 'size' }, scope: 'global' } },
];
roundTrip(phase5, 'round trip: Phase 5 corpus');

// --- empty workspace ---
deepEq(blocklyToLogic({}), [], 'empty workspace serializes to no blocks');
deepEq(blocklyToLogic(logicToBlockly([])), [], 'empty logic round trip');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
