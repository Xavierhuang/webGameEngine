'use client';

import { useState, useEffect } from 'react';
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
import { CHARACTER_TEMPLATES } from '../../lib/prefabs/characters';
import { buildCharacterVisual } from '../../lib/prefabs/characterPayload';
import { listenForFocusShortcut } from '../../lib/editor/cameraFocus';

// Blockly needs the DOM — load the block editor client-side only.
const BlockEditor = dynamic(() => import('./BlockEditor'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3 text-slate-500 text-sm">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
        Loading block editor…
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

export default function GameEditor({ projectId, initialData }: GameEditorProps) {
  const [project, setProject] = useState<any>(initialData);
  const [currentScene, setCurrentScene] = useState<any>(null);
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [editorMode, setEditorMode] = useState<'scene' | 'logic'>('scene');
  const [objectHistory, setObjectHistory] = useState<Array<{ id: string; objectId: string; action: string; payload: any; at: number }>>([]);
  const [history, setHistory] = useState<{ past: any[]; future: any[] }>({ past: [], future: [] });
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showCharacterSelector, setShowCharacterSelector] = useState(false);
  const [showCollectibleSelector, setShowCollectibleSelector] = useState(false);
  const [showObstacleSelector, setShowObstacleSelector] = useState(false);
  const [showSoundSelector, setShowSoundSelector] = useState(false);
  const [transformMode, setTransformMode] = useState<'translate' | 'scale' | 'rotate'>('translate');
  const [focusRequest, setFocusRequest] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showBackdropSelector, setShowBackdropSelector] = useState(false);
  const [showTutorials, setShowTutorials] = useState(false);
  const orbitRef = useRef<any>(null);

  // Eager starter-GLB preload — starts downloading every starter model the
  // moment the editor mounts so that by the time a kid opens the character/
  // obstacle/collectible picker, the ~20 GLBs are already in drei's cache.
  // Idempotent (useGLTF.preload dedupes internally), so re-runs are free.
  useEffect(() => {
    for (const c of CHARACTER_TEMPLATES) {
      const url = c.model_url;
      if (!url) continue;
      const ext = url.split('.').pop()?.toLowerCase();
      if (ext === 'glb' || ext === 'gltf') useGLTF.preload(url);
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

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history, project, currentScene]);

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
      const response = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          name: `Scene ${(project?.scenes?.length ?? 0) + 1}`,
        }),
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
      await fetch(`/api/scenes/${sceneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ background_image_url: url }),
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
      await fetch(`/api/scenes/${sceneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    } catch (error) {
      console.error('Failed to rename scene:', error);
    }
  };

  const deleteScene = async (sceneId: string) => {
    if ((project?.scenes?.length ?? 0) <= 1) return;
    if (!confirm('Delete this scene and everything in it?')) return;
    try {
      const response = await fetch(`/api/scenes/${sceneId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data?.error || 'Could not delete the scene.');
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
      const response = await fetch('/api/ai/apply-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          update: {
            type: 'add_game_object',
            game_object: {
              scene_id: (currentScene as any).id,
              type: source.type,
              name: `${source.name || 'Object'} copy`,
              position_x: (Number(source.position_x) || 0) + 40,
              position_y: Number(source.position_y) || 0,
              position_z: (Number(source.position_z) || 0) + 40,
              rotation: source.rotation,
              scale_x: source.scale_x,
              scale_y: source.scale_y,
              sprite_url: source.sprite_url,
              color: source.color,
              width: source.width,
              height: source.height,
              has_physics: source.has_physics,
              is_static: source.is_static,
              mass: source.mass,
              properties: source.properties,
            },
          },
        }),
      });
      if (!response.ok) return;

      // Copy the source's scripts onto the new object.
      const refreshed = await fetch(`/api/projects/${projectId}`).then((r) => r.json());
      const scene = refreshed?.project?.scenes?.find((s: any) => s.id === (currentScene as any).id);
      const copy = [...(scene?.game_objects ?? [])]
        .reverse()
        .find((o: any) => o.name === `${source.name || 'Object'} copy`);

      if (copy && Array.isArray(source.logic_blocks) && source.logic_blocks.length > 0) {
        await fetch(`/api/game-objects/${copy.id}/logic-blocks`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks: source.logic_blocks }),
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
      await fetch('/api/game-objects/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId, orderedIds: objects.map((o: any) => o.id) }),
      });
    } catch (error) {
      console.error('Failed to persist sprite order:', error);
    }
  };

  const handleSave = async () => {
    // Only the project's own columns are savable here; scenes, objects and
    // blocks have their own autosave paths. Sending the whole project object
    // meant any failure (401/403/422) was swallowed into a console.log.
    setSaveState('saving');
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: project.title,
          description: project.description ?? null,
          genre: project.genre ?? null,
        }),
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
              Editing
            </div>
            <h1 className="text-base font-bold text-slate-900 truncate max-w-[280px]">
              {project?.title || 'My Game'}
            </h1>
          </div>
          {/* Scene / Logic mode toggle */}
          <div className="ml-4 flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
            <ModeButton active={editorMode === 'scene'} onClick={() => setEditorMode('scene')}>
              Scene
            </ModeButton>
            <ModeButton active={editorMode === 'logic'} onClick={() => setEditorMode('logic')}>
              Logic
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
                Move
              </TransformButton>
              <TransformButton
                active={transformMode === 'scale'}
                onClick={() => setTransformMode('scale')}
                title="Scale (E)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Scale
              </TransformButton>
              <TransformButton
                active={transformMode === 'rotate'}
                onClick={() => setTransformMode('rotate')}
                title="Rotate (R)"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Rotate
              </TransformButton>
            </div>
          )}

          {/* Save + Play */}
          <button
            onClick={handleSave}
            disabled={saveState === 'saving'}
            className={`ml-2 inline-flex items-center gap-1.5 bg-white border text-sm font-semibold rounded-full px-4 py-1.5 transition disabled:opacity-60 ${
              saveState === 'error'
                ? 'border-red-300 text-red-700'
                : 'border-slate-200 hover:border-slate-300 text-slate-800'
            }`}
            title={saveState === 'error' ? 'Save failed — see console for details' : 'Save project details'}
          >
            <Save className="w-3.5 h-3.5" />
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setShowTutorials((v) => !v)}
            className={`inline-flex items-center gap-1.5 border text-sm font-semibold rounded-full px-4 py-1.5 transition ${
              showTutorials
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
            }`}
            title="Step-by-step tutorials"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            Learn
          </button>
          <button
            type="button"
            onClick={() => setShowShareDialog(true)}
            className={`inline-flex items-center gap-1.5 border text-sm font-semibold rounded-full px-4 py-1.5 transition ${
              project?.visibility === 'public'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300'
                : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
            }`}
            title="Share this game so others can play and remix it"
          >
            <Share2 className="w-3.5 h-3.5" />
            {project?.visibility === 'public' ? 'Shared' : 'Share'}
          </button>
          <button
            type="button"
            onClick={handlePlayTest}
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-full px-4 py-1.5 shadow-sm transition"
            title="Play game in new window"
          >
            <Play className="w-3.5 h-3.5" />
            Play
          </button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Toolbar */}
        <div className="w-64 bg-white border-r border-slate-200 overflow-y-auto">
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
                
                const response = await fetch('/api/ai/apply-update', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    projectId,
                    update: {
                      type: 'add_game_object',
                      scene_id: sceneId,
                      game_object: {
                        type,
                        name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${Date.now()}`,
                        position: { x: 500, y: type === 'platform' ? 300 : 300, z: 0 },
                        sprite_data: defaults,
                        properties: {
                          shape: defaults.shape,
                          color: defaults.color,
                          size: defaults.size,
                        },
                      },
                    },
                  }),
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
              <div className="w-full h-full editor-grid">
                <Canvas camera={{ position: [0, 5, 10] }}>
                <ambientLight intensity={1.2} />
                <pointLight position={[10, 10, 10]} intensity={2.0} />
                <directionalLight position={[-10, 10, -5]} intensity={1.0} />
                <directionalLight position={[10, 5, 5]} intensity={0.8} />
                <hemisphereLight intensity={0.5} />
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

                      const response = await fetch(`/api/game-objects/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
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
                        }),
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
              {selectedObject ? (
                <BlockEditor
                  key={selectedObject.id}
                  objectId={selectedObject.id}
                  objectName={selectedObject.name}
                  initialBlocks={selectedObject.logic_blocks ?? []}
            objectNames={((currentScene as any)?.game_objects ?? []).map((o: any) => o.name).filter(Boolean)}
            recordedSounds={(project?.assets ?? [])
              .filter((a: any) => a.asset_type === 'sound' && a.file_url)
              .map((a: any) => ({ name: a.name, url: a.file_url }))}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-50">
                  <div className="text-center max-w-xs">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white border border-slate-200 mb-3">
                      <span className="text-2xl">🧩</span>
                    </div>
                    <p className="font-semibold text-slate-900">No object selected</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Pick an object in the scene (or add one from the left) to write its logic.
                    </p>
                  </div>
                </div>
              )}
            </ErrorBoundary>
          )}
        </div>

        {/* Right Sidebar - Properties */}
        {/* Tutorials dock beside the properties panel so a child can follow a
            step while looking at the thing the step is about. */}
        {showTutorials && <TutorialPanel onClose={() => setShowTutorials(false)} />}

        <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto">
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
                const response = await fetch(`/api/game-objects/${selectedObject.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updates),
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
            onDelete={async () => {
              if (!selectedObject?.id) return;
              
              try {
                const response = await fetch(`/api/game-objects/${selectedObject.id}`, {
                  method: 'DELETE',
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
            // Apply AI update to the game
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

            const response = await fetch('/api/ai/apply-update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId,
                update: {
                  type: 'add_game_object',
                  scene_id: sceneId,
                  game_object: {
                    type: 'character',
                    name: character.name,
                    position: { x: 500, y: 300, z: 0 },
                    sprite_data: visual.spriteData,
                    // visual.properties already includes characterType from the builder
                    properties: visual.properties,
                  },
                },
              }),
            });

            if (response.ok) {
              // Refresh scene data
              const projectResponse = await fetch(`/api/projects/${projectId}`);
              if (projectResponse.ok) {
                const { project: updatedProject } = await projectResponse.json();
                commitProject(updatedProject);
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
            const response = await fetch('/api/ai/apply-update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId,
                update: {
                  type: 'add_game_object',
                  scene_id: sceneId,
                  game_object: {
                    type: 'collectible',
                    name: item.name,
                    position: { x: 500, y: 300, z: 0 },
                    sprite_data: {
                      shape: item.shape,
                      color: item.color,
                      size: item.size || 30,
                    },
                    properties: {
                      shape: item.shape,
                      color: item.color,
                      size: item.size || 30,
                      collectibleType: item.id,
                    },
                  },
                },
              }),
            });
            if (response.ok) {
              const projectResponse = await fetch(`/api/projects/${projectId}`);
              if (projectResponse.ok) {
                const { project: updatedProject } = await projectResponse.json();
                commitProject(updatedProject);
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
            const response = await fetch('/api/ai/apply-update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId,
                update: {
                  type: 'add_game_object',
                  scene_id: sceneId,
                  game_object: {
                    type: 'obstacle',
                    name: item.name,
                    position: { x: 500, y: 300, z: 0 },
                    sprite_data: {
                      shape: item.shape,
                      color: item.color,
                      size: item.size || 50,
                    },
                    properties: {
                      shape: item.shape,
                      color: item.color,
                      size: item.size || 50,
                      obstacleType: item.id,
                    },
                  },
                },
              }),
            });
            if (response.ok) {
              const projectResponse = await fetch(`/api/projects/${projectId}`);
              if (projectResponse.ok) {
                const { project: updatedProject } = await projectResponse.json();
                commitProject(updatedProject);
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
            const response = await fetch('/api/ai/apply-update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                projectId,
                update: {
                  type: 'add_game_object',
                  scene_id: sceneId,
                  game_object: {
                    type: 'sound',
                    name: item.name,
                    position: { x: 500, y: 300, z: 0 },
                    sprite_data: {
                      shape: item.shape,
                      color: item.color,
                      size: item.size || 40,
                    },
                    properties: {
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
                },
              }),
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
  const content = (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 max-w-sm text-center">
      <h3 className="font-bold text-red-800">{title}</h3>
      <p className="mt-1 text-sm text-red-700">{body}</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-full px-4 py-2 transition"
      >
        Reload page
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
