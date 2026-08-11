import { Box3, Vector3 } from 'three';

type FocusShortcutEvent = {
  altKey?: boolean;
  ctrlKey?: boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | null;
};

type FocusableTarget = EventTarget & {
  contentEditable?: string;
  getAttribute?: (name: string) => string | null;
  isContentEditable?: boolean;
  tagName?: string;
};

const FRAME_PADDING = 1.1;

function isFiniteVector(vector: Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function isTypingTarget(target: EventTarget | null | undefined): boolean {
  const element = target as FocusableTarget | null | undefined;
  const tagName = element?.tagName?.toUpperCase();

  return tagName === 'INPUT'
    || tagName === 'TEXTAREA'
    || tagName === 'SELECT'
    || element?.isContentEditable === true
    || element?.contentEditable === 'true'
    || element?.getAttribute?.('contenteditable') === 'true';
}

export function shouldHandleFocusShortcut(event: FocusShortcutEvent, editorMode: string): boolean {
  return editorMode === 'scene'
    && event.key.toLowerCase() === 'f'
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && !event.shiftKey
    && !isTypingTarget(event.target);
}

export function calculatePerspectiveFrame(
  bounds: Box3,
  cameraPosition: Vector3,
  currentTarget: Vector3,
  verticalFovDegrees: number,
  aspect: number,
  padding = FRAME_PADDING,
): { target: Vector3; position: Vector3 } | null {
  if (bounds.isEmpty()
    || !isFiniteVector(bounds.min)
    || !isFiniteVector(bounds.max)
    || !isFiniteVector(cameraPosition)
    || !isFiniteVector(currentTarget)
    || !Number.isFinite(verticalFovDegrees)
    || verticalFovDegrees <= 0
    || verticalFovDegrees >= 180
    || !Number.isFinite(aspect)
    || aspect <= 0
    || !Number.isFinite(padding)
    || padding <= 0) {
    return null;
  }

  const target = bounds.getCenter(new Vector3());
  const halfVerticalFov = (verticalFovDegrees * Math.PI) / 360;
  const tangent = Math.tan(halfVerticalFov);
  const backward = cameraPosition.clone().sub(currentTarget);

  if (backward.lengthSq() === 0) {
    backward.set(0, 0, 1);
  } else {
    backward.normalize();
  }

  const forward = backward.clone().negate();
  const referenceUp = Math.abs(forward.y) < 0.999 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
  const right = new Vector3().crossVectors(forward, referenceUp).normalize();
  const up = new Vector3().crossVectors(right, forward).normalize();
  const horizontalTangent = tangent * aspect;
  const { min, max } = bounds;
  let distance = 0.001;

  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        const offset = new Vector3(x, y, z).sub(target);
        const forwardOffset = offset.dot(forward);

        distance = Math.max(
          distance,
          Math.abs(offset.dot(right)) / horizontalTangent - forwardOffset,
          Math.abs(offset.dot(up)) / tangent - forwardOffset,
          -forwardOffset + 0.001,
        );
      }
    }
  }

  return {
    target,
    position: target.clone().addScaledVector(backward, distance * padding),
  };
}
