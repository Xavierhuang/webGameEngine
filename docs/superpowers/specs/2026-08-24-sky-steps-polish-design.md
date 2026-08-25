# Sky Steps visual polish design

**Goal:** Make the playable Sky Steps v2 flagship feel lively and rewarding through motion, feedback, lighting, camera presentation, and a small child-readable HUD.

## Scope

This is a presentation pass over the already playable private Sky Steps v2 world. It does not alter World Builder publication policy, coordinate/landing physics, missions, platform geometry, persistence, or legacy v1 behavior.

## Character motion

- Keep authored GLTF/FBX clips as the first choice.
- When a model has no matching clip, apply a procedural fallback in the player only: a gentle idle bob, a short walk bounce/lean, a jump squash-and-stretch, and a fall tilt.
- The fallback derives entirely from the current animation state and never changes collider positions, touch checks, or platform surfaces.

## World motion and feedback

- Stars slowly rotate and bob while visible. On collection, show a short sparkle burst, play the existing permitted sound if present, hide the star, and update the HUD.
- Sky Portal has a soft pulsing glow and slow rotation. Winning triggers a larger confetti/sparkle burst and a clear win card.
- Moving Cloud has visibly readable drift using the existing block/runtime motion, with a small visual bob if needed; it makes no damage claim.
- Platforms receive a cohesive bright material palette and the sky backdrop receives directional lighting/fog tuned for legibility.

## Camera and HUD

- Preserve existing camera follow. Add small look-ahead based on Hero’s horizontal velocity, bounded so it never hides the next landing.
- Add a short, low-strength landing camera bump and a one-time win emphasis; no motion during reduced-motion preference.
- Add a screen-reader-readable and visual HUD: `Stars 0/3`, then `Stars 1/3` etc.; portal goal hint while stars remain; a win card after the portal triggers.
- Use existing localization conventions and add every visible key to all supported locales.

## Accessibility and performance

- Honor `prefers-reduced-motion` by disabling continuous bob/spin, camera bumps, and nonessential particles while retaining game-state feedback.
- No internal IDs in aria-live output. Announcements use child-readable object names/status only.
- Cap decorative particles and reuse existing effect primitives; no external assets or new client-side service.

## Tests and acceptance

- Pure tests cover procedural animation transforms and reduced-motion disabling.
- Player tests verify fallback motion leaves gameplay coordinates/colliders unchanged.
- Sky Steps tests prove three stars drive a localized HUD count, collection feedback is one-time, and portal win shows the win card/effect.
- Browser journey proves loading state, collection count changes, and win presentation; v1/Blank Game and private boundary remain unchanged.

## Non-goals

- New art downloads, third-party animation packages, score economy, multiplayer, public sharing, or rebuilding the other four templates.
