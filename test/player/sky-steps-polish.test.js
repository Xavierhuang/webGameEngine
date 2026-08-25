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
assert.match(animatedModel, /enabled=\{!hasClips/, 'authored clips take precedence over procedural fallback');
assert.match(animatedModel, /<VisualFallbackMotion[\s\S]*<primitive/, 'fallback transforms wrap only the rendered model primitive');
assert.doesNotMatch(animatedModel, /meshRef\.current\.position\.y\s*[+\-*/]?=/, 'fallback does not write gameplay/collider coordinates');
assert.match(messages, /'player\.skySteps\.stars'/, 'the default locale declares the visible Sky Steps HUD key');
assert.match(messages, /'player\.skySteps\.win'/, 'the default locale declares the visible win-card key');

console.log('Sky Steps polish player integration tests passed');
