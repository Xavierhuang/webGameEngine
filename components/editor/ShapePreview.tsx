'use client';

interface ShapePreviewProps {
  shape: string;
  color: string;
  size?: number;
}

function PrimitiveShape({ shape, color }: { shape: string; color: string }) {
  const common = { fill: color, stroke: '#0f172a', strokeWidth: 2 };

  switch (shape) {
    case 'sphere':
      return (
        <>
          <circle cx="50" cy="47" r="28" {...common} />
          <ellipse cx="40" cy="36" rx="9" ry="6" fill="white" opacity="0.38" />
        </>
      );
    case 'cylinder':
      return (
        <>
          <path d="M27 31v37c0 8 46 8 46 0V31" {...common} />
          <ellipse cx="50" cy="31" rx="23" ry="9" {...common} />
          <ellipse cx="50" cy="30" rx="15" ry="4" fill="white" opacity="0.24" />
        </>
      );
    case 'cone':
      return (
        <>
          <path d="M50 17 23 69c4 11 50 11 54 0Z" {...common} />
          <ellipse cx="50" cy="69" rx="27" ry="9" fill={color} stroke="#0f172a" strokeWidth="2" />
        </>
      );
    case 'pyramid':
      return (
        <>
          <path d="M50 14 20 72l30 12Z" {...common} />
          <path d="M50 14 80 72 50 84Z" fill={color} opacity="0.72" stroke="#0f172a" strokeWidth="2" />
        </>
      );
    case 'torus':
      return (
        <>
          <ellipse cx="50" cy="50" rx="30" ry="23" fill="none" stroke="#0f172a" strokeWidth="17" />
          <ellipse cx="50" cy="50" rx="30" ry="23" fill="none" stroke={color} strokeWidth="13" />
          <path d="M27 42c8-13 36-18 49-3" fill="none" stroke="white" strokeWidth="4" opacity="0.3" />
        </>
      );
    case 'capsule':
      return (
        <>
          <rect x="31" y="15" width="38" height="70" rx="19" {...common} />
          <path d="M36 35c3-11 11-16 22-15" fill="none" stroke="white" strokeWidth="5" opacity="0.3" />
        </>
      );
    case 'box':
    default:
      return (
        <>
          <path d="m22 35 29-18 28 16-29 18Z" fill={color} stroke="#0f172a" strokeWidth="2" />
          <path d="m22 35 28 16v33L22 68Z" fill={color} opacity="0.82" stroke="#0f172a" strokeWidth="2" />
          <path d="m50 51 29-18v34L50 84Z" fill={color} opacity="0.62" stroke="#0f172a" strokeWidth="2" />
        </>
      );
  }
}

export default function ShapePreview({ shape, color, size = 200 }: ShapePreviewProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <ellipse cx="50" cy="88" rx="28" ry="5" fill="#0f172a" opacity="0.12" />
      <PrimitiveShape shape={shape} color={color} />
    </svg>
  );
}
