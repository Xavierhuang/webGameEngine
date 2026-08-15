/**
 * Every 3D view must use the shared lighting rig.
 *
 * A child reported "why can't I see anything?" with the Animation Editor open
 * on a character that had loaded correctly — the bone list was fully
 * populated. The viewport was black because that component declared its own
 * lights at roughly a third the intensity of the main editor, and every
 * starter character uses metallic materials (0.05-0.9). Metallic PBR surfaces
 * reflect light rather than emitting it, so under-lit they render black.
 *
 * The rig had been copy-pasted into six components and three had drifted dim.
 * Brightening the reported one would have left the character picker and the
 * model builder dark, which is what happened on the first attempt at this fix.
 *
 * This is a source-level check rather than a rendering test on purpose: it is
 * the drift that is dangerous, and drift is visible in the source. Nothing in
 * a test suite of 1300+ assertions could see a black model on a black
 * background, and this scan would have caught it in a second.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

let passed = 0;
function check(name, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`FAIL ${name}\n  ${e.message}`);
    process.exit(1);
  }
  passed++;
}

/** Files allowed to declare their own lights, with the reason. */
const EXEMPT = {
  'components/three/SceneLights.tsx': 'defines the shared rig',
  'components/showcase/DragonShowcase.tsx':
    'a deliberately art-directed showcase scene with coloured key lights, not a content view',
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = [...walk('components'), ...walk('app')];

// The scan is only meaningful if it is actually looking at the codebase.
check('scan covers the component tree', () => {
  assert.ok(files.length > 20, `expected to scan many files, found ${files.length}`);
  assert.ok(
    files.includes('components/editor/AnimationEditor.tsx'),
    'the component that regressed must be in scope'
  );
});

const LIGHT = /<(ambient|hemisphere|directional|point|spot)Light[\s/>]/;

check('no 3D view declares its own lights', () => {
  const offenders = files.filter((f) => !(f in EXEMPT) && LIGHT.test(readFileSync(f, 'utf8')));
  assert.deepStrictEqual(
    offenders,
    [],
    `these declare lights instead of using <SceneLights />:\n  ${offenders.join('\n  ')}\n` +
      'A view lit differently from the rest renders metallic characters black.'
  );
});

check('every 3D view that renders content pulls in the shared rig', () => {
  // A <Canvas> showing project content needs lighting from somewhere.
  const canvases = files.filter(
    (f) => !(f in EXEMPT) && /<Canvas[\s>]/.test(readFileSync(f, 'utf8'))
  );
  assert.ok(canvases.length >= 4, `expected several 3D views, found ${canvases.length}`);
  for (const f of canvases) {
    assert.ok(
      readFileSync(f, 'utf8').includes('SceneLights'),
      `${f} renders a <Canvas> but never lights it`
    );
  }
});

check('the shared rig is bright enough for metallic materials', () => {
  const src = readFileSync('lib/constants/game.ts', 'utf8');
  const num = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*([\\d.]+)`));
    assert.ok(m, `${key} missing from LIGHTING`);
    return parseFloat(m[1]);
  };
  const total =
    num('AMBIENT_INTENSITY') +
    num('POINT_LIGHT_INTENSITY') +
    num('DIRECTIONAL_LIGHT_1_INTENSITY') +
    num('DIRECTIONAL_LIGHT_2_INTENSITY') +
    num('HEMISPHERE_LIGHT_INTENSITY');

  // The three rigs that rendered characters black totalled 1.4-1.9. The
  // working editor rig totals 5.5. 3.0 sits clearly above the failures
  // without pinning the exact artistic values.
  assert.ok(
    total >= 3.0,
    `total light intensity ${total} is in the range that rendered metallic characters black`
  );
  assert.ok(num('AMBIENT_INTENSITY') >= 1.0, 'ambient carries unlit faces; below 1.0 they go dark');
});

console.log(`lighting: ${passed} checks passed`);
