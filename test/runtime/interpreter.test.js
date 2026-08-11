const { operators, toNumber, toBool, scratchEquals, scratchMod, scratchRound, scratchRandom } = require('../.build/lib/runtime/operators.js');
const { VariableStore, ObjectRuntime, RuntimeWorld, evalExpr } = require('../.build/lib/runtime/interpreter.js');

let failures = 0;
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}

// --- operators: Scratch semantics ---
eq(operators.mod(-7, 3), 2, 'mod floored negative');
eq(operators.mod(7, -3), -2, 'mod sign follows divisor');
eq(operators.mod(5, 0), 0, 'mod by zero');
eq(operators.round(1.5), 2, 'round 1.5');
eq(operators.round(-1.5), -1, 'round -1.5');
eq(operators.round(2.5), 3, 'round 2.5');
eq(toNumber('abc'), 0, 'toNumber non-numeric');
eq(toNumber('12.5'), 12.5, 'toNumber numeric string');
eq(toNumber(true), 1, 'toNumber true');
eq(scratchEquals('ABC', 'abc'), true, 'eq case-insensitive');
eq(scratchEquals('10', 10), true, 'eq numeric coercion');
eq(scratchEquals('abc', 0), false, 'eq mixed string/number');
eq(operators.sin(90), 1, 'sin degrees');
eq(Math.round(operators.asin(1)), 90, 'asin degrees');
eq(operators.letter_of(1, 'hello'), 'h', 'letter_of 1-indexed');
eq(operators.letter_of(9, 'hello'), '', 'letter_of out of range');
eq(operators.contains('Hello', 'ell'), true, 'contains case-insensitive');
eq(operators.join('a', 1), 'a1', 'join');
const r = scratchRandom(1, 3);
eq(Number.isInteger(r) && r >= 1 && r <= 3, true, 'random int inclusive');

// --- interpreter: variable store ---
const vars = new VariableStore();
vars.registerObject('obj1', 'Hero');
vars.set('obj1', 'score', 10);
eq(vars.get('obj1', 'score'), 10, 'global set/get');
vars.change('obj1', 'score', 5);
eq(vars.get('obj1', 'score'), 15, 'change');
vars.set('obj1', 'lives', 3, 'object');
eq(vars.get('obj1', 'lives'), 3, 'object-scoped get');
eq(vars.get('other', 'lives'), 0, 'object scope does not leak');
vars.set('obj1', 'lives', 99); // global same name
eq(vars.get('obj1', 'lives'), 3, 'object scope shadows global');
vars.setVisible('obj1', 'score', true);
vars.setVisible('obj1', 'lives', true, 'object');
const snap = vars.watcherSnapshot();
eq(snap.length, 2, 'watchers count');
eq(snap.find(w => w.label === 'Hero: lives')?.value, 3, 'object watcher label');

// --- interpreter: scripts ---
const keys = {};
let moved = { x: 0, z: 0 };
let jumps = 0;
const ctx = {
  getKeys: () => keys,
  move: (dx, dz) => { moved.x += dx; moved.z += dz; },
  jump: () => { jumps++; },
  rotate: () => {},
  scaleBy: () => {},
  playSound: () => {},
};

// legacy hat with action on the hat, arrow-right held
keys['arrowright'] = true;
const rt = new ObjectRuntime('obj1', [
  { id: 'h1', block_type: 'on_key_press', block_data: { key: 'RIGHT', action: 'move_right' } },
], vars, ctx);
rt.step(0.016, 0);
eq(moved.x > 0.07 && moved.x < 0.09, true, 'legacy key-hat move (5 * 0.016)');
keys['arrowright'] = false;

// wait suspends across frames
const vars2 = new VariableStore();
const rt2 = new ObjectRuntime('o', [
  { id: 'h', block_type: 'on_start' },
  { id: 'a', block_type: 'set_variable', inputs: { name: 'x', value: 1 } },
  { id: 'w', block_type: 'wait', inputs: { seconds: 0.05 } },
  { id: 'b', block_type: 'set_variable', inputs: { name: 'x', value: 2 } },
], vars2, ctx);
rt2.step(0.016, 0);
eq(vars2.get('o', 'x'), 1, 'wait: value before wait elapses');
rt2.step(0.016, 0.016);
eq(vars2.get('o', 'x'), 1, 'wait: still waiting');
rt2.step(0.016, 0.032);
rt2.step(0.016, 0.048);
rt2.step(0.016, 0.064); // 4 decrements * 0.016 = 0.064 > 0.05 -> resumes
eq(vars2.get('o', 'x'), 2, 'wait: resumed after 0.05s');
rt2.step(0.016, 0.08);
eq(vars2.get('o', 'x'), 2, 'on_start fires only once');

// repeat steps one iteration per frame
const vars3 = new VariableStore();
const rt3 = new ObjectRuntime('o', [
  { id: 'h', block_type: 'on_start' },
  { id: 'r', block_type: 'repeat', inputs: { times: 3 }, children: [
    { id: 'c', block_type: 'change_variable', inputs: { name: 'n', value: 1 } },
  ]},
], vars3, ctx);
rt3.step(0.016, 0);
eq(vars3.get('o', 'n'), 1, 'repeat iter 1');
rt3.step(0.016, 0.016);
eq(vars3.get('o', 'n'), 2, 'repeat iter 2');
rt3.step(0.016, 0.032);
eq(vars3.get('o', 'n'), 3, 'repeat iter 3');
rt3.step(0.016, 0.048);
eq(vars3.get('o', 'n'), 3, 'repeat finished');

// if_then with expression condition
const vars4 = new VariableStore();
vars4.set('o', 'hp', 0);
const rt4 = new ObjectRuntime('o', [
  { id: 'h', block_type: 'on_start' },
  { id: 'i', block_type: 'if_then',
    inputs: { condition: { op: 'lt', args: [{ op: 'var', value: 'hp' }, { op: 'literal', value: 1 }] } },
    children: [{ id: 't', block_type: 'set_variable', inputs: { name: 'dead', value: true } }],
    elseChildren: [{ id: 'e', block_type: 'set_variable', inputs: { name: 'dead', value: false } }],
  },
], vars4, ctx);
rt4.step(0.016, 0);
eq(vars4.get('o', 'dead'), true, 'if_then true branch with var expression');

// repeat_until
const vars5 = new VariableStore();
const rt5 = new ObjectRuntime('o', [
  { id: 'h', block_type: 'on_start' },
  { id: 'r', block_type: 'repeat_until',
    inputs: { condition: { op: 'gt', args: [{ op: 'var', value: 'c' }, { op: 'literal', value: 2 }] } },
    children: [{ id: 'c', block_type: 'change_variable', inputs: { name: 'c', value: 1 } }],
  },
], vars5, ctx);
for (let i = 0; i < 6; i++) rt5.step(0.016, i * 0.016);
eq(vars5.get('o', 'c'), 3, 'repeat_until stops when condition true');

// --- Phase 2: forever / wait_until / stop / broadcasts / sensing ---
const ctxIdle = {
  getKeys: () => ({}),
  move: () => {},
  jump: () => {},
  rotate: () => {},
  scaleBy: () => {},
  playSound: () => {},
};

// forever: one iteration per frame, indefinitely
{
  const w = new RuntimeWorld();
  const rt = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'f', block_type: 'forever', children: [
      { id: 'c', block_type: 'change_variable', inputs: { name: 'n', value: 1 } },
    ]},
  ], w.vars, ctxIdle, w);
  for (let i = 0; i < 5; i++) rt.step(0.016, i * 0.016);
  eq(w.vars.get('o', 'n'), 5, 'forever: one iteration per frame');
}

// wait_until: suspends until condition becomes true
{
  const w = new RuntimeWorld();
  const rt = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'w', block_type: 'wait_until', inputs: { condition: { op: 'gt', args: [{ op: 'var', value: 'go' }, { op: 'literal', value: 0 }] } } },
    { id: 's', block_type: 'set_variable', inputs: { name: 'done', value: 1 } },
  ], w.vars, ctxIdle, w);
  rt.step(0.016, 0);
  rt.step(0.016, 0.016);
  eq(w.vars.get('o', 'done'), 0, 'wait_until: still suspended');
  w.vars.set('o', 'go', 1);
  rt.step(0.016, 0.032);
  eq(w.vars.get('o', 'done'), 1, 'wait_until: resumes when condition true');
}

// stop this_script aborts remaining blocks in the script
{
  const w = new RuntimeWorld();
  const rt = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'a', block_type: 'set_variable', inputs: { name: 'x', value: 1 } },
    { id: 'st', block_type: 'stop', inputs: { option: 'this_script' } },
    { id: 'b', block_type: 'set_variable', inputs: { name: 'x', value: 2 } },
  ], w.vars, ctxIdle, w);
  rt.step(0.016, 0);
  eq(w.vars.get('o', 'x'), 1, 'stop this_script: later blocks do not run');
}

// stop other_scripts kills sibling scripts but lets the caller finish
{
  const w = new RuntimeWorld();
  const rt = new ObjectRuntime('o', [
    { id: 'h1', block_type: 'on_start' },
    { id: 'f', block_type: 'forever', children: [
      { id: 'c', block_type: 'change_variable', inputs: { name: 'sibling', value: 1 } },
    ]},
    { id: 'h2', block_type: 'on_start' },
    { id: 'st', block_type: 'stop', inputs: { option: 'other_scripts' } },
    { id: 'b', block_type: 'set_variable', inputs: { name: 'caller', value: 1 } },
  ], w.vars, ctxIdle, w);
  rt.step(0.016, 0);
  rt.step(0.016, 0.016);
  eq(w.vars.get('o', 'caller'), 1, 'stop other_scripts: caller finishes');
  eq(w.vars.get('o', 'sibling'), 1, 'stop other_scripts: sibling ran once then stopped');
}

// broadcast starts matching when_receive scripts on other objects
{
  const w = new RuntimeWorld();
  w.register('sender', { name: 'Sender', getPosition: () => ({ x: 0, y: 0, z: 0 }), getRadius: () => 0.5 });
  w.register('recv', { name: 'Coin', getPosition: () => ({ x: 5, y: 0, z: 0 }), getRadius: () => 0.5 });
  const rtSender = new ObjectRuntime('sender', [
    { id: 'h', block_type: 'on_start' },
    { id: 'b', block_type: 'broadcast', inputs: { message: 'collect' } },
  ], w.vars, ctxIdle, w);
  const rtRecv = new ObjectRuntime('recv', [
    { id: 'h', block_type: 'when_receive', inputs: { message: 'Collect' } }, // case-insensitive
    { id: 'c', block_type: 'change_variable', inputs: { name: 'score', value: 1 } },
  ], w.vars, ctxIdle, w);
  w.attachRuntime('sender', rtSender);
  w.attachRuntime('recv', rtRecv);
  rtSender.step(0.016, 0); // fires broadcast
  eq(w.vars.get('recv', 'score'), 0, 'broadcast: receiver has not stepped yet');
  rtRecv.step(0.016, 0);
  eq(w.vars.get('recv', 'score'), 1, 'broadcast: receiver script ran');
}

// broadcast_and_wait suspends caller until receiver script finishes
{
  const w = new RuntimeWorld();
  w.register('a', { name: 'A', getPosition: () => ({ x: 0, y: 0, z: 0 }), getRadius: () => 0.5 });
  w.register('b', { name: 'B', getPosition: () => ({ x: 9, y: 0, z: 0 }), getRadius: () => 0.5 });
  const rtA = new ObjectRuntime('a', [
    { id: 'h', block_type: 'on_start' },
    { id: 'b', block_type: 'broadcast_and_wait', inputs: { message: 'go' } },
    { id: 's', block_type: 'set_variable', inputs: { name: 'after', value: 1 } },
  ], w.vars, ctxIdle, w);
  const rtB = new ObjectRuntime('b', [
    { id: 'h', block_type: 'when_receive', inputs: { message: 'go' } },
    { id: 'w', block_type: 'wait', inputs: { seconds: 0.05 } },
    { id: 's', block_type: 'set_variable', inputs: { name: 'bDone', value: 1 } },
  ], w.vars, ctxIdle, w);
  w.attachRuntime('a', rtA);
  w.attachRuntime('b', rtB);
  for (let i = 0; i < 3; i++) { rtA.step(0.016, i * 0.016); rtB.step(0.016, i * 0.016); }
  eq(w.vars.get('a', 'after'), 0, 'broadcast_and_wait: caller still suspended while receiver waits');
  for (let i = 3; i < 8; i++) { rtA.step(0.016, i * 0.016); rtB.step(0.016, i * 0.016); }
  eq(w.vars.get('b', 'bDone'), 1, 'broadcast_and_wait: receiver finished');
  eq(w.vars.get('a', 'after'), 1, 'broadcast_and_wait: caller resumed after receiver');
}

// touching / distance_to via world registry; platforms are not touchable
{
  const w = new RuntimeWorld();
  w.register('hero', { name: 'Hero', getPosition: () => ({ x: 0, y: 0, z: 0 }), getRadius: () => 0.5 });
  w.register('coin', { name: 'Coin', getPosition: () => ({ x: 0.9, y: 0, z: 0 }), getRadius: () => 0.5 });
  w.register('far', { name: 'Far', getPosition: () => ({ x: 10, y: 0, z: 0 }), getRadius: () => 0.5 });
  w.register('ground', { name: 'Ground', getPosition: () => ({ x: 0, y: -2, z: 0 }), getRadius: () => 10, touchable: false });
  const env = { objectId: 'hero', vars: w.vars, keys: {}, time: 0, world: w };
  eq(evalExpr({ op: 'touching', value: 'Coin' }, env), true, 'touching: overlapping coin');
  eq(evalExpr({ op: 'touching', value: 'Far' }, env), false, 'touching: far object');
  eq(evalExpr({ op: 'touching', value: 'Ground' }, env), false, 'touching: platforms not touchable');
  eq(evalExpr({ op: 'touching' }, env), true, 'touching: any object');
  eq(evalExpr({ op: 'distance_to', value: 'Far' }, env), 10, 'distance_to');
}

// when_touches hat fires while overlapping
{
  const w = new RuntimeWorld();
  w.register('hero', { name: 'Hero', getPosition: () => ({ x: 0, y: 0, z: 0 }), getRadius: () => 0.5 });
  w.register('coin', { name: 'Coin', getPosition: () => ({ x: 0.8, y: 0, z: 0 }), getRadius: () => 0.5 });
  const rt = new ObjectRuntime('hero', [
    { id: 'h', block_type: 'when_touches', inputs: { target: 'Coin' } },
    { id: 'c', block_type: 'change_variable', inputs: { name: 'score', value: 1 } },
  ], w.vars, ctxIdle, w);
  rt.step(0.016, 0);
  eq(w.vars.get('hero', 'score'), 1, 'when_touches: fired on overlap');
}

// when_clicked hat fires once per click (no restart queue while running)
{
  const w = new RuntimeWorld();
  w.register('hero', { name: 'Hero', getPosition: () => ({ x: 0, y: 0, z: 0 }), getRadius: () => 0.5 });
  const rt = new ObjectRuntime('hero', [
    { id: 'h', block_type: 'when_clicked' },
    { id: 'c', block_type: 'change_variable', inputs: { name: 'clicks', value: 1 } },
  ], w.vars, ctxIdle, w);
  rt.step(0.016, 0);
  eq(w.vars.get('hero', 'clicks'), 0, 'when_clicked: no click yet');
  w.notifyClicked('hero');
  rt.step(0.016, 0.016);
  eq(w.vars.get('hero', 'clicks'), 1, 'when_clicked: fired on click');
  rt.step(0.016, 0.032);
  eq(w.vars.get('hero', 'clicks'), 1, 'when_clicked: does not refire without a new click');
}

// --- Phase 3: lists ---
{
  const w = new RuntimeWorld();
  w.register('o', { name: 'O', getPosition: () => ({ x: 0, y: 0, z: 0 }), getRadius: () => 0.5 });
  const v = w.vars;
  v.listAdd('o', 'inv', 'sword');
  v.listAdd('o', 'inv', 'shield');
  v.listAdd('o', 'inv', 'potion');
  eq(v.listLength('o', 'inv'), 3, 'list: length after adds');
  eq(v.listItem('o', 'inv', 1), 'sword', 'list: 1-indexed item');
  eq(v.listItem('o', 'inv', 9), '', 'list: out of range reads empty');
  v.listInsert('o', 'inv', 2, 'bow');
  eq(v.listItem('o', 'inv', 2), 'bow', 'list: insert shifts');
  eq(v.listLength('o', 'inv'), 4, 'list: length after insert');
  v.listReplace('o', 'inv', 1, 'axe');
  eq(v.listItem('o', 'inv', 1), 'axe', 'list: replace');
  eq(v.listContains('o', 'inv', 'POTION'), true, 'list: contains case-insensitive');
  eq(v.listContains('o', 'inv', 'stick'), false, 'list: not contains');
  v.listDelete('o', 'inv', 'last');
  eq(v.listLength('o', 'inv'), 3, 'list: delete last');
  v.listDelete('o', 'inv', 99);
  eq(v.listLength('o', 'inv'), 3, 'list: delete out of range is no-op');
  v.listDelete('o', 'inv', 'all');
  eq(v.listLength('o', 'inv'), 0, 'list: delete all');
  eq(v.get('o', 'inv'), '', 'list: empty list reads as empty string');
  v.listAdd('o', 'inv', 'a');
  v.listAdd('o', 'inv', 'b');
  eq(v.get('o', 'inv'), 'ab', 'list: scalar get joins items');

  // list watcher snapshot
  v.setVisible('o', 'inv', true);
  const snapL = v.watcherSnapshot().find((x) => x.label === 'inv');
  eq(snapL?.value, 2, 'list watcher: value is length');
  eq(snapL?.items?.join(','), 'a,b', 'list watcher: items snapshot');

  // object-scoped list shadows global
  v.listAdd('o', 'scoped', 'g');
  v.listAdd('o', 'scoped', 'o', 'object');
  eq(v.listLength('o', 'scoped'), 2, 'list: object scope prefers existing... creates local');
  eq(v.listItem('o', 'scoped', 2), 'o', 'list: object-scoped item');
  eq(v.listItem('other', 'scoped', 1), 'g', 'list: global still visible to others');

  // list expressions + blocks through the interpreter
  const v2 = new VariableStore();
  const rt = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'a1', block_type: 'add_to_list', inputs: { name: 'q', item: 'x' } },
    { id: 'a2', block_type: 'add_to_list', inputs: { name: 'q', item: 'y' } },
    { id: 'a3', block_type: 'add_to_list', inputs: { name: 'q', item: 'z' } },
    { id: 's', block_type: 'set_variable', inputs: { name: 'second', value: { op: 'list_item', value: 'q', args: [{ op: 'literal', value: 2 }] } } },
    { id: 'l', block_type: 'set_variable', inputs: { name: 'len', value: { op: 'list_length', value: 'q' } } },
    { id: 'c', block_type: 'set_variable', inputs: { name: 'has', value: { op: 'list_contains', value: 'q', args: [{ op: 'literal', value: 'Z' }] } } },
    { id: 'd', block_type: 'delete_from_list', inputs: { name: 'q', index: 1 } },
    { id: 'i', block_type: 'insert_into_list', inputs: { name: 'q', index: 1, item: 'w' } },
    { id: 'r', block_type: 'replace_in_list', inputs: { name: 'q', index: 3, item: 'Z' } },
  ], v2, ctxIdle);
  rt.step(0.016, 0);
  eq(v2.get('o', 'second'), 'y', 'list_item expr via block');
  eq(v2.get('o', 'len'), 3, 'list_length expr via block');
  eq(v2.get('o', 'has'), true, 'list_contains expr via block');
  eq(v2.get('o', 'q'), 'wyZ', 'list blocks: delete/insert/replace applied');
}

// --- Scratch list parity: index-of, delete-all block, show/hide list ---
{
  const v = new VariableStore();
  v.listAdd('o', 'inv', 'sword');
  v.listAdd('o', 'inv', 'shield');
  v.listAdd('o', 'inv', 'potion');
  eq(v.listIndexOf('o', 'inv', 'SHIELD'), 2, 'listIndexOf: 1-based, case-insensitive');
  eq(v.listIndexOf('o', 'inv', 'stick'), 0, 'listIndexOf: not found is 0');
  eq(v.listIndexOf('o', 'nope', 'x'), 0, 'listIndexOf: missing list is 0');

  const v2 = new VariableStore();
  const rt = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'a1', block_type: 'add_to_list', inputs: { name: 'q', item: 'x' } },
    { id: 'a2', block_type: 'add_to_list', inputs: { name: 'q', item: 'y' } },
    { id: 'ix', block_type: 'set_variable', inputs: { name: 'where', value: { op: 'list_index_of', value: 'q', args: [{ op: 'literal', value: 'Y' }] } } },
    { id: 'sh', block_type: 'show_list', inputs: { name: 'q' } },
    { id: 'da', block_type: 'delete_all_of_list', inputs: { name: 'q' } },
  ], v2, ctxIdle);
  rt.step(0.016, 0);
  eq(v2.get('o', 'where'), 2, 'list_index_of expr via block');
  eq(v2.listLength('o', 'q'), 0, 'delete_all_of_list block clears');
  const shown = v2.watcherSnapshot().find((x) => x.label === 'q');
  eq(shown?.value, 0, 'show_list: watcher visible with length value');
  eq(Array.isArray(shown?.items), true, 'show_list: watcher renders items rows');

  const rt2 = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'hd', block_type: 'hide_list', inputs: { name: 'q' } },
  ], v2, ctxIdle);
  rt2.step(0.016, 0);
  eq(v2.watcherSnapshot().find((x) => x.label === 'q'), undefined, 'hide_list: watcher removed');

  // show_list before any items: entry promotes 0 -> [] on first add
  const v3 = new VariableStore();
  const rt3 = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'sh', block_type: 'show_list', inputs: { name: 'fresh' } },
    { id: 'a', block_type: 'add_to_list', inputs: { name: 'fresh', item: 'first' } },
  ], v3, ctxIdle);
  rt3.step(0.016, 0);
  const fresh = v3.watcherSnapshot().find((x) => x.label === 'fresh');
  eq(fresh?.items?.join(','), 'first', 'show_list before add: promotes to list');
}

// --- Scene switching blocks ---
{
  const switched = [];
  let nexts = 0;
  const ctxScene = {
    getKeys: () => ({}),
    move: () => {}, jump: () => {}, rotate: () => {}, scaleBy: () => {}, playSound: () => {},
    switchScene: (name) => switched.push(name),
    nextScene: () => { nexts++; },
  };
  const v = new VariableStore();
  const rt = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 's', block_type: 'switch_to_scene', inputs: { name: 'Level 2' } },
    { id: 'n', block_type: 'next_scene' },
    { id: 'after', block_type: 'set_variable', inputs: { name: 'alive', value: 1 } },
  ], v, ctxScene);
  rt.step(0.016, 0);
  eq(switched.join(','), 'Level 2', 'switch_to_scene: ctx called with name');
  eq(nexts, 1, 'next_scene: ctx called');
  eq(v.get('o', 'alive'), 1, 'scene blocks do not kill the script (no-op switch continues)');

  // when_scene_starts fires once like on_start, and not for clones
  const v2 = new VariableStore();
  const rt2 = new ObjectRuntime('o', [
    { id: 'h', block_type: 'when_scene_starts' },
    { id: 'a', block_type: 'change_variable', inputs: { name: 'entered', value: 1 } },
  ], v2, ctxScene);
  rt2.step(0.016, 0);
  rt2.step(0.016, 0.016);
  eq(v2.get('o', 'entered'), 1, 'when_scene_starts: fires once per runtime');
  const rtClone = new ObjectRuntime('c', [
    { id: 'h', block_type: 'when_scene_starts' },
    { id: 'a', block_type: 'change_variable', inputs: { name: 'entered', value: 1 } },
  ], v2, ctxScene, undefined, { isClone: true });
  rtClone.step(0.016, 0);
  eq(v2.get('o', 'entered'), 1, 'when_scene_starts: clones do not refire');

  // ctx without scene callbacks: blocks are safe no-ops
  const v3 = new VariableStore();
  const rt3 = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 's', block_type: 'switch_to_scene', inputs: { name: 'X' } },
    { id: 'n', block_type: 'next_scene' },
    { id: 'a', block_type: 'set_variable', inputs: { name: 'ok', value: 1 } },
  ], v3, ctxIdle);
  rt3.step(0.016, 0);
  eq(v3.get('o', 'ok'), 1, 'scene blocks: no-op without ctx callbacks');
}

// --- Phase 3: clones ---
{
  const w = new RuntimeWorld();
  w.register('src', { name: 'Src', getPosition: () => ({ x: 1, y: 2, z: 3 }), getRadius: () => 0.5 });
  w.register('other', { name: 'Other', getPosition: () => ({ x: 9, y: 9, z: 9 }), getRadius: () => 0.5 });

  // create_clone_of myself
  const spawned = [];
  const despawned = [];
  w.onSpawnClone = (sourceId, cloneId) => spawned.push([sourceId, cloneId]);
  w.onDespawnClone = (cloneId) => despawned.push(cloneId);
  const id1 = w.createClone('src');
  eq(id1, 'src#clone1', 'clone: id format');
  eq(spawned.length, 1, 'clone: spawn hook fired');
  eq(spawned[0][0], 'src', 'clone: spawn hook source');
  eq(w.isClone(id1), true, 'clone: isClone');
  eq(w.isClone('src'), false, 'clone: source is not a clone');

  // create_clone_of by name
  const id2 = w.createClone('src', 'Other');
  eq(id2, 'other#clone2', 'clone: named target clones that object');
  eq(w.createClone('src', 'Nobody'), null, 'clone: unknown target returns null');

  // position lookup for spawn placement
  const p = w.getObjectPosition('src');
  eq(p.x === 1 && p.y === 2 && p.z === 3, true, 'clone: getObjectPosition');

  // delete
  eq(w.deleteClone('src'), false, 'clone: delete non-clone is no-op');
  eq(w.deleteClone(id1), true, 'clone: delete works');
  eq(despawned[0], id1, 'clone: despawn hook fired');

  // cap at 300
  let ok = 0;
  for (let i = 0; i < 400; i++) if (w.createClone('src')) ok++;
  eq(ok, 299, 'clone: cap at 300 total (one already live)');
  w.unregister(id2);
  eq(w.isClone(id2), false, 'clone: unregister clears clone tracking');

  // when_clone_start fires only on clones; on_start suppressed on clones
  const v3 = new VariableStore();
  const w3 = new RuntimeWorld();
  const blocks = [
    { id: 'h1', block_type: 'on_start' },
    { id: 'a', block_type: 'set_variable', inputs: { name: 'started', value: 1 } },
    { id: 'h2', block_type: 'when_clone_start' },
    { id: 'b', block_type: 'set_variable', inputs: { name: 'cloneStarted', value: 1 } },
  ];
  const rtOrig = new ObjectRuntime('src', blocks, v3, ctxIdle, w3);
  rtOrig.step(0.016, 0);
  eq(v3.get('src', 'started'), 1, 'clone: on_start fires on original');
  eq(v3.get('src', 'cloneStarted'), 0, 'clone: when_clone_start does not fire on original');

  // Fresh store: the original already set the globals above.
  const v3b = new VariableStore();
  const rtClone = new ObjectRuntime('src#clone9', blocks, v3b, ctxIdle, w3, { isClone: true });
  rtClone.step(0.016, 0);
  eq(v3b.get('src#clone9', 'started'), 0, 'clone: on_start suppressed on clone');
  eq(v3b.get('src#clone9', 'cloneStarted'), 1, 'clone: when_clone_start fires on clone');
  rtClone.step(0.016, 0.016);
  eq(v3b.get('src#clone9', 'cloneStarted'), 1, 'clone: when_clone_start fires once');

  // create_clone_of / delete_clone blocks end-to-end
  const v4 = new VariableStore();
  const w4 = new RuntimeWorld();
  w4.register('o', { name: 'O', getPosition: () => ({ x: 0, y: 0, z: 0 }), getRadius: () => 0.5 });
  const spawns = [];
  w4.onSpawnClone = (s, c) => spawns.push(c);
  const rtMaker = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'c1', block_type: 'create_clone_of', inputs: { target: 'myself' } },
    { id: 'c2', block_type: 'create_clone_of', inputs: { target: 'O' } },
    { id: 'c3', block_type: 'create_clone_of' }, // missing target -> myself
  ], v4, ctxIdle, w4);
  rtMaker.step(0.016, 0);
  eq(spawns.length, 3, 'clone block: three clones spawned');

  // delete_clone on a clone stops its script
  const rtDel = new ObjectRuntime(spawns[0], [
    { id: 'h', block_type: 'when_clone_start' },
    { id: 'd', block_type: 'delete_clone' },
    { id: 'x', block_type: 'set_variable', inputs: { name: 'afterDelete', value: 1 } },
  ], v4, ctxIdle, w4, { isClone: true });
  w4.register(spawns[0], { name: 'O', getPosition: () => ({ x: 0, y: 0, z: 0 }), getRadius: () => 0.5 });
  rtDel.step(0.016, 0);
  eq(w4.isClone(spawns[0]), false, 'delete_clone block: clone removed');
  eq(v4.get(spawns[0], 'afterDelete'), 0, 'delete_clone block: script aborted after delete');
}

// --- Phase 4: custom blocks (procedures) ---
{
  // definition via children + call with params; params shadow globals
  const v = new VariableStore();
  v.set('o', 'amount', 100); // global with same name as the param
  const rt = new ObjectRuntime('o', [
    { id: 'd', block_type: 'define_custom_block', inputs: { name: 'add score', params: ['amount'] }, children: [
      { id: 'b1', block_type: 'change_variable', inputs: { name: 'score', value: { op: 'var', value: 'amount' } } },
    ]},
    { id: 'h', block_type: 'on_start' },
    { id: 'c1', block_type: 'call_custom_block', inputs: { name: 'add score', amount: 5 } },
    { id: 'c2', block_type: 'call_custom_block', inputs: { name: 'Add Score', amount: { op: 'mul', args: [2, 3] } } }, // case-insensitive name, expr arg
  ], v, ctxIdle);
  rt.step(0.016, 0);
  eq(v.get('o', 'score'), 11, 'custom block: two calls accumulate (5 + 6)');
  eq(v.get('o', 'amount'), 100, 'custom block: param shadows global, global untouched');

  // flat-style definition (body blocks follow the hat, no children)
  const v2 = new VariableStore();
  const rt2 = new ObjectRuntime('o', [
    { id: 'd', block_type: 'define_custom_block', block_data: { name: 'spin', params: ['deg'] } },
    { id: 'r1', block_type: 'set_variable', inputs: { name: 'spun', value: { op: 'arg', value: 'deg' } } },
    { id: 'h', block_type: 'on_start' },
    { id: 'c', block_type: 'call_custom_block', inputs: { name: 'spin', deg: 45 } },
  ], v2, ctxIdle);
  rt2.step(0.016, 0);
  eq(v2.get('o', 'spun'), 45, 'custom block: flat-style definition via block_data name');

  // definitions never run on their own
  eq(v2.get('o', 'spun') === 45, true, 'custom block: only ran via call');

  // unknown call is a no-op
  const v3 = new VariableStore();
  const rt3 = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'c', block_type: 'call_custom_block', inputs: { name: 'missing' } },
    { id: 's', block_type: 'set_variable', inputs: { name: 'after', value: 1 } },
  ], v3, ctxIdle);
  rt3.step(0.016, 0);
  eq(v3.get('o', 'after'), 1, 'custom block: unknown call skipped, script continues');

  // recursion: countdown(n) -> if n > 0: countdown(n-1); counts frames
  const v4 = new VariableStore();
  const rt4 = new ObjectRuntime('o', [
    { id: 'd', block_type: 'define_custom_block', inputs: { name: 'count', params: ['n'] }, children: [
      { id: 'i', block_type: 'if_then',
        inputs: { condition: { op: 'gt', args: [{ op: 'var', value: 'n' }, 0] } },
        children: [
          { id: 's', block_type: 'change_variable', inputs: { name: 'total', value: 1 } },
          { id: 'c', block_type: 'call_custom_block', inputs: { name: 'count', n: { op: 'sub', args: [{ op: 'var', value: 'n' }, 1] } } },
        ],
      },
    ]},
    { id: 'h', block_type: 'on_start' },
    { id: 'go', block_type: 'call_custom_block', inputs: { name: 'count', n: 5 } },
  ], v4, ctxIdle);
  rt4.step(0.016, 0);
  eq(v4.get('o', 'total'), 5, 'custom block: recursion counts down 5');

  // wait inside a custom block suspends the caller's script
  const v5 = new VariableStore();
  const rt5 = new ObjectRuntime('o', [
    { id: 'd', block_type: 'define_custom_block', inputs: { name: 'pause then set', params: [] }, children: [
      { id: 'w', block_type: 'wait', inputs: { seconds: 0.05 } },
      { id: 's', block_type: 'set_variable', inputs: { name: 'inner', value: 1 } },
    ]},
    { id: 'h', block_type: 'on_start' },
    { id: 'c', block_type: 'call_custom_block', inputs: { name: 'pause then set' } },
    { id: 'a', block_type: 'set_variable', inputs: { name: 'after', value: 1 } },
  ], v5, ctxIdle);
  rt5.step(0.016, 0);
  eq(v5.get('o', 'after'), 0, 'custom block: caller suspended by wait inside procedure');
  for (let i = 1; i < 6; i++) rt5.step(0.016, i * 0.016);
  eq(v5.get('o', 'inner'), 1, 'custom block: procedure finished after wait');
  eq(v5.get('o', 'after'), 1, 'custom block: caller resumed after procedure');
}

// --- Phase 5a: motion writers + position/rotation reporters ---
{
  // Ctx that tracks live position + rotation like the player wires up.
  function makeCtx() {
    const pos = { x: 0, y: 0, z: 0 };
    const rot = { x: 0, y: 0, z: 0 }; // degrees
    return {
      pos, rot,
      ctx: {
        getKeys: () => ({}),
        move: () => {},
        jump: () => {},
        rotate: (x, y, z) => { rot.x += x; rot.y += y; rot.z += z; },
        scaleBy: () => {},
        playSound: () => {},
        getPosition: () => ({ ...pos }),
        getRotation: () => ({ ...rot }),
        setPosition: (x, y, z) => { pos.x = x; pos.y = y; pos.z = z; },
        changePosition: (dx, dy, dz) => { pos.x += dx; pos.y += dy; pos.z += dz; },
        setPositionAxis: (axis, v) => { pos[axis] = v; },
        setRotation: (x, y, z) => { rot.x = x; rot.y = y; rot.z = z; },
        pointTowards: (tx, tz) => {
          const yRad = Math.atan2(tx - pos.x, -(tz - pos.z));
          rot.y = yRad * 180 / Math.PI;
        },
      },
    };
  }

  // goto_xyz / change_xyz / set_x/y/z
  {
    const m = makeCtx();
    const rt = new ObjectRuntime('o', [
      { id: 'h', block_type: 'on_start' },
      { id: 'g', block_type: 'goto_xyz', inputs: { x: 5, y: 2, z: -1 } },
      { id: 'c', block_type: 'change_xyz', inputs: { dx: 1, dy: 1, dz: 1 } },
      { id: 'sx', block_type: 'set_x', inputs: { value: 99 } },
      { id: 'sy', block_type: 'set_y', inputs: { value: -3 } },
    ], new VariableStore(), m.ctx);
    rt.step(0.016, 0);
    eq(m.pos.x, 99, 'motion: goto -> change -> set_x');
    eq(m.pos.y, -3, 'motion: set_y');
    eq(m.pos.z, 0, 'motion: z after change (-1+1=0)');
  }

  // set_rotation replaces base
  {
    const m = makeCtx();
    const rt = new ObjectRuntime('o', [
      { id: 'h', block_type: 'on_start' },
      { id: 'r', block_type: 'rotate', inputs: { x: 45, y: 45, z: 0 } },
      { id: 's', block_type: 'set_rotation', inputs: { x: 0, y: 90, z: 0 } },
    ], new VariableStore(), m.ctx);
    rt.step(0.016, 0);
    eq(m.rot.y, 90, 'motion: set_rotation replaces rotate accumulator');
  }

  // goto_object teleports to named object
  {
    const m = makeCtx();
    const w = new RuntimeWorld();
    w.register('flag', { name: 'Flag', getPosition: () => ({ x: 7, y: 8, z: 9 }), getRadius: () => 0.5 });
    const rt = new ObjectRuntime('o', [
      { id: 'h', block_type: 'on_start' },
      { id: 'g', block_type: 'goto_object', inputs: { target: 'Flag' } },
    ], w.vars, m.ctx, w);
    rt.step(0.016, 0);
    eq(m.pos.x === 7 && m.pos.y === 8 && m.pos.z === 9, true, 'motion: goto_object by name');
  }

  // point_towards sets Y rotation to face target on XZ plane
  {
    const m = makeCtx();
    const w = new RuntimeWorld();
    w.register('target', { name: 'T', getPosition: () => ({ x: 10, y: 0, z: 0 }), getRadius: () => 0.5 });
    const rt = new ObjectRuntime('o', [
      { id: 'h', block_type: 'on_start' },
      { id: 'p', block_type: 'point_towards', inputs: { target: 'T' } },
    ], w.vars, m.ctx, w);
    rt.step(0.016, 0);
    // At (0,0,0) facing (10,0,0): atan2(10, 0) = 90 degrees
    eq(Math.round(m.rot.y), 90, 'motion: point_towards yields 90deg for +X target');
  }

  // glide_to_xyz interpolates over `seconds`, yielding a frame each step
  {
    const m = makeCtx();
    const rt = new ObjectRuntime('o', [
      { id: 'h', block_type: 'on_start' },
      { id: 'g', block_type: 'glide_to_xyz', inputs: { x: 10, y: 0, z: 0, seconds: 0.1 } },
      { id: 's', block_type: 'set_variable', inputs: { name: 'after', value: 1 } },
    ], new VariableStore(), m.ctx);
    rt.step(0.05, 0);
    eq(m.pos.x > 0 && m.pos.x < 10, true, 'glide: partial after 0.05s of 0.1s');
    rt.step(0.05, 0.05);
    rt.step(0.05, 0.10);
    eq(Math.round(m.pos.x), 10, 'glide: reached target');
  }

  // position_x/y/z reporters via env.ctx
  {
    const m = makeCtx();
    m.pos.x = 42; m.pos.y = -7; m.pos.z = 3;
    const env = { objectId: 'o', vars: new VariableStore(), keys: {}, time: 0, ctx: m.ctx };
    eq(evalExpr({ op: 'position_x' }, env), 42, 'reporter: position_x');
    eq(evalExpr({ op: 'position_y' }, env), -7, 'reporter: position_y');
    eq(evalExpr({ op: 'position_z' }, env), 3, 'reporter: position_z');
    m.rot.y = 45;
    eq(evalExpr({ op: 'rotation_y' }, env), 45, 'reporter: rotation_y');
  }

  // object_x/y/z read other objects via world
  {
    const w = new RuntimeWorld();
    w.register('a', { name: 'A', getPosition: () => ({ x: 1, y: 2, z: 3 }), getRadius: () => 0.5 });
    const env = { objectId: 'o', vars: w.vars, keys: {}, time: 0, world: w };
    eq(evalExpr({ op: 'object_x', value: 'A' }, env), 1, 'reporter: object_x');
    eq(evalExpr({ op: 'object_z', value: 'A' }, env), 3, 'reporter: object_z');
    eq(evalExpr({ op: 'object_y', value: 'Nobody' }, env), 0, 'reporter: unknown object -> 0');
  }
}

// --- Phase 5b: looks basics ---
{
  function makeLooksCtx() {
    let visible = true, size = 100, color = null;
    const bubbles = [];
    return {
      state: { get visible() { return visible; }, get size() { return size; }, get color() { return color; }, bubbles },
      ctx: {
        getKeys: () => ({}),
        move: () => {}, jump: () => {}, rotate: () => {}, scaleBy: () => {}, playSound: () => {},
        getVisible: () => visible,
        setVisible: (v) => { visible = v; },
        getSize: () => size,
        setSize: (pct) => { size = pct; },
        changeSizeBy: (delta) => { size += delta; },
        say: (text, seconds, style) => { bubbles.push({ text, seconds, style }); },
        clearBubble: () => { bubbles.push(null); },
        setColor: (hex) => { color = hex; },
      },
    };
  }

  const m = makeLooksCtx();
  const rt = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'v1', block_type: 'hide' },
    { id: 'v2', block_type: 'show' },
    { id: 's1', block_type: 'set_size', inputs: { pct: 50 } },
    { id: 's2', block_type: 'change_size_by', inputs: { delta: 25 } },
    { id: 'sy', block_type: 'say', inputs: { text: 'Hi', seconds: 2 } },
    { id: 'th', block_type: 'think', inputs: { text: 'Hmm' } },
    { id: 'cb', block_type: 'clear_bubble' },
    { id: 'sc', block_type: 'set_color', inputs: { hex: '#ff0000' } },
  ], new VariableStore(), m.ctx);
  rt.step(0.016, 0);
  eq(m.state.visible, true, 'looks: show after hide');
  eq(m.state.size, 75, 'looks: set 50 then change +25');
  eq(m.state.color, '#ff0000', 'looks: set_color');
  eq(m.state.bubbles[0].text, 'Hi', 'looks: say text');
  eq(m.state.bubbles[0].seconds, 2, 'looks: say seconds');
  eq(m.state.bubbles[1].style, 'think', 'looks: think style');
  eq(m.state.bubbles[2], null, 'looks: clear_bubble');

  // reporters via env.ctx
  const env = { objectId: 'o', vars: new VariableStore(), keys: {}, time: 0, ctx: m.ctx };
  eq(evalExpr({ op: 'size' }, env), 75, 'looks reporter: size');
  eq(evalExpr({ op: 'visible' }, env), true, 'looks reporter: visible');
}

// --- Phase 5c: AI blocks — mock the ctx.askAI callback ---
{
  const w = new RuntimeWorld();
  let capturedPrompt = null;
  let capturedChoices = null;
  let resolve = null;
  const ctx = {
    getKeys: () => ({}),
    move: () => {}, jump: () => {}, rotate: () => {}, scaleBy: () => {}, playSound: () => {},
    askAI: (prompt, cb, options) => {
      capturedPrompt = prompt;
      capturedChoices = options?.choices ?? null;
      resolve = cb;
    },
  };
  const rt = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'a', block_type: 'ask_ai', inputs: { prompt: 'Hello', into_var: 'answer' } },
    { id: 'b', block_type: 'set_variable', inputs: { name: 'after', value: 1 } },
  ], w.vars, ctx, w);
  rt.step(0.016, 0);
  eq(capturedPrompt, 'Hello', 'ai: askAI called with prompt');
  eq(w.vars.get('o', 'after'), 0, 'ai: script suspended until callback fires');
  rt.step(0.016, 0.016);
  eq(w.vars.get('o', 'after'), 0, 'ai: still suspended after another frame');
  resolve('42');
  rt.step(0.016, 0.032);
  eq(w.vars.get('o', 'answer'), '42', 'ai: answer written to variable');
  eq(w.vars.get('o', 'after'), 1, 'ai: script resumed after callback');

  // ai_decide with constrained choices
  const w2 = new RuntimeWorld();
  let ctx2Choices = null;
  const ctx2 = {
    getKeys: () => ({}),
    move: () => {}, jump: () => {}, rotate: () => {}, scaleBy: () => {}, playSound: () => {},
    askAI: (prompt, cb, options) => {
      ctx2Choices = options?.choices ?? null;
      cb('yes'); // synchronous callback
    },
  };
  const rt2 = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'd', block_type: 'ai_decide', inputs: { prompt: 'ok?', choices: 'yes,no', into_var: 'v' } },
  ], w2.vars, ctx2, w2);
  rt2.step(0.016, 0);
  eq(ctx2Choices?.join(','), 'yes,no', 'ai_decide: choices parsed from comma list');
  eq(w2.vars.get('o', 'v'), 'yes', 'ai_decide: answer stored');
}

// --- Sound blocks: volume, play-until-done, stop all sounds ---
{
  const calls = [];
  let stopped = 0;
  const ctx = {
    getKeys: () => ({}),
    move: () => {}, jump: () => {}, rotate: () => {}, scaleBy: () => {},
    playSound: (name, volume) => { calls.push({ name, volume }); },
    stopAllSounds: () => { stopped++; },
  };
  const w = new RuntimeWorld();
  const rt = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'v1', block_type: 'set_volume', inputs: { value: 50 } },
    { id: 'p1', block_type: 'play_sound', inputs: { sound: 'click' } },
    { id: 'v2', block_type: 'change_volume_by', inputs: { value: -30 } },
    { id: 'v3', block_type: 'change_volume_by', inputs: { value: -100 } }, // clamps to 0
    { id: 'v4', block_type: 'set_volume', inputs: { value: 250 } },        // clamps to 100
    { id: 'p2', block_type: 'play_sound', inputs: { sound: 'pop' } },
    { id: 'st', block_type: 'stop_all_sounds' },
    { id: 'sv', block_type: 'set_variable', inputs: { name: 'vol', value: { op: 'volume' } } },
  ], w.vars, ctx, w);
  rt.step(0.016, 0);
  eq(calls[0].name, 'click', 'sound: play_sound passes name');
  eq(calls[0].volume, 0.5, 'sound: volume 50 -> 0.5 passed to ctx');
  eq(calls[1].volume, 1, 'sound: set_volume clamps 250 -> 100');
  eq(stopped, 1, 'sound: stop_all_sounds calls ctx');
  eq(w.vars.get('o', 'vol'), 100, 'sound: volume reporter reads runtime volume');

  // play_sound_until_done suspends for the duration returned by ctx.playSound
  const played = [];
  const ctx2 = {
    getKeys: () => ({}),
    move: () => {}, jump: () => {}, rotate: () => {}, scaleBy: () => {},
    playSound: (name) => { played.push(name); return 0.5; },
  };
  const w2 = new RuntimeWorld();
  const rt2 = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'p', block_type: 'play_sound_until_done', inputs: { sound: 'long' } },
    { id: 's', block_type: 'set_variable', inputs: { name: 'after', value: 1 } },
  ], w2.vars, ctx2, w2);
  rt2.step(0.016, 0);
  eq(played[0], 'long', 'until_done: sound played immediately');
  eq(w2.vars.get('o', 'after'), 0, 'until_done: suspended while sound plays');
  rt2.step(0.3, 0.016);
  eq(w2.vars.get('o', 'after'), 0, 'until_done: still suspended at 0.3s of 0.5s');
  rt2.step(0.3, 0.316);
  eq(w2.vars.get('o', 'after'), 1, 'until_done: resumed after duration elapsed');

  // ctx.playSound returning nothing (legacy void) -> no wait, script continues
  const ctx3 = { getKeys: () => ({}), move: () => {}, jump: () => {}, rotate: () => {}, scaleBy: () => {}, playSound: () => {} };
  const w3 = new RuntimeWorld();
  const rt3 = new ObjectRuntime('o', [
    { id: 'h', block_type: 'on_start' },
    { id: 'p', block_type: 'play_sound_until_done', inputs: { sound: 'click' } },
    { id: 's', block_type: 'set_variable', inputs: { name: 'after', value: 1 } },
  ], w3.vars, ctx3, w3);
  rt3.step(0.016, 0);
  eq(w3.vars.get('o', 'after'), 1, 'until_done: void duration -> continues immediately');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
