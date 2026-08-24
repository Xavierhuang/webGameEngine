# Sky Steps flagship World Builder design

**Goal:** Replace the current minimal `platformer` starter with a short, immediately playable 3D platform game that demonstrates the quality bar for future World Builder templates.

## Scope

Only the `platformer` template is upgraded. Existing projects retain the current template data. New projects created from Sky Steps receive template version 2. The other four templates remain unchanged until this flagship has proven the content and runtime pattern.

## Player experience

Sky Steps opens on a friendly start island. A child sees a compact control hint: arrow keys move; Space jumps. They guide Hero across three elevated platforms, collect three bright stars, avoid a slowly moving cloud hazard, and reach a glowing sky portal. Collecting a star gives visual and sound feedback. Reaching the portal ends the game with a clear win message.

The level is deliberately small: the goal is a 2–4 minute complete game that a child can understand and edit, not a long obstacle course. Every required action is visible from the starting camera.

## Template data and compatibility

- Add `platformer` version 2 to the approved catalog while preserving version 1 lookup for existing projects.
- Keep all assets local and existing: starter Hero/star models and local sky backdrop.
- Keep the current conservative World Builder budgets.
- Add explicit metadata that makes version 2’s level intent testable: one player character, three collectible stars, three traversable platforms, one moving cloud hazard, and one finish portal/goal.
- Use only blocks supported by the existing editor/player runtime. Do not introduce new unimplemented block types merely for content.

## Gameplay contract

- Hero has arrow-key movement and a Space-key jump script at creation.
- The camera follows Hero.
- Platforms form a reachable ascending route. Their spacing and height must be within the current physics jump envelope.
- Each star is collectible by touching Hero and produces short feedback without ending the game.
- The cloud hazard is visibly animated and triggers a clear retry/reset behavior that already exists in the runtime; if a suitable supported hazard behavior does not exist, it is visual-only and the template does not claim damage/reset gameplay.
- The final portal completes the game only after the intended route is followed. Its win message names the accomplishment.

## Guided missions

Version 2 missions match the server-verified post-creation progress rules exactly:

1. **Build a new step:** add a new platform after the template baseline.
2. **Add a sky star:** add a new collectible after the template baseline.
3. **Play Sky Steps:** start an authenticated, revision-pinned play session.

No mission claims that merely renaming or viewing an existing object completes it. Outcome completion remains deferred until the runtime can provide server-verifiable gameplay facts.

## UI and feedback

- The player’s existing control hint is used or extended only when Sky Steps needs an explicit Space-to-jump reminder.
- Collectible and finish feedback uses the existing player presentation and local sound system; no external URLs or user-visible moderation/publication control is added.
- World Builder remains private-only. This change does not alter release, sharing, Explore, parent approval, or moderation policies.

## Testing and acceptance criteria

- Catalog/validation tests prove both `platformer` v1 and v2 can be retrieved, v2 uses only local existing assets and supported blocks, and all object/block IDs remain unique.
- Template gameplay tests assert the control scripts, reachable platform geometry, three collectible stars, hazard animation, and finish trigger contract.
- Mission tests assert the three v2 instructions map to the existing baseline-aware object/block/play predicates.
- Player/runtime tests cover Space jump and winning through the portal’s supported event path.
- Create a new v2 Sky Steps world in the browser journey, reload it, verify the expected objects/status, Play it, and verify controls/goal presentation. Existing version-1 worlds and Blank Game creation remain unaffected.

## Non-goals

- Rebuilding Obby, Racing, Story, or Pet in this change.
- Introducing a new physics engine, server-authoritative game simulation, score economy, checkpoint persistence, or a public World marketplace.
- Treating a client-reported win as an authoritative guided-mission completion signal.
