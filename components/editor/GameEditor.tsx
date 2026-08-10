'use client';

import { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { useRef } from 'react';
import { Play, Save, Settings, Plus } from 'lucide-react';
import Toolbar from './Toolbar';
import ObjectsPanel from './ObjectsPanel';
import SceneView from './SceneView';
import PropertiesPanel from './PropertiesPanel';
import LogicBlockEditor from './LogicBlockEditor';
import AIAssistant from './AIAssistant';
import CharacterSelector from './CharacterSelector';
import CollectibleSelector from './CollectibleSelector';
import ObstacleSelector from './ObstacleSelector';
import SoundSelector from './SoundSelector';
import { ErrorBoundary } from '../common/ErrorBoundary';

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
  const orbitRef = useRef<any>(null);

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

  const handleSave = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });

      if (response.ok) {
        // Show success message
        console.log('Project saved!');
      }
    } catch (error) {
      console.error('Save failed:', error);
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
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Top Bar */}
      <div className="bg-white shadow-md p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-purple-600">
            {project?.title || 'My Game'}
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => setEditorMode('scene')}
              className={`px-4 py-2 rounded-lg font-medium ${
                editorMode === 'scene'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Scene
            </button>
            <button
              onClick={() => setEditorMode('logic')}
              className={`px-4 py-2 rounded-lg font-medium ${
                editorMode === 'logic'
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Logic
            </button>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {/* Undo/Redo */}
          <div className="flex gap-1 mr-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={`px-3 py-2 rounded-lg font-medium ${canUndo ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              title="Undo (Ctrl/Cmd+Z)"
            >
              Undo
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={`px-3 py-2 rounded-lg font-medium ${canRedo ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              title="Redo (Shift+Ctrl/Cmd+Z or Ctrl+Y)"
            >
              Redo
            </button>
          </div>
          {/* Transform Mode Selector */}
          {selectedObject && editorMode === 'scene' && (
            <div className="flex gap-1 mr-4 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setTransformMode('translate')}
                className={`px-3 py-1 rounded transition-colors ${
                  transformMode === 'translate'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                title="Move (W)"
              >
                Move
              </button>
              <button
                onClick={() => setTransformMode('scale')}
                className={`px-3 py-1 rounded transition-colors ${
                  transformMode === 'scale'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                title="Scale (E)"
              >
                Scale
              </button>
              <button
                onClick={() => setTransformMode('rotate')}
                className={`px-3 py-1 rounded transition-colors ${
                  transformMode === 'rotate'
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                title="Rotate (R)"
              >
                Rotate
              </button>
            </div>
          )}
          {/* Removed duplicate AI Helper button; sidebar 'Generate with AI' opens the assistant */}
          <button
            onClick={handleSave}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-600"
          >
            <Save className="w-5 h-5" />
            Save
          </button>
          <button
            type="button"
            onClick={handlePlayTest}
            className="bg-green-500 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-green-600 cursor-pointer"
            title="Play game in new window"
          >
            <Play className="w-5 h-5" />
            Play
          </button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Toolbar */}
        <div className="w-64 bg-white shadow-lg overflow-y-auto">
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
          <ObjectsPanel
            scene={currentScene}
            selectedObject={selectedObject}
            onSelect={setSelectedObject}
          />
        </div>

        {/* Center - Canvas/Editor */}
        <div className="flex-1 relative">
          {editorMode === 'scene' ? (
            <ErrorBoundary
              fallback={
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                  <div className="text-center p-6 bg-white rounded-lg shadow-lg">
                    <h3 className="text-lg font-bold text-red-600 mb-2">Scene Rendering Error</h3>
                    <p className="text-gray-600 mb-4">An error occurred while rendering the 3D scene.</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Reload Page
                    </button>
                  </div>
                </div>
              }
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
              fallback={
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                  <div className="text-center p-6 bg-white rounded-lg shadow-lg">
                    <h3 className="text-lg font-bold text-red-600 mb-2">Logic Block Editor Error</h3>
                    <p className="text-gray-600 mb-4">An error occurred in the logic block editor.</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Reload Page
                    </button>
                  </div>
                </div>
              }
            >
              <LogicBlockEditor
              projectId={projectId}
              selectedObject={selectedObject}
            />
            </ErrorBoundary>
          )}
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-80 bg-white shadow-lg overflow-y-auto">
          <ErrorBoundary
            fallback={
              <div className="p-4">
                <h3 className="text-lg font-bold text-red-600 mb-2">Properties Panel Error</h3>
                <p className="text-gray-600 mb-4">An error occurred in the properties panel.</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Reload Page
                </button>
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
                    // Keep a lightweight sprite preview for non-models
                    sprite_data: character.model_url
                      ? { shape: 'model', model_url: character.model_url, thumbnail_url: character.thumbnail_url, size: 1 }
                      : { shape: character.shape || 'box', color: character.color, size: character.size || 50 },
                    // Persist full properties; include composite children if provided by builder
                    properties: {
                      ...(character.model_url
                        ? { shape: 'model', model_url: character.model_url, thumbnail_url: character.thumbnail_url, size: 1 }
                        : {
                            // for primitives or composites from builder
                            ...(character.properties ? { ...character.properties } : {}),
                            shape: character.shape || 'box',
                            color: character.color,
                            size: character.size || 50,
                          }),
                      characterType: character.id,
                    },
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

