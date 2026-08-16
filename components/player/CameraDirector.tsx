'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  createCameraState,
  setFollowTarget,
  setZoom,
  changeZoom,
  startShake,
  stepCamera,
} from '@/lib/camera/cameraControl';

/**
 * Applies the camera blocks to the real camera.
 *
 * All the behaviour — follow smoothing, shake decay, zoom clamping — lives in
 * `lib/camera/cameraControl.ts` and is tested there. This file only converts
 * the result into a camera position, which is the part a test cannot judge.
 *
 * The camera keeps its original angle and distance and orbits the point it is
 * looking at. That way a game that never touches the camera looks exactly as it
 * did before these blocks existed, and `camera follow Hero` is a change to what
 * is centred rather than a whole new viewpoint.
 */

export interface CameraController {
  follow(target: string | null): void;
  shake(strength: number, seconds: number): void;
  setZoom(zoom: number): void;
  changeZoom(delta: number): void;
}

export function CameraDirector({
  onReady,
  getObjectPosition,
}: {
  onReady?: (controller: CameraController) => void;
  /** Where a named object is right now, or null if there is no such object. */
  getObjectPosition: (name: string) => { x: number; y: number; z: number } | null;
}) {
  const { camera } = useThree();
  const stateRef = useRef(createCameraState());
  /** The camera's rest position, captured once so zoom and follow are relative. */
  const baseRef = useRef<{ offset: { x: number; y: number; z: number } } | null>(null);
  const onReadyRef = useRef(onReady);
  const getPositionRef = useRef(getObjectPosition);

  useEffect(() => {
    onReadyRef.current = onReady;
    getPositionRef.current = getObjectPosition;
  }, [onReady, getObjectPosition]);

  useEffect(() => {
    const state = stateRef.current;
    const controller: CameraController = {
      follow: (target) => setFollowTarget(state, target),
      shake: (strength, seconds) => startShake(state, strength, seconds),
      setZoom: (zoom) => setZoom(state, zoom),
      changeZoom: (delta) => changeZoom(state, delta),
    };
    onReadyRef.current?.(controller);
    // Once: the player passes inline callbacks, and depending on them would
    // reset the camera state on every render.
  }, []);

  useFrame((_, delta) => {
    const state = stateRef.current;

    // Capture the camera's own framing the first time we run, so a project that
    // never uses these blocks is completely unaffected.
    if (!baseRef.current) {
      baseRef.current = {
        offset: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      };
      state.look = { x: 0, y: 0, z: 0 };
    }

    const target = state.followTarget ? getPositionRef.current(state.followTarget) : null;
    const frame = stepCamera(state, delta, target);

    // Nothing is happening: leave the camera exactly where the scene put it.
    if (!state.followTarget && frame.zoom === 1 && frame.shake.x === 0 && frame.shake.y === 0) {
      return;
    }

    const base = baseRef.current.offset;
    // Zoom pulls the camera in along its existing view direction rather than
    // changing the field of view, which keeps perspective consistent.
    const k = 1 / frame.zoom;
    camera.position.set(
      frame.look.x + base.x * k,
      frame.look.y + base.y * k,
      frame.look.z + base.z * k
    );
    camera.lookAt(frame.look.x, frame.look.y, frame.look.z);
  });

  return null;
}

export default CameraDirector;
