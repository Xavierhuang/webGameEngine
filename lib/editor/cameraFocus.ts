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
  if (bounds.isEmpty() || verticalFovDegrees <= 0 || verticalFovDegrees >= 180 || aspect <= 0) {
    return null;
  }

  const target = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const halfVerticalFov = (verticalFovDegrees * Math.PI) / 360;
  const verticalHalfExtent = Math.max(size.y, size.z) / 2;
  const horizontalHalfExtent = Math.max(size.x, size.z) / 2;
  const distance = Math.max(
    verticalHalfExtent / Math.tan(halfVerticalFov),
    horizontalHalfExtent / (Math.tan(halfVerticalFov) * aspect),
  ) * padding;
  const direction = cameraPosition.clone().sub(currentTarget);

  if (direction.lengthSq() === 0) {
    direction.set(0, 0, 1);
  } else {
    direction.normalize();
  }

  return {
    target,
    position: target.clone().addScaledVector(direction, distance),
  };
}
