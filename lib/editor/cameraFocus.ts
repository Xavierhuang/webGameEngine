import { Box3, Object3D, PerspectiveCamera, Quaternion, Vector3 } from 'three';

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
const MIN_FRAME_DISTANCE = 0.001;

function isFiniteVector(vector: Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}

function isFiniteQuaternion(quaternion: Quaternion): boolean {
  return Number.isFinite(quaternion.x)
    && Number.isFinite(quaternion.y)
    && Number.isFinite(quaternion.z)
    && Number.isFinite(quaternion.w);
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

export function listenForFocusShortcut(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  editorMode: string,
  onFocusRequest: () => void,
): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!shouldHandleFocusShortcut(event, editorMode)) return;

    event.preventDefault();
    onFocusRequest();
  };

  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}

export function calculatePerspectiveFrame(
  bounds: Box3,
  cameraPosition: Vector3,
  currentTarget: Vector3,
  verticalFovDegrees: number,
  aspect: number,
  padding = FRAME_PADDING,
  cameraOrientation?: Quaternion,
): { target: Vector3; position: Vector3; near: number; far: number } | null {
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
    || padding <= 0
    || (cameraOrientation !== undefined && !isFiniteQuaternion(cameraOrientation))) {
    return null;
  }

  const target = bounds.getCenter(new Vector3());
  const halfVerticalFov = (verticalFovDegrees * Math.PI) / 360;
  const tangent = Math.tan(halfVerticalFov);
  const backward = cameraPosition.clone().sub(currentTarget);

  if (backward.lengthSq() === 0) {
    backward.set(0, 0, 1);
    if (cameraOrientation) backward.applyQuaternion(cameraOrientation);
    backward.normalize();
  } else {
    backward.normalize();
  }

  const forward = backward.clone().negate();
  const up = cameraOrientation
    ? new Vector3(0, 1, 0).applyQuaternion(cameraOrientation)
    : (Math.abs(forward.y) < 0.999 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1));
  up.addScaledVector(forward, -up.dot(forward));

  let right: Vector3;
  if (up.lengthSq() > Number.EPSILON) {
    up.normalize();
    right = new Vector3().crossVectors(forward, up).normalize();
  } else {
    right = cameraOrientation
      ? new Vector3(1, 0, 0).applyQuaternion(cameraOrientation)
      : new Vector3(1, 0, 0);
    right.addScaledVector(forward, -right.dot(forward)).normalize();
  }
  up.crossVectors(right, forward).normalize();

  const horizontalTangent = tangent * aspect;
  const { min, max } = bounds;
  let requiredDistance = 0;
  const offsets: Vector3[] = [];

  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        const offset = new Vector3(x, y, z).sub(target);
        offsets.push(offset);
        const forwardOffset = offset.dot(forward);

        requiredDistance = Math.max(
          requiredDistance,
          Math.abs(offset.dot(right)) / horizontalTangent - forwardOffset,
          Math.abs(offset.dot(up)) / tangent - forwardOffset,
          -forwardOffset,
        );
      }
    }
  }

  const distance = Math.max(
    MIN_FRAME_DISTANCE,
    requiredDistance + MIN_FRAME_DISTANCE,
    requiredDistance * padding,
  );
  let minimumDepth = Infinity;
  let maximumDepth = 0;

  for (const offset of offsets) {
    const depth = distance + offset.dot(forward);
    minimumDepth = Math.min(minimumDepth, depth);
    maximumDepth = Math.max(maximumDepth, depth);
  }

  const near = minimumDepth * 0.5;
  const far = Math.max(maximumDepth * 1.5, near * 2);

  if (!Number.isFinite(distance)
    || !Number.isFinite(near)
    || !Number.isFinite(far)
    || near <= 0
    || far <= near) {
    return null;
  }

  return {
    target,
    position: target.clone().addScaledVector(backward, distance),
    near,
    far,
  };
}

type CameraFocusControls = {
  target: Vector3;
  update: () => void;
};

export function focusSceneCamera(
  scene: Object3D,
  camera: PerspectiveCamera,
  controls: CameraFocusControls,
  selectedObjectId?: string | number,
): boolean {
  const bounds = new Box3();

  scene.traverse((object) => {
    const gameObjectId = object.userData.gameObjectId;
    if (gameObjectId === undefined
      || (selectedObjectId !== undefined && gameObjectId !== selectedObjectId)) {
      return;
    }

    const objectBounds = new Box3().setFromObject(object);
    if (!objectBounds.isEmpty()) bounds.union(objectBounds);
  });

  const frame = calculatePerspectiveFrame(
    bounds,
    camera.position,
    controls.target,
    camera.fov,
    camera.aspect,
    undefined,
    camera.quaternion,
  );
  if (!frame) return false;

  camera.position.copy(frame.position);
  controls.target.copy(frame.target);
  camera.near = Number.isFinite(camera.near) && camera.near > 0
    ? Math.min(camera.near, frame.near)
    : frame.near;
  camera.far = Number.isFinite(camera.far) && camera.far > camera.near
    ? Math.max(camera.far, frame.far)
    : frame.far;
  camera.updateProjectionMatrix();
  controls.update();
  return true;
}
