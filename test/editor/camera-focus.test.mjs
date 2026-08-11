import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import cameraFocusModule from '../.build/lib/editor/cameraFocus.js';

const {
  calculatePerspectiveFrame,
  focusSceneCamera,
  listenForFocusShortcut,
  shouldHandleFocusShortcut,
} = cameraFocusModule;

let failures = 0;

function ok(condition, label) {
  if (condition) {
    console.log(`ok   ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL ${label}`);
  }
}

function eq(actual, expected, label) {
  ok(actual === expected, label);
}

function near(actual, expected, label, tolerance = 0.000001) {
  ok(actual.distanceTo(expected) < tolerance, label);
}

function nearNumber(actual, expected, label, tolerance = 0.000001) {
  ok(Math.abs(actual - expected) < tolerance, label);
}

function cameraOrientation(position, target) {
  const camera = new PerspectiveCamera();
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return camera.quaternion.clone();
}

function boundsFitInCamera(frame, bounds, verticalFovDegrees, aspect, orientation) {
  const halfVerticalFov = (verticalFovDegrees * Math.PI) / 360;
  const forward = new Vector3(0, 0, -1).applyQuaternion(orientation);
  const right = new Vector3(1, 0, 0).applyQuaternion(orientation);
  const up = new Vector3(0, 1, 0).applyQuaternion(orientation);
  const { min, max } = bounds;

  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        const cornerFromCamera = new Vector3(x, y, z).sub(frame.position);
        const depth = cornerFromCamera.dot(forward);

        if (depth <= 0
          || (frame.near !== undefined && depth < frame.near)
          || (frame.far !== undefined && depth > frame.far)
          || Math.abs(cornerFromCamera.dot(right)) > depth * Math.tan(halfVerticalFov) * aspect
          || Math.abs(cornerFromCamera.dot(up)) > depth * Math.tan(halfVerticalFov)) {
          return false;
        }
      }
    }
  }

  return true;
}

const plainDiv = { tagName: 'DIV', isContentEditable: false };
const input = { tagName: 'INPUT', isContentEditable: false };
const textarea = { tagName: 'TEXTAREA', isContentEditable: false };
const select = { tagName: 'SELECT', isContentEditable: false };
const contentEditable = { tagName: 'DIV', isContentEditable: true };

eq(shouldHandleFocusShortcut({ key: 'f', target: plainDiv }, 'scene'), true, 'plain F frames');
eq(shouldHandleFocusShortcut({ key: 'F', target: plainDiv }, 'scene'), true, 'uppercase F frames');
eq(shouldHandleFocusShortcut({ key: 'g', target: plainDiv }, 'scene'), false, 'unrelated plain key is ignored');
eq(shouldHandleFocusShortcut({ key: 'f', metaKey: true, target: plainDiv }, 'scene'), false, 'Command-F stays native');
eq(shouldHandleFocusShortcut({ key: 'f', ctrlKey: true, target: plainDiv }, 'scene'), false, 'Control-F stays native');
eq(shouldHandleFocusShortcut({ key: 'f', altKey: true, target: plainDiv }, 'scene'), false, 'Alt-F stays native');
eq(shouldHandleFocusShortcut({ key: 'f', shiftKey: true, target: plainDiv }, 'scene'), false, 'Shift-F stays native');
eq(shouldHandleFocusShortcut({ key: 'f', target: input }, 'scene'), false, 'typing is ignored');
eq(shouldHandleFocusShortcut({ key: 'f', target: textarea }, 'scene'), false, 'textarea typing is ignored');
eq(shouldHandleFocusShortcut({ key: 'f', target: select }, 'scene'), false, 'select typing is ignored');
eq(shouldHandleFocusShortcut({ key: 'f', target: contentEditable }, 'scene'), false, 'contenteditable typing is ignored');
eq(shouldHandleFocusShortcut({ key: 'f', target: plainDiv }, 'logic'), false, 'logic mode is ignored');

class KeydownTarget {
  listeners = new Set();

  addEventListener(type, listener) {
    if (type === 'keydown') this.listeners.add(listener);
  }

  removeEventListener(type, listener) {
    if (type === 'keydown') this.listeners.delete(listener);
  }

  dispatch(event) {
    for (const listener of this.listeners) listener(event);
  }
}

function focusKeyEvent(overrides = {}) {
  return {
    key: 'f',
    target: plainDiv,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...overrides,
  };
}

eq(typeof listenForFocusShortcut, 'function', 'focus keydown listener is available to the editor');
if (typeof listenForFocusShortcut === 'function') {
  const keydownTarget = new KeydownTarget();
  let focusRequests = 0;
  const stopListening = listenForFocusShortcut(
    keydownTarget,
    'scene',
    () => { focusRequests += 1; },
  );
  const keydown = focusKeyEvent();

  keydownTarget.dispatch(keydown);
  eq(focusRequests, 1, 'eligible keydown emits one focus request');
  eq(keydown.defaultPrevented, true, 'handled focus keydown prevents the browser default');

  keydownTarget.dispatch(focusKeyEvent({ target: input }));
  eq(focusRequests, 1, 'typing keydown does not emit a focus request');

  stopListening();
  keydownTarget.dispatch(focusKeyEvent());
  eq(focusRequests, 1, 'listener cleanup stops future focus requests');

  const stopReplacement = listenForFocusShortcut(
    keydownTarget,
    'scene',
    () => { focusRequests += 1; },
  );
  keydownTarget.dispatch(focusKeyEvent());
  eq(focusRequests, 2, 'replacement lifecycle emits only one request per keydown');
  stopReplacement();
}

function taggedBox(id, position, size) {
  const root = new Group();
  root.userData.gameObjectId = id;
  root.position.copy(position);
  root.add(new Mesh(new BoxGeometry(size.x, size.y, size.z), new MeshBasicMaterial()));
  return root;
}

function cameraRig({
  aspect = 16 / 9,
  far = 1000,
  near: nearPlane = 0.1,
  position = new Vector3(0, 5, 10),
  target: initialTarget = new Vector3(),
} = {}) {
  const focusCamera = new PerspectiveCamera(50, aspect, nearPlane, far);
  focusCamera.position.copy(position);
  focusCamera.lookAt(initialTarget);
  focusCamera.updateMatrixWorld(true);

  const controls = {
    target: initialTarget.clone(),
    updateCount: 0,
    update() {
      this.updateCount += 1;
      focusCamera.lookAt(this.target);
      focusCamera.updateMatrixWorld(true);
    },
  };

  return { camera: focusCamera, controls };
}

eq(typeof focusSceneCamera, 'function', 'scene camera focus operation is available to SceneView');
if (typeof focusSceneCamera === 'function') {
  const focusScene = new Scene();
  focusScene.add(taggedBox('selected', new Vector3(10, 0, 0), new Vector3(2, 2, 2)));
  focusScene.add(taggedBox('other', new Vector3(-10, 0, 0), new Vector3(4, 4, 4)));
  const editorOnlyObject = new Mesh(new BoxGeometry(100, 100, 100), new MeshBasicMaterial());
  editorOnlyObject.position.set(1000, 0, 0);
  focusScene.add(editorOnlyObject);

  const selectedRig = cameraRig();
  const selectedStart = selectedRig.camera.position.clone();
  eq(
    focusSceneCamera(focusScene, selectedRig.camera, selectedRig.controls, 'selected'),
    true,
    'selected object bounds produce a camera focus',
  );
  near(selectedRig.controls.target, new Vector3(10, 0, 0), 'selected focus targets only the selected bounds');
  ok(!selectedRig.camera.position.equals(selectedStart), 'selected focus moves the camera');
  eq(selectedRig.controls.updateCount, 1, 'selected focus updates OrbitControls once');

  const allRig = cameraRig();
  eq(
    focusSceneCamera(focusScene, allRig.camera, allRig.controls),
    true,
    'missing selection focuses all tagged renderable roots',
  );
  near(allRig.controls.target, new Vector3(-0.5, 0, 0), 'all-object focus unions only tagged renderable bounds');
  eq(allRig.controls.updateCount, 1, 'all-object focus updates OrbitControls once');

  const missingRig = cameraRig();
  const missingPosition = missingRig.camera.position.clone();
  eq(
    focusSceneCamera(focusScene, missingRig.camera, missingRig.controls, 'missing'),
    false,
    'unmatched selection reports that no focus was applied',
  );
  near(missingRig.camera.position, missingPosition, 'unmatched selection leaves the camera unchanged');
  eq(missingRig.controls.updateCount, 0, 'unmatched selection does not update OrbitControls');

  const emptyRig = cameraRig();
  const emptyPosition = emptyRig.camera.position.clone();
  const emptyTarget = emptyRig.controls.target.clone();
  const emptyProjection = emptyRig.camera.projectionMatrix.clone();
  eq(
    focusSceneCamera(new Scene(), emptyRig.camera, emptyRig.controls),
    false,
    'empty scene reports that no focus was applied',
  );
  near(emptyRig.camera.position, emptyPosition, 'empty scene leaves the camera position unchanged');
  near(emptyRig.controls.target, emptyTarget, 'empty scene leaves the controls target unchanged');
  ok(emptyRig.camera.projectionMatrix.equals(emptyProjection), 'empty scene leaves clipping projection unchanged');
  eq(emptyRig.controls.updateCount, 0, 'empty scene does not update OrbitControls');

  const tinyScene = new Scene();
  const tinyRoot = taggedBox(
    'tiny',
    new Vector3(),
    new Vector3(0.000002, 0.000002, 0.000002),
  );
  tinyScene.add(tinyRoot);
  const tinyRig = cameraRig();
  const tinyProjection = tinyRig.camera.projectionMatrix.clone();
  focusSceneCamera(tinyScene, tinyRig.camera, tinyRig.controls);
  const tinyWorldBounds = new Box3().setFromObject(tinyRoot);
  ok(tinyRig.camera.near < 0.1, 'tiny focus lowers the camera near plane');
  ok(!tinyRig.camera.projectionMatrix.equals(tinyProjection), 'near-plane change updates the camera projection');
  ok(
    boundsFitInCamera(
      { position: tinyRig.camera.position, near: tinyRig.camera.near, far: tinyRig.camera.far },
      tinyWorldBounds,
      tinyRig.camera.fov,
      tinyRig.camera.aspect,
      tinyRig.camera.quaternion,
    ),
    'tiny focused bounds remain inside the applied clipping volume',
  );

  const hugeScene = new Scene();
  const hugeRoot = taggedBox('huge', new Vector3(), new Vector3(10000, 2000, 8000));
  hugeScene.add(hugeRoot);
  const hugeRig = cameraRig();
  focusSceneCamera(hugeScene, hugeRig.camera, hugeRig.controls);
  const hugeWorldBounds = new Box3().setFromObject(hugeRoot);
  ok(hugeRig.camera.far > 1000, 'large focus raises the camera far plane');
  ok(
    boundsFitInCamera(
      { position: hugeRig.camera.position, near: hugeRig.camera.near, far: hugeRig.camera.far },
      hugeWorldBounds,
      hugeRig.camera.fov,
      hugeRig.camera.aspect,
      hugeRig.camera.quaternion,
    ),
    'large focused bounds remain inside the applied clipping volume',
  );

  const poleScene = new Scene();
  const poleRoot = taggedBox('pole', new Vector3(), new Vector3(0.2, 0.2, 40));
  poleScene.add(poleRoot);
  const poleRig = cameraRig({ aspect: 0.5, position: new Vector3(0.01, 10, 0) });
  focusSceneCamera(poleScene, poleRig.camera, poleRig.controls);
  ok(
    boundsFitInCamera(
      { position: poleRig.camera.position, near: poleRig.camera.near, far: poleRig.camera.far },
      new Box3().setFromObject(poleRoot),
      poleRig.camera.fov,
      poleRig.camera.aspect,
      poleRig.camera.quaternion,
    ),
    'SceneView focus passes the near-pole camera orientation through the fit',
  );
}

const bounds = new Box3(new Vector3(-1, -2, -1), new Vector3(1, 2, 1));
const camera = new Vector3(0, 5, 10);
const target = new Vector3(0, 0, 0);
const orientation = cameraOrientation(camera, target);
const result = calculatePerspectiveFrame(bounds, camera, target, 50, 16 / 9, undefined, orientation);

ok(result !== null, 'non-empty bounds produce a frame');
if (result) {
  near(result.target, new Vector3(0, 0, 0), 'bounds center becomes the target');
  ok(result.position.clone().sub(result.target).normalize().dot(new Vector3(0, 5, 10).normalize()) > 0.999, 'view direction is preserved');
  ok(boundsFitInCamera(result, bounds, 50, 16 / 9, orientation), 'complete bounds fit');
}

const unitCube = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
const depthCamera = new Vector3(0, 0, 10);
const depthOrientation = cameraOrientation(depthCamera, target);
const depthFrame = calculatePerspectiveFrame(unitCube, depthCamera, target, 50, 1, undefined, depthOrientation);
ok(depthFrame && boundsFitInCamera(depthFrame, unitCube, 50, 1, depthOrientation), 'nearer cube corners fit after depth projection');
if (depthFrame) {
  nearNumber(
    depthFrame.position.distanceTo(depthFrame.target),
    3.4589576125605146,
    'unit cube uses the bounded padded fit distance',
  );
}

const rotatedBounds = new Box3(new Vector3(-4, -4, -4), new Vector3(4, 4, 4));
const rotatedCamera = new Vector3(6, 4, 8);
const rotatedOrientation = cameraOrientation(rotatedCamera, target);
const rotatedFrame = calculatePerspectiveFrame(rotatedBounds, rotatedCamera, target, 50, 1, undefined, rotatedOrientation);
ok(rotatedFrame && boundsFitInCamera(rotatedFrame, rotatedBounds, 50, 1, rotatedOrientation), 'rotated camera frames every projected corner');

const portraitBounds = new Box3(new Vector3(-5, -1, -1), new Vector3(5, 1, 1));
const portraitFrame = calculatePerspectiveFrame(portraitBounds, depthCamera, target, 50, 0.5, undefined, depthOrientation);
ok(portraitFrame && boundsFitInCamera(portraitFrame, portraitBounds, 50, 0.5, depthOrientation), 'portrait camera frames the horizontal extent');

const nearPoleCamera = new Vector3(0.01, 10, 0);
const nearPoleOrientation = cameraOrientation(nearPoleCamera, target);
const nearPoleBounds = new Box3(new Vector3(-0.1, -0.1, -20), new Vector3(0.1, 0.1, 20));
const nearPoleFrame = calculatePerspectiveFrame(
  nearPoleBounds,
  nearPoleCamera,
  target,
  50,
  0.5,
  undefined,
  nearPoleOrientation,
);
ok(
  nearPoleFrame && boundsFitInCamera(nearPoleFrame, nearPoleBounds, 50, 0.5, nearPoleOrientation),
  'near-pole framing uses the camera screen orientation',
);

const fallbackOrientation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
const fallbackFrame = calculatePerspectiveFrame(unitCube, target, target, 50, 1, undefined, fallbackOrientation);
const fallbackBackward = new Vector3(0, 0, 1).applyQuaternion(fallbackOrientation);
ok(
  fallbackFrame
    && fallbackFrame.position.clone().sub(fallbackFrame.target).normalize().dot(fallbackBackward) > 0.999,
  'coincident camera and target fall back to the camera orientation',
);

const tinyBounds = new Box3(
  new Vector3(-0.000001, -0.000001, -0.000001),
  new Vector3(0.000001, 0.000001, 0.000001),
);
const tinyFrame = calculatePerspectiveFrame(tinyBounds, depthCamera, target, 50, 1, undefined, depthOrientation);
ok(tinyFrame && tinyFrame.position.distanceTo(tinyFrame.target) >= 0.001, 'tiny bounds keep a stable minimum camera distance');
ok(
  tinyFrame
    && tinyFrame.near > 0
    && tinyFrame.far > tinyFrame.near
    && boundsFitInCamera(tinyFrame, tinyBounds, 50, 1, depthOrientation),
  'tiny bounds receive clipping planes that contain every corner',
);

const hugeBounds = new Box3(new Vector3(-5000, -1000, -4000), new Vector3(5000, 1000, 4000));
const hugeFrame = calculatePerspectiveFrame(hugeBounds, depthCamera, target, 50, 1, undefined, depthOrientation);
ok(
  hugeFrame
    && hugeFrame.far > 1000
    && boundsFitInCamera(hugeFrame, hugeBounds, 50, 1, depthOrientation),
  'large dispersed bounds receive a far plane beyond every corner',
);

eq(calculatePerspectiveFrame(new Box3(), camera, target, 50, 1), null, 'empty bounds do nothing');
eq(calculatePerspectiveFrame(new Box3(new Vector3(NaN, 0, 0), new Vector3(1, 1, 1)), camera, target, 50, 1), null, 'NaN bounds do nothing');
eq(calculatePerspectiveFrame(new Box3(new Vector3(-Infinity, 0, 0), new Vector3(1, 1, 1)), camera, target, 50, 1), null, 'infinite bounds do nothing');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
