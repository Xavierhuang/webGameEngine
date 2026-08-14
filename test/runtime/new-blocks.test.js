/**
 * Runtime coverage for the blocks added in the Scratch-parity pass:
 * graphic effects, layers, timer reset, ask/answer, mouse reporters, and the
 * math + comparison operators that existed in the runtime but had no block.
 */
const { RuntimeWorld, ObjectRuntime, evalExpr, clampEffect } = require('../.build/lib/runtime/interpreter.js');
const { operators } = require('../.build/lib/runtime/operators.js');

let failures = 0;
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}
function close(actual, expected, label, tol = 1e-6) {
  const ok = Math.abs(actual - expected) < tol;
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ~${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}

// --- operators that had no block until now ---------------------------------
close(operators.sin(90), 1, 'sin uses degrees like Scratch');
close(operators.cos(0), 1, 'cos(0) = 1');
close(operators.ln(Math.E), 1, 'ln(e) = 1');
close(operators.log(100), 2, 'log10(100) = 2');
close(operators.exp10(2), 100, '10^2 = 100');
close(operators.asin(1), 90, 'asin returns degrees');

// --- new comparison operators ----------------------------------------------
eq(operators.neq(1, 2), true, 'neq: 1 != 2');
eq(operators.neq(2, 2), false, 'neq: 2 == 2');
eq(operators.lte(2, 2), true, 'lte is inclusive');
eq(operators.gte(3, 2), true, 'gte: 3 >= 2');
eq(operators.lte(3, 2), false, 'lte: 3 <= 2 is false');
// neq inherits Scratch's case-insensitive string equality.
eq(operators.neq('ABC', 'abc'), false, 'neq matches Scratch case-insensitive equality');

// --- graphic effect clamping -----------------------------------------------
eq(clampEffect('ghost', 150), 100, 'ghost clamps at 100');
eq(clampEffect('ghost', -20), 0, 'ghost clamps at 0');
eq(clampEffect('brightness', -500), -100, 'brightness clamps at -100');
eq(clampEffect('brightness', 500), 100, 'brightness clamps at 100');
eq(clampEffect('color', 250), 50, 'color wraps modulo 200');
eq(clampEffect('color', -10), 190, 'negative color wraps forward');
eq(clampEffect('ghost', NaN), 0, 'non-finite effect value degrades to 0');

// --- world timer is resettable ---------------------------------------------
{
  const world = new RuntimeWorld();
  close(world.timerValue(5), 5, 'timer starts at the world clock');
  world.resetTimer(5);
  close(world.timerValue(5), 0, 'timer reads 0 immediately after reset');
  close(world.timerValue(8), 3, 'timer counts up from the reset point');
  eq(world.timerValue(1) >= 0, true, 'timer never goes negative');
}

// --- answer round-trips through the world ----------------------------------
{
  const world = new RuntimeWorld();
  eq(world.getAnswer(), '', 'answer starts empty');
  world.setAnswer('blue');
  eq(world.getAnswer(), 'blue', 'answer stores the response');
  eq(evalExpr({ op: 'answer' }, { objectId: 'o', vars: world.vars, keys: {}, time: 0, world }), 'blue',
    'answer reporter reads the stored response');
}

// --- mouse reporters read pointer state ------------------------------------
{
  const world = new RuntimeWorld();
  world.pointer = { x: 42, y: -17, down: true };
  const env = { objectId: 'o', vars: world.vars, keys: {}, time: 0, world, pointer: world.pointer };
  eq(evalExpr({ op: 'mouse_x' }, env), 42, 'mouse x reporter');
  eq(evalExpr({ op: 'mouse_y' }, env), -17, 'mouse y reporter');
  eq(evalExpr({ op: 'mouse_down' }, env), true, 'mouse down? reporter');
}
{
  // With no pointer supplied the reporters must not throw.
  const world = new RuntimeWorld();
  const env = { objectId: 'o', vars: world.vars, keys: {}, time: 0, world };
  eq(evalExpr({ op: 'mouse_x' }, env), 0, 'mouse x defaults to 0 with no pointer');
  eq(evalExpr({ op: 'mouse_down' }, env), false, 'mouse down defaults to false');
}

// --- clearAll wipes variables for Restart ----------------------------------
{
  const world = new RuntimeWorld();
  world.vars.set('obj', 'score', 10, 'global');
  eq(world.vars.get('obj', 'score'), 10, 'variable set before restart');
  world.vars.clearAll();
  eq(world.vars.get('obj', 'score'), 0, 'clearAll resets variables to Scratch default 0');
}

// --- effect statements drive the context -----------------------------------
{
  const world = new RuntimeWorld();
  const effects = {};
  let layer = 0;
  const ctx = {
    getKeys: () => ({}),
    getPosition: () => ({ x: 0, y: 0, z: 0 }),
    getRotation: () => ({ x: 0, y: 0, z: 0 }),
    setEffect: (name, value) => { effects[name] = value; },
    getEffect: (name) => effects[name] ?? 0,
    clearEffects: () => { for (const k of Object.keys(effects)) delete effects[k]; },
    goToLayer: (l) => { layer = l === 'front' ? 1000 : -1000; },
    changeLayerBy: (d) => { layer += d; },
  };

  // Hat and body are flat siblings, not nested under `children`.
  const blocks = [
    { id: '1', block_type: 'on_start' },
    { id: '2', block_type: 'set_effect', inputs: { effect: 'ghost', value: 150 } },
    { id: '3', block_type: 'change_effect_by', inputs: { effect: 'ghost', delta: -30 } },
    { id: '4', block_type: 'go_to_layer', inputs: { layer: 'front' } },
    { id: '5', block_type: 'change_layer_by', inputs: { direction: 'backward', amount: 5 } },
  ];

  const runtime = new ObjectRuntime('obj', blocks, world.vars, ctx, world);
  for (let i = 0; i < 10; i++) runtime.step(1 / 60, i / 60);

  eq(effects.ghost, 70, 'set_effect clamps to 100 then change_effect_by subtracts 30');
  eq(layer, 995, 'go_to_layer front then 5 layers backward');

  const clearBlocks = [
    { id: '1', block_type: 'on_start' },
    { id: '2', block_type: 'clear_effects' },
  ];
  const r2 = new ObjectRuntime('obj2', clearBlocks, world.vars, ctx, world);
  for (let i = 0; i < 5; i++) r2.step(1 / 60, i / 60);
  eq(Object.keys(effects).length, 0, 'clear_effects removes every effect');
}

// --- reset_timer statement --------------------------------------------------
{
  const world = new RuntimeWorld();
  const ctx = {
    getKeys: () => ({}),
    getPosition: () => ({ x: 0, y: 0, z: 0 }),
    getRotation: () => ({ x: 0, y: 0, z: 0 }),
  };
  const blocks = [
    { id: '1', block_type: 'on_start' },
    { id: '2', block_type: 'reset_timer' },
  ];
  const runtime = new ObjectRuntime('obj', blocks, world.vars, ctx, world);
  runtime.step(1 / 60, 12);
  close(world.timerValue(12), 0, 'reset_timer block zeroes the world timer');
}

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll new-block runtime tests passed');
