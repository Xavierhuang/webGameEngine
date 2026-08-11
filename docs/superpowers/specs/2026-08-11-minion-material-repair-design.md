# Minion Material Repair Design

## Goal

Restore recognizable Minion colors in the supplied FBX everywhere it renders: starter preview, editor scene, and Play mode. Preserve the working denim texture and leave every other local, uploaded, or remote model unchanged.

## Root Cause

The FBX was authored with Maya V-Ray materials. Three.js can load the geometry, but unsupported V-Ray materials arrive as gray `MeshLambertMaterial` fallbacks. Only `jeans_texture4807.jpg` is referenced by the FBX; `brown-eye.png` is not referenced. Converting the current FBX with Assimp would preserve these fallback values rather than recover the missing V-Ray shading.

## Architecture

Add a focused, pure Minion-material module under `lib/models/`. It will identify the built-in Minion by its exact public model URL and traverse the loaded model once. For each mesh material, it will clone the material before changing color or PBR properties so cached source materials and unrelated model instances are never mutated.

`AnimatedModel` will invoke the repair immediately after acquiring and cloning the Minion FBX, before attaching it to the render group. This single integration point covers the picker, editor, and player.

## Material Mapping

Use the real material and mesh names embedded in `Minion_FBX.fbx`:

- `VRayMtl2` on `polySurface31`: Minion yellow body.
- `VRayMtl1` on `pCylinder13` and `pCylinder14`: Minion yellow arms.
- `VRayMtl4` on hands, shoes, and related dark accessories: charcoal.
- `VRayMtl8`, `VRayMtl9`, and `lambert2`: charcoal hair, mouth line, and dark details.
- `VRayMtl3`: white teeth.
- `VRayMtl7`: metallic silver goggle assembly.
- Eye mesh `Minion_Eye_polySurface19_polySurface20`: map its material slots to silver/white, warm brown, and near-black according to the embedded material order (`VRayMtl5`, `VRayMtl6`, `lambert9`).
- `lambert3`: retain the existing jeans texture and neutral-white tint so its image colors remain unchanged.

The mapping will use standard Three.js materials/properties supported by WebGL. It will not modify UVs, geometry, rigging, animations, or the source FBX.

## Error Handling

Unknown meshes and materials remain unchanged. The repair must be idempotent: applying it twice produces the same visible/material state. If a future asset revision removes or renames a known material, model loading continues with its original material rather than failing.

## Validation

- Parse the real public FBX in the existing Node test environment.
- Verify the Minion URL is the only URL eligible for repair.
- Apply the repair and assert exact resulting colors/material properties for body, arms, gloves, goggles, eye slots, teeth, dark details, and denim.
- Assert the denim texture remains attached.
- Assert applying the repair to a non-Minion URL leaves all materials unchanged.
- Assert repeated repair is idempotent and does not share mutated material instances with the loaded source.
- Run the complete test suite, TypeScript check, and production build.
- In the browser, verify the starter preview and editor model show yellow skin, blue denim, dark gloves/shoes, silver goggles, and a readable eye without FBX or texture errors.

## Out of Scope

- Re-exporting or converting the FBX to GLB.
- Recreating V-Ray lighting or physically matching the original Maya render.
- Assigning the unused `brown-eye.png` texture.
- Editing geometry, UVs, skeleton, or animations.
- Changing generic FBX import behavior.
