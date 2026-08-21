'use client';
import { useTranslator } from '../common/LocaleProvider';

import { useState } from 'react';
import { Trash2, Bone, Brush } from 'lucide-react';
import AudioManager from '@/lib/audio/AudioManager';
import AnimationEditor from './AnimationEditor';
import PaintEditor from './PaintEditor';

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
  const t = useTranslator();
  const [showAnimationEditor, setShowAnimationEditor] = useState(false);
  const [showPaintEditor, setShowPaintEditor] = useState(false);

  // `properties` arrives as either a string or an object depending on the
  // driver, which is why this parse appears throughout the file.
  const currentProps = typeof selectedObject?.properties === 'string'
    ? (() => { try { return JSON.parse(selectedObject.properties || '{}'); } catch { return {}; } })()
    : (selectedObject?.properties || {});
  const texturePropUrl: string | null = currentProps?.texture_url ?? null;
  const [animationEditorModelUrl, setAnimationEditorModelUrl] = useState<string>('');
  const [availableAnimations, setAvailableAnimations] = useState<string[]>([]);
  
  if (!selectedObject) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-100 mb-3">
          <span className="text-2xl">🎯</span>
        </div>
        <p className="font-semibold text-slate-900">{t('editor.nothingSelected')}</p>
        <p className="mt-1 text-sm text-slate-500 max-w-[200px]">
          {t('editor.nothingSelectedHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="mb-4">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
          {t('editor.properties')}
        </div>
        <h2 className="text-lg font-bold text-slate-900 truncate">
          {selectedObject.name || 'Object'}
        </h2>
      </div>

      <div className="space-y-4">
        {/* Object History */}
        {selectedObject && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {t('editor.history')}
              </span>
              <button
                onClick={() => onClearHistoryForObject && onClearHistoryForObject(selectedObject.id)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                {t('editor.clear')}
              </button>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
              {(objectHistory || [])
                .filter((h) => h.objectId === selectedObject.id)
                .slice(-10)
                .reverse()
                .map((h) => (
                  <div key={h.id} className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">{h.action}</span>
                      <span className="text-slate-400 font-mono">{new Date(h.at).toLocaleTimeString()}</span>
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap break-words text-slate-600 font-mono text-[10px]">
{JSON.stringify(h.payload, null, 2)}
                    </pre>
                  </div>
                ))}
            </div>
          </div>
        )}

        {selectedObject.properties?.shape === 'particles' && (
          <div className="rounded-2xl border border-slate-200 p-3 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {t('editor.properties.effect')}
            </div>
            {/*
              Sliders rather than number boxes: the emitter is rendering live
              in the scene behind this panel, so dragging shows the result
              immediately. That feedback loop is the reason effects became a
              placed object instead of only a block.
            */}
            <PPField label={t('editor.properties.kind')}>
              <select
                value={selectedObject.properties?.effect ?? 'sparkle'}
                onChange={(e) =>
                  onUpdate({ properties: { ...(selectedObject.properties || {}), effect: e.target.value } })
                }
                className="w-full px-2 py-1 border border-slate-200 rounded-md text-sm text-slate-900"
              >
                {[
                  ['sparkle', t('editor.properties.effect.sparkles')],
                  ['smoke', t('editor.properties.effect.smoke')],
                  ['fire', t('editor.properties.effect.fire')],
                  ['confetti', t('editor.properties.effect.confetti')],
                  ['bubbles', t('editor.properties.effect.bubbles')],
                  ['magic', t('editor.properties.effect.magic')],
                  ['explosion', t('editor.properties.effect.explosion')],
                  ['snow', t('editor.properties.effect.snow')],
                ].map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
              </select>
            </PPField>
            <PPField label={t('editor.common.colour')}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={selectedObject.properties?.particleColour ?? '#ffcc33'}
                  onChange={(e) =>
                    onUpdate({ properties: { ...(selectedObject.properties || {}), particleColour: e.target.value } })
                  }
                  className="h-8 w-12 cursor-pointer rounded border border-slate-200"
                />
                {/* Confetti and fire are multi-coloured by design, so there has
                    to be a way back to the preset's own palette. */}
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({ properties: { ...(selectedObject.properties || {}), particleColour: null } })
                  }
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
                >
                  {t('editor.properties.presetColors')}
                </button>
              </div>
            </PPField>
            <PPField label={t('editor.properties.particleSizeFmt').replace('%d', String(selectedObject.properties?.particleSize ?? 100))}>
              <input
                type="range"
                min={10}
                max={500}
                step={10}
                value={selectedObject.properties?.particleSize ?? 100}
                onChange={(e) =>
                  onUpdate({ properties: { ...(selectedObject.properties || {}), particleSize: Number(e.target.value) } })
                }
                className="w-full accent-slate-900"
              />
            </PPField>
            <PPField label={t('editor.properties.particleAmountFmt').replace('%d', String(selectedObject.properties?.particleAmount ?? 100))}>
              <input
                type="range"
                min={10}
                max={500}
                step={10}
                value={selectedObject.properties?.particleAmount ?? 100}
                onChange={(e) =>
                  onUpdate({ properties: { ...(selectedObject.properties || {}), particleAmount: Number(e.target.value) } })
                }
                className="w-full accent-slate-900"
              />
            </PPField>
          </div>
        )}
        {/* Sound Controls */}
        {selectedObject.type === 'sound' && (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              {t('editor.properties.sound.controls')}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => AudioManager.get().playSfx(selectedObject.properties?.soundType || 'click')}
                className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-full px-3 py-1.5 transition"
              >
                {t('editor.properties.sound.playOnce')}
              </button>
              <button
                onClick={() => AudioManager.get().startBeat(selectedObject.properties?.beat || 'simple', selectedObject.properties?.bpm || 120)}
                className="inline-flex items-center gap-1 text-xs font-semibold bg-white border border-slate-200 hover:border-slate-300 text-slate-800 rounded-full px-3 py-1.5 transition"
              >
                {t('editor.properties.sound.startBeat')}
              </button>
              <button
                onClick={() => AudioManager.get().stopBeat()}
                className="inline-flex items-center gap-1 text-xs font-semibold bg-white border border-slate-200 hover:border-slate-300 text-slate-800 rounded-full px-3 py-1.5 transition"
              >
                {t('editor.properties.sound.stopBeat')}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <PPField label={t('editor.properties.sound.bpm')}>
                <input
                  type="number"
                  defaultValue={selectedObject.properties?.bpm || 120}
                  onBlur={(e) => onUpdate({ properties: { ...(selectedObject.properties || {}), bpm: parseInt(e.target.value || '120') } })}
                  className="w-full px-2 py-1 border border-slate-200 rounded-md text-sm text-slate-900 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </PPField>
              <PPField label={t('editor.properties.sound.autoplay')}>
                <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    defaultChecked={selectedObject.properties?.autoplay_beat || false}
                    onChange={(e) => onUpdate({ properties: { ...(selectedObject.properties || {}), autoplay_beat: e.target.checked } })}
                    className="w-4 h-4 accent-slate-900"
                  />
                  {t('editor.properties.sound.onStart')}
                </label>
              </PPField>
            </div>
          </div>
        )}
        {/* Name */}
        <PPField label={t('editor.name')}>
          <input
            type="text"
            value={selectedObject.name || ''}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
        </PPField>

        {/* Type */}
        <PPField label={t('editor.type')}>
          <input
            type="text"
            value={selectedObject.type || ''}
            disabled
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
          />
        </PPField>

        {/* Position */}
        <PPField label={t('editor.position')}>
          <div className="grid grid-cols-3 gap-2">
            <PPNumField
              label="X"
              value={selectedObject.position_x || 0}
              onChange={(v) => onUpdate({ position_x: v })}
            />
            <PPNumField
              label="Y"
              value={selectedObject.position_y || 0}
              onChange={(v) => onUpdate({ position_y: v })}
            />
            <PPNumField
              label="Z"
              value={selectedObject.position_z || 0}
              onChange={(v) => onUpdate({ position_z: v })}
            />
          </div>
        </PPField>

        {/* Scale/Size */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('editor.size')}
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
              <label className="text-xs text-gray-500">{t('editor.width')}</label>
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
                  <label className="text-xs text-gray-500">{t('editor.height')}</label>
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
            {t('editor.rotation')}
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
            {t('editor.color')}
          </label>
          <input
            type="color"
            value={selectedObject.color || '#4F46E5'}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="w-full h-10 rounded-lg cursor-pointer"
          />

          {/* {t('editor.drawYourOwn')} — the 3D analogue of a Scratch costume, applied as
              the object's surface texture. */}
          <button
            onClick={() => setShowPaintEditor(true)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            <Brush className="h-3.5 w-3.5" />
            {texturePropUrl ? t('editor.editDrawing') : t('editor.drawYourOwn')}
          </button>
          {texturePropUrl && (
            <button
              onClick={() => onUpdate({ properties: { ...currentProps, texture_url: null } })}
              className="mt-1 w-full text-center text-xs text-slate-500 hover:text-slate-800"
            >
              {t('editor.properties.removeDrawing')}
            </button>
          )}
        </div>

        {/* Costumes (Scratch analog — alternate appearances the runtime can switch to) */}
        {(() => {
          const props = typeof selectedObject.properties === 'string'
            ? JSON.parse(selectedObject.properties || '{}')
            : (selectedObject.properties || {});
          const costumes: Array<{ name: string; color?: string; shape?: string; model_url?: string }> =
            Array.isArray(props.costumes) ? props.costumes : [];
          const current = Math.max(0, Math.min(costumes.length - 1, Number(props.current_costume) || 0));
          const SHAPES = ['', 'box', 'sphere', 'cylinder', 'cone', 'pyramid', 'torus', 'capsule', 'plane', 'circle', 'model'];
          const save = (next: typeof costumes, currentIdx = current) => {
            onUpdate({
              properties: {
                ...props,
                costumes: next,
                current_costume: next.length > 0 ? Math.max(0, Math.min(next.length - 1, currentIdx)) : 0,
              },
            });
          };
          return (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  {t('editor.costumes')}
                </label>
                <button
                  onClick={() => {
                    const next = [...costumes, { name: `costume${costumes.length + 1}`, color: selectedObject.color || '#4F46E5' }];
                    save(next, next.length - 1);
                  }}
                  className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                  + Add
                </button>
              </div>
              {costumes.length === 0 ? (
                <p className="text-xs text-gray-500 mt-1">
                  {t('editor.properties.costumes.empty')}
                </p>
              ) : (
                <div className="space-y-2">
                  {costumes.map((c, i) => (
                    <div
                      key={i}
                      className={`p-2 rounded-lg border ${i === current ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white'}`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => save(costumes, i)}
                          title={i === current ? 'Active costume' : 'Set as active'}
                          className={`w-6 h-6 rounded border ${i === current ? 'border-purple-600' : 'border-gray-300'}`}
                          style={{ background: c.color || '#cccccc' }}
                        />
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => {
                            const next = costumes.slice();
                            next[i] = { ...c, name: e.target.value };
                            save(next);
                          }}
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                          placeholder="name"
                        />
                        <button
                          onClick={() => {
                            const next = costumes.filter((_, j) => j !== i);
                            const nextCurrent = i < current ? current - 1 : current;
                            save(next, nextCurrent);
                          }}
                          className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                        >
                          {t('editor.properties.costumes.delete')}
                        </button>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          type="color"
                          value={c.color || '#4F46E5'}
                          onChange={(e) => {
                            const next = costumes.slice();
                            next[i] = { ...c, color: e.target.value };
                            save(next);
                          }}
                          className="w-full h-8 rounded cursor-pointer"
                          title={t('editor.properties.color.title')}
                        />
                        <select
                          value={c.shape || ''}
                          onChange={(e) => {
                            const next = costumes.slice();
                            next[i] = { ...c, shape: e.target.value || undefined };
                            save(next);
                          }}
                          className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                          title={t('editor.properties.shape.title')}
                        >
                          {SHAPES.map((s) => (
                            <option key={s} value={s}>{s || t('editor.properties.inheritShape')}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="text"
                        value={c.model_url || ''}
                        onChange={(e) => {
                          const next = costumes.slice();
                          next[i] = { ...c, model_url: e.target.value || undefined };
                          save(next);
                        }}
                        placeholder="model URL (optional)"
                        className="mt-2 w-full px-2 py-1 text-xs border border-gray-300 rounded font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

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
                    {t('editor.properties.anim.state')}
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
                    <option value="idle">{t('editor.properties.anim.idle')}</option>
                    <option value="walk">{t('editor.properties.anim.walk')}</option>
                    <option value="run">{t('editor.properties.anim.run')}</option>
                    <option value="jump">{t('editor.properties.anim.jump')}</option>
                    <option value="fall">{t('editor.properties.anim.fall')}</option>
                    <option value="stop">{t('editor.properties.anim.stop')}</option>
                  </select>
                  {availableAnimations.length > 0 && (
                    <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                      <p className="text-xs font-semibold text-blue-800 mb-1">
                        {t('editor.properties.anim.availableFmt').replace('%d', String(availableAnimations.length))}
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
                    {t('editor.properties.anim.autoNote')}
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
                    {t('editor.properties.anim.openEditor')}
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
              {t('editor.properties.physics.enable')}
            </span>
          </label>
        </div>

        {selectedObject.has_physics && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('editor.properties.physics.mass')}
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
                if (confirm(t('editor.properties.confirmDelete').replace('%@', selectedObject.name ?? ''))) {
                  onDelete();
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              {t('editor.properties.delete')}
            </button>
          </div>
        )}
      </div>

      {showPaintEditor && (
        <PaintEditor
          isOpen={showPaintEditor}
          onClose={() => setShowPaintEditor(false)}
          initialUrl={texturePropUrl}
          onSave={async (dataUrl) => {
            try {
              const response = await fetch('/api/uploads/texture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dataUrl, name: selectedObject?.name }),
              });
              const data = await response.json().catch(() => ({}));
              if (response.ok && data?.url) {
                onUpdate({ properties: { ...currentProps, texture_url: data.url } });
              } else {
                console.error('[paint] save failed:', data?.error);
              }
            } catch (error) {
              console.error('[paint] save failed:', error);
            }
          }}
        />
      )}

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

// --- Local UI helpers ------------------------------------------------------

function PPField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function PPNumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-slate-500 mb-0.5">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value || '0'))}
        className="w-full px-2 py-1 border border-slate-200 rounded-md text-sm text-slate-900 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
      />
    </div>
  );
}

