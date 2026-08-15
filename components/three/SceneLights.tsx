'use client';

// Relative, not '@/': test:preview compiles this tree with bare tsc, which
// does not resolve the alias.
import { LIGHTING } from '../../lib/constants/game';

/**
 * The lighting rig for every 3D view in the app.
 *
 * This exists because the rig was copy-pasted into six components and three
 * copies drifted dim — the Animation Editor at 1.9 total intensity, the
 * character picker at 1.8, the model builder at 1.4, against 5.0 in the main
 * editor. That is not a cosmetic difference. Every starter character is
 * generated with metallic materials (0.05-0.9), and a metallic PBR surface
 * reflects light rather than emitting it: under-lit, with no environment map,
 * it has nothing to reflect and renders black. Against a dark background that
 * is indistinguishable from an empty viewport, which is exactly how it was
 * reported — "why can't I see anything?"
 *
 * A shared component rather than a shared constant because `LIGHTING` already
 * existed and only one of the six components bothered to import it. Values
 * that must be used identically everywhere should be hard to not use.
 *
 * `scale` dims the whole rig proportionally for small thumbnails. Prefer
 * leaving it at 1 — the rig is bright on purpose.
 */
export function SceneLights({ scale = 1 }: { scale?: number }) {
  return (
    <>
      <ambientLight intensity={LIGHTING.AMBIENT_INTENSITY * scale} />
      <pointLight
        position={LIGHTING.POINT_LIGHT_POSITION}
        intensity={LIGHTING.POINT_LIGHT_INTENSITY * scale}
      />
      <directionalLight
        position={LIGHTING.DIRECTIONAL_LIGHT_1_POSITION}
        intensity={LIGHTING.DIRECTIONAL_LIGHT_1_INTENSITY * scale}
      />
      <directionalLight
        position={LIGHTING.DIRECTIONAL_LIGHT_2_POSITION}
        intensity={LIGHTING.DIRECTIONAL_LIGHT_2_INTENSITY * scale}
      />
      <hemisphereLight intensity={LIGHTING.HEMISPHERE_LIGHT_INTENSITY * scale} />
    </>
  );
}

export default SceneLights;
