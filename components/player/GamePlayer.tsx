'use client';

import { useState, useEffect, useRef, Suspense, memo, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
import { Box, Sphere, Grid, useGLTF, Html } from '@react-three/drei';
import { RotateCcw, Square, Maximize } from 'lucide-react';
import { TouchControls } from './TouchControls';
import { parseAnimations, findAnimation, sampleAnimation } from '../../lib/models/customAnimation';
import { beatsToSeconds } from '../../lib/audio/music';
import { applyTexture } from '../../lib/models/textureMaterial';
import { useTranslator } from '../common/LocaleProvider';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import AnimatedModel from '../editor/AnimatedModel';
import { logger } from '../../lib/utils/logger';
import {
  createModelRenderContract,
  resolveActiveModelMetadata,
} from '../../lib/models/modelRenderContract';
import {
  PHYSICS,
  CAMERA,
  SCENE,
  LIGHTING,
  MOVEMENT,
  RENDERING,
} from '../../lib/constants/game';
import FPSCounter from './FPSCounter';
import VariableWatchers from './VariableWatchers';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { ObjectRuntime, RuntimeWorld, type RuntimeContext } from '../../lib/runtime/interpreter';
import AudioManager from '../../lib/audio/AudioManager';
import type { Project, GameObject, KeyState, LogicBlock, Costume } from '../../types/game';

// -----------------------------------------------------------------------------
// Per-extension mesh components. Each one always calls exactly one loader hook,
// which is how React's Rules of Hooks are satisfied. The dispatch component
// ExtensionModel picks by extension and NEVER calls a hook itself — it only
// renders one of these children conditionally, which is legal.
// -----------------------------------------------------------------------------
type ExtModelProps = {
  modelUrl: string;
  meshRef: React.RefObject<any>;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number] | number;
  color: string;
};

function GLTFExtModel({ modelUrl, meshRef, position, rotation, scale }: ExtModelProps) {
  const gltf = useGLTF(modelUrl) as any;
  return <primitive ref={meshRef} object={gltf.scene} position={position} rotation={rotation} scale={scale} />;
}
function OBJExtModel({ modelUrl, meshRef, position, rotation, scale }: ExtModelProps) {
  const obj = useLoader(OBJLoader as any, modelUrl);
  return <primitive ref={meshRef} object={obj as any} position={position} rotation={rotation} scale={scale} />;
}
function STLExtModel({ modelUrl, meshRef, position, rotation, scale, color }: ExtModelProps) {
  const geom = useLoader(STLLoader as any, modelUrl);
  return (
    <mesh ref={meshRef} position={position} rotation={rotation} scale={scale}>
      <primitive object={geom as any} attach="geometry" />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}
function FBXExtModel({ modelUrl, meshRef, position, rotation, scale }: ExtModelProps) {
  const fbx = useLoader(FBXLoader as any, modelUrl);
  return <primitive ref={meshRef} object={fbx as any} position={position} rotation={rotation} scale={scale} />;
}
function ColladaExtModel({ modelUrl, meshRef, position, rotation, scale }: ExtModelProps) {
  const collada = useLoader(ColladaLoader as any, modelUrl);
  return <primitive ref={meshRef} object={(collada as any).scene} position={position} rotation={rotation} scale={scale} />;
}
function BoxFallback({ meshRef, position, rotation, scale, color }: Omit<ExtModelProps, 'modelUrl'>) {
  return (
    <Box ref={meshRef} position={position} rotation={rotation} scale={scale as any}>
      <meshStandardMaterial color={color} />
    </Box>
  );
}
function ExtensionModel({ ext, ...rest }: ExtModelProps & { ext: string }) {
  switch (ext) {
    case 'glb':
    case 'gltf':
      return <GLTFExtModel {...rest} />;
    case 'obj':
      return <OBJExtModel {...rest} />;
    case 'stl':
      return <STLExtModel {...rest} />;
    case 'fbx':
      return <FBXExtModel {...rest} />;
    case 'dae':
      return <ColladaExtModel {...rest} />;
    default:
      // Unknown extension: fallback to box. No loader hook needed.
      return <BoxFallback {...rest} />;
  }
}

interface GamePlayerProps {
  project: Project;
}

export default function GamePlayer({ project }: GamePlayerProps) {
  // Prime AudioManager eagerly so its user-gesture unlock listener is armed
  // before the first click in the play window. Without this the very first
  // click that fires `on_start` → play_sound races the AudioContext resume
  // and produces silence.
  useEffect(() => {
    AudioManager.get();
  }, []);
  const t = useTranslator();
  const [keys, setKeys] = useState<KeyState>({});
  // Scene switching: scenes arrive ordered by order_index; blocks change the
  // active index. Variables/broadcast state persist across switches (Scratch
  // semantics); the scene's objects remount fresh via the key below.
  const scenes = project.scenes ?? [];
  const [sceneIndex, setSceneIndex] = useState(0);
  const scene = scenes[Math.min(sceneIndex, Math.max(scenes.length - 1, 0))];
  // Shared runtime world: variables, broadcasts, and touch/click sensing.
  const worldRef = useRef<RuntimeWorld | null>(null);
  if (!worldRef.current) {
    worldRef.current = new RuntimeWorld();
    // Gate the game loop until the click-to-start splash unlocks audio.
    // Without this, on_start { play sound } fires into a suspended
    // AudioContext (browser autoplay policy) and never plays.
    worldRef.current.started = false;
  }
  const world = worldRef.current;
  const vars = world.vars;
  const [showStartSplash, setShowStartSplash] = useState(true);
  /**
   * Bumping this remounts every scene object, which is exactly what "restart"
   * means here — fresh runtimes, fresh positions. Variables live on the world,
   * so they're cleared explicitly.
   */
  const [runNonce, setRunNonce] = useState(0);
  const [askPrompt, setAskPrompt] = useState<{ prompt: string; resolve: (v: string) => void } | null>(null);
  const [askDraft, setAskDraft] = useState('');
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    world.onSwitchScene = (name: string) => {
      const wanted = name.trim().toLowerCase();
      const idx = scenes.findIndex((s) => (s.name ?? '').trim().toLowerCase() === wanted);
      if (idx >= 0) setSceneIndex(idx);
      else logger.warn('[GamePlayer] switch_to_scene: no scene named', name);
    };
    world.onNextScene = () => {
      if (scenes.length > 0) setSceneIndex((cur) => (cur + 1) % scenes.length);
    };
    world.onAsk = (prompt: string) =>
      new Promise<string>((resolve) => {
        setAskDraft('');
        setAskPrompt({ prompt, resolve });
      });
    return () => {
      world.onSwitchScene = undefined;
      world.onNextScene = undefined;
      world.onAsk = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, project.scenes]);

  // Pointer tracking for the mouse x / mouse y / mouse down? reporters, in
  // stage coordinates centred on the middle of the stage (Scratch convention).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      world.pointer.x = Math.round(e.clientX - rect.left - rect.width / 2);
      world.pointer.y = Math.round(rect.height / 2 - (e.clientY - rect.top));
    };
    const onDown = () => { world.pointer.down = true; };
    const onUp = () => { world.pointer.down = false; };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [world]);

  /**
   * Autoplaying background beats. SceneView started these in the *editor* only —
   * GamePlayer never called startBeat and never read `autoplay_beat`, so a beat
   * you picked was silent in the actual game.
   */
  useEffect(() => {
    if (showStartSplash || !scene) return;
    const objects = (scene as any).game_objects ?? [];
    const beatObject = objects.find((o: any) => {
      if (o?.type !== 'sound') return false;
      const props = typeof o.properties === 'string' ? safeParse(o.properties) : o.properties;
      return Boolean(props?.autoplay_beat);
    });
    if (!beatObject) return;

    const props =
      typeof beatObject.properties === 'string'
        ? safeParse(beatObject.properties)
        : beatObject.properties ?? {};
    try {
      AudioManager.get().startBeat(props.beat || 'simple', Number(props.bpm) || 120);
    } catch {
      /* audio unavailable */
    }
    return () => {
      try { AudioManager.get().stopBeat(); } catch { /* noop */ }
    };
  }, [scene, showStartSplash]);

  const stopRun = () => {
    world.started = false;
    setAskPrompt(null);
    try { AudioManager.get().stopAllSfx(); } catch { /* noop */ }
  };

  /** `game_objects.properties` arrives as a string or an object depending on the driver. */
  function safeParse(raw: string): any {
    try { return JSON.parse(raw || '{}'); } catch { return {}; }
  }

  const restartRun = () => {
    // Clear cross-run state, then remount every object.
    world.vars.clearAll?.();
    world.resetTimer(0);
    world.setAnswer('');
    setAskPrompt(null);
    setSceneIndex(0);
    setRunNonce((n) => n + 1);
    world.started = true;
  };

  /**
   * Touch controls write into exactly the same key state as the keyboard
   * handler above, so the runtime needs no notion of touch at all.
   */
  const handleTouchKey = useCallback((key: string, down: boolean) => {
    setKeys((prev) => ({ ...prev, [key]: down }));
  }, []);

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    if (scene) {
      logger.debug('[GamePlayer] Scene background_color from database:', scene.background_color);
    }
  }, [scene]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Normalize key names
      let keyName = e.key.toLowerCase();
      // Map arrow keys
      if (e.key === 'ArrowUp') keyName = 'arrowup';
      else if (e.key === 'ArrowDown') keyName = 'arrowdown';
      else if (e.key === 'ArrowLeft') keyName = 'arrowleft';
      else if (e.key === 'ArrowRight') keyName = 'arrowright';
      else if (e.key === ' ') keyName = ' ';
      
      setKeys((prev) => ({ ...prev, [keyName]: true }));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Normalize key names
      let keyName = e.key.toLowerCase();
      // Map arrow keys
      if (e.key === 'ArrowUp') keyName = 'arrowup';
      else if (e.key === 'ArrowDown') keyName = 'arrowdown';
      else if (e.key === 'ArrowLeft') keyName = 'arrowleft';
      else if (e.key === 'ArrowRight') keyName = 'arrowright';
      else if (e.key === ' ') keyName = ' ';
      
      setKeys((prev) => ({ ...prev, [keyName]: false }));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-2 p-4">
        <div className="mb-4 text-white">
          <h1 className="text-2xl font-bold">{project.title || 'My Game'}</h1>
          {project.description && (
            <p className="text-gray-400 text-sm mt-1">{project.description}</p>
          )}
        </div>
        {/* Responsive stage: keeps the 4:3 play area but shrinks to fit a
            tablet or phone instead of overflowing at a fixed 800x600. */}
        <div
          ref={stageRef}
          className="relative w-full max-w-[800px] aspect-[4/3] rounded-lg shadow-2xl overflow-hidden touch-none"
          style={{ backgroundColor: SCENE.DEFAULT_BACKGROUND_COLOR }}
        >
          <FPSCounter position="top-right" />
          <VariableWatchers vars={vars} />
          {!showStartSplash && <TouchControls onKeyChange={handleTouchKey} />}

          {/* ask-and-wait prompt. Sits above the canvas and blocks until answered. */}
          {askPrompt && (
            <form
              className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 bg-slate-900/90 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                askPrompt.resolve(askDraft);
                setAskPrompt(null);
                setAskDraft('');
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="mb-1 block truncate text-xs text-slate-300">{askPrompt.prompt}</span>
                <input
                  autoFocus
                  value={askDraft}
                  onChange={(e) => setAskDraft(e.target.value)}
                  className="w-full rounded-full border border-slate-600 bg-white px-4 py-2 text-sm text-slate-900 outline-none"
                />
              </label>
              <button
                type="submit"
                className="shrink-0 self-end rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                OK
              </button>
            </form>
          )}
          {showStartSplash && (
            <button
              type="button"
              onClick={() => {
                // Two things happen here that both need a genuine user
                // gesture: (1) resume the AudioContext so on_start sounds
                // aren't fired into a suspended context, (2) flip world.started
                // so runtime.step begins actually running scripts.
                try { AudioManager.get(); } catch { /* noop */ }
                world.started = true;
                setShowStartSplash(false);
              }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-900/85 text-white hover:bg-slate-900/75 transition-colors"
              aria-label="Start game"
            >
              <span className="w-16 h-16 rounded-full bg-white/95 text-slate-900 flex items-center justify-center shadow-xl">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <span className="text-xl font-semibold">{t('player.clickToStart')}</span>
              <span className="text-xs text-slate-300">{t('player.unlocksSound')}</span>
            </button>
          )}
          <ErrorBoundary
            fallback={
              <div className="w-full h-full flex items-center justify-center bg-red-900 bg-opacity-50">
                <div className="text-white text-center">
                  <p className="text-xl font-bold mb-2">3D Rendering Error</p>
                  <p className="text-sm">The 3D scene failed to render. Check the console for details.</p>
                </div>
              </div>
            }
          >
            <Canvas 
          camera={{ 
            position: CAMERA.DEFAULT_POSITION, 
            fov: CAMERA.DEFAULT_FOV, 
            near: CAMERA.DEFAULT_NEAR, 
            far: CAMERA.DEFAULT_FAR 
          }}
          gl={{ alpha: true, preserveDrawingBuffer: true }}
          onCreated={({ scene }) => {
            logger.debug('[GamePlayer] Canvas created, setting background to sky blue');
            scene.background = new THREE.Color(SCENE.DEFAULT_BACKGROUND_COLOR);
          }}
        >
          <ambientLight intensity={LIGHTING.AMBIENT_INTENSITY} />
          <pointLight position={LIGHTING.POINT_LIGHT_POSITION} intensity={LIGHTING.POINT_LIGHT_INTENSITY} />
          <directionalLight position={LIGHTING.DIRECTIONAL_LIGHT_1_POSITION} intensity={LIGHTING.DIRECTIONAL_LIGHT_1_INTENSITY} />
          <directionalLight position={LIGHTING.DIRECTIONAL_LIGHT_2_POSITION} intensity={LIGHTING.DIRECTIONAL_LIGHT_2_INTENSITY} />
          <hemisphereLight intensity={LIGHTING.HEMISPHERE_LIGHT_INTENSITY} />
          <Grid
            args={[SCENE.GRID_SIZE, SCENE.GRID_SIZE]}
            cellSize={SCENE.GRID_CELL_SIZE}
            cellColor={SCENE.GRID_CELL_COLOR}
            sectionColor={SCENE.GRID_SECTION_COLOR}
            position={SCENE.GRID_POSITION}
          />
          {scene && (
            <GameScene
              key={`${(scene as any).id ?? sceneIndex}:${runNonce}`}
              scene={scene}
              keys={keys}
              world={world}
            />
          )}
            </Canvas>
          </ErrorBoundary>
        </div>

        {/* Stage controls. Before this there was no way to stop or restart a
            running game — you had to reload the page. */}
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={restartRun}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
            title="Restart the game from the beginning"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('player.restart')}
          </button>
          <button
            type="button"
            onClick={stopRun}
            className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-red-400"
            title="Stop all scripts"
          >
            <Square className="h-3.5 w-3.5" />
            {t('player.stop')}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-600 px-4 py-1.5 text-sm font-semibold text-slate-200 transition hover:border-slate-400"
            title="Toggle fullscreen"
          >
            <Maximize className="h-3.5 w-3.5" />
            {t('player.fullscreen')}
          </button>
        </div>

        <div className="mt-3 text-center text-sm text-white">
          <p>{t('player.controls')}</p>
          <p className="text-gray-400">{t('player.jump')}</p>
        </div>
      </div>
    </ErrorBoundary>
  );
}

// Sky dome - a 3D object that acts as the sky
function SkyDome() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useEffect(() => {
    logger.debug('[SkyDome] Sky dome component mounted and rendering');
    if (meshRef.current) {
      logger.debug('[SkyDome] Mesh created:', {
        position: meshRef.current.position,
        scale: meshRef.current.scale,
        visible: meshRef.current.visible,
        material: meshRef.current.material,
      });
      meshRef.current.frustumCulled = false;
    }
  }, []);
  
  useFrame(() => {
    // Ensure the sky dome is always visible
    if (meshRef.current) {
      meshRef.current.visible = true;
    }
  });
  
  useEffect(() => {
    if (meshRef.current) {
      // Mark this as the sky dome for debugging
      meshRef.current.userData.isSkyDome = true;
      meshRef.current.name = 'SkyDome';
    }
  }, []);
  
  return (
    <mesh 
      ref={meshRef}
      position={[0, 0, 0]} 
      scale={[RENDERING.SKY_DOME_SCALE, RENDERING.SKY_DOME_SCALE, RENDERING.SKY_DOME_SCALE]}
      renderOrder={-10000} // Very low render order to render FIRST (before everything else)
      frustumCulled={false}
      userData={{ isSkyDome: true }}
      name="SkyDome"
    >
      <sphereGeometry args={[1, RENDERING.SKY_DOME_SEGMENTS * 2, RENDERING.SKY_DOME_SEGMENTS]} />
      <meshBasicMaterial 
        color={SCENE.DEFAULT_BACKGROUND_COLOR} 
        side={THREE.BackSide} 
        depthWrite={false}
        depthTest={true} // Enable depth test but write false - renders behind everything
        fog={false}
        transparent={false}
      />
    </mesh>
  );
}

const GameScene = memo(function GameScene({ scene, keys, world }: { scene: { game_objects?: GameObject[]; background_color?: string; background_image_url?: string | null }; keys: KeyState; world: RuntimeWorld  }) {
  const { scene: threeScene, camera } = useThree();
  const skyBlueColor = useRef(new THREE.Color(SCENE.DEFAULT_BACKGROUND_COLOR));
  const checkCount = useRef(0);
  const skyDomeRef = useRef<THREE.Mesh>(null);
  const backdropTextureRef = useRef<THREE.Texture | null>(null);
  const characterPositionRef = useRef<THREE.Vector3 | null>(null);
  // Live clones spawned by create_clone_of blocks
  const [clones, setClones] = useState<{ cloneId: string; sourceId: string }[]>([]);

  useEffect(() => {
    world.onSpawnClone = (sourceId, cloneId) =>
      setClones((prev) => (prev.some((c) => c.cloneId === cloneId) ? prev : [...prev, { cloneId, sourceId }]));
    world.onDespawnClone = (cloneId) =>
      setClones((prev) => prev.filter((c) => c.cloneId !== cloneId));
    return () => {
      world.onSpawnClone = undefined;
      world.onDespawnClone = undefined;
    };
  }, [world]);
  
  useEffect(() => {
    // Per-scene background: use the scene's DB color, falling back to sky blue.
    // skyBlueColor doubles as the enforced color in the useFrame guard below.
    const bg = scene?.background_color || SCENE.DEFAULT_BACKGROUND_COLOR;
    logger.debug('[GameScene] Component mounted, setting background to', bg);
    skyBlueColor.current = new THREE.Color(bg);
    threeScene.background = new THREE.Color(bg);

    // Backdrop image. `scenes.background_image_url` has existed in the schema
    // since the first migration and was never rendered — the colour always won.
    // When set, it replaces the flat colour as the scene background.
    const backdropUrl = scene?.background_image_url;
    if (backdropUrl) {
      let cancelled = false;
      new THREE.TextureLoader().load(
        backdropUrl,
        (texture) => {
          if (cancelled) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          threeScene.background = texture;
          backdropTextureRef.current = texture;
        },
        undefined,
        () => logger.warn('[GameScene] backdrop image failed to load:', backdropUrl)
      );
      return () => {
        cancelled = true;
        backdropTextureRef.current?.dispose();
        backdropTextureRef.current = null;
      };
    }

    // Check if sky dome is in the scene (debug only)
    if (logger.isDevelopment) {
      setTimeout(() => {
        const skyDome = threeScene.children.find((child: any) => child.userData?.isSkyDome) as any;
        logger.group('🌌 SKY DOME CHECK', () => {
          logger.debug(`In scene: ${skyDome ? '✅ YES' : '❌ NO'}`);
          logger.debug(`Total scene children: ${threeScene.children.length}`);
          logger.debug(`Scene background: ${threeScene.background ? (threeScene.background instanceof THREE.Color ? `Color(${threeScene.background.getHexString()})` : typeof threeScene.background) : 'null'}`);
          
          if (skyDome) {
            logger.debug(`Sky dome position: (${skyDome.position.x}, ${skyDome.position.y}, ${skyDome.position.z})`);
            logger.debug(`Sky dome scale: (${skyDome.scale.x}, ${skyDome.scale.y}, ${skyDome.scale.z})`);
            logger.debug(`Sky dome visible: ${skyDome.visible}`);
            logger.debug(`Sky dome material: ${skyDome.material ? skyDome.material.type : 'none'}`);
            if (skyDome.material) {
              logger.debug(`Sky dome color: ${skyDome.material.color ? skyDome.material.color.getHexString() : 'none'}`);
            }
          }
        });
      }, 500);
    }
  }, [threeScene, scene]);
  
  useFrame(() => {
    // Ensure background stays the scene's color.
    // Skipped when a backdrop image is active — otherwise this would overwrite
    // the texture with the flat colour on the very next frame.
    if (backdropTextureRef.current) return;
    checkCount.current++;
    const currentBg = threeScene.background;
    const sceneBg = skyBlueColor.current;

    if (!(currentBg instanceof THREE.Color) || currentBg.getHex() !== sceneBg.getHex()) {
      threeScene.background = sceneBg;
      if (checkCount.current % 300 === 0) { // Log every 5 seconds (60fps * 5) to avoid spam
        logger.debug(`[GameScene] Frame ${checkCount.current}: Background reset to scene color`);
      }
    }
  });
  
  // Debug: Comprehensive scene analysis (development only)
  useEffect(() => {
    if (scene?.game_objects && process.env.NODE_ENV === 'development') {
      const sceneObjects = scene.game_objects;
      logger.group('📊 SCENE ANALYSIS', () => {
        logger.debug(`Total objects: ${sceneObjects.length}`);
        logger.debug(`Background color from DB: ${scene.background_color || 'none'}`);

      const objectsByType: { [key: string]: any[] } = {};
      sceneObjects.forEach((obj: any) => {
        const type = obj.type || 'unknown';
        if (!objectsByType[type]) objectsByType[type] = [];
        objectsByType[type].push(obj);
      });
      
        logger.debug(`\n📦 Objects by type:`);
        Object.entries(objectsByType).forEach(([type, objs]) => {
          logger.debug(`  ${type}: ${objs.length} object(s)`);
          objs.forEach(obj => {
          const props = typeof obj.properties === 'string' 
            ? JSON.parse(obj.properties || '{}') 
            : (obj.properties || {});
          const color = obj.color || props.color || props.sprite_data?.color || '#6B7280';
          const size = props.size || { width: 100, height: 100 };
          const isPlatform = obj.type === 'platform' || props.shape === 'plane';
          const width = isPlatform ? (size.width || 1000) : (typeof size === 'number' ? size : size.width || 100);
          const height = isPlatform ? (size.height || 50) : (typeof size === 'number' ? size : size.height || 100);
          
          // Calculate 3D position for platforms
          const defaultX = 500;
          const defaultY = 300;
          const posX = (obj.position_x === 0 || obj.position_x == null) ? defaultX : obj.position_x;
          const posY = (obj.position_y === 0 || obj.position_y == null) ? defaultY : obj.position_y;
          const pos3D = {
            x: (posX / 100) - 5,
            y: -(posY / 100) + 3,
            z: obj.position_z || 0,
          };
          const size3D = {
            width: isPlatform ? (width / 100) : (typeof size === 'number' ? size / 100 : (size.width || 100) / 100),
            height: isPlatform ? (height / 100) : (typeof size === 'number' ? size / 100 : (size.height || 100) / 100),
          };
          
            logger.debug(`    - "${obj.name}"`);
            logger.debug(`      Color: ${color}`);
            logger.debug(`      Size: ${width}x${height}px (${size3D.width.toFixed(2)}x${size3D.height.toFixed(2)} units in 3D)`);
            logger.debug(`      Position (pixels): (${obj.position_x || 500}, ${obj.position_y || 300}, ${obj.position_z || 0})`);
            logger.debug(`      Position (3D): (${pos3D.x.toFixed(2)}, ${pos3D.y.toFixed(2)}, ${pos3D.z.toFixed(2)})`);
            if (isPlatform) {
              logger.debug(`      ⚠️  This is a PLATFORM - could be covering the sky if large!`);
              logger.debug(`      Camera is at (0, 5, 10) - platform at Y=${pos3D.y.toFixed(2)}`);
              if (size3D.width > 10 || size3D.height > 10) {
                logger.debug(`      ⚠️  Platform is VERY LARGE (${size3D.width.toFixed(1)}x${size3D.height.toFixed(1)} units) - this will cover the entire view!`);
              }
            }
          });
        });
        
        // Check for large green objects
        const largeGreenObjects = sceneObjects.filter((obj: any) => {
        const props = typeof obj.properties === 'string' 
          ? JSON.parse(obj.properties || '{}') 
          : (obj.properties || {});
        const color = obj.color || props.color || props.sprite_data?.color || '#6B7280';
        const isGreen = color.toLowerCase().includes('green') || color === '#00ff00' || color === '#008000';
        const isPlatform = obj.type === 'platform' || props.shape === 'plane';
        const size = props.size || { width: 100, height: 100 };
        const width = isPlatform ? (size.width || 1000) : (typeof size === 'number' ? size : size.width || 100);
        const isLarge = width > 500;
        return isGreen && isLarge;
      });
      
        if (largeGreenObjects.length > 0) {
          logger.warn('\n⚠️  LARGE GREEN OBJECTS DETECTED (could be blocking sky):');
          largeGreenObjects.forEach((obj: any) => {
            const props = typeof obj.properties === 'string' 
              ? JSON.parse(obj.properties || '{}') 
              : (obj.properties || {});
            const size = props.size || { width: 100, height: 100 };
            const defaultX = 500;
            const defaultY = 300;
            const posX = (obj.position_x === 0 || obj.position_x == null) ? defaultX : obj.position_x;
            const posY = (obj.position_y === 0 || obj.position_y == null) ? defaultY : obj.position_y;
            const pos3D = {
              x: (posX / 100) - 5,
              y: -(posY / 100) + 3,
              z: obj.position_z || 0,
            };
            const width3D = (size.width || 1000) / 100;
            const height3D = (size.height || 50) / 100;
            logger.warn(`  - "${obj.name}":`);
            logger.warn(`    Size: ${size.width || 1000}x${size.height || 50}px (${width3D.toFixed(1)}x${height3D.toFixed(1)} units)`);
            logger.warn(`    3D Position: (${pos3D.x.toFixed(2)}, ${pos3D.y.toFixed(2)}, ${pos3D.z.toFixed(2)})`);
            logger.warn(`    Camera: (0, 5, 10) - Platform Y: ${pos3D.y.toFixed(2)}`);
            logger.warn(`    ⚠️  This huge green platform is blocking the sky dome!`);
          });
        }
      });
    }
  }, [scene]);
  
  // Camera follow logic - update camera to follow character
  useFrame((state, delta) => {
    if (characterPositionRef.current) {
      const charPos = characterPositionRef.current;
      // Camera follows character with offset: behind and above
      const cameraOffset = new THREE.Vector3(...CAMERA.FOLLOW_OFFSET);
      const targetPosition = new THREE.Vector3().copy(charPos).add(cameraOffset);
      
      // Smooth camera movement
      camera.position.lerp(targetPosition, delta * CAMERA.FOLLOW_LERP_SPEED);
      // Camera looks at character
      camera.lookAt(charPos);
    }
  });

  return (
    <>
      {/* No SkyDome needed - using scene.background instead which always renders behind everything */}
      {/* Render game objects with frustum culling */}
      {scene.game_objects?.map((obj: any) => (
        <FrustumCulledObject
          key={obj.id}
          object={obj}
          keys={keys}
          world={world}
          camera={camera}
          onPositionUpdate={obj.type === 'character' ? (pos) => {
            characterPositionRef.current = pos;
          } : undefined}
        />
      ))}
      {clones.map((c) => {
        const source = scene.game_objects?.find((o) => o.id === c.sourceId);
        if (!source) return null;
        return (
          <GameObject
            key={c.cloneId}
            object={source}
            keys={keys}
            world={world}
            cloneId={c.cloneId}
          />
        );
      })}
    </>
  );
});

// Frustum culling wrapper - only renders GameObject if it's in the camera's view
const FrustumCulledObject = memo(function FrustumCulledObject({
  object,
  keys,
  world,
  camera,
  onPositionUpdate
}: {
  object: GameObject;
  keys: KeyState;
  world: RuntimeWorld;
  camera: THREE.Camera;
  onPositionUpdate?: (pos: THREE.Vector3) => void;
}) {
  const [isVisible, setIsVisible] = useState(true);
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const boundingBox = useMemo(() => new THREE.Box3(), []);
  const objectPosition = useRef(new THREE.Vector3());
  
  useFrame(() => {
    // Update object position from database
    const posX = object.position_x || 0;
    const posY = object.position_y || 0;
    const posZ = object.position_z || 0;
    objectPosition.current.set(
      (posX / 100) - 5,
      -(posY / 100) + 3,
      posZ || 0
    );
    
    // Get object size for bounding box
    const properties = typeof object.properties === 'string' 
      ? JSON.parse(object.properties || '{}')
      : (object.properties || {});
    
    const isPlatform = object.type === 'platform' || properties.shape === 'plane';
    let size: number;
    if (isPlatform) {
      const baseWidthPx = properties.size?.width ?? 1000;
      const baseHeightPx = properties.size?.height ?? 50;
      size = Math.max(baseWidthPx / 100, baseHeightPx / 100);
    } else {
      size = properties.size
        ? (typeof properties.size === 'number' ? properties.size / 100 : (properties.size.width || 50) / 100)
        : (object.scale_x || 1);
    }
    
    // Create bounding box around object
    boundingBox.setFromCenterAndSize(objectPosition.current, new THREE.Vector3(size, size, size));
    
    // Update frustum from camera
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix);
    
    // Check if bounding box intersects frustum
    const visible = frustum.intersectsBox(boundingBox);
    setIsVisible(visible);
  });
  
  // Always render characters (they're important)
  if (object.type === 'character') {
    return (
      <GameObject
        object={object}
        keys={keys}
        world={world}
        onPositionUpdate={onPositionUpdate}
      />
    );
  }

  // Only render if visible
  if (!isVisible) {
    return null;
  }

  return (
    <GameObject
      object={object}
      keys={keys}
      world={world}
      onPositionUpdate={onPositionUpdate}
    />
  );
});

/**
 * Speech bubble that follows the object's live world position, independent of
 * any mesh scale/transform. Rendered as a scene-root sibling of the mesh so the
 * mesh's scale never distorts the bubble offset or size.
 */
function FollowerBubble({
  meshRef,
  bubble,
  yOffset,
}: {
  meshRef: React.RefObject<THREE.Object3D>;
  bubble: { text: string; style: 'say' | 'think' } | null;
  yOffset: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!groupRef.current || !meshRef.current) return;
    // Copy world position so parent scale never distorts the anchor.
    meshRef.current.getWorldPosition(groupRef.current.position);
    groupRef.current.position.y += yOffset;
  });
  if (!bubble) return null;
  const border = bubble.style === 'say' ? '2px solid #333' : '2px dashed #333';
  const tailChar = bubble.style === 'say' ? '▾' : '⋯';
  return (
    <group ref={groupRef} renderOrder={999}>
      <Html center distanceFactor={10} zIndexRange={[40, 20]} occlude={false}>
        <div
          style={{
            background: 'white', color: '#111', border, borderRadius: 12, padding: '6px 10px',
            fontFamily: 'system-ui, sans-serif', fontSize: 13, maxWidth: 200, minWidth: 40,
            whiteSpace: 'pre-wrap', textAlign: 'center', pointerEvents: 'none', userSelect: 'none',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)', position: 'relative',
          }}
        >
          {bubble.text}
          <span style={{
            position: 'absolute', left: '50%', bottom: -10, transform: 'translateX(-50%)',
            color: '#333', fontSize: 14, lineHeight: 1,
          }}>{tailChar}</span>
        </div>
      </Html>
    </group>
  );
}

const GameObject = memo(function GameObject({ object, keys, world, onPositionUpdate, cloneId }: { object: GameObject; keys: KeyState; world: RuntimeWorld; onPositionUpdate?: (pos: THREE.Vector3) => void; cloneId?: string }) {
  // Clones register/run under their clone id but render the source object's looks.
  const objectId = cloneId ?? object.id;
  const meshRef = useRef<THREE.Mesh>(null);
  const velocityRef = useRef({ x: 0, y: 0, z: 0 });
  const isGroundedRef = useRef(false);
  // Live key state for the interpreter (React replaces the keys object each event)
  const keysRef = useRef<KeyState>(keys);
  keysRef.current = keys;
  // Per-frame movement accumulated by interpreter move blocks
  const frameAccumRef = useRef({ x: 0, z: 0 });
  // Live rotation (radians) applied every frame — mutated by both rotate (add) and setRotation (replace)
  const baseRotationRef = useRef<{ x: number; y: number; z: number } | null>(null);
  // Bounding radius for touch sensing (set each render from computed scale)
  const radiusRef = useRef(0.5);
  // Phase 5b looks state applied each frame
  const visibleRef = useRef(true);
  const sizeMultiplierRef = useRef(1);
  const tintColorRef = useRef<string | null>(null);
  // Graphic effects (ghost/brightness/color) and draw order, applied in the
  // same per-frame material pass as the tint.
  const effectsRef = useRef<Record<string, number>>({});
  /** Name of the custom animation currently playing, and when it started. */
  const customAnimRef = useRef<{ name: string; startedAt: number } | null>(null);
  /** Pen trail: a list of strokes, each a list of world-space points. */
  const penStateRef = useRef<{ down: boolean; color: string; size: number; points: number[][][] }>({
    down: false,
    color: '#ff3b30',
    size: 4,
    points: [],
  });
  const [penStrokes, setPenStrokes] = useState<number[][][]>([]);
  /** Throttles how often the trail is re-published to React state. */
  const penTickRef = useRef(0);
  const layerRef = useRef(0);
  /** Keeps the loaded texture so it isn't refetched every frame. */
  const textureCacheRef = useRef<{ url: string | null; texture: any }>({ url: null, texture: null });
  const [bubble, setBubble] = useState<{ text: string; style: 'say' | 'think'; expiresAt: number | null } | null>(null);
  // Costumes (Scratch analog) — refs feed the runtime callbacks (built once); state drives the appearance re-render.
  const costumesRef = useRef<Costume[]>([]);
  const costumeIndexRef = useRef(0);
  const [costumeIndex, setCostumeIndex] = useState(() => {
    const raw = typeof object.properties === 'string' ? object.properties : JSON.stringify(object.properties || {});
    try {
      const parsed = JSON.parse(raw || '{}');
      const list: unknown = parsed?.costumes;
      const n = Array.isArray(list) ? list.length : 0;
      if (n === 0) return 0;
      const initial = Number(parsed?.current_costume) || 0;
      return Math.max(0, Math.min(n - 1, initial));
    } catch { return 0; }
  });
  costumeIndexRef.current = costumeIndex;
  const bubbleRef = useRef(bubble);
  bubbleRef.current = bubble;

  // Register in the shared world for broadcasts and touch/click sensing
  useEffect(() => {
    world.register(objectId, {
      name: object.name,
      getPosition: () =>
        meshRef.current
          ? { x: meshRef.current.position.x, y: meshRef.current.position.y, z: meshRef.current.position.z }
          : positionRef.current,
      getRotation: () =>
        meshRef.current
          ? {
              x: (meshRef.current.rotation.x * 180) / Math.PI,
              y: (meshRef.current.rotation.y * 180) / Math.PI,
              z: (meshRef.current.rotation.z * 180) / Math.PI,
            }
          : { x: 0, y: 0, z: 0 },
      getRadius: () => radiusRef.current,
      touchable: object.type !== 'platform',
    });
    return () => world.unregister(objectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, objectId, object.name]);

  // Block interpreter context — stable across frames, reads everything through refs
  const ctxRef = useRef<RuntimeContext | null>(null);
  if (!ctxRef.current) {
    ctxRef.current = {
      getKeys: () => keysRef.current,
      move: (dx, dz) => {
        frameAccumRef.current.x += dx;
        frameAccumRef.current.z += dz;
      },
      jump: () => {
        if (isGroundedRef.current) {
          velocityRef.current.y = PHYSICS.JUMP_FORCE;
          isGroundedRef.current = false;
        }
      },
      rotate: (xDeg, yDeg, zDeg) => {
        const base = baseRotationRef.current ?? { x: 0, y: 0, z: 0 };
        baseRotationRef.current = {
          x: base.x + (xDeg * Math.PI) / 180,
          y: base.y + (yDeg * Math.PI) / 180,
          z: base.z + (zDeg * Math.PI) / 180,
        };
      },
      scaleBy: (factor) => {
        if (factor > 0) sizeMultiplierRef.current *= factor;
      },
      playSound: (name, volume) => {
        try {
          return AudioManager.get().playSfx(name, volume ?? 1);
        } catch (e) {
          logger.warn('[GamePlayer] playSfx failed:', e);
          return 0;
        }
      },
      stopAllSounds: () => {
        try {
          AudioManager.get().stopAllSfx();
        } catch (e) {
          logger.warn('[GamePlayer] stopAllSfx failed:', e);
        }
      },
      // Phase 5a: motion writers/readers
      getPosition: () => ({ ...positionRef.current }),
      getRotation: () => {
        const r = baseRotationRef.current ?? { x: 0, y: 0, z: 0 };
        return { x: (r.x * 180) / Math.PI, y: (r.y * 180) / Math.PI, z: (r.z * 180) / Math.PI };
      },
      setPosition: (x, y, z) => {
        positionRef.current.x = x;
        positionRef.current.y = y;
        positionRef.current.z = z;
        if (meshRef.current) meshRef.current.position.set(x, y, z);
        velocityRef.current.x = 0;
        velocityRef.current.y = 0;
        velocityRef.current.z = 0;
        isGroundedRef.current = false;
      },
      changePosition: (dx, dy, dz) => {
        positionRef.current.x += dx;
        positionRef.current.y += dy;
        positionRef.current.z += dz;
        if (meshRef.current) {
          meshRef.current.position.x += dx;
          meshRef.current.position.y += dy;
          meshRef.current.position.z += dz;
        }
        if (dy !== 0) {
          velocityRef.current.y = 0;
          isGroundedRef.current = false;
        }
      },
      setPositionAxis: (axis, v) => {
        positionRef.current[axis] = v;
        if (meshRef.current) meshRef.current.position[axis] = v;
        if (axis === 'y') {
          velocityRef.current.y = 0;
          isGroundedRef.current = false;
        }
      },
      setRotation: (xDeg, yDeg, zDeg) => {
        baseRotationRef.current = {
          x: (xDeg * Math.PI) / 180,
          y: (yDeg * Math.PI) / 180,
          z: (zDeg * Math.PI) / 180,
        };
      },
      pointTowards: (targetX, targetZ) => {
        const self = positionRef.current;
        const dx = targetX - self.x;
        const dz = targetZ - self.z;
        // Scratch/three: object faces -Z by default; angle so that forward vector points at target on XZ.
        const yRad = Math.atan2(dx, -dz);
        baseRotationRef.current = {
          x: baseRotationRef.current?.x ?? 0,
          y: yRad,
          z: baseRotationRef.current?.z ?? 0,
        };
      },
      // Phase 5b: looks basics
      getVisible: () => visibleRef.current,
      setVisible: (v) => { visibleRef.current = v; },
      getSize: () => sizeMultiplierRef.current * 100,
      setSize: (pct) => { sizeMultiplierRef.current = Math.max(0, pct) / 100; },
      changeSizeBy: (deltaPct) => { sizeMultiplierRef.current = Math.max(0, sizeMultiplierRef.current * 100 + deltaPct) / 100; },
      say: (text, seconds, style = 'say') => {
        const expiresAt = seconds && seconds > 0 ? performance.now() + seconds * 1000 : null;
        setBubble({ text, style, expiresAt });
      },
      clearBubble: () => setBubble(null),
      setColor: (hex) => { tintColorRef.current = hex; },
      // Phase 5c: AI (implementation delegated to the app so the interpreter stays server-agnostic)
      askAI: (prompt, cb, options) => {
        fetch('/api/ai/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, choices: options?.choices }),
        })
          .then((r) => r.json())
          .then((data) => cb(String(data?.answer ?? '')))
          .catch((e) => {
            logger.warn('[GamePlayer] askAI failed:', e);
            cb('');
          });
      },
      // Scene switching — delegate to the player-level handlers on the world.
      switchScene: (name) => world.onSwitchScene?.(name),
      nextScene: () => world.onNextScene?.(),
      // Costumes — mutate the ref immediately (getCostume sees it same frame) and
      // fire setState so the mesh re-renders with the new appearance.
      switchCostume: (name) => {
        const list = costumesRef.current;
        if (list.length === 0) return;
        const wanted = String(name || '').trim().toLowerCase();
        const i = list.findIndex((c) => String(c?.name || '').trim().toLowerCase() === wanted);
        if (i >= 0) {
          costumeIndexRef.current = i;
          setCostumeIndex(i);
        }
      },
      nextCostume: () => {
        const list = costumesRef.current;
        if (list.length === 0) return;
        const next = (costumeIndexRef.current + 1) % list.length;
        costumeIndexRef.current = next;
        setCostumeIndex(next);
      },
      getCostume: () => {
        const list = costumesRef.current;
        if (list.length === 0) return { number: 1, name: '' };
        const i = Math.max(0, Math.min(list.length - 1, costumeIndexRef.current));
        return { number: i + 1, name: String(list[i]?.name ?? '') };
      },
      // Graphic effects — stored as refs and applied in the same frame loop that
      // applies the colour tint (see the material pass below).
      setEffect: (effect, value) => { effectsRef.current = { ...effectsRef.current, [effect]: value }; },
      getEffect: (effect) => effectsRef.current[effect] ?? 0,
      clearEffects: () => { effectsRef.current = {}; },
      // Layer ordering maps to renderOrder; higher draws later (on top).
      goToLayer: (layer) => { layerRef.current = layer === 'front' ? 1000 : -1000; },
      changeLayerBy: (delta) => { layerRef.current += delta; },
      // ask-and-wait: the prompt UI is stage-level, so delegate to the player.
      ask: (prompt) => world.onAsk?.(prompt) ?? Promise.resolve(''),
      // --- Music extension. AudioManager owns tempo/instrument state. ---
      playNote: (note, beats) => {
        try { return AudioManager.get().playNote(note, beats); }
        catch { return 0; }
      },
      playDrum: (drum, beats) => {
        try { return AudioManager.get().playDrum(drum, beats); }
        catch { return 0; }
      },
      restForBeats: (beats) => {
        try { return beatsToSeconds(beats, AudioManager.get().getTempo()); }
        catch { return 0; }
      },
      setInstrument: (id) => { try { AudioManager.get().setInstrument(id); } catch { /* noop */ } },
      setTempo: (bpm) => { try { AudioManager.get().setTempo(bpm); } catch { /* noop */ } },
      changeTempoBy: (delta) => { try { AudioManager.get().changeTempoBy(delta); } catch { /* noop */ } },

      // --- Text-to-speech via the browser's SpeechSynthesis. ---
      speak: (text, untilDone) => {
        const value = String(text ?? '').trim();
        if (!value || typeof window === 'undefined' || !window.speechSynthesis) {
          return untilDone ? Promise.resolve() : undefined;
        }
        const utterance = new SpeechSynthesisUtterance(value);
        if (!untilDone) {
          window.speechSynthesis.speak(utterance);
          return;
        }
        return new Promise<void>((resolve) => {
          // Resolve on error too, or a script would hang forever when speech
          // is unavailable or interrupted.
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          window.speechSynthesis.speak(utterance);
        });
      },

      // --- Pen extension. Trails are sampled per frame while the pen is down
      // and drawn as a line following the object. ---
      penDown: (down) => {
        penStateRef.current.down = down;
        // Starting a new stroke shouldn't connect to where the pen was lifted.
        if (down) penStateRef.current.points.push([]);
      },
      penClear: () => { penStateRef.current.points = []; },
      penSetColor: (hex) => { penStateRef.current.color = hex; },
      penSetSize: (size) => { penStateRef.current.size = Math.max(1, Math.min(50, size)); },

      // Custom animations authored in the Animation Editor and saved onto the
      // object's properties.animations.
      switchAnimation: (name) => {
        const wanted = String(name ?? '').trim();
        if (!wanted || wanted.toLowerCase() === 'stop' || wanted.toLowerCase() === 'none') {
          customAnimRef.current = null;
          return;
        }
        customAnimRef.current = { name: wanted, startedAt: performance.now() / 1000 };
      },
    };
  }

  // Parse properties FIRST (before using it)
  const properties = typeof object.properties === 'string'
    ? JSON.parse(object.properties || '{}')
    : (object.properties || {});
  
  // Check if there's a manual animation state override (e.g., "stop")
  const manualAnimationState = properties.animationState;
  const isAnimationStopped = manualAnimationState === null || manualAnimationState === 'stop' || manualAnimationState === 'none';
  
  // Initialize animation state from properties if set, otherwise default to 'idle'
  // This ensures that if the character has 'walk' set in properties, it starts with walk animation
  const initialAnimationState = (manualAnimationState && !isAnimationStopped) 
    ? (manualAnimationState as 'idle' | 'walk' | 'run' | 'jump' | 'fall')
    : 'idle';
  const [animationState, setAnimationState] = useState<'idle' | 'walk' | 'run' | 'jump' | 'fall' | null>(initialAnimationState);
  const lastMoveStateRef = useRef({ wasMoving: false, wasJumping: false, wasFalling: false });
  // Default center position: (500, 300) in pixels = (0, 0) in 3D
  // Treat (0, 0) as center for backward compatibility
  const defaultX = 500;
  const defaultY = 300;
  const posX = (object.position_x === 0 || object.position_x == null) ? defaultX : object.position_x;
  const posY = (object.position_y === 0 || object.position_y == null) ? defaultY : object.position_y;
  // Clones spawn at the source object's live position.
  const spawnPos = cloneId ? world.getObjectPosition(object.id) : null;
  const positionRef = useRef(
    spawnPos
      ? { x: spawnPos.x, y: spawnPos.y, z: spawnPos.z }
      : {
          x: (posX / 100) - 5,
          y: -(posY / 100) + 3,
          z: object.position_z || 0,
        }
  );

  // Costumes: sync ref with the object's saved costume list, then resolve the active one.
  // The active costume's fields layer over the base appearance (Scratch costume semantics).
  const costumesList: Costume[] = Array.isArray(properties.costumes) ? properties.costumes : [];
  costumesRef.current = costumesList;
  const activeCostume: Costume | null = costumesList.length > 0
    ? costumesList[Math.max(0, Math.min(costumesList.length - 1, costumeIndex))]
    : null;

  // Get color from multiple possible locations (active costume wins if set)
  const color = activeCostume?.color
    || object.color
    || properties.color
    || properties.sprite_data?.color
    || '#6B7280';

  // Convert pixel coordinates to 3D coordinates (same as editor)
  const position = [
    positionRef.current.x,
    positionRef.current.y,
    positionRef.current.z,
  ] as [number, number, number];

  // Get scale/size from properties or use defaults
  const isPlatform = object.type === 'platform' || properties.shape === 'plane';
  let scale: [number, number, number];
  let scaleValue: number; // For physics calculations
  
  if (isPlatform) {
    const baseWidthPx = properties.size?.width ?? 1000;
    const baseHeightPx = properties.size?.height ?? 50;
    // No size limit - let platforms be as large as needed to cover the grid
    const scaleX = baseWidthPx / 100;
    const scaleY = baseHeightPx / 100;
    scale = [scaleX, scaleY, 1];
    // For platforms, use average scale for physics
    scaleValue = (scaleX + scaleY) / 2;
  } else {
    scaleValue = properties.size
      ? (typeof properties.size === 'number' ? properties.size / 100 : (properties.size.width || 50) / 100)
      : (object.scale_x || 1);
    scale = [scaleValue, scaleValue, scaleValue];
  }
  // Get rotation from properties (in degrees, convert to radians)
  const rotationFromProps = properties.rotation || {};
  const rotation: [number, number, number] = [
    ((rotationFromProps.x || 0) * Math.PI) / 180,
    ((rotationFromProps.y || 0) * Math.PI) / 180,
    ((rotationFromProps.z || 0) * Math.PI) / 180,
  ];

  // Determine shape from properties (active costume wins if it declares one)
  const baseModelUrl = properties.model_url || properties.sprite_data?.model_url;
  const modelUrl = activeCostume?.model_url || baseModelUrl;
  const shape = activeCostume?.shape
    || properties.shape
    || properties.sprite_data?.shape
    || (modelUrl ? 'model' : 'box');
  const isCharacter = object.type === 'character';
  const modelMetadata = resolveActiveModelMetadata({
    shape,
    baseModelUrl,
    modelUrl,
    baseBounds: properties.model_bounds || properties.sprite_data?.model_bounds,
    baseOriginOffset: properties.model_origin_offset
      || properties.sprite_data?.model_origin_offset,
    activeBounds: activeCostume?.model_bounds,
    activeOriginOffset: activeCostume?.model_origin_offset,
  });
  const modelBounds = modelMetadata.bounds;
  const modelOriginOffset = modelMetadata.originOffset;
  const modelRender = createModelRenderContract(
    scaleValue,
    modelBounds,
    modelOriginOffset
  );
  radiusRef.current = modelRender.touchRadius;
  
  // Debug logging
  logger.debug('[GamePlayer] Rendering object:', {
    name: object.name,
    type: object.type,
    shape,
    modelUrl,
    isCharacter,
    properties: properties,
  });

  // Parse logic blocks
  const logicBlocks = object.logic_blocks || [];
  const hasMovementLogic = logicBlocks.some((block: any) => {
    const blockData = typeof block.block_data === 'string'
      ? JSON.parse(block.block_data || '{}')
      : (block.block_data || {});
    return block.block_type === 'on_key_press' || 
           block.block_type === 'move' ||
           block.category === 'movement' ||
           block.category === 'input' ||
           block.category === 'event';
  });

  // Debug: Log logic blocks for this object
  if (logicBlocks.length > 0) {
    logger.debug(`Object "${object.name}" has ${logicBlocks.length} logic blocks:`, logicBlocks);
  }

  // Build the block interpreter; rebuilt when the object's blocks change
  const blocksKey = JSON.stringify(logicBlocks);
  const runtime = useMemo(() => {
    if (logicBlocks.length === 0) return null;
    return new ObjectRuntime(objectId, logicBlocks as LogicBlock[], world.vars, ctxRef.current!, world, { isClone: !!cloneId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksKey, objectId, world]);

  // Expose this object's scripts to world broadcasts
  useEffect(() => {
    if (runtime) world.attachRuntime(objectId, runtime);
  }, [world, objectId, runtime]);

  // Physics simulation (simple gravity and movement)
  const hasInitializedPosition = useRef(false);
  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Enable physics if object has physics enabled OR has movement logic blocks
    const shouldHavePhysics = object.has_physics || hasMovementLogic || isCharacter;

    // Initialize position on first frame for physics objects
    if (shouldHavePhysics && !hasInitializedPosition.current) {
      // For characters, position is already at torso center from database
      // For other objects, use the position as-is
      meshRef.current.position.set(position[0], position[1], position[2]);
      positionRef.current.x = position[0];
      positionRef.current.y = position[1];
      positionRef.current.z = position[2];
      hasInitializedPosition.current = true;
      
      // Check if object starts on the ground
      // IMPORTANT: For characters, meshRef position IS at the feet (model pivot is at feet)
      const groundY = PHYSICS.GROUND_Y;
      if (isCharacter) {
        // For characters, position is already at feet (no offset needed)
        const feetY = position[1];
        isGroundedRef.current = feetY <= groundY + PHYSICS.GROUND_TOLERANCE;
        // If character starts above ground, make sure it's not grounded so it falls
        if (feetY > groundY + PHYSICS.GROUND_TOLERANCE) {
          isGroundedRef.current = false;
          logger.debug(`[GamePlayer] Character "${object.name}" starts above ground (feet at ${feetY.toFixed(2)}, ground at ${groundY}), will fall`);
        }
      } else {
        // For other objects, assume pivot is at center
        const bottomY = position[1] - scaleValue / 2;
        isGroundedRef.current = bottomY <= groundY + PHYSICS.GROUND_TOLERANCE;
        // If object starts above ground, make sure it's not grounded so it falls
        if (bottomY > groundY + PHYSICS.GROUND_TOLERANCE) {
          isGroundedRef.current = false;
          logger.debug(`[GamePlayer] Object "${object.name}" starts above ground (bottom at ${bottomY.toFixed(2)}, ground at ${groundY}), will fall`);
        }
      }
    }

    if (shouldHavePhysics) {
      // Simple gravity - always apply if not grounded
      if (!isGroundedRef.current) {
        velocityRef.current.y -= PHYSICS.GRAVITY * delta;
        // Clamp to terminal velocity
        if (velocityRef.current.y < -PHYSICS.TERMINAL_VELOCITY) {
          velocityRef.current.y = -PHYSICS.TERMINAL_VELOCITY;
        }
        // Debug: log falling state
        if (isCharacter && Math.abs(velocityRef.current.y) > 0.1) {
          logger.debug(`[GamePlayer] Character "${object.name}" falling: velocity.y=${velocityRef.current.y.toFixed(2)}, position.y=${meshRef.current.position.y.toFixed(2)}`);
        }
      }

      // Ground collision (simple check)
      // Ground is at Y=-2 (platform level)
      // IMPORTANT: Most 3D character models have their pivot at the FEET (bottom)
      // So meshRef.position.y IS the feet position for characters
      // For other objects, assume pivot is at center
      const groundY = PHYSICS.GROUND_Y;
      let objectBottomY: number;
      
      if (isCharacter) {
        // For characters, meshRef position IS at the feet (model pivot is at feet)
        // No offset needed - the position is already the feet position
        objectBottomY = meshRef.current.position.y;
      } else {
        // For other objects, assume pivot is at center
        objectBottomY = meshRef.current.position.y - scaleValue / 2;
      }
      
      if (objectBottomY <= groundY + PHYSICS.GROUND_TOLERANCE) {
        // Object hit the ground - position it so bottom touches ground
        if (isCharacter) {
          // For characters, position is at feet, so set directly to ground level
          meshRef.current.position.y = groundY;
        } else {
          // For other objects, set center position so bottom touches ground
          meshRef.current.position.y = groundY + scaleValue / 2;
        }
        velocityRef.current.y = 0;
        isGroundedRef.current = true;
      } else {
        isGroundedRef.current = false;
      }

      // Execute logic blocks via the interpreter (coroutines stepped once per frame)
      let moveX = 0;
      const moveY = 0;
      let moveZ = 0;
      const moveSpeed = PHYSICS.MOVE_SPEED;
      const jumpForce = PHYSICS.JUMP_FORCE;

      // Gate on world.started so on_start hats don't fire until the
      // click-to-start splash has unlocked audio in this window. Motion,
      // physics, and rendering keep running so the scene composes on mount.
      if (runtime?.hasScripts && world.started) {
        frameAccumRef.current.x = 0;
        frameAccumRef.current.z = 0;
        runtime.step(delta, state.clock.elapsedTime);
        moveX = frameAccumRef.current.x;
        moveZ = frameAccumRef.current.z;
      }

      // Fallback: Default keyboard controls if no logic blocks but is a character
      if (!hasMovementLogic && isCharacter) {
        // Horizontal movement (left/right)
        if (keys['arrowleft'] || keys['a']) {
          moveX = -moveSpeed * delta;
        } else if (keys['arrowright'] || keys['d']) {
          moveX = moveSpeed * delta;
        }
        
        // Forward/backward movement (up/down or W/S)
        if (keys['arrowup'] || keys['w']) {
          moveZ = -moveSpeed * delta; // Negative Z is forward in Three.js
        } else if (keys['arrowdown'] || keys['s']) {
          moveZ = moveSpeed * delta; // Positive Z is backward
        }

        // Jump (only if not using arrow up for forward movement)
        if (keys[' '] && isGroundedRef.current) {
          velocityRef.current.y = jumpForce;
          isGroundedRef.current = false;
        }
      }

      // Apply horizontal movement directly to position
      // Movement is already in world units (moveSpeed * delta), so apply it directly
      if (moveX !== 0 || moveZ !== 0) {
        meshRef.current.position.x += moveX;
        meshRef.current.position.z += moveZ;
        // Clear horizontal velocity when moving (movement takes priority)
        velocityRef.current.x = 0;
        velocityRef.current.z = 0;
      } else {
        // Apply friction when not moving (gradual stop)
        velocityRef.current.x *= PHYSICS.FRICTION;
        velocityRef.current.z *= PHYSICS.FRICTION;
        // Apply remaining velocity
        meshRef.current.position.x += velocityRef.current.x * delta;
        meshRef.current.position.z += velocityRef.current.z * delta;
      }

      // Apply vertical velocity (for jumping/gravity) - always applied
      meshRef.current.position.y += velocityRef.current.y * delta;

      // Update position ref to match mesh position
      positionRef.current.x = meshRef.current.position.x;
      positionRef.current.y = meshRef.current.position.y;
      positionRef.current.z = meshRef.current.position.z;
      
      // Notify parent of position update for camera following (only once per frame)
      if (onPositionUpdate && meshRef.current) {
        onPositionUpdate(meshRef.current.position);
      }

      // Calculate movement state (always, for tracking)
      // Check both moveX/moveZ and velocity to detect actual movement
      const isMoving = Math.abs(moveX) > MOVEMENT.MIN_MOVE_THRESHOLD || Math.abs(moveZ) > MOVEMENT.MIN_MOVE_THRESHOLD || 
                       Math.abs(velocityRef.current.x) > MOVEMENT.MIN_VELOCITY_THRESHOLD || Math.abs(velocityRef.current.z) > MOVEMENT.MIN_VELOCITY_THRESHOLD;
      const isJumping = velocityRef.current.y > MOVEMENT.JUMP_VELOCITY_THRESHOLD;
      const isFalling = !isGroundedRef.current && velocityRef.current.y < MOVEMENT.FALL_VELOCITY_THRESHOLD;
      
      // Update animation state based on movement (only if not manually stopped)
      // If manualAnimationState is set and not 'stop', use it; otherwise use movement-based state
      if (!isAnimationStopped) {
        // Priority: jump > fall > walk (if moving) > idle (if not moving)
        if (isJumping) {
          if (!lastMoveStateRef.current.wasJumping) {
            setAnimationState('jump');
          }
        } else if (isFalling) {
          if (!lastMoveStateRef.current.wasFalling) {
            setAnimationState('fall');
          }
        } else if (isMoving) {
          // Always set to walk when moving (not just on state change)
          // This ensures the animation updates even if manualAnimationState was set
          setAnimationState('walk');
        } else if (isGroundedRef.current && !isMoving) {
          // Set to idle when stopped and grounded
          // Only change if we were moving before, or if we want to reset to idle
          if (lastMoveStateRef.current.wasMoving || animationState === 'walk') {
            setAnimationState('idle');
          }
        }
      } else {
        // If manually stopped, keep it stopped
        setAnimationState(null);
      }
      
      lastMoveStateRef.current = {
        wasMoving: isMoving,
        wasJumping: isJumping,
        wasFalling: isFalling,
      };
    }

    // Apply base rotation from properties (but NOT for platforms - they have special rotation)
    // Platforms have their rotation set in JSX and should not be overridden here
    if (meshRef.current && !isPlatform && shape !== 'plane') {
      // Lazy-init the interpreter's live rotation from the object's property rotation.
      if (baseRotationRef.current === null) {
        baseRotationRef.current = { x: rotation[0], y: rotation[1], z: rotation[2] };
      }
      const base = baseRotationRef.current;
      const animYaw = properties.animate ? state.clock.elapsedTime * 0.01 : 0;
      meshRef.current.rotation.set(base.x, base.y + animYaw, base.z);

      // Phase 5b: apply live looks state each frame.
      meshRef.current.visible = visibleRef.current;
      const effectiveScale = scaleValue * sizeMultiplierRef.current;
      meshRef.current.scale.setScalar(effectiveScale);
      radiusRef.current = createModelRenderContract(
        effectiveScale,
        modelBounds,
        modelOriginOffset
      ).touchRadius;
      if (tintColorRef.current) {
        const hex = tintColorRef.current;
        // Only tint materials with no color map — textured meshes (e.g. rigged
        // characters) would otherwise wash out. Untextured primitives get tinted.
        meshRef.current.traverse((child: any) => {
          const mats = Array.isArray(child?.material) ? child.material : child?.material ? [child.material] : [];
          for (const mat of mats) {
            if (mat?.color?.set && !mat.map) mat.color.set(hex);
          }
        });
      }

      // Graphic effects. ghost → opacity, brightness → emissive lift,
      // color → hue rotation. Applied after the tint so both compose.
      const effects = effectsRef.current;
      const ghost = effects.ghost ?? 0;
      const brightness = effects.brightness ?? 0;
      const hueShift = effects.color ?? 0;
      if (ghost || brightness || hueShift) {
        meshRef.current.traverse((child: any) => {
          const mats = Array.isArray(child?.material) ? child.material : child?.material ? [child.material] : [];
          for (const mat of mats) {
            if (!mat) continue;
            if (ghost) {
              mat.transparent = true;
              mat.opacity = 1 - ghost / 100;
            }
            if (brightness && mat.emissive?.setScalar) {
              mat.emissive.setScalar(Math.max(0, brightness) / 200);
            }
            if (hueShift && mat.color?.getHSL && mat.color?.setHSL && !mat.map) {
              const hsl = { h: 0, s: 0, l: 0 };
              mat.color.getHSL(hsl);
              mat.color.setHSL((hsl.h + hueShift / 200) % 1, hsl.s, hsl.l);
            }
          }
        });
      }

      meshRef.current.renderOrder = layerRef.current;

      // A drawing made in the paint editor, applied as this object's texture.
      applyTexture(meshRef.current, properties.texture_url, textureCacheRef.current);

      // Pen: sample the object's world position into the active stroke while
      // the pen is down. Sampling on movement only keeps the point count sane.
      const pen = penStateRef.current;
      if (pen.down) {
        const stroke = pen.points[pen.points.length - 1];
        if (stroke) {
          const p = meshRef.current.position;
          const last = stroke[stroke.length - 1];
          const moved =
            !last ||
            Math.abs(last[0] - p.x) > 0.02 ||
            Math.abs(last[1] - p.y) > 0.02 ||
            Math.abs(last[2] - p.z) > 0.02;
          if (moved) {
            stroke.push([p.x, p.y, p.z]);
            // Cap total points so a forever-loop can't grow this without bound.
            if (stroke.length > 2000) stroke.shift();
            penTickRef.current = (penTickRef.current + 1) % 6;
            if (penTickRef.current === 0) setPenStrokes(pen.points.map((s) => s.slice()));
          }
        }
      }

      // Custom keyframe animations saved by the Animation Editor. Applied
      // after effects so it wins over the rest pose, and only while one is
      // actually playing.
      const playing = customAnimRef.current;
      if (playing) {
        const animations = parseAnimations(properties.animations);
        const clip = findAnimation(animations, playing.name);
        if (clip) {
          const elapsed = performance.now() / 1000 - playing.startedAt;
          const sample = sampleAnimation(clip, elapsed);
          meshRef.current.traverse((child: any) => {
            const t = sample[child.name];
            if (!t) return;
            child.rotation.set(t.rotation[0], t.rotation[1], t.rotation[2]);
            child.scale.set(t.scale[0], t.scale[1], t.scale[2]);
          });
        }
      }
    }

    // Bubble expiry — check once per frame, don't setState unless needed
    if (bubbleRef.current?.expiresAt != null && performance.now() >= bubbleRef.current.expiresAt) {
      setBubble(null);
    }
  });

  // Render platforms/planes - MUST lay flat on the ground
  if (isPlatform || shape === 'plane') {
    // For platforms, ensure they're at ground level (negative Y)
    // Ground level is Y=-2 in 3D coordinates
    const platformPosition: [number, number, number] = [position[0], PHYSICS.GROUND_Y, position[2]];
    logger.debug(`[GamePlayer] Platform "${object.name}" at Y=${PHYSICS.GROUND_Y} with rotation X=-90°`);
    
    // Platforms don't have physics, so use position prop
    // Using a group to isolate the mesh from useFrame rotation updates
    // The inner mesh has rotation [-Math.PI/2, 0, 0] to lay flat
    return (
      <group position={platformPosition}>
        <mesh
          rotation={[RENDERING.DEFAULT_PLATFORM_ROTATION, 0, 0]}
          scale={scale}
          renderOrder={0}
          onClick={() => world.notifyClicked(objectId)}
        >
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
    );
  }

  // Render based on shape
  if (object.type === 'collectible' || shape === 'circle' || shape === 'sphere') {
    return (
      <>
        <Sphere ref={meshRef} position={position} rotation={rotation} scale={scale[0]} onClick={() => world.notifyClicked(objectId)}>
          <meshStandardMaterial color={color} />
        </Sphere>
        <FollowerBubble meshRef={meshRef} bubble={bubble} yOffset={scale[0] * 0.7 + 0.5} />
      </>
    );
  }

  // Render external model if available
  if (shape === 'model' && modelUrl) {
    const ext = (modelUrl.split('.').pop() || '').toLowerCase();
    const isAnimatedFormat = ext === 'glb' || ext === 'gltf' || ext === 'fbx';
    
    logger.debug('[GamePlayer] Model detected:', { ext, isAnimatedFormat, isCharacter, modelUrl });
    
    // Use AnimatedModel for characters with animation-capable formats
    if (isCharacter && isAnimatedFormat) {
      // Animation state priority:
      // 1. If manually stopped, use null
      // 2. If movement-based state is set (from useFrame), use that (it overrides manual state when moving)
      // 3. Otherwise, use manual state from properties (for initial/default animation)
      // This allows movement-based animations to work while still respecting manual overrides when not moving
      const finalAnimationState = isAnimationStopped 
        ? null 
        : (animationState || manualAnimationState || 'idle');
      logger.debug('[GamePlayer] Rendering animated model:', { 
        finalAnimationState, 
        animationState, 
        manualAnimationState,
        isAnimationStopped,
        playAnimation: !isAnimationStopped 
      });
      // For characters with physics, don't pass position prop - it's controlled by useFrame
      const shouldHavePhysics = object.has_physics || hasMovementLogic || isCharacter;
      
      // IMPORTANT: Most 3D character models have their pivot at the FEET (bottom)
      // So the model's origin (0,0,0) is at the feet
      // meshRef position should be at the FEET position, not torso center
      // For physics calculations, we account for this by checking feet position
      return (
        <>
          <group
            ref={meshRef as any}
            position={shouldHavePhysics ? [0, 0, 0] : position}
            scale={modelRender.outerScale}
            onClick={() => world.notifyClicked(objectId)}
          >
            <AnimatedModel
              url={modelUrl}
              position={modelRender.innerPosition}
              rotation={rotation}
              scale={modelRender.innerScale}
              animationState={finalAnimationState || 'idle'}
              playAnimation={!isAnimationStopped}
            />
          </group>
          <FollowerBubble meshRef={meshRef as any} bubble={bubble} yOffset={scaleValue * 1.8 + 0.3} />
        </>
      );
    }
    
    // Also handle non-animated models for characters (e.g., OBJ, STL, DAE)
    if (isCharacter && !isAnimatedFormat) {
      logger.debug('[GamePlayer] Rendering non-animated model for character');
    }
    
    // Non-animated models. Each extension is its own component so its
    // useGLTF/useLoader hook always fires unconditionally (Rules of Hooks).
    // The parent switch below picks which one to render; hooks never appear
    // inside a conditional branch in a single component.
    const shouldHavePhysics = object.has_physics || hasMovementLogic || isCharacter;
    const modelPosition: [number, number, number] = shouldHavePhysics ? [0, 0, 0] : position;
    return (
      <>
        <Suspense fallback={null}>
          <ExtensionModel
            ext={ext}
            modelUrl={modelUrl}
            meshRef={meshRef}
            position={modelPosition}
            rotation={rotation}
            scale={scale}
            color={color}
          />
        </Suspense>
        <FollowerBubble meshRef={meshRef} bubble={bubble} yOffset={scaleValue * 1.2 + 0.3} />
      </>
    );
  }

  // Default: render as box (for characters without models, obstacles, etc.)
  logger.debug('[GamePlayer] Rendering default box for:', { name: object.name, type: object.type, shape, modelUrl });
  // For objects with physics, position is controlled by useFrame
  const shouldHavePhysics = object.has_physics || hasMovementLogic || isCharacter;
  return (
    <>
      <Box ref={meshRef} position={shouldHavePhysics ? [0, 0, 0] : position} rotation={rotation} scale={scale} onClick={() => world.notifyClicked(objectId)}>
        <meshStandardMaterial color={color} />
      </Box>
      <FollowerBubble meshRef={meshRef} bubble={bubble} yOffset={scaleValue * 0.7 + 0.4} />
      <PenTrail strokes={penStrokes} color={penStateRef.current.color} size={penStateRef.current.size} />
    </>
  );
});

/**
 * The Pen extension's output. Scratch draws on a 2D canvas; in 3D the natural
 * equivalent is a ribbon of line segments through the points the object passed.
 */
function PenTrail({
  strokes,
  color,
  size,
}: {
  strokes: number[][][];
  color: string;
  size: number;
}) {
  if (!strokes || strokes.length === 0) return null;
  return (
    <>
      {strokes.map((stroke, i) => {
        // A line needs at least two points.
        if (!stroke || stroke.length < 2) return null;
        const positions = new Float32Array(stroke.flat());
        return (
          <line key={i}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[positions, 3]}
                count={stroke.length}
                array={positions}
                itemSize={3}
              />
            </bufferGeometry>
            {/* linewidth is capped at 1 by most WebGL drivers; kept for intent. */}
            <lineBasicMaterial color={color} linewidth={size} />
          </line>
        );
      })}
    </>
  );
}
