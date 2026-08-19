/**
 * A script must run whether or not its object has a mesh.
 *
 * Reported as "I don't see any particles" for a burst on a Platform. The cause
 * was not particles at all: the player's frame loop opened with
 *
 *     if (!meshRef.current) return;
 *
 * and platforms render through their own <group> without ever attaching that
 * ref. So the interpreter was never stepped for a platform, and *no* script on
 * one had ever run — `when game starts` did nothing there, for any block.
 *
 * This is a source-level check because the bug lives in a React frame loop that
 * the pure tests cannot reach. It is deliberately specific: if someone
 * restructures that guard, this fails loudly rather than silently returning the
 * app to a state where a whole object type is inert.
 */

const fs = require('fs');
const assert = require('assert');

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

const player = fs.readFileSync('components/player/GamePlayer.tsx', 'utf8');

test('the frame loop still guards on a mesh ref', () => {
  // If this disappears the test below is meaningless, so fail loudly instead.
  assert.ok(
    /if \(!meshRef\.current\) \{/.test(player),
    'the meshRef guard has been restructured — re-check that scripts still run without a mesh'
  );
});

test('a missing mesh ref does not skip the interpreter', () => {
  const start = player.indexOf('if (!meshRef.current) {');
  assert.ok(start > 0, 'guard not found');
  // The guard's body, up to its closing return.
  const body = player.slice(start, start + 600);
  const untilReturn = body.slice(0, body.indexOf('return;'));
  assert.ok(
    /runtime\?\.hasScripts/.test(untilReturn) && /runtime\.step\(/.test(untilReturn),
    'the frame loop returns without stepping the interpreter — every object ' +
      'without a mesh ref (platforms) would go inert'
  );
});

test('platforms really do render without the mesh ref', () => {
  // The premise of the fix. If platforms ever start attaching meshRef, the
  // special case above becomes dead code and should be revisited.
  const start = player.indexOf("if (isPlatform || shape === 'plane') {");
  assert.ok(start > 0, 'the platform render branch has moved');
  const branch = player.slice(start, start + 900);
  assert.ok(
    !/ref=\{meshRef\}/.test(branch),
    'platforms now attach meshRef — the frame-loop special case may be redundant'
  );
});

test('culling never unmounts an object that has scripts', () => {
  // The related half: unmounting destroys the ObjectRuntime, so an object
  // scrolling off screen would stop running its blocks and never resume.
  assert.ok(
    /const hasScripts = Array\.isArray\(object\.logic_blocks\)/.test(player),
    'the culling wrapper no longer checks for scripts'
  );
  const start = player.indexOf('const hasScripts = Array.isArray(object.logic_blocks)');
  const branch = player.slice(start, start + 300);
  assert.ok(
    /object\.type === 'character' \|\| hasScripts/.test(branch),
    'scripted objects can be culled again — their blocks would stop running'
  );
});

test('the compact stage ungates its own run loop', () => {
  // The Logic tab's stage renders the player with `compact`, which hides the
  // click-to-start splash. That splash was the only thing that ever set
  // `world.started = true`, so the compact stage drew the scene, ran no
  // scripts, and looked exactly like a working stage on an empty project —
  // no error, nothing in the console.
  assert.ok(
    /worldRef\.current\.started = compact;/.test(player),
    'the run gate no longer opens for the compact stage — the Logic tab stage ' +
      'would render but never run a single block'
  );
});

test('the compact stage hides the splash', () => {
  // The other half of the same invariant: if the splash comes back for compact
  // the gate above is redundant, and if it does not the gate is load-bearing.
  assert.ok(
    /useState\(!compact\)/.test(player),
    'the start splash no longer keys off `compact` — re-check the run gate'
  );
});

console.log(`\nscripts always run: ${passed} checks passed`);
