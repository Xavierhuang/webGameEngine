'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, useGLTF } from '@react-three/drei';
import { useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, Save, Undo2, Redo2, Move3D, Maximize2, RotateCw, Share2, GraduationCap } from 'lucide-react';
import { ShareDialog } from './ShareDialog';
import { LogoMark } from '../common/AppNav';
import Toolbar from './Toolbar';
import ObjectsPanel from './ObjectsPanel';
import SceneTabs from './SceneTabs';
import BackdropSelector from './BackdropSelector';
import { TutorialPanel } from '../tutorials/TutorialPanel';
import SceneView from './SceneView';
import PropertiesPanel from './PropertiesPanel';
import AIAssistant from './AIAssistant';
import CharacterSelector from './CharacterSelector';
import CollectibleSelector from './CollectibleSelector';
import ObstacleSelector from './ObstacleSelector';
import SoundSelector from './SoundSelector';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { PICKER_CHARACTERS } from '../../lib/prefabs/characters';
import { useTranslator } from '../common/LocaleProvider';
import { buildCharacterVisual } from '../../lib/prefabs/characterPayload';
import { listenForFocusShortcut } from '../../lib/editor/cameraFocus';
import { SceneLights } from '@/components/three/SceneLights';
import {
  LIGHTING_PRESETS,
  DEFAULT_PRESET,
  readScenePreset,
  writeScenePreset,
  type LightingPresetId,
} from '@/lib/scene/lightingPresets';
import { commandWrite, commandServiceCall, newEditingSessionId, newObjectId } from '@/lib/editor/commandWrite';

// Blockly needs the DOM — load the block editor client-side only.
/**
 * The stage shown beside the blocks. Loaded on demand and never on the server:
 * it is the full 3D player, and the Scene tab should not pay for it.
 */
const StagePreview = dynamic(
  () => import('../player/GamePlayer').then((m) => {
    const Player = m.default;
    const Compact = (props: any) => <Player {...props} compact />;
    Compact.displayName = 'StagePreview';
    return Compact;
  }),
  { ssr: false, loading: () => <div className="h-full w-full bg-slate-900" /> }
);

const BlockEditor = dynamic(() => import('./BlockEditor'), {
  ssr: false,
  // Loading fallback shown for <1s while the code-split chunk loads. Kept as
  // an English literal because `dynamic`'s loading callback runs outside any
  // component's render, so `useTranslator()` can't be called here. The spinner
  // does most of the communication.
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500 text-sm">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
        Loading…
      </div>
    </div>
  ),
});

interface GameEditorProps {
  projectId: string;
  initialData?: any;
}

// Helper function to get default properties for each object type
const getObjectDefaults = (type: string) => {
  const defaults: Record<string, any> = {
    character: {
      shape: 'box',
      color: '#60A5FA', // blue
      size: 50,
    },
    platform: {
      shape: 'plane',
      color: '#166534', // dark green
      size: { width: 2000, height: 2000 }, // taller (depth) ground by default (pixels)
    },
    /*
     * A placed effect. `shape: 'particles'` is what tells the editor and the
     * player to render an emitter here instead of a mesh — there is no
     * geometry, only the particle cloud.
     */
    particles: {
      shape: 'particles',
      color: '#F59E0B',
      size: 100,
      effect: 'sparkle',
      particleSize: 100,
      particleAmount: 100,
    },
    collectible: {
      shape: 'sphere',
      color: '#FBBF24', // yellow
      size: 30,
    },
    obstacle: {
      shape: 'box',
      color: '#EF4444', // red
      size: 50,
    },
    sprite: {
      shape: 'box',
      color: '#A78BFA', // purple
      size: 50,
    },
    sound: {
      shape: 'box',
      color: '#F472B6', // pink
      size: 40,
    },
  };
  return defaults[type] || defaults.sprite;
};

/** Marks that the first-run tutorial nudge has been shown. */
const FIRST_RUN_KEY = 'lingplay-tutorials-introduced';

export default function GameEditor({ projectId, initialData }: GameEditorProps) {
  const t = useTranslator();
  const [project, setProject] = useState<any>(initialData);
  // Task 4 compat: every project-graph write sends `If-Match: "<revision>"`.
  // useRef gives us the exact `{ current: number }` shape `commandWrite`
  // expects, and its identity is stable across renders so the ref can be
  // mutated in place from the server response.
  const revisionRef = useRef<number>(initialData?.revision ?? 0);
  const editingSessionIdRef = useRef<string>(newEditingSessionId());
  const [currentScene, setCurrentScene] = useState<any>(null);
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [editorMode, setEditorMode] = useState<'scene' | 'logic'>('scene');
  /** Bumping this remounts the stage, which is how Restart works there. */
  const [stageNonce, setStageNonce] = useState(0);
  const [objectHistory, setObjectHistory] = useState<Array<{ id: string; objectId: string; action: string; payload: any; at: number }>>([]);
  const [history, setHistory] = useState<{ past: any[]; future: any[] }>({ past: [], future: [] });
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showCharacterSelector, setShowCharacterSelector] = useState(false);
  const [showCollectibleSelector, setShowCollectibleSelector] = useState(false);
  const [showObstacleSelector, setShowObstacleSelector] = useState(false);
  const [showSoundSelector, setShowSoundSelector] = useState(false);
  const [transformMode, setTransformMode] = useState<'translate' | 'scale' | 'rotate'>('translate');
  // Snap-to-grid for the transform gizmo. On by default because a kid
  // aiming for "put Hero on the ground" wants Y=0, not Y=-1.837. Persisted
  // so a user who prefers free-drag stays that way across sessions.
  const [snapEnabled, setSnapEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try { return window.localStorage.getItem('lingplay.snapEnabled') !== '0'; }
    catch { return true; }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem('lingplay.snapEnabled', snapEnabled ? '1' : '0'); }
    catch { /* private mode, ignore */ }
  }, [snapEnabled]);
  // Lighting preset for the current scene — persisted per scene ID in
  // localStorage. Read on scene switch; write on picker change.
  const [lightingPreset, setLightingPreset] = useState<LightingPresetId>(DEFAULT_PRESET);
  useEffect(() => {
    if (!currentScene?.id) return;
    setLightingPreset(readScenePreset(currentScene.id));
  }, [currentScene?.id]);
  const applyLightingPreset = (preset: LightingPresetId) => {
    setLightingPreset(preset);
    if (currentScene?.id) writeScenePreset(currentScene.id, preset);
  };
  const [focusRequest, setFocusRequest] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showBackdropSelector, setShowBackdropSelector] = useState(false);
  const [showTutorials, setShowTutorials] = useState(false);
  // Properties panel occupies a full sidebar (w-80) — a lot of horizontal
  // real estate on smaller laptops. Persist the collapsed state in
  // localStorage so a user who prefers the compact stage doesn't have to
  // hide it on every visit.
  const [propertiesCollapsed, setPropertiesCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem('lingplay.propertiesCollapsed') === '1'; }
    catch { return false; }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem('lingplay.propertiesCollapsed', propertiesCollapsed ? '1' : '0'); }
    catch { /* private mode, ignore */ }
  }, [propertiesCollapsed]);

  /**
   * Open the tutorials once, for someone who has never seen them.
   *
   * A first-time child landed in an empty editor with no idea where to start;
   * the tutorials existed but nothing pointed at them, and the Learn button is
   * easy to miss among Save/Share/Play. Scratch opens its tutorial panel on
   * first entry for the same reason.
   *
   * Strictly once ever, not once per project — it is a nudge, not a nag. The
   * flag is written as soon as the panel opens, so closing it, reloading, or
   * creating a second project will not bring it back. The Learn button is
   * still there whenever they want it.
   *
   * Set from an effect rather than in the initial state on purpose:
   * localStorage does not exist on the server, and seeding state from it would
   * make the server and client disagree about whether the panel is open.
   */
  useEffect(() => {
    try {
      if (window.localStorage.getItem(FIRST_RUN_KEY)) return;
      window.localStorage.setItem(FIRST_RUN_KEY, String(Date.now()));
      setShowTutorials(true);
    } catch {
      /* private browsing: skip the nudge rather than show it every time */
    }
  }, []);
  const orbitRef = useRef<any>(null);

  /**
   * Warm the cache for the starters a child sees first — not all of them.
   *
   * This used to preload every starter GLB on mount. The comment said "~20";
   * it was 39 by the time anyone checked, which is 2.6 MB pulled down before
   * the child has clicked anything, on every single editor open. On school
   * wifi or a tablet that is the difference between an editor that opens and
   * one that hangs. It also scales exactly the wrong way: the library is the
   * thing we want to grow, and at 300 starters this would be ~20 MB.
   *
   * The picker loads the rest on demand, which is what it already did for
   * anything past the first screen anyway.
   */
  useEffect(() => {
    const FIRST_SCREEN = 8;
    let warmed = 0;
    for (const c of PICKER_CHARACTERS) {
      if (warmed >= FIRST_SCREEN) break;
      const url = c.model_url;
      if (!url) continue;
      const ext = url.split('.').pop()?.toLowerCase();
      if (ext === 'glb' || ext === 'gltf') {
        useGLTF.preload(url);
        warmed++;
      }
    }
  }, []);

  // Commit helper: push current project to history, set next project, reset future
  const commitProject = (nextProject: any) => {
    setHistory((h) => ({ past: [...h.past, project], future: [] }));
    setProject(nextProject);
    // Keep currentScene in sync
    if (nextProject?.scenes?.length > 0) {
      const nextScene =
        (currentScene && nextProject.scenes.find((s: any) => s.id === (currentScene as any).id)) ||
        nextProject.scenes[0];
      setCurrentScene(nextScene || null);
    }
  };

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const undo = () => {
    if (!canUndo) return;
    setHistory((h) => {
      const previous = h.past[h.past.length - 1];
      const newPast = h.past.slice(0, -1);
      // Current becomes first in future
      const newFuture = [project, ...h.future];
      setProject(previous);
      // Adjust currentScene reference
      if (previous?.scenes?.length > 0) {
        const nextScene =
          (currentScene && previous.scenes.find((s: any) => s.id === (currentScene as any).id)) ||
          previous.scenes[0];
        setCurrentScene(nextScene || null);
      }
      // Deselect selection on undo for safety
      setSelectedObject(null);
      return { past: newPast, future: newFuture };
    });
  };

  const redo = () => {
    if (!canRedo) return;
    setHistory((h) => {
      const [next, ...rest] = h.future;
      const newPast = [...h.past, project];
      setProject(next);
      if (next?.scenes?.length > 0) {
        const nextScene =
          (currentScene && next.scenes.find((s: any) => s.id === (currentScene as any).id)) ||
          next.scenes[0];
        setCurrentScene(nextScene || null);
      }
      setSelectedObject(null);
      return { past: newPast, future: rest };
    });
  };

  const logObjectAction = (objectId: string, action: string, payload: any) => {
    setObjectHistory((h) => [
      ...h,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, objectId, action, payload, at: Date.now() },
    ]);
  };

  useEffect(() => listenForFocusShortcut(
    window,
    editorMode,
    () => setFocusRequest((request) => request + 1),
  ), [editorMode]);

  // Duplicate the currently-selected object. Reuses the same
  // object.create shape as the toolbar / picker Add flows so the copy
  // lands in the same code path (interpreter, renderer, delete). Nudge
  // position +40 world units so the copy doesn't overlap the source
  // and the kid can see they got a new object.
  //
  // Logic blocks are copied via a follow-up PUT to /logic-blocks with
  // the source's rows repackaged as LogicBlock-shape entries — the
  // shape the save handler already accepts after `Fix logic-block
  // save`. Without this a duplicated Coin looks identical but has
  // none of the collection behaviour, which is exactly the
  // "why doesn't my copy work?" question we don't want to invite.
  const duplicateSelected = useCallback(async () => {
    if (!selectedObject?.id) return;
    const sceneId = currentScene?.id || project?.scenes?.[0]?.id;
    if (!sceneId) return;
    const src = selectedObject;
    const srcProps = typeof src.properties === 'string'
      ? (() => { try { return JSON.parse(src.properties || '{}'); } catch { return {}; } })()
      : (src.properties || {});
    const newId = newObjectId();
    const addedTo = objectIdsIn(sceneId);
    const response = await commandServiceCall({
      projectId,
      editingSessionId: editingSessionIdRef.current,
      revisionRef,
      command: {
        type: 'object.create',
        objectId: newId,
        sceneId,
        name: `${src.name ?? ''} ${t('editor.properties.copySuffix')}`.trim(),
        objectType: src.type,
        properties: {
          ...srcProps,
          position: {
            x: (src.position_x ?? 0) + 40,
            y: src.position_y ?? 0,
            z: (src.position_z ?? 0) + 40,
          },
        },
      },
    });
    if (!response.ok) return;
    // Copy the source's logic blocks onto the new object. Each source
    // row already carries `block_type` + `block_data` (raw JSON with
    // inputs/children); repackaging as LogicBlock shape means the save
    // handler writes them straight without re-serialization.
    const srcBlocks = Array.isArray(src.logic_blocks) ? src.logic_blocks : [];
    if (srcBlocks.length > 0) {
      const cloned = srcBlocks.map((row: any) => {
        const data = typeof row.block_data === 'string'
          ? (() => { try { return JSON.parse(row.block_data || '{}'); } catch { return {}; } })()
          : (row.block_data || {});
        return {
          ...data,
          block_type: row.block_type ?? data.block_type,
          // Drop the source id — a fresh one gets assigned on insert.
          id: undefined,
        };
      });
      try {
        const { commandWrite } = await import('@/lib/editor/commandWrite');
        await commandWrite({
          url: `/api/game-objects/${newId}/logic-blocks`,
          method: 'PUT',
          body: { blocks: cloned },
          revisionRef,
          editingSessionId: editingSessionIdRef.current,
          projectId,
        });
      } catch (e) {
        // Non-fatal: the duplicated object still exists visually; the
        // kid can re-add blocks if the copy step failed. Logged for
        // debugging but not surfaced — the primary duplicate worked.
        console.warn('[GameEditor] Duplicate: block-copy step failed:', e);
      }
    }
    const projectResponse = await fetch(`/api/projects/${projectId}`);
    if (projectResponse.ok) {
      const { project: updatedProject } = await projectResponse.json();
      commitProject(updatedProject);
      selectNewObject(addedTo, updatedProject, sceneId);
    }
  }, [selectedObject, currentScene, project, projectId, t]);

  // Keyboard shortcuts for undo/redo + duplicate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      // Skip when the user is typing in an input/textarea — ⌘D there
      // is the browser "bookmark this page" default and should stay.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, project, currentScene, duplicateSelected]);

  // Initialize current scene from initial data
  useEffect(() => {
    if (!currentScene && initialData?.scenes?.length > 0) {
      setCurrentScene(initialData.scenes[0]);
    }
  }, [initialData, currentScene]);

  // Keep current scene in sync when project changes
  useEffect(() => {
    if (project?.scenes?.length > 0) {
      if (!currentScene) {
        setCurrentScene(project.scenes[0]);
      } else {
        const updated = project.scenes.find((s: any) => s.id === (currentScene as any).id);
        if (updated) setCurrentScene(updated);
      }
    }
  }, [project]);

  // --- Scenes -------------------------------------------------------------
  // Until now every code path resolved to scenes[0] and there was no scenes
  // API, so projects were permanently single-scene.
  const addScene = async () => {
    try {
      const response = await commandWrite({
        url: '/api/scenes',
        method: 'POST',
        body: { projectId, name: `Scene ${(project?.scenes?.length ?? 0) + 1}` },
        revisionRef,
        editingSessionId: editingSessionIdRef.current,
        projectId,
      });
      const data = await response.json();
      if (!response.ok || !data?.scene) return;
      const scene = { ...data.scene, game_objects: [] };
      setProject((prev: any) => ({ ...prev, scenes: [...(prev.scenes ?? []), scene] }));
      setCurrentScene(scene);
      setSelectedObject(null);
    } catch (error) {
      console.error('Failed to add scene:', error);
    }
  };

  /** Set (or clear) the current scene's backdrop image. */
  const setBackdrop = async (url: string | null) => {
    const sceneId = (currentScene as any)?.id;
    if (!sceneId) return;

    setProject((prev: any) => ({
      ...prev,
      scenes: (prev.scenes ?? []).map((s: any) =>
        s.id === sceneId ? { ...s, background_image_url: url } : s
      ),
    }));
    setCurrentScene((cur: any) => (cur?.id === sceneId ? { ...cur, background_image_url: url } : cur));

    try {
      await commandWrite({
        url: `/api/scenes/${sceneId}`,
        method: 'PATCH',
        body: { background_image_url: url },
        revisionRef,
        editingSessionId: editingSessionIdRef.current,
        projectId,
      });
    } catch (error) {
      console.error('Failed to set backdrop:', error);
    }
  };

  const renameScene = async (sceneId: string, name: string) => {
    setProject((prev: any) => ({
      ...prev,
      scenes: (prev.scenes ?? []).map((s: any) => (s.id === sceneId ? { ...s, name } : s)),
    }));
    try {
      await commandWrite({
        url: `/api/scenes/${sceneId}`,
        method: 'PATCH',
        body: { name },
        revisionRef,
        editingSessionId: editingSessionIdRef.current,
        projectId,
      });
    } catch (error) {
      console.error('Failed to rename scene:', error);
    }
  };

  const deleteScene = async (sceneId: string) => {
    if ((project?.scenes?.length ?? 0) <= 1) return;
    if (!confirm(t('editor.game.confirmDeleteScene'))) return;
    try {
      const response = await commandWrite({
        url: `/api/scenes/${sceneId}`,
        method: 'DELETE',
        revisionRef,
        editingSessionId: editingSessionIdRef.current,
        projectId,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data?.error || t('editor.game.sceneDeleteFailed'));
        return;
      }
      setProject((prev: any) => {
        const scenes = (prev.scenes ?? []).filter((s: any) => s.id !== sceneId);
        return { ...prev, scenes };
      });
      setCurrentScene((cur: any) =>
        cur?.id === sceneId ? project.scenes.find((s: any) => s.id !== sceneId) ?? null : cur
      );
      setSelectedObject(null);
    } catch (error) {
      console.error('Failed to delete scene:', error);
    }
  };

  /**
   * Duplicate a sprite, including its scripts — Scratch's right-click →
   * duplicate. Offsets the copy slightly so it isn't hidden under the original.
   */
  const duplicateObject = async (source: any) => {
    if (!currentScene || !source) return;
    try {
      // Coalesce the source object's row columns + JSON properties into a
      // single properties bag for the command service, then offset the copy
      // by (+40, 0, +40) so it isn't hidden under the original.
      const sourceProps = (source.properties && typeof source.properties === 'object') ? source.properties : {};
      const scaleX = Number(source.scale_x);
      const scaleY = Number(source.scale_y);
      const rotationY = Number(source.rotation);
      const response = await commandServiceCall({
        projectId,
        editingSessionId: editingSessionIdRef.current,
        revisionRef,
        command: {
          type: 'object.create',
          objectId: newObjectId(),
          sceneId: (currentScene as any).id,
          name: `${source.name || 'Object'} copy`,
          objectType: source.type,
          properties: {
            ...sourceProps,
            position: {
              x: (Number(source.position_x) || 0) + 40,
              y: Number(source.position_y) || 0,
              z: (Number(source.position_z) || 0) + 40,
            },
            ...(Number.isFinite(rotationY) ? { rotation: { x: 0, y: rotationY, z: 0 } } : {}),
            ...(Number.isFinite(scaleX) && Number.isFinite(scaleY)
              ? { scale: { x: scaleX, y: scaleY, z: 1 } }
              : {}),
            ...(source.color ? { color: source.color } : {}),
            ...(source.mass != null && Number.isFinite(Number(source.mass))
              ? { mass: Number(source.mass) }
              : {}),
          },
        },
      });
      if (!response.ok) return;

      // Copy the source's scripts onto the new object.
      const refreshed = await fetch(`/api/projects/${projectId}`).then((r) => r.json());
      const scene = refreshed?.project?.scenes?.find((s: any) => s.id === (currentScene as any).id);
      const copy = [...(scene?.game_objects ?? [])]
        .reverse()
        .find((o: any) => o.name === `${source.name || 'Object'} copy`);

      if (copy && Array.isArray(source.logic_blocks) && source.logic_blocks.length > 0) {
        await commandWrite({
          url: `/api/game-objects/${copy.id}/logic-blocks`,
          method: 'PUT',
          body: { blocks: source.logic_blocks },
          revisionRef,
          editingSessionId: editingSessionIdRef.current,
        projectId,
        });
      }

      if (refreshed?.project) {
        commitProject(refreshed.project);
        const updatedScene = refreshed.project.scenes?.find((s: any) => s.id === (currentScene as any).id);
        if (updatedScene) setCurrentScene(updatedScene);
      }
    } catch (error) {
      console.error('Failed to duplicate object:', error);
    }
  };

  /** Move a sprite up/down in the scene list and persist the new order. */
  const reorderObject = async (target: any, direction: -1 | 1) => {
    const sceneId = (currentScene as any)?.id;
    const objects = [...((currentScene as any)?.game_objects ?? [])];
    const from = objects.findIndex((o: any) => o.id === target.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= objects.length) return;

    const [moved] = objects.splice(from, 1);
    objects.splice(to, 0, moved);

    // Optimistic: reorder locally, then persist.
    setProject((prev: any) => ({
      ...prev,
      scenes: (prev.scenes ?? []).map((s: any) =>
        s.id === sceneId ? { ...s, game_objects: objects } : s
      ),
    }));
    setCurrentScene((cur: any) => (cur?.id === sceneId ? { ...cur, game_objects: objects } : cur));

    try {
      await commandWrite({
        url: '/api/game-objects/reorder',
        method: 'POST',
        body: { sceneId, orderedIds: objects.map((o: any) => o.id) },
        revisionRef,
        editingSessionId: editingSessionIdRef.current,
        projectId,
      });
    } catch (error) {
      console.error('Failed to persist sprite order:', error);
    }
  };

  /**
   * "Platform 2" rather than "Platform 1786905746918".
   *
   * Objects added from the toolbar were named with a raw millisecond
   * timestamp, which is what a child then sees in the scene list, the
   * properties panel, and the block editor header — "Blocks for Platform
   * 1786905746918". Counts what is already in the scene and takes the next
   * number, the way Scratch names Sprite1, Sprite2.
   */
  const nextObjectName = (type: string): string => {
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    const scene =
      project?.scenes?.find((s: any) => s.id === (currentScene as any)?.id) ?? project?.scenes?.[0];
    const taken = new Set<string>((scene?.game_objects ?? []).map((o: any) => o.name));
    for (let n = 1; n < 500; n++) {
      const candidate = n === 1 ? label : `${label} ${n}`;
      if (!taken.has(candidate)) return candidate;
    }
    return label;
  };

  /**
   * Ids already in a scene, so an add can tell what it created.
   * Diffing ids beats a name heuristic — two "Hero"s are indistinguishable.
   */
  const objectIdsIn = (sceneId?: string): Set<string> => {
    const scene =
      project?.scenes?.find((s: any) => s.id === sceneId) ?? project?.scenes?.[0];
    return new Set<string>((scene?.game_objects ?? []).map((o: any) => o.id));
  };

  /**
   * Select whatever the add just created, the way Scratch selects a newly
   * added sprite.
   *
   * Nothing used to. Adding a character left the selection empty, so switching
   * to the Logic tab said "No object selected" — and that tab shows neither the
   * 3D scene nor an object list, so there was nothing there to click to fix it.
   * A child had to know to go back to Scene, click the character, and return.
   */
  const selectNewObject = (before: Set<string>, updated: any, sceneId?: string) => {
    const scene =
      updated?.scenes?.find((s: any) => s.id === sceneId) ?? updated?.scenes?.[0];
    if (scene) setCurrentScene(scene);
    const created = (scene?.game_objects ?? []).find((o: any) => !before.has(o.id));
    if (created) setSelectedObject(created);
    return created;
  };

  const handleSave = async () => {
    // Only the project's own columns are savable here; scenes, objects and
    // blocks have their own autosave paths. Sending the whole project object
    // meant any failure (401/403/422) was swallowed into a console.log.
    setSaveState('saving');
    try {
      const response = await commandWrite({
        url: `/api/projects/${projectId}`,
        method: 'PATCH',
        body: {
          title: project.title,
          description: project.description ?? null,
          genre: project.genre ?? null,
        },
        revisionRef,
        editingSessionId: editingSessionIdRef.current,
        projectId,
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        console.error('Save failed:', response.status, detail);
        setSaveState('error');
        return;
      }
      setSaveState('saved');
    } catch (error) {
      console.error('Save failed:', error);
      setSaveState('error');
    }
  };

  const handlePlayTest = (e?: React.MouseEvent) => {
    // Prevent default and stop propagation to avoid any conflicts
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Open game in preview mode
    try {
      console.log('[GameEditor] Play button clicked, projectId:', projectId);
      
      if (!projectId) {
        console.error('[GameEditor] Cannot play: projectId is missing');
        alert('Error: Project ID is missing. Please refresh the page.');
        return;
      }
      
      const playUrl = `/play/${projectId}`;
      console.log('[GameEditor] Opening play mode:', playUrl);
      
      // Try window.open first (opens in new tab)
      const newWindow = window.open(playUrl, '_blank');
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        // If popup is blocked, fall back to same window navigation
        console.warn('[GameEditor] Popup blocked, opening in same window');
        window.location.href = playUrl;
      } else {
        console.log('[GameEditor] Successfully opened play window');
      }
    } catch (error) {
      console.error('[GameEditor] Error opening play mode:', error);
      // Fallback: navigate in same window
      try {
        const playUrl = `/play/${projectId}`;
        console.log('[GameEditor] Using fallback navigation to:', playUrl);
        window.location.href = playUrl;
      } catch (fallbackError) {
        console.error('[GameEditor] Fallback navigation also failed:', fallbackError);
        alert(`Error opening play mode: ${fallbackError}. Please check the console for details.`);
      }
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Top Bar — sticky, mirrors the app nav style */}
      <div className="bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/projects"
            title="Back to My Games"
            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-md hover:bg-slate-100 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <LogoMark size="sm" />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-none">
              {t('editor.editing')}
            </div>
            <h1 className="text-base font-bold text-slate-900 truncate max-w-[280px]">
              {project?.title || 'My Game'}
            </h1>
          </div>
          {/* Scene / Logic mode toggle */}
          <div
            className="ml-4 flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200"
            data-tour-target="sceneLogicTabs"
          >
            <ModeButton active={editorMode === 'scene'} onClick={() => setEditorMode('scene')}>
              {t('editor.scene')}
            </ModeButton>
            <ModeButton active={editorMode === 'logic'} onClick={() => setEditorMode('logic')}>
              {t('editor.logic')}
            </ModeButton>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5">
            <IconButton onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
              <Undo2 className="w-4 h-4" />
            </IconButton>
            <IconButton onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">
              <Redo2 className="w-4 h-4" />
            </IconButton>
          </div>

          {/* Transform mode — only visible while an object is selected in Scene mode */}
          {selectedObject && editorMode === 'scene' && (
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200 ml-1">
              <TransformButton
                active={transformMode === 'translate'}
                onClick={() => setTransformMode('translate')}
                title="Move (W)"
              >
                <Move3D className="w-3.5 h-3.5" />
                {t('editor.move')}
              </TransformButton>
              <TransformButton
                active={transformMode === 'scale'}
                onClick={() => setTransformMode('scale')}
                title="Scale (E)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                {t('editor.scale')}
              </TransformButton>
              <TransformButton
                active={transformMode === 'rotate'}
                onClick={() => setTransformMode('rotate')}
                title="Rotate (R)"
              >
                <RotateCw className="w-3.5 h-3.5" />
                {t('editor.rotate')}
              </TransformButton>
              {/* Snap-on-drag toggle. Divider + magnet-ish glyph lives right
                  after the transform-mode pills so a user who's already
                  reaching for a mode button can see whether snap is on. */}
              <span className="mx-1 h-4 w-px bg-slate-300" aria-hidden />
              <TransformButton
                active={snapEnabled}
                onClick={() => setSnapEnabled((v) => !v)}
                title={snapEnabled ? t('editor.transform.snapOn') : t('editor.transform.snapOff')}
              >
                <span aria-hidden className="text-xs">⊞</span>
                {t('editor.transform.snap')}
              </TransformButton>
            </div>
          )}

          {/* Save + Play */}
          <button
            onClick={handleSave}
            data-tour-target="saveButton"
            disabled={saveState === 'saving'}
            className={`ml-2 inline-flex items-center gap-1.5 bg-white border text-sm font-semibold rounded-full px-4 py-1.5 transition disabled:opacity-60 ${
              saveState === 'error'
                ? 'border-red-300 text-red-700'
                : 'border-slate-200 hover:border-slate-300 text-slate-800'
            }`}
            title={saveState === 'error' ? 'Save failed — see console for details' : 'Save project details'}
          >
            <Save className="w-3.5 h-3.5" />
            {saveState === 'saving'
              ? t('editor.saving')
              : saveState === 'saved'
                ? t('editor.saved')
                : saveState === 'error'
                  ? t('editor.saveFailed')
                  : t('editor.save')}
          </button>
          <button
            type="button"
            onClick={() => setShowTutorials((v) => !v)}
            data-tour-target="tutorialsButton"
            className={`inline-flex items-center gap-1.5 border text-sm font-semibold rounded-full px-4 py-1.5 transition ${
              showTutorials
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
            }`}
            title="Step-by-step tutorials"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            {t('editor.learn')}
          </button>
          <button
            type="button"
            onClick={() => setShowShareDialog(true)}
            data-tour-target="shareButton"
            className={`inline-flex items-center gap-1.5 border text-sm font-semibold rounded-full px-4 py-1.5 transition ${
              project?.visibility === 'public'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300'
                : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
            }`}
            title="Share this game so others can play and remix it"
          >
            <Share2 className="w-3.5 h-3.5" />
            {project?.visibility === 'public' ? t('editor.shared') : t('editor.share')}
          </button>
          <button
            type="button"
            onClick={handlePlayTest}
            data-tour-target="playButton"
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-full px-4 py-1.5 shadow-sm transition"
            title="Play game in new window"
          >
            <Play className="w-3.5 h-3.5" />
            {t('editor.play')}
          </button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Toolbar */}
        <div className="w-64 bg-white border-r border-slate-200 overflow-y-auto" data-tour-target="toolbar">
          <Toolbar
            onAddObject={async (type) => {
              // Add object to scene
              if (type === 'character') {
                setShowCharacterSelector(true);
                return;
              }
              if (type === 'collectible') {
                setShowCollectibleSelector(true);
                return;
              }
              if (type === 'obstacle') {
                setShowObstacleSelector(true);
                return;
              }
              if (type === 'sound') {
                setShowSoundSelector(true);
                return;
              }

              try {
                const sceneId = currentScene?.id || project?.scenes?.[0]?.id;
                if (!sceneId) {
                  alert('No scene found. Please create a scene first.');
                  return;
                }

                const defaults = getObjectDefaults(type);
                const addedTo = objectIdsIn(sceneId);

                const response = await commandServiceCall({
                  projectId,
                  editingSessionId: editingSessionIdRef.current,
                  revisionRef,
                  command: {
                    type: 'object.create',
                    objectId: newObjectId(),
                    sceneId,
                    name: nextObjectName(type),
                    objectType: type,
                    properties: {
                      position: { x: 500, y: type === 'platform' ? 300 : 300, z: 0 },
                      shape: defaults.shape,
                      color: defaults.color,
                      size: defaults.size,
                    },
                  },
                });

                if (!response.ok) {
                  console.error('Failed to add object:', await response.text());
                  return;
                }

                // Refresh project data and current scene
                const projectResponse = await fetch(`/api/projects/${projectId}`);
                if (projectResponse.ok) {
                  const { project: fetchedProject } = await projectResponse.json();
                  // Merge with local transient state to avoid snapping
                  const localMap: Record<string, any> = {};
                  project?.scenes?.forEach((s: any) =>
                    s?.game_objects?.forEach((o: any) => {
                      localMap[o.id] = {
                        position_x: o.position_x,
                        position_y: o.position_y,
                        position_z: o.position_z,
                        properties: o.properties,
                      };
                    })
                  );
                  const merged = {
                    ...fetchedProject,
                    scenes: fetchedProject.scenes?.map((s: any) => ({
                      ...s,
                      game_objects: s.game_objects?.map((o: any) =>
                        localMap[o.id]
                          ? {
                              ...o,
                              position_x: localMap[o.id].position_x ?? o.position_x,
                              position_y: localMap[o.id].position_y ?? o.position_y,
                              position_z: localMap[o.id].position_z ?? o.position_z,
                              properties: localMap[o.id].properties ?? o.properties,
                            }
                          : o
                      ),
                    })),
                  };
                  commitProject(merged);
                  selectNewObject(addedTo, merged, sceneId);
                  // Log: add object (find newly added by name heuristic)
                  const scene = merged.scenes?.find((s: any) => s.id === (currentScene as any)?.id) || merged.scenes?.[0];
                  const added = scene?.game_objects?.slice().reverse().find((o: any) => o.name?.startsWith(type.charAt(0).toUpperCase() + type.slice(1)));
                  if (added?.id) {
                    logObjectAction(added.id, 'add', { type, defaults });
                  }
                }
              } catch (err) {
                console.error('Error adding object:', err);
              }
            }}
            onOpenAI={() => setShowAIAssistant(true)}
          />
          <SceneTabs
            scenes={project?.scenes ?? []}
            currentSceneId={(currentScene as any)?.id ?? null}
            onSelect={(scene) => {
              setCurrentScene(scene);
              setSelectedObject(null);
            }}
            onAdd={addScene}
            onRename={renameScene}
            onDelete={deleteScene}
            onChooseBackdrop={() => setShowBackdropSelector(true)}
            currentBackdropUrl={(currentScene as any)?.background_image_url ?? null}
          />
          <ObjectsPanel
            scene={currentScene}
            selectedObject={selectedObject}
            onSelect={setSelectedObject}
            onDuplicate={duplicateObject}
            onReorder={reorderObject}
          />
        </div>

        {/* Center - Canvas/Editor */}
        <div className="flex-1 relative">
          {editorMode === 'scene' ? (
            <ErrorBoundary
              fallback={<EditorErrorPanel title="Scene rendering error" body="Something went wrong rendering the 3D scene." />}
            >
              <div className="w-full h-full editor-grid relative">
                {/* Floating lighting-preset picker — top-left of the canvas
                    so it doesn't compete with the transform toolbar (top)
                    or property panel (right). One click changes the scene
                    vibe; the choice persists per scene in localStorage. */}
                <select
                  value={lightingPreset}
                  onChange={(e) => applyLightingPreset(e.target.value as LightingPresetId)}
                  className="absolute left-3 top-3 z-10 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-300"
                  aria-label={t('editor.lighting.pickerLabel')}
                  title={t('editor.lighting.pickerLabel')}
                >
                  {LIGHTING_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {t(`editor.lighting.preset.${p.id}` as any)}
                    </option>
                  ))}
                </select>
                <Canvas camera={{ position: [0, 5, 10] }}>
                <SceneLights preset={lightingPreset} />
                <OrbitControls ref={orbitRef} />
                <Grid
                  args={[20, 20]}
                  cellSize={1}
                  cellColor="#6B7280"
                  sectionColor="#4B5563"
                />
                <SceneView
                  scene={currentScene}
                  selectedObject={selectedObject}
                  focusRequest={focusRequest}
                  onSelectObject={setSelectedObject}
                  orbitRef={orbitRef}
                  transformMode={transformMode}
                  snapEnabled={snapEnabled}
                  onAnimationsDetected={(objectId, animations) => {
                    // Store animations for the selected object
                    if (selectedObject && selectedObject.id === objectId) {
                      console.log(`Detected ${animations.length} animation(s) for "${selectedObject.name}":`, animations);
                    }
                  }}
                  onRotationChange={(id, rotationDegrees) => {
                    // Update selectedObject rotation in real-time during drag
                    if (selectedObject && selectedObject.id === id) {
                      const props = typeof selectedObject.properties === 'string'
                        ? JSON.parse(selectedObject.properties || '{}')
                        : (selectedObject.properties || {});
                      setSelectedObject({
                        ...selectedObject,
                        properties: {
                          ...props,
                          rotation: rotationDegrees,
                        },
                      });
                      // Also update currentScene so the mesh updates
                      setCurrentScene((prev: any) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          game_objects: prev.game_objects?.map((obj: any) =>
                            obj.id === id
                              ? {
                                  ...obj,
                                  properties: {
                                    ...(typeof obj.properties === 'string'
                                      ? JSON.parse(obj.properties || '{}')
                                      : obj.properties || {}),
                                    rotation: rotationDegrees,
                                  },
                                }
                              : obj
                          ),
                        };
                      });
                    }
                  }}
                  onCommitPosition={async (
                    id: string,
                    posPixels: { x: number; y: number; z: number },
                    sizePixels?: { width: number; height: number },
                    rotationProperties?: any
                  ) => {
                    try {
                      // Record history before applying local transform
                      setHistory((h) => ({ past: [...h.past, project], future: [] }));
                      // Optimistic update so the object doesn't snap back
                      let nextSelected: any = null;
                      // If the object was deleted meanwhile, skip persisting
                      const stillExists =
                        !!currentScene?.game_objects?.some((o: any) => o.id === id) ||
                        !!project?.scenes?.some((s: any) => s.game_objects?.some((o: any) => o.id === id));
                      if (!stillExists) {
                        return;
                      }
                      setProject((prev: any) => {
                        if (!prev?.scenes) return prev;
                        const nextProject = {
                          ...prev,
                          scenes: prev.scenes.map((scene: any) => ({
                            ...scene,
                            game_objects: scene.game_objects?.map((obj: any) =>
                              obj.id === id
                                ? {
                                    ...obj,
                                    position_x: Math.round(posPixels.x),
                                    position_y: Math.round(posPixels.y),
                                    position_z: Math.round(posPixels.z),
                                    properties: (() => {
                                      const currentProps = typeof obj.properties === 'string'
                                        ? JSON.parse(obj.properties || '{}')
                                        : (obj.properties || {});
                                      let updatedProps = { ...currentProps };
                                      
                                      if (sizePixels) {
                                        updatedProps.size = {
                                          width: sizePixels.width,
                                          height: sizePixels.height,
                                        };
                                      }
                                      
                                      if (rotationProperties) {
                                        updatedProps = { ...updatedProps, ...rotationProperties };
                                      }
                                      
                                      return updatedProps;
                                    })(),
                                  }
                                : obj
                            ),
                          })),
                        };
                        // Capture the updated object for selectedObject sync
                        const updatedScene = nextProject.scenes.find((s: any) => s.id === (currentScene as any)?.id) || nextProject.scenes[0];
                        nextSelected = updatedScene?.game_objects?.find((o: any) => o.id === id) || null;
                        return nextProject;
                      });
                      // Immediately update currentScene for canvas re-render
                      setCurrentScene((prev: any) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          game_objects: prev.game_objects?.map((obj: any) =>
                            obj.id === id
                              ? {
                                  ...obj,
                                  position_x: Math.round(posPixels.x),
                                  position_y: Math.round(posPixels.y),
                                  position_z: Math.round(posPixels.z),
                                }
                              : obj
                          ),
                        };
                      });
                      if (nextSelected) {
                        setSelectedObject(nextSelected);
                      }

                      const response = await commandWrite({
                        url: `/api/game-objects/${id}`,
                        method: 'PATCH',
                        body: {
                          position_x: Math.round(posPixels.x),
                          position_y: Math.round(posPixels.y),
                          position_z: Math.round(posPixels.z),
                          ...(sizePixels || rotationProperties
                            ? {
                                properties: {
                                  ...(selectedObject?.properties &&
                                  typeof selectedObject.properties !== 'string'
                                    ? selectedObject.properties
                                    : typeof selectedObject?.properties === 'string'
                                    ? JSON.parse(selectedObject.properties || '{}')
                                    : {}),
                                  ...(sizePixels
                                    ? {
                                        size: {
                                          width: sizePixels.width,
                                          height: sizePixels.height,
                                        },
                                      }
                                    : {}),
                                  ...(rotationProperties || {}),
                                },
                              }
                            : {}),
                        },
                        revisionRef,
                        editingSessionId: editingSessionIdRef.current,
        projectId,
                      });
                      if (response.ok) {
                        const updated = await response.json();
                        // Update local state
                        setProject((prev: any) => {
                          if (!prev?.scenes) return prev;
                          return {
                            ...prev,
                            scenes: prev.scenes.map((scene: any) => ({
                              ...scene,
                              game_objects: scene.game_objects?.map((obj: any) =>
                                obj.id === id ? { ...obj, ...updated } : obj
                              ),
                            })),
                          };
                        });
                        logObjectAction(id, sizePixels ? 'scale' : 'move', { position: posPixels, size: sizePixels });
                      } else if (response.status === 404) {
                        // Object no longer exists server-side; ignore gracefully
                        console.warn('Skipping position save; object not found (likely deleted).');
                      }
                    } catch (e) {
                      console.error('Failed to save position:', e);
                    }
                  }}
                />
              </Canvas>
            </div>
            </ErrorBoundary>
          ) : (
            <ErrorBoundary
              fallback={<EditorErrorPanel title="Logic editor error" body="Something went wrong loading the block editor." />}
            >
              <div className="flex h-full min-h-0">
                <div className="min-w-0 flex-1">
                  {selectedObject ? (
                    <BlockEditor
                      key={selectedObject.id}
                      objectId={selectedObject.id}
                      objectName={selectedObject.name}
                      initialBlocks={selectedObject.logic_blocks ?? []}
                      objectNames={((currentScene as any)?.game_objects ?? [])
                        .map((o: any) => o.name)
                        .filter(Boolean)}
                      recordedSounds={(project?.assets ?? [])
                        .filter((a: any) => a.asset_type === 'sound' && a.file_url)
                        .map((a: any) => ({ name: a.name, url: a.file_url }))}
                      writeAdapter={{
                        projectId,
                        revisionRef,
                        editingSessionId: editingSessionIdRef.current,
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-50">
                      <div className="text-center max-w-xs">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white border border-slate-200 mb-3">
                          <span className="text-2xl">🧩</span>
                        </div>
                        <p className="font-semibold text-slate-900">{t('editor.game.noSelection.title')}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {t('editor.game.noSelection.hint')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {/*
                  The stage, beside the blocks — the thing the Logic tab has
                  never had. Preview could not preview because there was
                  nowhere for a result to appear, which is the root of every
                  "where should I see it" question in this project. Scratch
                  has always shown the stage next to the scripts.

                  Outside the selected-object branch on purpose: the stage is
                  the whole project, not one sprite's, and Scratch never hides
                  it. It also used to be the only thing on this tab, so an
                  empty selection replaced the stage with an apology.
                */}
                <div
                  data-stage-panel
                  className="hidden w-[460px] shrink-0 flex-col border-l border-slate-200 bg-slate-950 xl:flex"
                >
                  <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <span>{t('editor.stage')}</span>
                    <button
                      type="button"
                      onClick={() => setStageNonce((n) => n + 1)}
                      className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500"
                    >
                      {t('player.restart')}
                    </button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <StagePreview key={stageNonce} project={project} />
                  </div>
                </div>
              </div>
            </ErrorBoundary>
          )}
        </div>

        {/* Right Sidebar - Properties */}
        {/* Tutorials dock beside the properties panel so a child can follow a
            step while looking at the thing the step is about. */}
        {showTutorials && <TutorialPanel onClose={() => setShowTutorials(false)} />}

        <div className={`${propertiesCollapsed ? 'w-8' : 'w-80'} bg-white border-l border-slate-200 overflow-y-auto relative transition-[width] duration-150`}>
          {/* Collapse/expand toggle. Sits pinned at the top-left of the
              panel; on collapsed layouts the panel is 32 px wide so the
              button IS the whole panel. */}
          <button
            type="button"
            onClick={() => setPropertiesCollapsed((v) => !v)}
            title={propertiesCollapsed ? t('editor.properties.expand') : t('editor.properties.collapse')}
            aria-label={propertiesCollapsed ? t('editor.properties.expand') : t('editor.properties.collapse')}
            className={`sticky top-2 z-10 ${propertiesCollapsed ? 'mx-auto' : 'ml-2'} flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-900`}
          >
            <span aria-hidden className="text-xs font-semibold">{propertiesCollapsed ? '‹' : '›'}</span>
          </button>
          {propertiesCollapsed ? null : (
          <ErrorBoundary
            fallback={
              <div className="p-4">
                <EditorErrorPanel title="Properties error" body="An error occurred in the properties panel." inline />
              </div>
            }
          >
            <PropertiesPanel
            selectedObject={selectedObject}
            objectHistory={objectHistory}
            onClearHistoryForObject={(objectId) => {
              setObjectHistory((h) => h.filter((e) => e.objectId !== objectId));
            }}
            onUpdate={async (updates) => {
              // Update object properties
              try {
                const response = await commandWrite({
                  url: `/api/game-objects/${selectedObject.id}`,
                  method: 'PATCH',
                  body: updates,
                  revisionRef,
                  editingSessionId: editingSessionIdRef.current,
        projectId,
                });

                if (response.ok) {
                  const updatedObject = await response.json();
                  // Update local state
                  setHistory((h) => ({ past: [...h.past, project], future: [] }));
                  setProject((prev: any) => {
                    if (!prev?.scenes) return prev;
                    return {
                      ...prev,
                      scenes: prev.scenes.map((scene: any) => ({
                        ...scene,
                        game_objects: scene.game_objects?.map((obj: any) =>
                          obj.id === selectedObject.id ? { ...obj, ...updates } : obj
                        ) || [],
                      })),
                    };
                  });
                  setSelectedObject((prev: any) => ({ ...prev, ...updates }));
                  // Also update the currentScene immediately so canvas reflects changes
                  setCurrentScene((prev: any) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      game_objects: prev.game_objects?.map((obj: any) =>
                        obj.id === selectedObject.id ? { ...obj, ...updates } : obj
                      ),
                    };
                  });
                  logObjectAction(selectedObject.id, 'update', updates);
                }
              } catch (error) {
                console.error('Error updating object:', error);
              }
            }}
            onDuplicate={duplicateSelected}
            onDelete={async () => {
              if (!selectedObject?.id) return;

              try {
                const response = await commandWrite({
                  url: `/api/game-objects/${selectedObject.id}`,
                  method: 'DELETE',
                  revisionRef,
                  editingSessionId: editingSessionIdRef.current,
        projectId,
                });

                if (response.ok) {
                  // Remove from local state
                  setHistory((h) => ({ past: [...h.past, project], future: [] }));
                  setProject((prev: any) => {
                    if (!prev?.scenes) return prev;
                    return {
                      ...prev,
                      scenes: prev.scenes.map((scene: any) => ({
                        ...scene,
                        game_objects: scene.game_objects?.filter(
                          (obj: any) => obj.id !== selectedObject.id
                        ) || [],
                      })),
                    };
                  });
                  logObjectAction(selectedObject.id, 'delete', { id: selectedObject.id, name: selectedObject.name });
                  setSelectedObject(null);
                  
                  // Update current scene
                  if (currentScene) {
                    setCurrentScene((prev: any) => ({
                      ...prev,
                      game_objects: prev.game_objects?.filter(
                        (obj: any) => obj.id !== selectedObject.id
                      ) || [],
                    }));
                  }
                }
              } catch (error) {
                console.error('Error deleting object:', error);
              }
            }}
          />
          </ErrorBoundary>
          )}
        </div>
      </div>

      {showBackdropSelector && (
        <BackdropSelector
          isOpen={showBackdropSelector}
          onClose={() => setShowBackdropSelector(false)}
          currentUrl={(currentScene as any)?.background_image_url ?? null}
          onSelect={setBackdrop}
        />
      )}

      {showShareDialog && (
        <ShareDialog
          projectId={projectId}
          initialVisibility={project?.visibility ?? 'private'}
          initialModerationStatus={project?.moderation_status ?? 'pending'}
          onClose={() => setShowShareDialog(false)}
          onVisibilityChange={(visibility, moderationStatus) =>
            setProject((prev: any) =>
              prev ? { ...prev, visibility, moderation_status: moderationStatus } : prev
            )
          }
        />
      )}

      {/* AI Assistant Overlay */}
      {showAIAssistant && (
        <AIAssistant
          projectId={projectId}
          onClose={() => setShowAIAssistant(false)}
          onApplyUpdate={async (update) => {
            // Apply AI update to the game.
            //
            // TODO(add-object-migration): the legacy /api/ai/apply-update
            // route is retired server-side; this call currently 503s.
            // Migrating requires mapping each AI update shape
            // (add_game_object, add_scene, set_backdrop, add_logic_blocks, ...)
            // to a command-service command, which is beyond the scope of the
            // add-object picker fix. Deferred until the AI Assistant panel
            // gets its own migration pass.
            try {
              const response = await fetch('/api/ai/apply-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  projectId,
                  update,
                }),
              });

              if (!response.ok) {
                throw new Error('Failed to apply update');
              }

              // Refresh project data
              const projectResponse = await fetch(`/api/projects/${projectId}`);
              if (projectResponse.ok) {
                const { project: updatedProject } = await projectResponse.json();
                commitProject(updatedProject);
                
                // Update current scene - find the scene that matches currentScene or use first scene
                if (updatedProject.scenes && updatedProject.scenes.length > 0) {
                  const matchingScene = currentScene 
                    ? updatedProject.scenes.find((s: any) => s.id === currentScene.id)
                    : null;
                  setCurrentScene(matchingScene || updatedProject.scenes[0]);
                  
                  // Force re-render by updating the scene reference
                  console.log('Updated scene with objects:', matchingScene || updatedProject.scenes[0]);
                }
              } else {
                console.error('Failed to refresh project:', projectResponse.status);
              }
            } catch (error) {
              console.error('Error applying update:', error);
              throw error;
            }
          }}
        />
      )}

      {/* Character Selector Modal */}
      <CharacterSelector
        isOpen={showCharacterSelector}
        onClose={() => setShowCharacterSelector(false)}
        projectId={projectId}
        onSelect={async (character) => {
          try {
            const sceneId = currentScene?.id || project?.scenes?.[0]?.id;
            if (!sceneId) {
              alert('No scene found. Please create a scene first.');
              return;
            }
            const visual = buildCharacterVisual(character);

            const addedTo = objectIdsIn(sceneId);

            const response = await commandServiceCall({
              projectId,
              editingSessionId: editingSessionIdRef.current,
              revisionRef,
              command: {
                type: 'object.create',
                objectId: newObjectId(),
                sceneId,
                name: character.name,
                objectType: 'character',
                properties: {
                  position: { x: 500, y: 300, z: 0 },
                  // visual.properties already includes characterType, shape,
                  // color, size (+ model_url/thumbnail_url/model_bounds/
                  // model_origin_offset for 3D models) from the picker builder.
                  ...visual.properties,
                },
              },
            });

            if (response.ok) {
              // Refresh scene data
              const projectResponse = await fetch(`/api/projects/${projectId}`);
              if (projectResponse.ok) {
                const { project: updatedProject } = await projectResponse.json();
                commitProject(updatedProject);
                selectNewObject(addedTo, updatedProject, sceneId);
              }
            }
          } catch (error) {
            console.error('Error adding character:', error);
          }
        }}
      />
      {/* Collectible Selector Modal */}
      <CollectibleSelector
        isOpen={showCollectibleSelector}
        onClose={() => setShowCollectibleSelector(false)}
        onSelect={async (item) => {
          try {
            const sceneId = currentScene?.id || project?.scenes?.[0]?.id;
            if (!sceneId) {
              alert('No scene found. Please create a scene first.');
              return;
            }
            const addedTo = objectIdsIn(sceneId);

            const response = await commandServiceCall({
              projectId,
              editingSessionId: editingSessionIdRef.current,
              revisionRef,
              command: {
                type: 'object.create',
                objectId: newObjectId(),
                sceneId,
                name: item.name,
                objectType: 'collectible',
                properties: {
                  position: { x: 500, y: 300, z: 0 },
                  shape: item.shape,
                  color: item.color,
                  size: item.size || 30,
                  collectibleType: item.id,
                },
              },
            });
            if (response.ok) {
              const projectResponse = await fetch(`/api/projects/${projectId}`);
              if (projectResponse.ok) {
                const { project: updatedProject } = await projectResponse.json();
                commitProject(updatedProject);
                selectNewObject(addedTo, updatedProject, sceneId);
              }
            }
          } catch (e) {
            console.error('Error adding collectible:', e);
          }
        }}
      />
      {/* Obstacle Selector Modal */}
      <ObstacleSelector
        isOpen={showObstacleSelector}
        onClose={() => setShowObstacleSelector(false)}
        onSelect={async (item) => {
          try {
            const sceneId = currentScene?.id || project?.scenes?.[0]?.id;
            if (!sceneId) {
              alert('No scene found. Please create a scene first.');
              return;
            }
            const addedTo = objectIdsIn(sceneId);

            const response = await commandServiceCall({
              projectId,
              editingSessionId: editingSessionIdRef.current,
              revisionRef,
              command: {
                type: 'object.create',
                objectId: newObjectId(),
                sceneId,
                name: item.name,
                objectType: 'obstacle',
                properties: {
                  position: { x: 500, y: 300, z: 0 },
                  shape: item.shape,
                  color: item.color,
                  size: item.size || 50,
                  obstacleType: item.id,
                },
              },
            });
            if (response.ok) {
              const projectResponse = await fetch(`/api/projects/${projectId}`);
              if (projectResponse.ok) {
                const { project: updatedProject } = await projectResponse.json();
                commitProject(updatedProject);
                selectNewObject(addedTo, updatedProject, sceneId);
              }
            }
          } catch (e) {
            console.error('Error adding obstacle:', e);
          }
        }}
      />
      {/* Sound Selector Modal */}
      <SoundSelector
        isOpen={showSoundSelector}
        onClose={() => setShowSoundSelector(false)}
        onSelect={async (item) => {
          try {
            const sceneId = currentScene?.id || project?.scenes?.[0]?.id;
            if (!sceneId) {
              alert('No scene found. Please create a scene first.');
              return;
            }
            const addedTo = objectIdsIn(sceneId);

            const response = await commandServiceCall({
              projectId,
              editingSessionId: editingSessionIdRef.current,
              revisionRef,
              command: {
                type: 'object.create',
                objectId: newObjectId(),
                sceneId,
                name: item.name,
                objectType: 'sound',
                properties: {
                  position: { x: 500, y: 300, z: 0 },
                  shape: item.shape,
                  color: item.color,
                  size: item.size || 40,
                  soundType: item.id,
                  // The picker's own properties carry beat/bpm/autoplay_beat
                  // for the Beats tab. These used to be dropped on the floor
                  // here, so picking "Chill 90" persisted no beat at all.
                  ...(item.properties ?? {}),
                },
              },
            });
            if (response.ok) {
              const projectResponse = await fetch(`/api/projects/${projectId}`);
              if (projectResponse.ok) {
                const { project: updatedProject } = await projectResponse.json();
                setProject(updatedProject);
                setCurrentScene(updatedProject.scenes?.find((s: any) => s.id === sceneId));
              }
            }
          } catch (e) {
            console.error('Error adding sound:', e);
          }
        }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Top-bar micro components. Extracted so the header JSX stays readable while
// still sharing the same slate-900 design tokens as the rest of the app.
// -----------------------------------------------------------------------------

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold rounded-md px-3 py-1.5 transition ${
        active
          ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-md transition ${
        disabled
          ? 'text-slate-300 cursor-not-allowed'
          : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

function EditorErrorPanel({
  title,
  body,
  inline,
}: {
  title: string;
  body: string;
  inline?: boolean;
}) {
  const t = useTranslator();
  const content = (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 max-w-sm text-center">
      <h3 className="font-bold text-red-800">{title}</h3>
      <p className="mt-1 text-sm text-red-700">{body}</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-full px-4 py-2 transition"
      >
        {t('editor.game.reloadPage')}
      </button>
    </div>
  );
  if (inline) return content;
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-50">
      {content}
    </div>
  );
}

function TransformButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1 text-xs font-semibold rounded-md px-2.5 py-1.5 transition ${
        active
          ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}
