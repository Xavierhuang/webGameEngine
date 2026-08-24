# Platformer runtime upgrade for flagship Sky Steps

**Goal:** Add a small, reusable platformer collision layer to the existing player so the Sky Steps flagship world is genuinely playable: Hero can land on raised platforms, jump between them, collect reachable stars, and enter a reachable portal.

## Why this replaces the previous content-only approach

The content-only Sky Steps v2 attempt was rejected in review. The current player flattens platform objects to a fixed ground plane, collides only with that fixed ground, and transforms persisted template coordinates differently from the authored template’s assumed world units. Raised steps do not exist physically, and the stars/portal cannot be reached. Template data alone cannot correct this.

This design supersedes the runtime assumptions in `2026-08-24-sky-steps-flagship-design.md`. Its product scope remains one flagship world first.

## Scope

- Upgrade only the existing `GamePlayer` platformer behavior; do not replace the physics stack or introduce a separate game engine.
- Build the upgraded Sky Steps as template version 2 only after the runtime contract exists.
- Preserve all existing version-1 projects and non-platformer worlds.
- Keep World Builder private-phase only. No sharing, release, moderation, or parent-consent behavior changes.

## Coordinate contract

Introduce a pure `platformerWorld` module as the sole converter between persisted object positions and player world positions.

- Persisted object `position: [x, y, z]` is interpreted as design units, not screen pixels.
- `toPlayerPosition(position)` maps the design coordinate directly into R3F/collision units with one explicit global scale constant. It is used by player rendering, character movement, touch tests, platform surfaces, and authored Sky Steps data.
- No platform object receives a forced `GROUND_Y` render position. The platform’s persisted y is its top-surface design height.
- Existing legacy projects retain their current apparent ground placement through a compatibility normalizer: old platforms missing a version-2 `platformer` metadata flag map to ground level. Version-2 worlds use authored heights.

## Platform collision layer

The active controllable character gets a simple axis-aligned collider.

- Each `platform` object contributes an axis-aligned top surface derived from its rendered scale/size and player-world position.
- During each physics step, horizontal movement is resolved as today; vertical motion applies gravity.
- On downward crossing of a platform top while Hero’s horizontal footprint overlaps, Hero snaps to that top, vertical velocity becomes zero, and `grounded` becomes true.
- `grounded` is true on the fixed ground or any platform top. Space jump is allowed only when grounded, then applies the existing jump force.
- The system needs no side-wall collision, slopes, movable platforms, or full rigid-body simulation in this milestone.
- Touch overlap uses the same converted world positions and character radius, so the visible star/portal collision zone matches the gameplay collision zone.

## Sky Steps v2 level

New Sky Steps worlds use the latest active platformer template version 2; version 1 remains resolvable for existing projects.

The level contains:

1. Hero on a start island at ground height.
2. Three ascending step platforms with every adjacent landing gap within the measured horizontal and vertical jump envelope.
3. Three stars positioned on reachable platform surfaces.
4. One slowly animated cloud obstacle. It remains visual-only unless a current supported runtime behavior can safely reset Hero; no false damage claim.
5. A portal on the final reachable platform. `when_touches Hero → you_win` is the only authored win path.
6. Hero’s original arrow-key motion, camera follow, and a Space `on_key_press → jump` script.
7. Existing local sound feedback for each star where the sound player supports the named packaged sound; otherwise the template uses visible feedback only and makes no sound promise.

## Template version selection

- Catalog APIs expose available versions for project compatibility but identify exactly one active/latest version per template ID.
- The Create a World picker displays only the active/latest catalog entry for each ID.
- `POST /api/worlds/create` accepts only a catalog version returned by the picker; callers may still explicitly create a prior valid version only where the existing private migration/compatibility path requires it, never via ordinary picker UI.
- Existing `platformer` v1 projects preserve their source graph and legacy visual placement.

## Guided missions

Sky Steps v2 has only truthful mission instructions:

1. Add a new platform after creation (server proves a post-baseline platform).
2. Add a new collectible after creation (server proves a post-baseline collectible).
3. Start a revision-pinned, actor-bound play session.

No mission requires a client-reported win. Outcome progress remains deferred until the runtime has server-verifiable gameplay facts.

## Testing and acceptance criteria

- Pure coordinate tests prove one converter is used consistently and legacy/v2 placement is deterministic.
- Player physics tests prove a character falls onto a raised platform, remains grounded, can jump from it, and cannot double-jump while airborne.
- Collision tests prove stars and the final portal are touchable only when the visible player collider reaches them.
- Sky Steps contract tests derive actual gap/height limits from the current physics constants rather than arbitrary template numbers.
- Catalog tests prove platformer v1 remains intact, v2 is active in the picker, and every v2 object/block/asset is valid.
- Browser journey creates a v2 Sky Steps world, reloads it, verifies the raised level, uses Space to jump, collects a reachable star, and reaches/observes the portal’s win feedback. It also verifies a v1 project and Blank Game remain unaffected.

## Non-goals

- A general rigid-body engine, terrain, slope collision, moving collision platforms, respawn/checkpoint persistence, scoring/economy, multiplayer, or public Worlds.
- Retrofitting every legacy template to raised platform physics in this change.
