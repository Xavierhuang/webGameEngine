# Editor Focus Shortcut Design

## Goal

Add an `F` keyboard shortcut to the scene editor that frames the selected object in the 3D viewport. When no object is selected, the shortcut frames every renderable object in the current scene.

## Behavior

- The shortcut runs only while the editor is in Scene mode.
- Plain `F` and `f` trigger framing; modified shortcuts such as Command-F or Control-F remain available to the browser.
- The shortcut is ignored while focus is inside an input, textarea, select, or editable element.
- With a selected object, the camera target moves to the center of that object's world-space bounds and the camera moves along its existing viewing direction until the complete bounds fit in view.
- With no selection, the same operation uses the combined world-space bounds of all renderable scene objects.
- Empty scenes and objects without usable bounds leave the camera unchanged.
- OrbitControls is updated after the camera and target change so subsequent orbiting uses the new center.

## Architecture

Keep the bounds and camera-distance calculation in a small pure helper so it can be tested without WebGL. A scene-side controller inside the Canvas will receive the current selection and scene state, collect the matching Three.js objects, calculate their combined `Box3`, and apply the framing result to the active camera and OrbitControls.

The editor-level keyboard listener will convert an eligible `F` keydown into a monotonically increasing focus request. The Canvas controller will react to that request using the latest selection and scene graph, avoiding direct camera access from outside React Three Fiber.

## Testing

- Unit-test the pure framing calculation for object center, fit distance, aspect ratio, and minimum distance.
- Test keyboard eligibility for plain `F`, modified keys, typing targets, and non-scene mode.
- Run the focused tests, the full test suite, TypeScript checks, and a production build.
- Verify manually in the live editor with a selected Minion and with no selection.
