import { Box3, Vector3 } from 'three';
import { readFileSync } from 'node:fs';
import {
  calculatePerspectiveFrame,
  shouldHandleFocusShortcut,
} from '../.build/lib/editor/cameraFocus.js';

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

const gameEditorSource = readFileSync(
  new URL('../../components/editor/GameEditor.tsx', import.meta.url),
  'utf8',
);
const sceneViewSource = readFileSync(
  new URL('../../components/editor/SceneView.tsx', import.meta.url),
  'utf8',
);

ok(
  gameEditorSource.includes('shouldHandleFocusShortcut(e, editorMode)'),
  'GameEditor checks whether F should request focus',
);
ok(
  gameEditorSource.includes('setFocusRequest((request) => request + 1)'),
  'GameEditor increments the focus request',
);
ok(
  gameEditorSource.includes('focusRequest={focusRequest}'),
  'GameEditor passes the focus request to SceneView',
);
ok(
  sceneViewSource.includes('<group userData={{ gameObjectId: object.id }}>{content}</group>'),
  'SceneView tags only rendered object content, excluding editor controls',
);
ok(
  sceneViewSource.includes('<CameraFocusController'),
  'SceneView mounts the camera focus controller',
);

function boundsFitInCamera(frame, bounds, verticalFovDegrees, aspect) {
  const halfVerticalFov = (verticalFovDegrees * Math.PI) / 360;
  const forward = frame.target.clone().sub(frame.position).normalize();
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(right, forward).normalize();
  const { min, max } = bounds;

  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        const cornerFromCamera = new Vector3(x, y, z).sub(frame.position);
        const depth = cornerFromCamera.dot(forward);

        if (depth <= 0
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
eq(shouldHandleFocusShortcut({ key: 'f', metaKey: true, target: plainDiv }, 'scene'), false, 'Command-F stays native');
eq(shouldHandleFocusShortcut({ key: 'f', ctrlKey: true, target: plainDiv }, 'scene'), false, 'Control-F stays native');
eq(shouldHandleFocusShortcut({ key: 'f', altKey: true, target: plainDiv }, 'scene'), false, 'Alt-F stays native');
eq(shouldHandleFocusShortcut({ key: 'f', shiftKey: true, target: plainDiv }, 'scene'), false, 'Shift-F stays native');
eq(shouldHandleFocusShortcut({ key: 'f', target: input }, 'scene'), false, 'typing is ignored');
eq(shouldHandleFocusShortcut({ key: 'f', target: textarea }, 'scene'), false, 'textarea typing is ignored');
eq(shouldHandleFocusShortcut({ key: 'f', target: select }, 'scene'), false, 'select typing is ignored');
eq(shouldHandleFocusShortcut({ key: 'f', target: contentEditable }, 'scene'), false, 'contenteditable typing is ignored');
eq(shouldHandleFocusShortcut({ key: 'f', target: plainDiv }, 'logic'), false, 'logic mode is ignored');

const bounds = new Box3(new Vector3(-1, -2, -1), new Vector3(1, 2, 1));
const camera = new Vector3(0, 5, 10);
const target = new Vector3(0, 0, 0);
const result = calculatePerspectiveFrame(bounds, camera, target, 50, 16 / 9);

ok(result !== null, 'non-empty bounds produce a frame');
if (result) {
  near(result.target, new Vector3(0, 0, 0), 'bounds center becomes the target');
  ok(result.position.clone().sub(result.target).normalize().dot(new Vector3(0, 5, 10).normalize()) > 0.999, 'view direction is preserved');
  ok(boundsFitInCamera(result, bounds, 50, 16 / 9), 'complete bounds fit');
}

const unitCube = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
const depthFrame = calculatePerspectiveFrame(unitCube, new Vector3(0, 0, 10), target, 50, 1);
ok(depthFrame && boundsFitInCamera(depthFrame, unitCube, 50, 1), 'nearer cube corners fit after depth projection');

const rotatedBounds = new Box3(new Vector3(-4, -4, -4), new Vector3(4, 4, 4));
const rotatedFrame = calculatePerspectiveFrame(rotatedBounds, new Vector3(6, 4, 8), target, 50, 1);
ok(rotatedFrame && boundsFitInCamera(rotatedFrame, rotatedBounds, 50, 1), 'rotated camera frames every projected corner');

eq(calculatePerspectiveFrame(new Box3(), camera, target, 50, 1), null, 'empty bounds do nothing');
eq(calculatePerspectiveFrame(new Box3(new Vector3(NaN, 0, 0), new Vector3(1, 1, 1)), camera, target, 50, 1), null, 'NaN bounds do nothing');
eq(calculatePerspectiveFrame(new Box3(new Vector3(-Infinity, 0, 0), new Vector3(1, 1, 1)), camera, target, 50, 1), null, 'infinite bounds do nothing');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
