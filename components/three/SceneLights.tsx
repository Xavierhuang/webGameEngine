'use client';

// Relative, not '@/': test:preview compiles this tree with bare tsc, which
// does not resolve the alias.
import { LIGHTING } from '../../lib/constants/game';
import { presetById, type LightingPresetId } from '../../lib/scene/lightingPresets';

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
 *
 * `preset` (optional) picks a whole vibe (sunset / night / underwater /
 * space) — colour + intensity multipliers on top of the base rig. Only the
 * main scene view + player pass a preset; pickers and thumbnails stay on
 * the neutral default so a "night" scene's character preview isn't
 * rendered as a black silhouette.
 */
export function SceneLights({ scale = 1, preset }: { scale?: number; preset?: LightingPresetId }) {
  const p = presetById(preset);
  const color = p.color ?? '#ffffff';
  const totalScale = scale * p.intensity;
  return (
    <>
      <ambientLight color={color} intensity={LIGHTING.AMBIENT_INTENSITY * totalScale} />
      <pointLight
        color={color}
        position={LIGHTING.POINT_LIGHT_POSITION}
        intensity={LIGHTING.POINT_LIGHT_INTENSITY * totalScale}
      />
      <directionalLight
        color={color}
        position={LIGHTING.DIRECTIONAL_LIGHT_1_POSITION}
        intensity={LIGHTING.DIRECTIONAL_LIGHT_1_INTENSITY * totalScale}
      />
      <directionalLight
        color={color}
        position={LIGHTING.DIRECTIONAL_LIGHT_2_POSITION}
        intensity={LIGHTING.DIRECTIONAL_LIGHT_2_INTENSITY * totalScale}
      />
      <hemisphereLight color={color} intensity={LIGHTING.HEMISPHERE_LIGHT_INTENSITY * totalScale} />
      {p.fog && <fog attach="fog" args={[p.fog.color, p.fog.near, p.fog.far]} />}
    </>
  );
}

export default SceneLights;
