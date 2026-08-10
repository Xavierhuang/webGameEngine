'use client';

import { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, TransformControls } from '@react-three/drei';
import { X, Play, Pause, Square, Save, Download, Bone } from 'lucide-react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

interface AnimationEditorProps {
  isOpen: boolean;
  onClose: () => void;
  modelUrl: string;
  objectId?: string;
}

interface BoneInfo {
  name: string;
  bone: THREE.Bone;
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
    const bonesMapRef = useRef<Map<string, THREE.Bone>>(new Map());
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

          // Extract bone hierarchy
          const bonesList: BoneInfo[] = [];
          const bonesMap = new Map<string, THREE.Bone>();

          if (skeleton) {
            (skeleton as THREE.Skeleton).bones.forEach((bone: THREE.Bone) => {
              bonesMap.set(bone.name, bone);
              bonesList.push({
                name: bone.name,
                bone: bone,
                parent: bone.parent?.name || null,
                position: [bone.position.x, bone.position.y, bone.position.z],
                rotation: [
                  bone.rotation.x * (180 / Math.PI),
                  bone.rotation.y * (180 / Math.PI),
                  bone.rotation.z * (180 / Math.PI),
                ],
                scale: [bone.scale.x, bone.scale.y, bone.scale.z],
              });
            });
          } else {
            // Fallback: try to find bones in the scene
            loadedModel.traverse((child: any) => {
              if (child.type === 'Bone' || child.isBone) {
                const bone = child as THREE.Bone;
                bonesMap.set(bone.name, bone);
                bonesList.push({
                  name: bone.name,
                  bone: bone,
                  parent: bone.parent?.name || null,
                  position: [bone.position.x, bone.position.y, bone.position.z],
                  rotation: [
                    bone.rotation.x * (180 / Math.PI),
                    bone.rotation.y * (180 / Math.PI),
                    bone.rotation.z * (180 / Math.PI),
                  ],
                  scale: [bone.scale.x, bone.scale.y, bone.scale.z],
                });
              }
            });
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bone className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Animation Editor</h2>
            {modelUrl && (
              <span className="text-sm opacity-90">({modelUrl.split('/').pop()})</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Bone Hierarchy */}
          <div className="w-64 bg-gray-50 border-r border-gray-200 overflow-y-auto p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Bone Hierarchy</h3>
            {bones.length === 0 ? (
              <div className="text-sm text-gray-500">Loading bones...</div>
            ) : (
              <div className="space-y-1">
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
              <div className="mt-6 p-3 bg-blue-50 rounded border border-blue-200">
                <h4 className="font-semibold text-sm text-blue-800 mb-2">
                  Selected: {selectedBone}
                </h4>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-gray-600">Position:</span>
                    <div className="font-mono text-gray-800">
                      X: {bones.find((b) => b.name === selectedBone)?.position[0].toFixed(2)}
                      <br />
                      Y: {bones.find((b) => b.name === selectedBone)?.position[1].toFixed(2)}
                      <br />
                      Z: {bones.find((b) => b.name === selectedBone)?.position[2].toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600">Rotation:</span>
                    <div className="font-mono text-gray-800">
                      X: {bones.find((b) => b.name === selectedBone)?.rotation[0].toFixed(1)}°
                      <br />
                      Y: {bones.find((b) => b.name === selectedBone)?.rotation[1].toFixed(1)}°
                      <br />
                      Z: {bones.find((b) => b.name === selectedBone)?.rotation[2].toFixed(1)}°
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Center: 3D Viewport */}
          <div className="flex-1 relative bg-gray-900">
            <Canvas camera={{ position: [0, 1.5, 3], fov: 50 }}>
              <ambientLight intensity={0.6} />
              <directionalLight position={[5, 10, 5]} intensity={0.8} />
              <pointLight position={[-5, 5, -5]} intensity={0.5} />
              <Grid args={[10, 10]} cellSize={0.5} cellColor="#4B5563" sectionColor="#6B7280" />
              <AnimatedModelView />
              {selectedBone && <BoneController boneName={selectedBone} />}
              <OrbitControls ref={orbitRef} />
            </Canvas>
            <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              {transformMode === 'translate' && 'Move (1)'}
              {transformMode === 'rotate' && 'Rotate (2)'}
              {transformMode === 'scale' && 'Scale (3)'}
            </div>
          </div>

          {/* Right Panel: Timeline & Controls */}
          <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto p-4">
            <div className="space-y-4">
              {/* Animation Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Animation Name
                </label>
                <input
                  type="text"
                  value={animationName}
                  onChange={(e) => setAnimationName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duration (seconds)
                </label>
                <input
                  type="number"
                  value={animationDuration}
                  onChange={(e) => setAnimationDuration(parseFloat(e.target.value) || 5)}
                  min="0.1"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              {/* Transform Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transform Mode
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTransformMode('translate')}
                    className={`flex-1 px-3 py-2 rounded ${
                      transformMode === 'translate'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    Move
                  </button>
                  <button
                    onClick={() => setTransformMode('rotate')}
                    className={`flex-1 px-3 py-2 rounded ${
                      transformMode === 'rotate'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    Rotate
                  </button>
                  <button
                    onClick={() => setTransformMode('scale')}
                    className={`flex-1 px-3 py-2 rounded ${
                      transformMode === 'scale'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    Scale
                  </button>
                </div>
              </div>

              {/* Timeline */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Timeline</label>
                  <span className="text-xs text-gray-500">
                    {currentTime.toFixed(2)}s / {animationDuration.toFixed(2)}s
                  </span>
                </div>
                <div className="relative h-32 bg-gray-100 rounded border border-gray-300 overflow-x-auto">
                  <div className="relative h-full" style={{ width: `${animationDuration * 100}px` }}>
                    {/* Time markers */}
                    {Array.from({ length: Math.ceil(animationDuration) + 1 }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-l border-gray-400"
                        style={{ left: `${i * 100}px` }}
                      >
                        <span className="absolute -top-5 left-0 text-xs text-gray-600">{i}s</span>
                      </div>
                    ))}
                    {/* Keyframes */}
                    {keyframes.map((kf, idx) => (
                      <div
                        key={idx}
                        className="absolute top-2 w-2 h-2 bg-blue-600 rounded-full cursor-pointer"
                        style={{ left: `${(kf.time / animationDuration) * 100}%` }}
                        title={`${kf.boneName} at ${kf.time.toFixed(2)}s`}
                      />
                    ))}
                    {/* Playhead */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-600 z-10"
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
                  className="w-full mt-2"
                />
              </div>

              {/* Controls */}
              <div className="flex gap-2">
                <button
                  onClick={addKeyframe}
                  disabled={!selectedBone}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Keyframe
                </button>
                <button
                  onClick={playAnimation}
                  disabled={keyframes.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setIsPlaying(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg"
                >
                  <Square className="w-4 h-4" />
                </button>
              </div>

              {/* Keyframes List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Keyframes ({keyframes.length})
                  </label>
                  <button
                    onClick={() => setKeyframes([])}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Clear All
                  </button>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {keyframes.length === 0 ? (
                    <div className="text-sm text-gray-500 text-center py-4">
                      No keyframes. Select a bone and add keyframes.
                    </div>
                  ) : (
                    keyframes
                      .sort((a, b) => a.time - b.time)
                      .map((kf, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs"
                        >
                          <div>
                            <span className="font-semibold">{kf.boneName}</span>
                            <span className="text-gray-500 ml-2">{kf.time.toFixed(2)}s</span>
                          </div>
                          <button
                            onClick={() =>
                              setKeyframes((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-red-600 hover:underline"
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
                className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Export Animation
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
        className={`w-full text-left px-2 py-1 rounded text-sm ${
          isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
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

