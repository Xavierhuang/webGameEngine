# Red Dragon Editor Integration Design

## Goal

Make the checked-in Red Metal Dragon GLB available as a reusable starter character that can be inserted into any LingPlay 3D editor scene.

## User Experience

The Add Character modal shows a `Red Metal Dragon` tile in the existing Starters tab. Its tile renders the real local dragon model rather than the old capsule placeholder. Selecting it adds the dragon at the scene's standard spawn position with a tuned initial size that is immediately visible and manipulable.

The inserted dragon participates in existing editor behavior: selection, transform controls, property editing, deletion, and logic blocks. Adding multiple dragons to one scene must render every instance independently.

The AI character prompt uses the same prefab. A prompt containing `dragon`, `drake`, `wyrm`, or `wyvern` returns the local Red Metal Dragon model immediately without Meshy or another remote generation request. A color word may still update the prefab's color metadata, but this first generated GLB retains its baked red metallic materials.

## Architecture

Extend the shared `CharacterPrefab` contract with optional local-model metadata: `model_url` and a model-specific numeric `size`. The dragon entry uses `/models/red-metal-dragon.glb`, while primitive prefabs remain unchanged.

The character selector passes the optional model URL to `ShapePreview`. `ShapePreview` gains a model-preview path that loads and frames a cloned GLB scene; primitive rendering remains its fallback.

The GameEditor insertion payload stops hard-coding all model characters to size `1`. It persists the selected prefab's size into both `sprite_data` and `properties`, with `1` retained as the fallback for imported models that do not supply a size.

The shared GLTF rendering path clones the loaded scene graph per mounted model. This prevents one cached Three.js scene object from being reparented or mutated when multiple instances of the same dragon are placed in a scene.

## Data Flow

```text
CharacterPrefab dragon metadata
  -> CharacterSelector tile and GLB preview
  -> GameEditor add_game_object payload
  -> persisted model_url + tuned size
  -> SceneView / AnimatedModel cloned GLB instance
```

The `/api/ai/generate-character` route already reads the same prefab module, so the model metadata naturally flows through the prefab-first response without a separate dragon-specific endpoint.

## Failure Handling

If the preview model cannot load, the tile displays a compact fallback rather than crashing the selector modal. If the editor model cannot load, the existing scene error boundary remains the final containment layer. The local asset URL avoids network and credential failures during normal use.

## Validation

- Prefab tests verify dragon aliases return the model URL and tuned size.
- Selector tests/contracts verify the dragon tile passes its model URL to the preview.
- Insertion tests/contracts verify model size is propagated instead of replaced with `1`.
- Model-rendering tests/contracts verify the cached GLTF scene is cloned per instance.
- Type-check, existing project tests, production build, and a browser walkthrough verify adding two dragons to an editor scene renders two independently selectable models at usable scale.

## Out of Scope

This extension does not add skeletal animation, fire effects, alternate dragon colors, a new asset marketplace, database schema changes, or remote model generation.
