# Minion Starter Character Design

## Goal

Add the supplied `Minion_FBX.fbx` asset as one new starter character in the character picker. Existing starter characters remain unchanged. Selecting Minion creates a model-backed character that appears in both the editor and game player.

## Asset Layout

Copy the supplied FBX into the application's public assets at:

```text
public/models/minion/FBX/Minion_FBX.fbx
```

The FBX refers to its jeans texture through `../Textures/jeans_texture4807.jpg`, so its associated textures will be copied to:

```text
public/models/minion/Textures/jeans_texture4807.jpg
public/models/minion/Textures/brown-eye.png
```

This preserves the FBX-relative texture layout and allows Next.js to serve the model from `/models/minion/FBX/Minion_FBX.fbx`. The original files under `models/Minion/` remain source assets and are not modified.

## Prefab Data

Extend `CharacterPrefab` with optional model metadata, beginning with `model_url`. Add a `minion` entry to `CHARACTER_TEMPLATES` with a friendly name and description, Minion-related aliases, `shape: 'model'`, and the public FBX URL.

The existing shared prefab list remains the single source of truth for the manual character picker and AI prompt matching. A prompt containing “minion” should therefore resolve to this local starter rather than invoke external generation.

## Picker Preview and Selection

The starter picker will detect model-backed prefabs and render a live 3D preview using the existing FBX-capable model renderer. Primitive-backed prefabs continue to use `ShapePreview` unchanged.

The Minion preview will use a fixed, model-specific scale and orientation chosen to frame the supplied asset clearly. Preview controls will remain nonessential to selection; failure to load the preview must not prevent the tile from being selected.

When selected, the existing `GameEditor` model path persists `shape: 'model'` and `model_url` into both sprite and object properties. No new database fields or API behavior are required.

## Runtime Behavior and Error Handling

`SceneView` and `GamePlayer` already route FBX URLs through `AnimatedModel`, so they will load the Minion through the established runtime path. Any embedded animation clips remain available to the existing animation system; no new animation mapping is part of this change.

If the FBX or a texture cannot be loaded, the existing renderer logging remains in place and the rest of the editor stays usable. The picker preview will provide a simple visible fallback instead of leaving a blank tile.

## Validation

- Extend prefab tests to confirm that `minion` and a descriptive Minion prompt resolve to the new prefab and that its `model_url` is correct.
- Update library-count expectations affected by the added starter.
- Run the prefab test suite, full project tests, TypeScript checking, and a production build.
- In the browser, confirm the picker shows the textured Minion preview and selecting it produces the same model in the editor and player without console loading errors.

## Success Criteria

- Minion appears as one additional starter without replacing existing entries.
- Its picker tile shows the supplied 3D model or a clear fallback during a load failure.
- Selecting it creates a model-backed character using the local FBX URL.
- The jeans and eye textures load from local public assets.
- Existing primitive starters and AI prefab matching continue to work.

## Out of Scope

- Converting the FBX to GLB.
- Editing, rerigging, or adding animations to the model.
- Replacing other starter characters with Minion variants.
- Changing uploaded-model behavior or database schema.
