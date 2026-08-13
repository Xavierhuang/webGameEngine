'use client';

import { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, TransformControls } from '@react-three/drei';
import { X, Play, Pause, Square, Save, Download, Bone, Move3D, RotateCw, Maximize2 } from 'lucide-react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { PALETTE } from '../common/design';

interface AnimationEditorProps {
  isOpen: boolean;
  onClose: () => void;
  modelUrl: string;
  objectId?: string;
}

/**
 * Animatable node — either a real THREE.Bone (skinned rigs like Minion) or a
 * plain THREE.Object3D / Mesh (our metal-generated multi-part starters). The
 * TransformControls + keyframe machinery only touches position/rotation/scale,
 * which every Object3D has, so treating a mesh part as a "bone" for the UI's
 * sake works transparently. The field stays named `bone` for compatibility
 * with keyframes and the existing map keys.
 */
interface BoneInfo {
  name: string;
  bone: THREE.Object3D;
  parent: string | null;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

interface Keyframe {
  time: number; // in seconds
  boneName: string;
  transform: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  };
}

export default function AnimationEditor({ isOpen, onClose, modelUrl, objectId }: AnimationEditorProps) {
  const [selectedBone, setSelectedBone] = useState<string | null>(null);
  const [bones, setBones] = useState<BoneInfo[]>([]);
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [animationDuration, setAnimationDuration] = useState(5); // seconds
  const [animationName, setAnimationName] = useState('New Animation');
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationClipRef = useRef<THREE.AnimationClip | null>(null);
  const orbitRef = useRef<any>(null);

  if (!isOpen) return null;

  const ext = (modelUrl.split('.').pop() || '').toLowerCase();

  // Model renderer component
  function AnimatedModelView() {
    const groupRef = useRef<THREE.Group>(null);
    const modelRef = useRef<THREE.Object3D | null>(null);
    const bonesMapRef = useRef<Map<string, THREE.Object3D>>(new Map());
    const [modelLoaded, setModelLoaded] = useState(false);

    useEffect(() => {
      const loadModel = async () => {
        try {
          let loadedModel: any;
          let skeleton: THREE.Skeleton | null = null;

          if (ext === 'glb' || ext === 'gltf') {
            const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js');
            const loader = new GLTFLoader();
            const gltf = await new Promise<any>((resolve, reject) => {
              loader.load(
                modelUrl,
                (gltf: any) => resolve(gltf),
                undefined,
                (error: any) => reject(error)
              );
            });
            loadedModel = gltf.scene;
            // Find skeleton
            loadedModel.traverse((child: any) => {
              if (child.isSkinnedMesh && child.skeleton) {
                skeleton = child.skeleton;
              }
            });
          } else if (ext === 'fbx') {
            const loader = new FBXLoader();
            loadedModel = await new Promise<any>((resolve, reject) => {
              loader.load(
                modelUrl,
                (object: any) => resolve(object),
                undefined,
                (error: any) => reject(error)
              );
            });
            // FBX models have bones directly
            loadedModel.traverse((child: any) => {
              if (child.isSkinnedMesh && child.skeleton) {
                skeleton = child.skeleton;
              }
            });
          }

          modelRef.current = loadedModel;

          // Extract animatable-node hierarchy. Prefer a real skeleton (skinned
          // models like Minion); fall back to loose Bones in the scene; finally
          // fall back to top-level Mesh children (our multi-part metal starters
          // — no skeleton, but each part has its own Object3D transform we can
          // rotate/translate/scale independently).
          const bonesList: BoneInfo[] = [];
          const bonesMap = new Map<string, THREE.Object3D>();

          const pushNode = (node: THREE.Object3D) => {
            if (bonesMap.has(node.name)) return;
            bonesMap.set(node.name, node);
            bonesList.push({
              name: node.name,
              bone: node,
              parent: node.parent?.name || null,
              position: [node.position.x, node.position.y, node.position.z],
              rotation: [
                node.rotation.x * (180 / Math.PI),
                node.rotation.y * (180 / Math.PI),
                node.rotation.z * (180 / Math.PI),
              ],
              scale: [node.scale.x, node.scale.y, node.scale.z],
            });
          };

          if (skeleton) {
            (skeleton as THREE.Skeleton).bones.forEach((bone: THREE.Bone) => pushNode(bone));
          } else {
            // Look for loose bones first.
            loadedModel.traverse((child: any) => {
              if (child.type === 'Bone' || child.isBone) pushNode(child as THREE.Bone);
            });
            // If still nothing, treat every named Mesh child as an animatable
            // node — matches how the metal-starters pipeline emits parts.
            if (bonesList.length === 0) {
              loadedModel.traverse((child: any) => {
                if (child.isMesh && child.name) pushNode(child as THREE.Mesh);
              });
            }
          }

          bonesMapRef.current = bonesMap;
          setBones(bonesList);
          setModelLoaded(true);
        } catch (error) {
          console.error('Failed to load model:', error);
        }
      };

      loadModel();
    }, [modelUrl, ext]);

    // Render bone helpers
    const renderBoneHelpers = () => {
      if (!selectedBone || !bonesMapRef.current.has(selectedBone)) return null;
      
      const bone = bonesMapRef.current.get(selectedBone)!;
      return (
        <group position={bone.position} rotation={bone.rotation} scale={bone.scale}>
          <axesHelper args={[0.1]} />
        </group>
      );
    };

    return (
      <>
        {modelLoaded && modelRef.current && (
          <primitive object={modelRef.current} />
        )}
        {renderBoneHelpers()}
      </>
    );
  }

  // Bone manipulation component
  function BoneController({ boneName }: { boneName: string }) {
    const boneRef = useRef<THREE.Group>(null);
    const bone = bones.find((b) => b.name === boneName)?.bone;

    if (!bone || !selectedBone || selectedBone !== boneName) return null;

    const handleTransform = () => {
      if (!boneRef.current || !bone) return;
      
      // Update bone transform
      bone.position.copy(boneRef.current.position);
      bone.quaternion.copy(boneRef.current.quaternion);
      bone.scale.copy(boneRef.current.scale);

      // Update bones state
      const euler = new THREE.Euler().setFromQuaternion(bone.quaternion);
      setBones((prev) =>
        prev.map((b) =>
          b.name === boneName
            ? {
                ...b,
                position: [bone.position.x, bone.position.y, bone.position.z],
                rotation: [
                  euler.x * (180 / Math.PI),
                  euler.y * (180 / Math.PI),
                  euler.z * (180 / Math.PI),
                ],
                scale: [bone.scale.x, bone.scale.y, bone.scale.z],
              }
            : b
        )
      );
    };

    return (
      <TransformControls
        object={boneRef as any}
        mode={transformMode}
        showX
        showY
        showZ
        onObjectChange={handleTransform}
        onMouseDown={() => {
          if (orbitRef.current) orbitRef.current.enabled = false;
        }}
        onMouseUp={() => {
          if (orbitRef.current) orbitRef.current.enabled = true;
        }}
      >
        <group
          ref={boneRef}
          position={bone.position}
          quaternion={bone.quaternion}
          scale={bone.scale}
        />
      </TransformControls>
    );
  }

  // Add keyframe at current time
  const addKeyframe = () => {
    if (!selectedBone) {
      alert('Please select a bone first');
      return;
    }

    const bone = bones.find((b) => b.name === selectedBone);
    if (!bone) return;

    const keyframe: Keyframe = {
      time: currentTime,
      boneName: selectedBone,
      transform: {
        position: [...bone.position],
        rotation: [...bone.rotation],
        scale: [...bone.scale],
      },
    };

    setKeyframes((prev) => {
      // Remove existing keyframe at this time for this bone
      const filtered = prev.filter(
        (kf) => !(kf.time === currentTime && kf.boneName === selectedBone)
      );
      return [...filtered, keyframe].sort((a, b) => a.time - b.time);
    });
  };

  // Play animation preview
  const playAnimation = () => {
    if (keyframes.length === 0) {
      alert('No keyframes to play. Add some keyframes first.');
      return;
    }

    setIsPlaying(true);
    // TODO: Implement animation playback using AnimationMixer
  };

  // Export animation as GLTF animation clip
  const exportAnimation = async () => {
    if (keyframes.length === 0) {
      alert('No keyframes to export');
      return;
    }

    // Create animation tracks for each bone
    const tracks: THREE.KeyframeTrack[] = [];

    // Group keyframes by bone
    const keyframesByBone = new Map<string, Keyframe[]>();
    keyframes.forEach((kf) => {
      if (!keyframesByBone.has(kf.boneName)) {
        keyframesByBone.set(kf.boneName, []);
      }
      keyframesByBone.get(kf.boneName)!.push(kf);
    });

    // Create tracks for each bone
    keyframesByBone.forEach((boneKeyframes, boneName) => {
      const sorted = boneKeyframes.sort((a, b) => a.time - b.time);
      
      // Position track
      const times: number[] = [];
      const positions: number[] = [];
      sorted.forEach((kf) => {
        times.push(kf.time);
        const pos = kf.transform.position || [0, 0, 0];
        positions.push(pos[0], pos[1], pos[2]);
      });
      if (times.length > 0) {
        const positionTrack = new THREE.VectorKeyframeTrack(
          `${boneName}.position`,
          times,
          positions
        );
        tracks.push(positionTrack);
      }

      // Rotation track (convert degrees to quaternions)
      const rotTimes: number[] = [];
      const rotations: number[] = [];
      sorted.forEach((kf) => {
        rotTimes.push(kf.time);
        const rot = kf.transform.rotation || [0, 0, 0];
        const euler = new THREE.Euler(
          (rot[0] * Math.PI) / 180,
          (rot[1] * Math.PI) / 180,
          (rot[2] * Math.PI) / 180
        );
        const quat = new THREE.Quaternion().setFromEuler(euler);
        rotations.push(quat.x, quat.y, quat.z, quat.w);
      });
      if (rotTimes.length > 0) {
        const rotationTrack = new THREE.QuaternionKeyframeTrack(
          `${boneName}.quaternion`,
          rotTimes,
          rotations
        );
        tracks.push(rotationTrack);
      }

      // Scale track
      const scaleTimes: number[] = [];
      const scales: number[] = [];
      sorted.forEach((kf) => {
        scaleTimes.push(kf.time);
        const scale = kf.transform.scale || [1, 1, 1];
        scales.push(scale[0], scale[1], scale[2]);
      });
      if (scaleTimes.length > 0) {
        const scaleTrack = new THREE.VectorKeyframeTrack(
          `${boneName}.scale`,
          scaleTimes,
          scales
        );
        tracks.push(scaleTrack);
      }
    });

    // Create animation clip
    const clip = new THREE.AnimationClip(animationName, animationDuration, tracks);
    animationClipRef.current = clip;

    // Export as JSON
    const json = JSON.stringify(THREE.AnimationClip.toJSON(clip), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${animationName.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('Animation exported:', clip);
    alert(`Animation "${animationName}" exported successfully!`);
  };

  // Get root bones (bones without parents)
  const rootBones = bones.filter((b) => !b.parent || !bones.find((p) => p.name === b.parent));

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white"
              style={{ background: PALETTE.looks }}
            >
              <Bone className="w-5 h-5" />
            </span>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-none mb-0.5">
                Bone keyframes
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 truncate max-w-[400px]">
                Animation Editor
              </h2>
              {modelUrl && (
                <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[400px]">{modelUrl.split('/').pop()}</div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Bone Hierarchy */}
          <div className="w-64 bg-slate-50 border-r border-slate-200 overflow-y-auto p-4">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Bone hierarchy
            </div>
            {bones.length === 0 ? (
              modelLoaded ? (
                <div className="rounded-xl bg-slate-100 border border-slate-200 p-3 text-xs text-slate-600 leading-relaxed">
                  This model has no named parts to animate. Use the block
                  editor&apos;s motion blocks to move it instead.
                </div>
              ) : (
                <div className="text-sm text-slate-500">Loading parts…</div>
              )
            ) : (
              <div className="space-y-0.5">
                {rootBones.map((bone) => (
                  <BoneTree
                    key={bone.name}
                    bone={bone}
                    allBones={bones}
                    selectedBone={selectedBone}
                    onSelect={setSelectedBone}
                  />
                ))}
              </div>
            )}

            {selectedBone && (
              <div className="mt-6 rounded-xl bg-white border border-slate-200 p-3">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Selected
                </div>
                <div className="font-semibold text-sm text-slate-900 mb-3 break-all">
                  {selectedBone}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                    <div className="text-slate-500 mb-0.5">Position</div>
                    <div className="font-mono text-slate-800 leading-tight">
                      x {bones.find((b) => b.name === selectedBone)?.position[0].toFixed(2)}
                      <br />y {bones.find((b) => b.name === selectedBone)?.position[1].toFixed(2)}
                      <br />z {bones.find((b) => b.name === selectedBone)?.position[2].toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                    <div className="text-slate-500 mb-0.5">Rotation</div>
                    <div className="font-mono text-slate-800 leading-tight">
                      x {bones.find((b) => b.name === selectedBone)?.rotation[0].toFixed(1)}°
                      <br />y {bones.find((b) => b.name === selectedBone)?.rotation[1].toFixed(1)}°
                      <br />z {bones.find((b) => b.name === selectedBone)?.rotation[2].toFixed(1)}°
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Center: 3D Viewport */}
          <div className="flex-1 relative bg-slate-900">
            <Canvas camera={{ position: [0, 1.5, 3], fov: 50 }}>
              <ambientLight intensity={0.6} />
              <directionalLight position={[5, 10, 5]} intensity={0.8} />
              <pointLight position={[-5, 5, -5]} intensity={0.5} />
              <Grid args={[10, 10]} cellSize={0.5} cellColor="#334155" sectionColor="#475569" />
              <AnimatedModelView />
              {selectedBone && <BoneController boneName={selectedBone} />}
              <OrbitControls ref={orbitRef} />
            </Canvas>
            <div className="absolute top-3 left-3 inline-flex items-center gap-1 text-[11px] font-semibold bg-white/95 text-slate-800 px-2.5 py-1 rounded-full border border-slate-200 shadow-sm">
              {transformMode === 'translate' && <><Move3D className="w-3 h-3" /> Move · press 1</>}
              {transformMode === 'rotate' && <><RotateCw className="w-3 h-3" /> Rotate · press 2</>}
              {transformMode === 'scale' && <><Maximize2 className="w-3 h-3" /> Scale · press 3</>}
            </div>
          </div>

          {/* Right Panel: Timeline & Controls */}
          <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto p-4">
            <div className="space-y-5">
              {/* Animation Name */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Animation name
                </label>
                <input
                  type="text"
                  value={animationName}
                  onChange={(e) => setAnimationName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>

              {/* Duration */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Duration (seconds)
                </label>
                <input
                  type="number"
                  value={animationDuration}
                  onChange={(e) => setAnimationDuration(parseFloat(e.target.value) || 5)}
                  min="0.1"
                  step="0.1"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>

              {/* Transform Mode */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Transform mode
                </label>
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200">
                  <TransformPill active={transformMode === 'translate'} onClick={() => setTransformMode('translate')} icon={<Move3D className="w-3.5 h-3.5" />}>Move</TransformPill>
                  <TransformPill active={transformMode === 'rotate'} onClick={() => setTransformMode('rotate')} icon={<RotateCw className="w-3.5 h-3.5" />}>Rotate</TransformPill>
                  <TransformPill active={transformMode === 'scale'} onClick={() => setTransformMode('scale')} icon={<Maximize2 className="w-3.5 h-3.5" />}>Scale</TransformPill>
                </div>
              </div>

              {/* Timeline */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Timeline</label>
                  <span className="text-xs text-slate-500 font-mono">
                    {currentTime.toFixed(2)}s / {animationDuration.toFixed(2)}s
                  </span>
                </div>
                <div className="relative h-24 rounded-lg bg-slate-50 border border-slate-200 overflow-x-auto">
                  <div className="relative h-full pt-5" style={{ width: `${animationDuration * 100}px` }}>
                    {/* Time markers */}
                    {Array.from({ length: Math.ceil(animationDuration) + 1 }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-l border-slate-200"
                        style={{ left: `${i * 100}px` }}
                      >
                        <span className="absolute -top-0 left-1 text-[10px] text-slate-500 font-mono">{i}s</span>
                      </div>
                    ))}
                    {/* Keyframes */}
                    {keyframes.map((kf, idx) => (
                      <div
                        key={idx}
                        className="absolute top-8 w-2.5 h-2.5 rounded-full cursor-pointer shadow-sm"
                        style={{
                          left: `calc(${(kf.time / animationDuration) * 100}% - 5px)`,
                          background: PALETTE.motion,
                        }}
                        title={`${kf.boneName} at ${kf.time.toFixed(2)}s`}
                      />
                    ))}
                    {/* Playhead */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                      style={{ left: `${(currentTime / animationDuration) * 100}%` }}
                    />
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max={animationDuration}
                  step="0.01"
                  value={currentTime}
                  onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                  className="w-full mt-2 accent-slate-900"
                />
              </div>

              {/* Controls */}
              <div className="flex gap-2">
                <button
                  onClick={addKeyframe}
                  disabled={!selectedBone}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 text-sm font-semibold rounded-full px-4 py-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add keyframe
                </button>
                <button
                  onClick={playAnimation}
                  disabled={keyframes.length === 0}
                  className="inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white rounded-full w-10 h-10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setIsPlaying(false)}
                  className="inline-flex items-center justify-center bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-full w-10 h-10 transition"
                  aria-label="Stop"
                >
                  <Square className="w-4 h-4" />
                </button>
              </div>

              {/* Keyframes List */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Keyframes · {keyframes.length}
                  </label>
                  {keyframes.length > 0 && (
                    <button
                      onClick={() => setKeyframes([])}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {keyframes.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                      Select a bone, pose it, and add a keyframe.
                    </div>
                  ) : (
                    keyframes
                      .sort((a, b) => a.time - b.time)
                      .map((kf, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{kf.boneName}</div>
                            <div className="text-slate-500 font-mono">{kf.time.toFixed(2)}s</div>
                          </div>
                          <button
                            onClick={() =>
                              setKeyframes((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-red-600 hover:text-red-700 text-[11px] font-medium"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Export */}
              <button
                onClick={exportAnimation}
                disabled={keyframes.length === 0}
                className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-full font-semibold transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                Export animation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Recursive bone tree component
function BoneTree({
  bone,
  allBones,
  selectedBone,
  onSelect,
  depth = 0,
}: {
  bone: BoneInfo;
  allBones: BoneInfo[];
  selectedBone: string | null;
  onSelect: (name: string) => void;
  depth?: number;
}) {
  const children = allBones.filter((b) => b.parent === bone.name);
  const isSelected = selectedBone === bone.name;

  return (
    <div>
      <button
        onClick={() => onSelect(bone.name)}
        className={`w-full text-left px-2 py-1.5 rounded-md text-xs font-medium transition ${
          isSelected
            ? 'bg-slate-900 text-white'
            : 'text-slate-700 hover:bg-white hover:text-slate-900'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {bone.name}
      </button>
      {children.map((child) => (
        <BoneTree
          key={child.name}
          bone={child}
          allBones={allBones}
          selectedBone={selectedBone}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function TransformPill({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold rounded-md px-2.5 py-1.5 transition ${
        active
          ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

