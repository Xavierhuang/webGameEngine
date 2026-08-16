/**
 * Ending a game, and putting words on the screen.
 *
 * Until now a child could only fake an ending with a speech bubble and `stop
 * all` — both example games did exactly that. These are the rules that make a
 * real ending behave: it stops everything, the first result wins, and Restart
 * genuinely restarts.
 */

const assert = require('assert');
const { RuntimeWorld, ObjectRuntime, VariableStore } = require('../.build/lib/runtime/interpreter');

let passed = 0;
function test(name, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`);
    process.exit(1);
  }
  passed++;
  console.log(`ok   ${name}`);
}

/** A world with one object whose script is `blocks`. */
function play(blocks, frames = 20) {
  const world = new RuntimeWorld();
  const calls = [];
  world.register('o', { name: 'Hero', getPosition: () => ({ x: 0, y: 0, z: 0 }), getRadius: () => 1 });
  const ctx = { getKeys: () => ({}), jump: () => calls.push('jump') };
  const rt = new ObjectRuntime('o', blocks, new VariableStore(), ctx, world);
  for (let i = 0; i < frames; i++) rt.step(1 / 60, i / 60);
  return { world, calls, rt };
}

test('a new game is playing', () => {
  const { world } = play([{ block_type: 'on_start' }]);
  assert.strictEqual(world.gameOutcome().state, 'playing');
});

test('you win ends the game as a win', () => {
  const { world } = play([{ block_type: 'on_start' }, { block_type: 'you_win' }]);
  assert.strictEqual(world.gameOutcome().state, 'won');
});

test('game over ends the game as a loss', () => {
  const { world } = play([{ block_type: 'on_start' }, { block_type: 'game_over' }]);
  assert.strictEqual(world.gameOutcome().state, 'lost');
});

test('the message reaches the overlay', () => {
  const { world } = play([
    { block_type: 'on_start' },
    { block_type: 'you_win', block_data: { message: 'All coins collected!' } },
  ]);
  assert.strictEqual(world.gameOutcome().message, 'All coins collected!');
});

test('ending the game stops the rest of the script', () => {
  // Anything after `game over` must not run — a child expects the game to be
  // over, not to keep playing for one more block.
  const { calls } = play([
    { block_type: 'on_start' },
    { block_type: 'game_over' },
    { block_type: 'jump' },
  ]);
  assert.deepStrictEqual(calls, [], 'a block after the ending still ran');
});

test('the first ending wins', () => {
  // Two objects can both decide the game is over on the same frame. Whichever
  // got there first should stand, rather than a loss overwriting a win.
  const { world } = play([
    { block_type: 'on_start' },
    { block_type: 'you_win', block_data: { message: 'First' } },
  ]);
  world.endGame('lost', 'Second');
  assert.strictEqual(world.gameOutcome().state, 'won');
  assert.strictEqual(world.gameOutcome().message, 'First');
});

test('restarting clears the ending', () => {
  const { world } = play([{ block_type: 'on_start' }, { block_type: 'game_over' }]);
  world.resetOutcome();
  assert.strictEqual(world.gameOutcome().state, 'playing');
  assert.strictEqual(world.currentMessage(0), null, 'a stale banner survived the restart');
});

test('a message shows and then expires', () => {
  const world = new RuntimeWorld();
  world.showMessage('Ready?', 2, 10);
  assert.strictEqual(world.currentMessage(10.5), 'Ready?');
  assert.strictEqual(world.currentMessage(11.9), 'Ready?');
  assert.strictEqual(world.currentMessage(12.1), null, 'the message outstayed its welcome');
});

test('a message with no duration stays until cleared', () => {
  const world = new RuntimeWorld();
  world.showMessage('Level 1', 0, 0);
  assert.strictEqual(world.currentMessage(9999), 'Level 1');
  world.clearMessage();
  assert.strictEqual(world.currentMessage(1), null);
});

test('show message reaches the world from a block', () => {
  const { world } = play([
    { block_type: 'on_start' },
    { block_type: 'show_message', block_data: { text: 'Go!', seconds: 5 } },
  ]);
  assert.strictEqual(world.currentMessage(0.1), 'Go!');
});

console.log(`\ngame outcome: ${passed} checks passed`);
