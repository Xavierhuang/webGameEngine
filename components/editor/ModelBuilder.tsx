'use client';

import { useRef, useState, useEffect } from 'react';
import { X, Shapes, Plus, Trash2 } from 'lucide-react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Box as DreiBox, Sphere as DreiSphere, TransformControls } from '@react-three/drei';

interface ModelBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (composite: any) => void;
}

type Part = {
  id: string;
  shape: string;
  color: string;
  size: number;
  offset: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number }; // degrees
};

const presets = [
  { shape: 'box', name: 'Box' },
  { shape: 'sphere', name: 'Sphere' },
  { shape: 'cylinder', name: 'Cylinder' },
  { shape: 'cone', name: 'Cone' },
  { shape: 'pyramid', name: 'Pyramid' },
  { shape: 'torus', name: 'Torus' },
  { shape: 'capsule', name: 'Capsule' },
  { shape: 'plane', name: 'Plane' },
];

export default function ModelBuilder({ isOpen, onClose, onSave }: ModelBuilderProps) {
  const [name, setName] = useState('Composite');
  const [parts, setParts] = useState<Part[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [moveSnap, setMoveSnap] = useState<number | null>(null); // world units
  const [rotateSnapDeg, setRotateSnapDeg] = useState<number | null>(null); // degrees
  const [scaleSnap, setScaleSnap] = useState<number | null>(null); // scale units
  const orbitRef = useRef<any>(null);

  // Keyboard shortcuts for gizmo modes and quick selection clearing.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '1') {
        setGizmoMode('translate');
      } else if (e.key === '2') {
        setGizmoMode('rotate');
      } else if (e.key === '3') {
        setGizmoMode('scale');
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const addPart = (shape: string) => {
    setParts((p) => [
      ...p,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        shape,
        color: '#60A5FA',
        size: 50,
        offset: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
      },
    ]);
  };

  const updatePart = (id: string, patch: Partial<Part>) => {
    setParts((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const removePart = (id: string) => {
    setParts((p) => p.filter((x) => x.id !== id));
  };

  const handleSave = () => {
    onSave({
      id: `composite-${Date.now()}`,
      name,
      color: '#60A5FA',
      shape: 'composite',
      size: 1,
      description: 'Composite from primitives',
      properties: {
        shape: 'composite',
        children: parts.map(({ shape, color, size, offset, rotation }) => ({
          shape,
          color,
          size,
          offset,
          rotation: rotation || { x: 0, y: 0, z: 0 },
        })),
      },
    });
    onClose();
  };

  // 3D preview renderer for a single part
  const PartPreview = ({
    part,
    isSelected,
    onSelect,
  }: {
    part: Part;
    isSelected: boolean;
    onSelect: (id: string) => void;
  }) => {
    const scaleVal = (part.size || 50) / 100;
    const scale: [number, number, number] = [scaleVal, scaleVal, scaleVal];
    const pos: [number, number, number] = [part.offset.x, part.offset.y, part.offset.z];
    const rot = part.rotation || { x: 0, y: 0, z: 0 };
    const rotRad: [number, number, number] = [
      (rot.x * Math.PI) / 180,
      (rot.y * Math.PI) / 180,
      (rot.z * Math.PI) / 180,
    ];
    const meshRef = useRef<any>(null);

    const onObjectChange = () => {
      if (!meshRef.current) return;
      const p = parts.find((x) => x.id === part.id);
      if (!p) return;
      const next: Partial<Part> = {};
      next.offset = {
        x: meshRef.current.position.x,
        y: meshRef.current.position.y,
        z: meshRef.current.position.z,
      };
      const rx = meshRef.current.rotation.x;
      const ry = meshRef.current.rotation.y;
      const rz = meshRef.current.rotation.z;
      next.rotation = { x: Math.round((rx * 180) / Math.PI), y: Math.round((ry * 180) / Math.PI), z: Math.round((rz * 180) / Math.PI) };
      if (gizmoMode === 'scale') {
        const s = meshRef.current.scale.x;
        next.size = Math.round(s * 100);
      }
      updatePart(part.id, next);
    };

    const wrap = (node: JSX.Element) => {
      if (!isSelected) return node;
      const rotationSnap = rotateSnapDeg ? (rotateSnapDeg * Math.PI) / 180 : undefined;
      return (
        <TransformControls
          object={meshRef}
          mode={gizmoMode}
          showX
          showY
          showZ
          onObjectChange={onObjectChange}
          onMouseDown={() => {
            if (orbitRef.current) orbitRef.current.enabled = false;
          }}
          onMouseUp={() => {
            if (orbitRef.current) orbitRef.current.enabled = true;
          }}
          translationSnap={moveSnap ?? undefined}
          rotationSnap={rotationSnap}
          scaleSnap={scaleSnap ?? undefined}
        >
          {node}
        </TransformControls>
      );
    };
    if (part.shape === 'sphere') {
      return wrap(
        <DreiSphere
          ref={meshRef}
          position={pos}
          rotation={rotRad}
          scale={scaleVal}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <meshStandardMaterial color={part.color} />
        </DreiSphere>
      );
    }
    if (part.shape === 'cylinder') {
      return wrap(
        <mesh
          ref={meshRef}
          position={pos}
          rotation={rotRad}
          scale={scale}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      );
    }
    if (part.shape === 'cone') {
      return wrap(
        <mesh
          ref={meshRef}
          position={pos}
          rotation={rotRad}
          scale={scale}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <coneGeometry args={[0.6, 1, 24]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      );
    }
    if (part.shape === 'pyramid') {
      return wrap(
        <mesh
          ref={meshRef}
          position={pos}
          rotation={rotRad}
          scale={scale}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <coneGeometry args={[0.7, 1, 4]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      );
    }
    if (part.shape === 'torus') {
      return wrap(
        <mesh
          ref={meshRef}
          position={pos}
          rotation={rotRad}
          scale={scaleVal}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <torusGeometry args={[0.6, 0.2, 16, 32]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      );
    }
    if (part.shape === 'capsule') {
      return wrap(
        <mesh
          ref={meshRef}
          position={pos}
          rotation={rotRad}
          scale={scale}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <capsuleGeometry args={[0.4, 0.8, 8, 16]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      );
    }
    if (part.shape === 'plane') {
      return wrap(
        <mesh
          ref={meshRef}
          position={pos}
          scale={scale}
          rotation={[-Math.PI / 2 + rotRad[0], rotRad[1], rotRad[2]]}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(part.id);
          }}
        >
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color={part.color} />
        </mesh>
      );
    }
    // default: box
    return wrap(
      <DreiBox
        ref={meshRef}
        position={pos}
        rotation={rotRad}
        scale={scale}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(part.id);
        }}
      >
        <meshStandardMaterial color={part.color} />
      </DreiBox>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500 to-teal-500 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shapes className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Model Builder</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto max-h-[calc(90vh-160px)]">
          {/* Right Pane: Preview + Gizmos + Name */}
          <div className="md:col-span-2">
            {/* Live 3D preview */}
            <div className="w-full h-96 relative rounded-lg border border-gray-200 mb-3 overflow-hidden bg-white">
              <div className="absolute z-10 top-2 left-2 text-[12px] text-gray-700 bg-white/80 px-2 py-1 rounded pointer-events-none shadow-sm">
                Click a part to select. Drag gizmos to move/rotate/scale.
                <span className="ml-2">1=Move • 2=Rotate • 3=Scale • Esc=Clear</span>
              </div>
              <Canvas camera={{ position: [0, 3, 6], fov: 55 }}>
                <ambientLight intensity={0.6} />
                <directionalLight position={[5, 10, 5]} intensity={0.8} />
                <Grid args={[20, 20]} cellSize={1} cellColor="#CBD5E1" sectionColor="#94A3B8" />
                <group position={[0, 0, 0]} onClick={() => setSelectedId(null)}>
                  {parts.map((p) => (
                    <PartPreview
                      key={p.id}
                      part={p}
                      isSelected={p.id === selectedId}
                      onSelect={(id) => {
                        setSelectedId(id);
                        setGizmoMode('translate');
                      }}
                    />
                  ))}
                </group>
                <OrbitControls ref={orbitRef} />
              </Canvas>
            </div>
            {/* Gizmo mode */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm text-gray-600">Gizmo:</span>
              <button
                onClick={() => setGizmoMode('translate')}
                className={`px-3 py-1 rounded ${gizmoMode === 'translate' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
              >
                Move
              </button>
              <button
                onClick={() => setGizmoMode('rotate')}
                className={`px-3 py-1 rounded ${gizmoMode === 'rotate' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
              >
                Rotate
              </button>
              <button
                onClick={() => setGizmoMode('scale')}
                className={`px-3 py-1 rounded ${gizmoMode === 'scale' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
              >
                Scale
              </button>
              <span className="text-xs text-gray-500 ml-2">Click a part in the list to edit with gizmos.</span>
            </div>
            {/* Snap controls */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Move Snap:</span>
                <button
                  onClick={() => setMoveSnap(null)}
                  className={`px-2 py-1 rounded text-sm ${moveSnap == null ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
                >
                  Off
                </button>
                <button
                  onClick={() => setMoveSnap(0.5)}
                  className={`px-2 py-1 rounded text-sm ${moveSnap === 0.5 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
                >
                  0.5
                </button>
                <button
                  onClick={() => setMoveSnap(1)}
                  className={`px-2 py-1 rounded text-sm ${moveSnap === 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
                >
                  1
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Rotate Snap:</span>
                <button
                  onClick={() => setRotateSnapDeg(null)}
                  className={`px-2 py-1 rounded text-sm ${rotateSnapDeg == null ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
                >
                  Off
                </button>
                <button
                  onClick={() => setRotateSnapDeg(15)}
                  className={`px-2 py-1 rounded text-sm ${rotateSnapDeg === 15 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
                >
                  15°
                </button>
                <button
                  onClick={() => setRotateSnapDeg(45)}
                  className={`px-2 py-1 rounded text-sm ${rotateSnapDeg === 45 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
                >
                  45°
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Scale Snap:</span>
                <button
                  onClick={() => setScaleSnap(null)}
                  className={`px-2 py-1 rounded text-sm ${scaleSnap == null ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
                >
                  Off
                </button>
                <button
                  onClick={() => setScaleSnap(0.1)}
                  className={`px-2 py-1 rounded text-sm ${scaleSnap === 0.1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
                >
                  0.1
                </button>
                <button
                  onClick={() => setScaleSnap(0.25)}
                  className={`px-2 py-1 rounded text-sm ${scaleSnap === 0.25 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
                >
                  0.25
                </button>
              </div>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg mb-4"
            />
          </div>
          {/* Left Pane: Add Parts + Parts List */}
          <div className="flex flex-col gap-3">
            <h3 className="text-md font-semibold text-gray-800">Add Parts</h3>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((p) => (
                <button key={p.shape} onClick={() => addPart(p.shape)} className="border rounded-lg p-3 hover:shadow flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {p.name}
                </button>
              ))}
            </div>
            <h3 className="text-md font-semibold text-gray-800 mt-2">Parts</h3>
            <div className="space-y-3 max-h-[calc(90vh-360px)] overflow-auto pr-1">
              {parts.length === 0 ? (
                <div className="text-gray-500 text-sm">No parts yet. Add a part above.</div>
              ) : (
                parts.map((part) => (
                  <div key={part.id} className={`border rounded-lg p-3 ${selectedId === part.id ? 'ring-2 ring-blue-500' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <button onClick={() => setSelectedId(part.id)} className="font-medium text-gray-800 hover:underline">
                        {part.shape}
                      </button>
                      <button onClick={() => removePart(part.id)} className="text-red-600 hover:underline flex items-center gap-1">
                        <Trash2 className="w-4 h-4" /> Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-6 gap-2">
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500">Color</label>
                        <input
                          type="color"
                          value={part.color}
                          onChange={(e) => updatePart(part.id, { color: e.target.value })}
                          className="w-full h-9 rounded"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Size</label>
                        <input
                          type="number"
                          value={part.size}
                          onChange={(e) => updatePart(part.id, { size: parseFloat(e.target.value || '50') })}
                          className="w-full px-2 py-1 border rounded"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Offset X</label>
                        <input
                          type="number"
                          value={part.offset.x}
                          onChange={(e) => updatePart(part.id, { offset: { ...part.offset, x: parseFloat(e.target.value || '0') } })}
                          className="w-full px-2 py-1 border rounded"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Offset Y</label>
                        <input
                          type="number"
                          value={part.offset.y}
                          onChange={(e) => updatePart(part.id, { offset: { ...part.offset, y: parseFloat(e.target.value || '0') } })}
                          className="w-full px-2 py-1 border rounded"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Offset Z</label>
                        <input
                          type="number"
                          value={part.offset.z}
                          onChange={(e) => updatePart(part.id, { offset: { ...part.offset, z: parseFloat(e.target.value || '0') } })}
                          className="w-full px-2 py-1 border rounded"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500">Rotate X (deg)</label>
                        <input
                          type="number"
                          value={part.rotation?.x ?? 0}
                          onChange={(e) =>
                            updatePart(part.id, { rotation: { ...(part.rotation || { x: 0, y: 0, z: 0 }), x: parseFloat(e.target.value || '0') } })
                          }
                          className="w-full px-2 py-1 border rounded"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Rotate Y</label>
                        <input
                          type="number"
                          value={part.rotation?.y ?? 0}
                          onChange={(e) =>
                            updatePart(part.id, { rotation: { ...(part.rotation || { x: 0, y: 0, z: 0 }), y: parseFloat(e.target.value || '0') } })
                          }
                          className="w-full px-2 py-1 border rounded"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Rotate Z</label>
                        <input
                          type="number"
                          value={part.rotation?.z ?? 0}
                          onChange={(e) =>
                            updatePart(part.id, { rotation: { ...(part.rotation || { x: 0, y: 0, z: 0 }), z: parseFloat(e.target.value || '0') } })
                          }
                          className="w-full px-2 py-1 border rounded"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4">
              <button
                onClick={handleSave}
                disabled={parts.length === 0}
                className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold disabled:opacity-50"
              >
                Save Composite
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


