'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const player = fs.readFileSync(path.join(root, 'components/player/GamePlayer.tsx'), 'utf8');
const animatedModel = fs.readFileSync(path.join(root, 'components/editor/AnimatedModel.tsx'), 'utf8');
const messages = fs.readFileSync(path.join(root, 'lib/i18n/messages.ts'), 'utf8');

assert.match(player, /data-testid="sky-steps-hud"/, 'Sky Steps renders a dedicated HUD');
assert.match(player, /player\.skySteps\.stars/, 'the HUD uses a localized star-count key');
assert.match(player, /player\.skySteps\.portalHint/, 'the incomplete portal hint is localized');
assert.match(player, /data-testid="sky-steps-status"[\s\S]*aria-live="polite"/, 'Sky Steps state is announced semantically');
assert.match(player, /usePrefersReducedMotion/, 'decorative presentation reads prefers-reduced-motion safely');
assert.match(player, /if \(!isSkyStepsV2 \|\| reducedMotion\) return;[\s\S]*particlesRef\.current\?\.burst\('sky-steps-star/, 'star feedback is gated and uses the shared capped particle burst');
assert.match(player, /if \(!isSkyStepsV2 \|\| reducedMotion \|\| outcome\.state !== 'won'[\s\S]*particlesRef\.current\?\.burst\('sky-steps-win/, 'win feedback is gated and uses the shared capped particle burst');
assert.match(player, /'sky-steps-win-card'/, 'a Sky Steps win card is rendered');
assert.match(animatedModel, /proceduralMotion\(/, 'procedural fallback reads Task 1 render-only transforms');
assert.match(animatedModel, /const matchingAnimationName = findAnimationName\(animationState \?\? 'idle', animations\.map\(\(clip\) => clip\.name\)\);/, 'GLTF only treats a semantic clip match as authored animation');
assert.match(animatedModel, /enabled=\{!hasMatchingClip && Boolean\(playAnimation\)\}/, 'a missing matching GLTF clip uses the visual fallback');
assert.match(animatedModel, /<VisualFallbackMotion[\s\S]*<primitive/, 'fallback transforms wrap only the rendered model primitive');
assert.match(animatedModel, /function FBXAnimatedModel\([\s\S]*reducedMotion = false,/, 'FBX receives the reduced-motion preference');
assert.match(animatedModel, /<VisualFallbackMotion[\s\S]*ref=\{visualRef\}[\s\S]*reducedMotion=\{reducedMotion\}/, 'FBX fallback is a reduced-motion-aware visual child');
assert.doesNotMatch(animatedModel, /Using first available animation/, 'unrelated authored clips are never played as a fallback');
assert.doesNotMatch(animatedModel, /animationsRef\.current\[0\]/, 'FBX never substitutes an unrelated first clip');
assert.doesNotMatch(animatedModel, /stateLower\.includes\(nameLower\)/, 'short unrelated clip names cannot masquerade as a semantic state match');
assert.doesNotMatch(animatedModel, /meshRef\.current\.position\.y\s*[+\-*/]?=/, 'fallback does not write gameplay/collider coordinates');
assert.match(player, /<SkyStepsWorldPresentation[\s\S]*reducedMotion=\{reducedMotion\}/, 'the flagship mounts world-only decorative presentation with reduced-motion support');
assert.match(player, /function SkyStepsWorldPresentation[\s\S]*function SkyStepsStarDecoration[\s\S]*useFrame/, 'visible stars have a render-only bob and rotation hook');
assert.match(player, /function SkyStepsPortalDecoration[\s\S]*useFrame/, 'the portal has a render-only pulse and rotation hook');
assert.match(player, /function SkyStepsCameraPresentation[\s\S]*velocity\.x/, 'camera lookahead is driven by horizontal hero velocity');
assert.match(player, /<fog attach="fog" args=\{\['#bae6fd', 12, 32\]\}/, 'Sky Steps receives a bright readable atmospheric treatment');
assert.match(player, /skyStepsV2 \? '#2563eb' : color/, 'Sky Steps platforms use the cohesive legibility material treatment');
assert.match(messages, /'player\.skySteps\.stars'/, 'the default locale declares the visible Sky Steps HUD key');
assert.match(messages, /'player\.skySteps\.win'/, 'the default locale declares the visible win-card key');

console.log('Sky Steps polish player integration tests passed');
