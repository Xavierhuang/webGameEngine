# Editor Focus Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `F` shortcut that frames the selected scene object, or all scene objects when nothing is selected.

**Architecture:** A pure camera-focus module owns shortcut eligibility and perspective-camera fit calculations. `SceneView` tags each rendered game-object root and hosts a React Three Fiber controller that derives world bounds and updates the camera plus OrbitControls when `GameEditor` emits a focus request.

**Tech Stack:** TypeScript, React 18, React Three Fiber, Three.js, OrbitControls, Node-based focused tests

## Global Constraints

- Run only in Scene mode.
- Handle plain `F`/`f`; preserve Command-F, Control-F, Alt-F, and Shift-F.
- Ignore the shortcut in input, textarea, select, and contenteditable targets.
- Preserve the current camera viewing direction.
- Frame the selected object's complete world-space bounds, or all renderable game objects when none is selected.
- Empty or unusable bounds must leave the camera unchanged.

---

### Task 1: Pure Shortcut and Camera-Framing Logic

**Files:**
- Create: `lib/editor/cameraFocus.ts`
- Create: `test/editor/camera-focus.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `shouldHandleFocusShortcut(event, editorMode): boolean`
- Produces: `calculatePerspectiveFrame(bounds, cameraPosition, currentTarget, verticalFovDegrees, aspect, padding?): { target: Vector3; position: Vector3 } | null`

- [ ] **Step 1: Add failing focused tests**

Create tests that compile and import the pure module, then assert:

```js
eq(shouldHandleFocusShortcut({ key: 'f', target: plainDiv }, 'scene'), true, 'plain F frames');
eq(shouldHandleFocusShortcut({ key: 'f', metaKey: true, target: plainDiv }, 'scene'), false, 'Command-F stays native');
eq(shouldHandleFocusShortcut({ key: 'f', target: input }, 'scene'), false, 'typing is ignored');
eq(shouldHandleFocusShortcut({ key: 'f', target: plainDiv }, 'logic'), false, 'logic mode is ignored');

const result = calculatePerspectiveFrame(
  new Box3(new Vector3(-1, -2, -1), new Vector3(1, 2, 1)),
  new Vector3(0, 5, 10),
  new Vector3(0, 0, 0),
  50,
  16 / 9,
);
near(result.target, new Vector3(0, 0, 0));
ok(result.position.clone().sub(result.target).normalize().dot(new Vector3(0, 5, 10).normalize()) > 0.999, 'view direction is preserved');
ok(boundsFitAtDistance(result, bounds, 50, 16 / 9), 'complete bounds fit');
eq(calculatePerspectiveFrame(new Box3(), camera, target, 50, 1), null, 'empty bounds do nothing');
```

Add `test:camera-focus` to compile `lib/editor/cameraFocus.ts` into `test/.build` and run `test/editor/camera-focus.test.mjs`; include it in `test:all`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm run test:camera-focus`

Expected: FAIL because `lib/editor/cameraFocus.ts` does not exist or its exports are missing.

- [ ] **Step 3: Implement the minimal pure helper**

Implement shortcut filtering using the event key, modifier flags, editor mode, and the target element's tag/contenteditable state. Implement perspective fitting by taking the bounds center and size, calculating the vertical and horizontal fit distances from the camera FOV/aspect, applying a small padding factor, and placing the camera along the normalized vector from the current OrbitControls target to the current camera position. Use a stable fallback direction when that vector has zero length.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npm run test:camera-focus`

Expected: all camera-focus assertions pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/editor/cameraFocus.ts test/editor/camera-focus.test.mjs package.json
git commit -m "feat: add camera focus calculations"
```

---

### Task 2: Wire Focusing into the Scene Editor

**Files:**
- Modify: `components/editor/GameEditor.tsx`
- Modify: `components/editor/SceneView.tsx`
- Modify: `test/editor/camera-focus.test.mjs`

**Interfaces:**
- Consumes: `shouldHandleFocusShortcut(...)` and `calculatePerspectiveFrame(...)` from Task 1
- Produces: `SceneView` prop `focusRequest: number`
- Produces: rendered object roots tagged with `userData.gameObjectId`

- [ ] **Step 1: Extend the focused test with source-level wiring assertions**

Assert that `GameEditor.tsx` calls `shouldHandleFocusShortcut`, increments a focus request, and passes it to `SceneView`; assert that `SceneView.tsx` tags object roots with `gameObjectId` and mounts its camera-focus controller. These assertions must fail before production wiring is added.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm run test:camera-focus`

Expected: FAIL on missing editor/scene wiring.

- [ ] **Step 3: Add the editor keyboard request**

In `GameEditor`, add `focusRequest` state. Extend the existing keydown effect so an eligible `F` prevents the default and increments the request. Keep undo/redo behavior unchanged and pass `focusRequest` into `SceneView`.

- [ ] **Step 4: Add the Canvas focus controller**

Wrap each visible `GameObject` in a group tagged with `userData={{ gameObjectId: obj.id }}`. Add a controller inside `SceneView` that uses `useThree()` to access the active camera and canvas scene, reacts to changes in `focusRequest`, finds the tagged group for the selected ID or all tagged groups, unions non-empty `Box3` bounds, calls `calculatePerspectiveFrame`, writes `camera.position` and `orbitRef.current.target`, updates the projection matrix, and calls `orbitRef.current.update()`.

- [ ] **Step 5: Run the focused test and confirm GREEN**

Run: `npm run test:camera-focus`

Expected: all helper and integration assertions pass.

- [ ] **Step 6: Run static and regression verification**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run test:all`

Expected: all suites pass.

Run: `npm run build`

Expected: production build succeeds.

- [ ] **Step 7: Verify in the live editor**

Open a project containing the Minion. Select the Minion, orbit/pan away, press `F`, and confirm it is centered and fully visible. Deselect it, move the camera away, press `F`, and confirm all scene objects are framed. Focus a text input and confirm typing `f` does not move the camera. Confirm the browser console has no errors.

- [ ] **Step 8: Commit Task 2**

```bash
git add components/editor/GameEditor.tsx components/editor/SceneView.tsx test/editor/camera-focus.test.mjs
git commit -m "feat: frame scene objects with F"
```
