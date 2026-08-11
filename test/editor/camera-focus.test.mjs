import { Box3, Vector3 } from 'three';
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

function boundsFitAtDistance(frame, bounds, verticalFovDegrees, aspect) {
  const size = bounds.getSize(new Vector3());
  const halfVerticalFov = (verticalFovDegrees * Math.PI) / 360;
  const verticalHalfExtent = Math.max(size.y / 2, size.z / 2);
  const horizontalHalfExtent = Math.max(size.x / 2, size.z / 2);
  const distance = frame.position.distanceTo(frame.target);

  return distance * Math.tan(halfVerticalFov) >= verticalHalfExtent
    && distance * Math.tan(halfVerticalFov) * aspect >= horizontalHalfExtent;
}

const plainDiv = { tagName: 'DIV', isContentEditable: false };
const input = { tagName: 'INPUT', isContentEditable: false };

eq(shouldHandleFocusShortcut({ key: 'f', target: plainDiv }, 'scene'), true, 'plain F frames');
eq(shouldHandleFocusShortcut({ key: 'f', metaKey: true, target: plainDiv }, 'scene'), false, 'Command-F stays native');
eq(shouldHandleFocusShortcut({ key: 'f', target: input }, 'scene'), false, 'typing is ignored');
eq(shouldHandleFocusShortcut({ key: 'f', target: plainDiv }, 'logic'), false, 'logic mode is ignored');

const bounds = new Box3(new Vector3(-1, -2, -1), new Vector3(1, 2, 1));
const camera = new Vector3(0, 5, 10);
const target = new Vector3(0, 0, 0);
const result = calculatePerspectiveFrame(bounds, camera, target, 50, 16 / 9);

ok(result !== null, 'non-empty bounds produce a frame');
if (result) {
  near(result.target, new Vector3(0, 0, 0), 'bounds center becomes the target');
  ok(result.position.clone().sub(result.target).normalize().dot(new Vector3(0, 5, 10).normalize()) > 0.999, 'view direction is preserved');
  ok(boundsFitAtDistance(result, bounds, 50, 16 / 9), 'complete bounds fit');
}
eq(calculatePerspectiveFrame(new Box3(), camera, target, 50, 1), null, 'empty bounds do nothing');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
