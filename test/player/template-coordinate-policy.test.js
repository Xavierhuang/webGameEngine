'use strict';

const assert = require('node:assert/strict');

const { usesLegacyWorldCoordinates } = require('../.build/lib/player/templateCoordinatePolicy');

// This fails if starter worlds are accidentally sent back through the old
// pixel-coordinate adapter. A 10-unit template route must remain a 10-unit
// route at play time; only worlds without a template identity use legacy data.
assert.equal(usesLegacyWorldCoordinates(undefined), true, 'hand-built legacy worlds keep their existing coordinate adapter');
assert.equal(usesLegacyWorldCoordinates({ templateId: 'platformer', templateVersion: 2 }), false, 'Sky Steps keeps authored 3D coordinates');
assert.equal(usesLegacyWorldCoordinates({ templateId: 'obby', templateVersion: 1 }), false, 'Rainbow Obby keeps its full obstacle route');
assert.equal(usesLegacyWorldCoordinates({ templateId: 'racing', templateVersion: 1 }), false, 'Turbo Track keeps its full road');
assert.equal(usesLegacyWorldCoordinates({ templateId: 'story', templateVersion: 1 }), false, 'Castle Story keeps its exploration route');
assert.equal(usesLegacyWorldCoordinates({ templateId: 'pet', templateVersion: 1 }), false, 'Happy Pet Park keeps its fetch route');

console.log('Template coordinate policy tests passed');
