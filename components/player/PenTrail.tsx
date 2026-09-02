'use client';

/** The pen's strokes, one line per stroke. */
export /**
 * The Pen extension's output. Scratch draws on a 2D canvas; in 3D the natural
 * equivalent is a ribbon of line segments through the points the object passed.
 */
function PenTrail({
  strokes,
  color,
  size,
}: {
  strokes: number[][][];
  color: string;
  size: number;
}) {
  if (!strokes || strokes.length === 0) return null;
  return (
    <>
      {strokes.map((stroke, i) => {
        // A line needs at least two points.
        if (!stroke || stroke.length < 2) return null;
        const positions = new Float32Array(stroke.flat());
        return (
          <line key={i}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[positions, 3]}
                count={stroke.length}
                array={positions}
                itemSize={3}
              />
            </bufferGeometry>
            {/* linewidth is capped at 1 by most WebGL drivers; kept for intent. */}
            <lineBasicMaterial color={color} linewidth={size} />
          </line>
        );
      })}
    </>
  );
}
