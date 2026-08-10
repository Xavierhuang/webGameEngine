'use client';

import { useRef, useEffect, useState } from 'react';

interface FPSCounterProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export default function FPSCounter({ position = 'top-right' }: FPSCounterProps) {
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const fpsHistory = useRef<number[]>([]);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    const updateFps = () => {
      frameCount.current++;
      const now = performance.now();
      const delta = now - lastTime.current;

      // Update FPS every second
      if (delta >= 1000) {
        const currentFps = Math.round((frameCount.current * 1000) / delta);
        fpsHistory.current.push(currentFps);
        
        // Keep only last 10 readings for smoothing
        if (fpsHistory.current.length > 10) {
          fpsHistory.current.shift();
        }
        
        // Calculate average FPS
        const avgFps = Math.round(
          fpsHistory.current.reduce((a, b) => a + b, 0) / fpsHistory.current.length
        );
        
        setFps(avgFps);
        frameCount.current = 0;
        lastTime.current = now;
      }

      animationFrameRef.current = requestAnimationFrame(updateFps);
    };

    animationFrameRef.current = requestAnimationFrame(updateFps);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
  };

  const getFpsColor = () => {
    if (fps >= 55) return 'text-green-400';
    if (fps >= 30) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div
      className={`absolute ${positionClasses[position]} bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm font-mono z-50`}
    >
      <span className={getFpsColor()}>
        {fps} FPS
      </span>
    </div>
  );
}
