'use client';

import { useState } from 'react';
import { Trash2, Bone } from 'lucide-react';
import AudioManager from '@/lib/audio/AudioManager';
import AnimationEditor from './AnimationEditor';

interface PropertiesPanelProps {
  selectedObject: any;
  onUpdate: (updates: any) => void;
  onDelete?: () => void;
  objectHistory?: Array<{ id: string; objectId: string; action: string; payload: any; at: number }>;
  onClearHistoryForObject?: (objectId: string) => void;
}

export default function PropertiesPanel({
  selectedObject,
  onUpdate,
  onDelete,
  objectHistory = [],
  onClearHistoryForObject,
}: PropertiesPanelProps) {
  const [showAnimationEditor, setShowAnimationEditor] = useState(false);
  const [animationEditorModelUrl, setAnimationEditorModelUrl] = useState<string>('');
  const [availableAnimations, setAvailableAnimations] = useState<string[]>([]);
  
  if (!selectedObject) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-100 mb-3">
          <span className="text-2xl">🎯</span>
        </div>
        <p className="font-semibold text-slate-900">Nothing selected</p>
        <p className="mt-1 text-sm text-slate-500 max-w-[200px]">
          Click an object in the scene to see its properties here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="mb-4">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
          Properties
        </div>
        <h2 className="text-lg font-bold text-slate-900 truncate">
          {selectedObject.name || 'Object'}
        </h2>
      </div>

      <div className="space-y-4">
        {/* Object History */}
        {selectedObject && (
          <div className="p-3 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">History</span>
              <div className="flex gap-2">
                <button
                  onClick={() => onClearHistoryForObject && onClearHistoryForObject(selectedObject.id)}
                  className="px-3 py-1 rounded bg-gray-200 text-gray-800 text-sm"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="space-y-2 max-h-44 overflow-auto pr-1">
              {(objectHistory || [])
                .filter((h) => h.objectId === selectedObject.id)
                .slice(-10)
                .reverse()
                .map((h) => (
                  <div key={h.id} className="text-xs bg-gray-50 border border-gray-200 rounded p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{h.action}</span>
                      <span className="text-gray-400">{new Date(h.at).toLocaleTimeString()}</span>
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap break-words text-gray-600">
{JSON.stringify(h.payload, null, 2)}
                    </pre>
                  </div>
                ))}
            </div>
          </div>
        )}
        {/* Sound Controls */}
        {selectedObject.type === 'sound' && (
          <div className="p-3 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Sound Controls</span>
              <div className="flex gap-2">
                <button
                  onClick={() => AudioManager.get().playSfx(selectedObject.properties?.soundType || 'click')}
                  className="px-3 py-1 rounded bg-indigo-500 text-white text-sm"
                >
                  Play Once
                </button>
                <button
                  onClick={() => AudioManager.get().startBeat(selectedObject.properties?.beat || 'simple', selectedObject.properties?.bpm || 120)}
                  className="px-3 py-1 rounded bg-emerald-500 text-white text-sm"
                >
                  Start Beat
                </button>
                <button
                  onClick={() => AudioManager.get().stopBeat()}
                  className="px-3 py-1 rounded bg-gray-300 text-gray-800 text-sm"
                >
                  Stop Beat
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Beat BPM</label>
                <input
                  type="number"
                  defaultValue={selectedObject.properties?.bpm || 120}
                  onBlur={(e) => onUpdate({ properties: { ...(selectedObject.properties || {}), bpm: parseInt(e.target.value || '120') } })}
                  className="w-full px-2 py-1 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Autoplay Beat on Start</label>
                <input
                  type="checkbox"
                  defaultChecked={selectedObject.properties?.autoplay_beat || false}
                  onChange={(e) => onUpdate({ properties: { ...(selectedObject.properties || {}), autoplay_beat: e.target.checked } })}
                  className="w-4 h-4 ml-2 align-middle"
                />
              </div>
            </div>
          </div>
        )}
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            type="text"
            value={selectedObject.name || ''}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type
          </label>
          <input
            type="text"
            value={selectedObject.type || ''}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
          />
        </div>

        {/* Position */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Position
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500">X</label>
              <input
                type="number"
                value={selectedObject.position_x || 0}
                onChange={(e) =>
                  onUpdate({ position_x: parseFloat(e.target.value) })
                }
                className="w-full px-2 py-1 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Y</label>
              <input
                type="number"
                value={selectedObject.position_y || 0}
                onChange={(e) =>
                  onUpdate({ position_y: parseFloat(e.target.value) })
                }
                className="w-full px-2 py-1 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Z</label>
              <input
                type="number"
                value={selectedObject.position_z || 0}
                onChange={(e) =>
                  onUpdate({ position_z: parseFloat(e.target.value) })
                }
                className="w-full px-2 py-1 border border-gray-300 rounded"
              />
            </div>
          </div>
        </div>

        {/* Scale/Size */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Size
          </label>
          {(() => {
            // Parse properties
            const properties = typeof selectedObject.properties === 'string'
              ? JSON.parse(selectedObject.properties || '{}')
              : (selectedObject.properties || {});
            
            const isPlatform = selectedObject.type === 'platform' || properties.shape === 'plane';
            
            // For platforms, size is in properties.size (pixels)
            // For other objects, it can be in properties.size or scale_x/scale_y
            let widthValue: number;
            let heightValue: number;
            
            if (isPlatform) {
              widthValue = properties.size?.width ?? 1000;
              heightValue = properties.size?.height ?? 50;
            } else if (properties.size !== undefined && properties.size !== null) {
              if (typeof properties.size === 'number') {
                // Size is a single number (pixels) - use for both width and height
                widthValue = properties.size;
                heightValue = properties.size;
              } else if (typeof properties.size === 'object' && !Array.isArray(properties.size)) {
                // Size is an object with width/height
                widthValue = properties.size.width ?? (selectedObject.scale_x || 1) * 100;
                heightValue = properties.size.height ?? (selectedObject.scale_y || 1) * 100;
              } else {
                // Fallback to scale_x/scale_y (convert from scale multiplier to pixels)
                widthValue = (selectedObject.scale_x || 1) * 100;
                heightValue = (selectedObject.scale_y || 1) * 100;
              }
            } else {
              // No properties.size, check scale_x/scale_y (convert from scale multiplier to pixels)
              // scale_x/scale_y of 1 = 100 pixels
              widthValue = (selectedObject.scale_x ?? 1) * 100;
              heightValue = (selectedObject.scale_y ?? 1) * 100;
            }
            
            return (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Width</label>
              <input
                type="number"
                    value={widthValue}
                    onChange={(e) => {
                      const newWidth = parseFloat(e.target.value) || 0;
                      if (isPlatform || properties.size) {
                        // Update properties.size
                        const currentProps = typeof selectedObject.properties === 'string'
                          ? JSON.parse(selectedObject.properties || '{}')
                          : (selectedObject.properties || {});
                        onUpdate({
                          properties: {
                            ...currentProps,
                            size: {
                              ...(typeof currentProps.size === 'object' && !Array.isArray(currentProps.size) ? currentProps.size : {}),
                              width: newWidth,
                              ...(typeof currentProps.size === 'object' && !Array.isArray(currentProps.size) ? {} : { height: heightValue }),
                            },
                          },
                        });
                      } else {
                        // Update scale_x (convert pixels to scale)
                        onUpdate({ scale_x: newWidth / 100 });
                      }
                    }}
                    className="w-full px-2 py-1 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Height</label>
                  <input
                    type="number"
                    value={heightValue}
                    onChange={(e) => {
                      const newHeight = parseFloat(e.target.value) || 0;
                      if (isPlatform || properties.size) {
                        // Update properties.size
                        const currentProps = typeof selectedObject.properties === 'string'
                          ? JSON.parse(selectedObject.properties || '{}')
                          : (selectedObject.properties || {});
                        onUpdate({
                          properties: {
                            ...currentProps,
                            size: {
                              ...(typeof currentProps.size === 'object' && !Array.isArray(currentProps.size) ? currentProps.size : {}),
                              ...(typeof currentProps.size === 'object' && !Array.isArray(currentProps.size) ? {} : { width: widthValue }),
                              height: newHeight,
                            },
                          },
                        });
                      } else {
                        // Update scale_y (convert pixels to scale)
                        onUpdate({ scale_y: newHeight / 100 });
                      }
                    }}
                    className="w-full px-2 py-1 border border-gray-300 rounded"
                  />
                </div>
              </div>
            );
          })()}
        </div>

        {/* Rotation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rotation (degrees)
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500">X</label>
              <input
                type="number"
                value={(() => {
                  const props = typeof selectedObject.properties === 'string'
                    ? JSON.parse(selectedObject.properties || '{}')
                    : (selectedObject.properties || {});
                  return props.rotation?.x || props.rotation_x || 0;
                })()}
                onChange={(e) => {
                  const props = typeof selectedObject.properties === 'string'
                    ? JSON.parse(selectedObject.properties || '{}')
                    : (selectedObject.properties || {});
                  onUpdate({
                    properties: {
                      ...props,
                      rotation: {
                        ...(props.rotation || {}),
                        x: parseFloat(e.target.value || '0'),
                      },
                    },
                  });
                }}
                className="w-full px-2 py-1 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Y</label>
              <input
                type="number"
                value={(() => {
                  const props = typeof selectedObject.properties === 'string'
                    ? JSON.parse(selectedObject.properties || '{}')
                    : (selectedObject.properties || {});
                  return props.rotation?.y || props.rotation_y || 0;
                })()}
                onChange={(e) => {
                  const props = typeof selectedObject.properties === 'string'
                    ? JSON.parse(selectedObject.properties || '{}')
                    : (selectedObject.properties || {});
                  onUpdate({
                    properties: {
                      ...props,
                      rotation: {
                        ...(props.rotation || {}),
                        y: parseFloat(e.target.value || '0'),
                      },
                    },
                  });
                }}
                className="w-full px-2 py-1 border border-gray-300 rounded"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Z</label>
              <input
                type="number"
                value={(() => {
                  const props = typeof selectedObject.properties === 'string'
                    ? JSON.parse(selectedObject.properties || '{}')
                    : (selectedObject.properties || {});
                  return props.rotation?.z || props.rotation_z || 0;
                })()}
                onChange={(e) => {
                  const props = typeof selectedObject.properties === 'string'
                    ? JSON.parse(selectedObject.properties || '{}')
                    : (selectedObject.properties || {});
                  onUpdate({
                    properties: {
                      ...props,
                      rotation: {
                        ...(props.rotation || {}),
                        z: parseFloat(e.target.value || '0'),
                      },
                    },
                  });
                }}
                className="w-full px-2 py-1 border border-gray-300 rounded"
              />
            </div>
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Color
          </label>
          <input
            type="color"
            value={selectedObject.color || '#4F46E5'}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="w-full h-10 rounded-lg cursor-pointer"
          />
        </div>

        {/* Animation State (for characters with animated models) */}
        {selectedObject.type === 'character' && (() => {
          const props = typeof selectedObject.properties === 'string'
            ? JSON.parse(selectedObject.properties || '{}')
            : (selectedObject.properties || {});
          const modelUrl = props.model_url || props.sprite_data?.model_url;
          if (modelUrl) {
            const ext = (modelUrl.split('.').pop() || '').toLowerCase();
            if (ext === 'glb' || ext === 'gltf' || ext === 'fbx') {
              return (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Animation State
                  </label>
                  <select
                    value={props.animationState === null || props.animationState === undefined ? 'stop' : (props.animationState || 'idle')}
                    onChange={(e) => {
                      const newState = e.target.value === 'stop' ? null : e.target.value;
                      onUpdate({
                        properties: {
                          ...props,
                          animationState: newState,
                        },
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="idle">Idle</option>
                    <option value="walk">Walk</option>
                    <option value="run">Run</option>
                    <option value="jump">Jump</option>
                    <option value="fall">Fall</option>
                    <option value="stop">Stop (No Animation)</option>
                  </select>
                  {availableAnimations.length > 0 && (
                    <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                      <p className="text-xs font-semibold text-blue-800 mb-1">
                        Available Animations ({availableAnimations.length}):
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {availableAnimations.map((anim, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded"
                          >
                            {anim}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    In play mode, animations change automatically based on movement.
                    Check browser console for detected animations.
                  </p>
                  <button
                    onClick={() => {
                      const props = typeof selectedObject.properties === 'string'
                        ? JSON.parse(selectedObject.properties || '{}')
                        : (selectedObject.properties || {});
                      const modelUrl = props.model_url || props.sprite_data?.model_url;
                      if (modelUrl) {
                        setShowAnimationEditor(true);
                        setAnimationEditorModelUrl(modelUrl);
                      }
                    }}
                    className="mt-3 w-full px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Bone className="w-4 h-4" />
                    Open Animation Editor
                  </button>
                </div>
              );
            }
          }
          return null;
        })()}

        {/* Physics */}
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedObject.has_physics || false}
              onChange={(e) => onUpdate({ has_physics: e.target.checked })}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Enable Physics
            </span>
          </label>
        </div>

        {selectedObject.has_physics && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mass
            </label>
            <input
              type="number"
              value={selectedObject.mass || 1}
              onChange={(e) => onUpdate({ mass: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        )}

        {/* Delete Button */}
        {onDelete && (
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={() => {
                if (confirm(`Are you sure you want to delete "${selectedObject.name}"?`)) {
                  onDelete();
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Object
            </button>
          </div>
        )}
      </div>

      {/* Animation Editor Modal */}
      {showAnimationEditor && (
        <AnimationEditor
          isOpen={showAnimationEditor}
          onClose={() => {
            setShowAnimationEditor(false);
            setAnimationEditorModelUrl('');
          }}
          modelUrl={animationEditorModelUrl}
          objectId={selectedObject?.id}
        />
      )}
    </div>
  );
}

