/**
 * Scratch-style block interpreter for the 3D player runtime.
 * Pure TypeScript — no React, no THREE. The player wires a RuntimeContext
 * per object; scripts are generator coroutines stepped once per frame.
 */

import type { Expr, ExprValue, LogicBlock, VariableScope } from '../../types/game';
import { operators, toBool, toNumber, type Value } from './operators';

// ---------------------------------------------------------------------------
// Variable store
// ---------------------------------------------------------------------------

interface VariableEntry {
  value: Value | Value[];
  visible: boolean;
}

export interface WatcherSnapshot {
  /** Display label: "score" for globals, "Enemy: lives" for object-scoped. */
  label: string;
  value: Value;
  /** Present when the variable is a list — render rows instead of a scalar. */
  items?: Value[];
}

export class VariableStore {
  private global = new Map<string, VariableEntry>();
  private scopes = new Map<string, Map<string, VariableEntry>>();
  private objectNames = new Map<string, string>();
  private listeners = new Set<() => void>();
  private cachedWatchers: WatcherSnapshot[] | null = null;

  registerObject(objectId: string, name: string) {
    this.objectNames.set(objectId, name);
    this.notify();
  }

  unregisterObject(objectId: string) {
    this.objectNames.delete(objectId);
    this.scopes.delete(objectId);
    this.notify();
  }

  /**
   * Drop every variable and list in every scope. Used by the player's Restart
   * control, which needs a clean slate without rebuilding the world.
   */
  clearAll() {
    this.global.clear();
    this.scopes.clear();
    this.notify();
  }

  private scopeMap(objectId: string, scope: VariableScope): Map<string, VariableEntry> {
    if (scope === 'global') return this.global;
    let m = this.scopes.get(objectId);
    if (!m) {
      m = new Map();
      this.scopes.set(objectId, m);
    }
    return m;
  }

  /** Object scope shadows global. Unset variables read as 0 (Scratch behavior). Lists read as their items joined. */
  get(objectId: string, name: string): Value {
    const local = this.scopes.get(objectId)?.get(name);
    const entry = local ?? this.global.get(name);
    if (!entry) return 0;
    return Array.isArray(entry.value) ? entry.value.join('') : entry.value;
  }

  /** Read the raw entry, honoring object-scope shadowing. */
  private entryFor(objectId: string, name: string): VariableEntry | undefined {
    return this.scopes.get(objectId)?.get(name) ?? this.global.get(name);
  }

  /** Get (or lazily create in the given scope) a list entry. Prefers an existing entry in any scope. */
  private listFor(objectId: string, name: string, scope: VariableScope, create: boolean): Value[] | null {
    const m = this.scopeMap(objectId, scope);
    let entry = m.get(name) ?? this.entryFor(objectId, name);
    if (!entry) {
      if (!create) return null;
      entry = { value: [], visible: false };
      m.set(name, entry);
    }
    if (!Array.isArray(entry.value)) entry.value = entry.value === 0 ? [] : [entry.value];
    return entry.value;
  }

  // --- List operations (Scratch semantics: 1-indexed, out-of-range is a no-op) ---

  listAdd(objectId: string, name: string, item: Value, scope: VariableScope = 'global') {
    this.listFor(objectId, name, scope, true)!.push(item);
    this.notify();
  }

  /** index is 1-based, or 'all' to clear, or 'last'. */
  listDelete(objectId: string, name: string, index: Value, scope: VariableScope = 'global') {
    const list = this.listFor(objectId, name, scope, false);
    if (!list) return;
    if (index === 'all') list.length = 0;
    else {
      const i = index === 'last' ? list.length : toNumber(index);
      if (i >= 1 && i <= list.length) list.splice(i - 1, 1);
    }
    this.notify();
  }

  listInsert(objectId: string, name: string, index: Value, item: Value, scope: VariableScope = 'global') {
    const list = this.listFor(objectId, name, scope, true)!;
    const i = toNumber(index);
    if (i >= 1 && i <= list.length + 1) {
      list.splice(i - 1, 0, item);
      this.notify();
    }
  }

  listReplace(objectId: string, name: string, index: Value, item: Value, scope: VariableScope = 'global') {
    const list = this.listFor(objectId, name, scope, false);
    if (!list) return;
    const i = toNumber(index);
    if (i >= 1 && i <= list.length) {
      list[i - 1] = item;
      this.notify();
    }
  }

  /** 1-based; out of range reads as '' (Scratch behavior). */
  listItem(objectId: string, name: string, index: Value): Value {
    const list = this.listFor(objectId, name, 'global', false);
    if (!list) return '';
    const i = toNumber(index);
    return i >= 1 && i <= list.length ? list[i - 1] : '';
  }

  listLength(objectId: string, name: string): number {
    return this.listFor(objectId, name, 'global', false)?.length ?? 0;
  }

  /** Case-insensitive membership, matching Scratch. */
  listContains(objectId: string, name: string, item: Value): boolean {
    const list = this.listFor(objectId, name, 'global', false);
    if (!list) return false;
    const wanted = String(item).toLowerCase();
    return list.some((v) => String(v).toLowerCase() === wanted);
  }

  /** 1-based index of first case-insensitive match, or 0 if not found (Scratch behavior). */
  listIndexOf(objectId: string, name: string, item: Value): number {
    const list = this.listFor(objectId, name, 'global', false);
    if (!list) return 0;
    const wanted = String(item).toLowerCase();
    const i = list.findIndex((v) => String(v).toLowerCase() === wanted);
    return i >= 0 ? i + 1 : 0;
  }

  set(objectId: string, name: string, value: Value, scope: VariableScope = 'global') {
    const m = this.scopeMap(objectId, scope);
    const entry = m.get(name);
    if (entry) entry.value = value;
    else m.set(name, { value, visible: false });
    this.notify();
  }

  change(objectId: string, name: string, delta: Value, scope: VariableScope = 'global') {
    const current = scope === 'object' ? this.scopes.get(objectId)?.get(name)?.value : undefined;
    const raw = current ?? (scope === 'global' ? this.global.get(name)?.value : undefined) ?? this.get(objectId, name);
    const base = Array.isArray(raw) ? raw.join('') : raw;
    this.set(objectId, name, toNumber(base) + toNumber(delta), scope);
  }

  setVisible(objectId: string, name: string, visible: boolean, scope: VariableScope = 'global') {
    const m = this.scopeMap(objectId, scope);
    const entry = m.get(name);
    if (entry) entry.visible = visible;
    else m.set(name, { value: 0, visible });
    this.notify();
  }

  /** Snapshot of visible watchers for the React overlay. Stable reference until a change. */
  watcherSnapshot(): WatcherSnapshot[] {
    if (this.cachedWatchers) return this.cachedWatchers;
    const out: WatcherSnapshot[] = [];
    const push = (label: string, e: VariableEntry) => {
      if (!e.visible) return;
      if (Array.isArray(e.value)) out.push({ label, value: e.value.length, items: [...e.value] });
      else out.push({ label, value: e.value });
    };
    for (const [name, e] of this.global) push(name, e);
    for (const [objectId, m] of this.scopes) {
      const objectName = this.objectNames.get(objectId) ?? objectId;
      for (const [name, e] of m) push(`${objectName}: ${name}`, e);
    }
    this.cachedWatchers = out;
    return out;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.cachedWatchers = null;
    this.listeners.forEach((l) => l());
  }
}

// ---------------------------------------------------------------------------
// Expression evaluation
// ---------------------------------------------------------------------------

export interface EvalEnv {
  objectId: string;
  vars: VariableStore;
  keys: Record<string, boolean>;
  /** World clock in seconds. */
  time: number;
  world?: RuntimeWorld;
  /** Custom-block parameter frames, innermost last. */
  locals?: Array<Record<string, Value>>;
  /** Per-object runtime context; used by position/rotation/size reporters. */
  ctx?: RuntimeContext;
  /** Per-object sound volume (0-100); provided by ObjectRuntime. */
  getVolume?(): number;
  /** Pointer state in stage coordinates; provided by the player. */
  pointer?: { x: number; y: number; down: boolean };
  /** The player's language code, for the `language` reporter. */
  language?: string;
}

/**
 * Clamp a graphic effect to Scratch's range: ghost 0..100, brightness
 * -100..100, colour wraps modulo 200.
 */
export function clampEffect(effect: string, value: number): number {
  if (!Number.isFinite(value)) return 0;
  switch (effect) {
    case 'ghost':
      return Math.min(100, Math.max(0, value));
    case 'brightness':
      return Math.min(100, Math.max(-100, value));
    case 'color': {
      const wrapped = value % 200;
      return wrapped < 0 ? wrapped + 200 : wrapped;
    }
    default:
      return value;
  }
}

export function evalExpr(expr: Expr | ExprValue | undefined, env: EvalEnv): Value {
  if (expr === undefined || expr === null) return 0;
  if (typeof expr !== 'object') return expr;

  switch (expr.op) {
    case 'literal':
      return expr.value ?? 0;
    case 'var':
    case 'variable':
    case 'arg': {
      const name = String(expr.value ?? '');
      // Custom-block parameters shadow variables (innermost frame wins).
      if (env.locals) {
        for (let i = env.locals.length - 1; i >= 0; i--) {
          const frame = env.locals[i];
          if (Object.prototype.hasOwnProperty.call(frame, name)) return frame[name];
        }
      }
      return env.vars.get(env.objectId, name);
    }
    case 'key_pressed':
      return isKeyDown(env.keys, String(expr.value ?? ''));
    case 'video_motion':
      return env.world ? env.world.videoMotion() : 0;
    case 'video_direction':
      return env.world ? env.world.videoDirection() : 0;
    case 'timer':
      // Relative to the last reset_timer, matching Scratch. Falls back to the
      // raw world clock when there's no world (headless expression tests).
      return env.world ? env.world.timerValue(env.time) : env.time;
    case 'answer':
      return env.world?.getAnswer() ?? '';
    case 'mouse_x':
      return env.pointer?.x ?? 0;
    case 'mouse_y':
      return env.pointer?.y ?? 0;
    case 'mouse_down':
      return env.pointer?.down ?? false;
    case 'language':
      // The player's language, so a game can greet them appropriately.
      return env.language ?? 'en';
    case 'touching': {
      if (!env.world) return false;
      const target = expr.value !== undefined ? String(expr.value) : expr.args?.[0] !== undefined ? String(evalExpr(expr.args[0], env)) : '';
      return env.world.touching(env.objectId, target);
    }
    case 'distance_to': {
      if (!env.world) return 0;
      const target = expr.value !== undefined ? String(expr.value) : expr.args?.[0] !== undefined ? String(evalExpr(expr.args[0], env)) : '';
      return env.world.distanceTo(env.objectId, target);
    }
    case 'list_item': {
      const index = expr.args?.[0] !== undefined ? evalExpr(expr.args[0], env) : 1;
      return env.vars.listItem(env.objectId, String(expr.value ?? ''), index);
    }
    case 'list_length':
      return env.vars.listLength(env.objectId, String(expr.value ?? ''));
    case 'list_contains': {
      const item = expr.args?.[0] !== undefined ? evalExpr(expr.args[0], env) : '';
      return env.vars.listContains(env.objectId, String(expr.value ?? ''), item);
    }
    case 'list_index_of': {
      const item = expr.args?.[0] !== undefined ? evalExpr(expr.args[0], env) : '';
      return env.vars.listIndexOf(env.objectId, String(expr.value ?? ''), item);
    }
    // Self position/rotation/size reporters (Phase 5a/5b)
    case 'position_x': return env.ctx?.getPosition?.().x ?? 0;
    case 'position_y': return env.ctx?.getPosition?.().y ?? 0;
    case 'position_z': return env.ctx?.getPosition?.().z ?? 0;
    case 'rotation_x': return env.ctx?.getRotation?.().x ?? 0;
    case 'rotation_y': return env.ctx?.getRotation?.().y ?? 0;
    case 'rotation_z': return env.ctx?.getRotation?.().z ?? 0;
    case 'size': return env.ctx?.getSize?.() ?? 100;
    case 'costume_number': return env.ctx?.getCostume?.().number ?? 1;
    case 'costume_name': return env.ctx?.getCostume?.().name ?? '';
    case 'volume': return env.getVolume?.() ?? 100;
    case 'visible': return env.ctx?.getVisible?.() ?? true;
    // Other-object position/rotation reporters
    case 'object_x':
    case 'object_y':
    case 'object_z': {
      const target = expr.value !== undefined ? String(expr.value) : expr.args?.[0] !== undefined ? String(evalExpr(expr.args[0], env)) : '';
      const p = env.world?.getObjectPositionByName(target);
      if (!p) return 0;
      return expr.op === 'object_x' ? p.x : expr.op === 'object_y' ? p.y : p.z;
    }
    case 'object_rotation_x':
    case 'object_rotation_y':
    case 'object_rotation_z': {
      const target = expr.value !== undefined ? String(expr.value) : expr.args?.[0] !== undefined ? String(evalExpr(expr.args[0], env)) : '';
      const r = env.world?.getObjectRotationByName(target);
      if (!r) return 0;
      return expr.op === 'object_rotation_x' ? r.x : expr.op === 'object_rotation_y' ? r.y : r.z;
    }
    default: {
      const fn = operators[expr.op];
      if (!fn) return 0;
      const args = (expr.args ?? []).map((a) => evalExpr(a, env));
      return fn(...args);
    }
  }
}

// ---------------------------------------------------------------------------
// Legacy block parameter adapter
// ---------------------------------------------------------------------------

function blockData(block: LogicBlock): Record<string, any> {
  const raw = block.block_data;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }
  return raw;
}

/** Reads a block parameter: new-style `inputs` first, then legacy block_data / block_data.parameter. */
function getInput(block: LogicBlock, name: string, env: EvalEnv, fallback: Value = 0): Value {
  const data = blockData(block);
  const input = block.inputs?.[name] ?? data.inputs?.[name];
  if (input !== undefined) return evalExpr(input, env);
  const v = data[name] ?? data.parameter?.[name];
  return v === undefined ? fallback : (v as Value);
}

/** Nested bodies can live on the block or (after DB persistence) inside block_data. */
function blockChildren(block: LogicBlock): LogicBlock[] | undefined {
  return block.children ?? (blockData(block).children as LogicBlock[] | undefined);
}

function blockElseChildren(block: LogicBlock): LogicBlock[] | undefined {
  return block.elseChildren ?? (blockData(block).elseChildren as LogicBlock[] | undefined);
}

const KEY_ALIASES: Record<string, string> = {
  UP: 'arrowup',
  DOWN: 'arrowdown',
  LEFT: 'arrowleft',
  RIGHT: 'arrowright',
  SPACE: ' ',
  ARROWUP: 'arrowup',
  ARROWDOWN: 'arrowdown',
  ARROWLEFT: 'arrowleft',
  ARROWRIGHT: 'arrowright',
};

export function normalizeKeyName(key: string): string {
  const upper = key.toUpperCase();
  return KEY_ALIASES[upper] ?? key.toLowerCase();
}

function isKeyDown(keys: Record<string, boolean>, key: string): boolean {
  const normalized = normalizeKeyName(key);
  return !!keys[normalized] || !!keys[key.toLowerCase()];
}

// ---------------------------------------------------------------------------
// Runtime world: shared state across all objects in a scene
// ---------------------------------------------------------------------------

export interface WorldObjectHooks {
  name: string;
  getPosition(): { x: number; y: number; z: number };
  /** Optional rotation reader in degrees; used by expr_object_rotation_*. */
  getRotation?(): { x: number; y: number; z: number };
  /** Approximate bounding radius in world units. */
  getRadius(): number;
  /** Whether other objects can "touch" this one (platforms are scenery — default true). */
  touchable?: boolean;
  /** Live touch participation; hidden collectibles use this to become inactive. */
  isTouchable?(): boolean;
}

/** Scratch caps total live clones at 300. */
export const MAX_CLONES = 300;

export class RuntimeWorld {
  readonly vars = new VariableStore();
  private objects = new Map<string, WorldObjectHooks>();
  private runtimes = new Map<string, ObjectRuntime>();
  private clickCounts = new Map<string, number>();
  /** Live clone ids (synchronously tracked so bursts can't overshoot the cap). */
  private activeClones = new Set<string>();
  /**
   * Latest camera reading, pushed in by the player each frame.
   *
   * Held here rather than read on demand because motion is a comparison
   * between two frames: the blocks ask "how much moved", and only whatever is
   * sampling the camera knows. Zero when the camera is off, so every video
   * block answers 0 rather than throwing in a game that never turned it on.
   */
  private video = { amount: 0, direction: 0, on: false, transparency: 50 };
  private cloneSeq = 0;
  /**
   * Gate for the game loop. Player mounts this false, flips it true after the
   * click-to-start splash unlocks audio. When false, every object's
   * useFrame skips runtime.step so on_start hats don't fire into a suspended
   * AudioContext. Defaults true for tests and any host that doesn't opt in.
   */
  started = true;
  /** Player hooks: spawn/despawn the clone's visual object. */
  onSpawnClone?: (sourceId: string, cloneId: string) => void;
  onDespawnClone?: (cloneId: string) => void;
  /** Scene switching — set by the player; per-object ctx delegates here. */
  onSwitchScene?: (name: string) => void;
  onNextScene?: () => void;
  /**
   * "Ask and wait" — set by the player, which owns the stage-level prompt UI.
   * Resolves with the player's typed answer.
   */
  onAsk?: (prompt: string) => Promise<string>;

  /**
   * Pointer state in stage coordinates, written by the player's pointer
   * listeners. Lives on the world rather than being drilled through the scene
   * and object components, same as the scene-switch handlers above.
   */
  pointer = { x: 0, y: 0, down: false };

  /** The player's language code, set by the player from the page locale. */
  language = 'en';

  /**
   * Scratch's timer is world-global and resettable. `expr_timer` reads
   * `env.time - timerEpoch`, so resetting is just re-stamping the epoch.
   */
  private timerEpoch = 0;
  /** Last value written by `ask and wait`, read by the `answer` reporter. */
  private answer = '';

  resetTimer(now?: number) {
    this.timerEpoch = now ?? this.lastKnownTime;
  }

  /** Elapsed seconds since the last reset. */
  /**
   * Whatever is driving the camera, registered by the player.
   *
   * The video blocks reach the camera through the world rather than the
   * interpreter context, because the context is built inside a per-object
   * component that has no view of the player's camera. The world is the one
   * object every script already shares.
   */
  private videoController: {
    setState(state: 'on' | 'off' | 'flipped'): void;
    setTransparency(value: number): void;
  } | null = null;

  registerVideoController(controller: RuntimeWorld['videoController']) {
    this.videoController = controller;
  }

  /** Turn the camera on or off, and remember the state for the reporters. */
  requestVideo(state: 'on' | 'off' | 'flipped') {
    this.setVideoState(state !== 'off');
    this.videoController?.setState(state);
  }

  requestVideoTransparency(value: number) {
    this.setVideoState(this.video.on, value);
    this.videoController?.setTransparency(value);
  }

  /**
   * The camera, registered by the player.
   *
   * Same route as particles and the camera feed: the blocks run inside
   * per-object components that cannot see the camera, and the world is the one
   * object every script shares.
   */
  private camera: {
    follow(target: string | null): void;
    shake(strength: number, seconds: number): void;
    setZoom(zoom: number): void;
    changeZoom(delta: number): void;
  } | null = null;

  registerCameraController(controller: RuntimeWorld['camera']) {
    this.camera = controller;
  }

  cameraFollow(target: string | null) {
    this.camera?.follow(target);
  }

  cameraShake(strength: number, seconds: number) {
    this.camera?.shake(strength, seconds);
  }

  cameraZoom(zoom: number) {
    this.camera?.setZoom(zoom);
  }

  cameraZoomBy(delta: number) {
    this.camera?.changeZoom(delta);
  }

  /**
   * The particle cloud, registered by the player.
   *
   * Same reasoning as the camera: the blocks run inside per-object components
   * that cannot see the renderer, and the world is the object every script
   * already shares. Positions are read from the object's own registered
   * getPosition(), so a trail follows its object without the interpreter
   * having to carry coordinates around.
   */
  private particles: {
    burst(objectId: string, preset: string, at: [number, number, number]): void;
    setTrail(objectId: string, preset: string | null): void;
    setSize(objectId: string, scale: number): void;
    setAmount(objectId: string, scale: number): void;
    setColour(objectId: string, hex: string | null): void;
    updatePosition(objectId: string, at: [number, number, number]): void;
    remove(objectId: string): void;
  } | null = null;

  registerParticleController(controller: RuntimeWorld['particles']) {
    this.particles = controller;
  }

  /**
   * Where particles should come out of an object.
   *
   * The object's own position is its origin, which for a character sitting on
   * the ground is its feet. Emitting there put every particle at floor level,
   * so anything that falls — confetti, sparks — sank straight through the
   * ground plane and vanished within a second. Measured: the emitter sat at
   * y = -2 and particles were at y = -3.5 three seconds later, well under the
   * floor.
   *
   * Lifting by the object's own radius puts the source at roughly its middle,
   * which is where a child expects sparkles to come from anyway.
   */
  private emitPointFor(objectId: string): [number, number, number] {
    const hooks = this.objects.get(objectId);
    const at = hooks?.getPosition();
    if (!at) return [0, 0, 0];
    const lift = hooks?.getRadius ? Math.max(0, hooks.getRadius()) : 0;
    return [at.x, at.y + lift, at.z];
  }

  /** Burst at an object's current position. */
  burstParticlesFor(objectId: string, preset: string) {
    this.particles?.burst(objectId, preset, this.emitPointFor(objectId));
  }

  setParticleTrailFor(objectId: string, preset: string | null) {
    this.particles?.setTrail(objectId, preset);
  }

  /** Percentages from the blocks; the simulation clamps them. */
  setParticleSizeFor(objectId: string, percent: number) {
    this.particles?.setSize(objectId, percent / 100);
  }

  setParticleAmountFor(objectId: string, percent: number) {
    this.particles?.setAmount(objectId, percent / 100);
  }

  setParticleColourFor(objectId: string, hex: string | null) {
    this.particles?.setColour(objectId, hex);
  }

  /** Called each frame so trails follow their objects. */
  syncParticlePositions() {
    if (!this.particles) return;
    for (const id of this.objects.keys()) {
      this.particles.updatePosition(id, this.emitPointFor(id));
    }
  }

  /** Called by the player once per frame while the camera is on. */
  setVideoMotion(amount: number, direction: number) {
    this.video.amount = amount;
    this.video.direction = direction;
  }

  /** Camera on/off plus how faintly it is drawn behind the scene. */
  setVideoState(on: boolean, transparency = this.video.transparency) {
    this.video.on = on;
    this.video.transparency = Math.max(0, Math.min(100, transparency));
    if (!on) {
      this.video.amount = 0;
      this.video.direction = 0;
    }
  }

  videoMotion(): number {
    return this.video.on ? this.video.amount : 0;
  }

  videoDirection(): number {
    return this.video.on ? this.video.direction : 0;
  }

  videoState(): { on: boolean; transparency: number } {
    return { on: this.video.on, transparency: this.video.transparency };
  }

  timerValue(now: number): number {
    this.lastKnownTime = now;
    return Math.max(0, now - this.timerEpoch);
  }

  setAnswer(value: string) {
    this.answer = value;
  }

  getAnswer(): string {
    return this.answer;
  }

  /** Tracks the most recent frame time so resetTimer() works without an argument. */
  private lastKnownTime = 0;

  register(id: string, hooks: WorldObjectHooks) {
    this.objects.set(id, hooks);
    this.vars.registerObject(id, hooks.name);
  }

  unregister(id: string) {
    this.particles?.remove(id);
    this.objects.delete(id);
    this.runtimes.delete(id);
    this.clickCounts.delete(id);
    this.activeClones.delete(id);
    this.vars.unregisterObject(id);
  }

  attachRuntime(id: string, runtime: ObjectRuntime) {
    this.runtimes.set(id, runtime);
  }

  /** Called from the player's pointer/raycast handling. */
  notifyClicked(id: string) {
    this.clickCounts.set(id, (this.clickCounts.get(id) ?? 0) + 1);
  }

  clickCount(id: string): number {
    return this.clickCounts.get(id) ?? 0;
  }

  /** Fire all `when I receive <message>` scripts that are not already running. */
  broadcast(message: string): ScriptHandle[] {
    const handles: ScriptHandle[] = [];
    const wanted = message.trim().toLowerCase();
    for (const runtime of this.runtimes.values()) {
      handles.push(...runtime.startBroadcast(wanted));
    }
    return handles;
  }

  /**
   * How the game ended, and anything on screen.
   *
   * Held on the world because both are whole-game facts, not per-object ones:
   * any script can end the game, and the player renders one overlay for it.
   * Both example games had to fake an ending with a speech bubble and `stop`,
   * which is what a missing feature looks like from the inside.
   */
  private outcome: { state: 'playing' | 'won' | 'lost'; message: string } = {
    state: 'playing',
    message: '',
  };
  private banner: { text: string; until: number } | null = null;

  /** Back to playing, for Restart. */
  resetOutcome() {
    this.outcome = { state: 'playing', message: '' };
    this.banner = null;
  }

  /** End the game. Ignored if it has already ended, so the first result wins. */
  endGame(state: 'won' | 'lost', message = '') {
    if (this.outcome.state !== 'playing') return;
    this.outcome = { state, message };
    this.stopAll();
  }

  gameOutcome(): { state: 'playing' | 'won' | 'lost'; message: string } {
    return this.outcome;
  }

  /**
   * On-screen text. `seconds` of 0 or less means until something clears it.
   *
   * Both the stamp and the check default to the same wall clock. They used to
   * differ: the interpreter passed R3F's elapsed time, which starts at zero,
   * while the overlay polled performance.now(), which is in the thousands — so
   * every banner was already expired the instant it was set, and none ever
   * appeared. Tests still inject a clock explicitly.
   */
  showMessage(text: string, seconds: number, now: number = performance.now() / 1000) {
    this.banner = { text, until: seconds > 0 ? now + seconds : Infinity };
  }

  clearMessage() {
    this.banner = null;
  }

  /** The banner if it is still due, else null. */
  currentMessage(now: number = performance.now() / 1000): string | null {
    if (!this.banner) return null;
    if (now >= this.banner.until) return null;
    return this.banner.text;
  }

  stopAll() {
    for (const runtime of this.runtimes.values()) {
      runtime.stopAll();
    }
  }

  isClone(id: string): boolean {
    return this.activeClones.has(id);
  }

  /** Live position of a registered object (used to place new clones at the source). */
  getObjectPosition(id: string): { x: number; y: number; z: number } | null {
    return this.objects.get(id)?.getPosition() ?? null;
  }

  /** Live position of the object with the given display name (case-insensitive). */
  getObjectPositionByName(name: string): { x: number; y: number; z: number } | null {
    return this.findByName(name)?.[1].getPosition() ?? null;
  }

  /** Live rotation (degrees) of the object with the given display name; null if unknown. */
  getObjectRotationByName(name: string): { x: number; y: number; z: number } | null {
    return this.findByName(name)?.[1].getRotation?.() ?? null;
  }

  /**
   * Spawn a clone of `fromId` (or of the object named `targetName`).
   * Returns the clone id, or null when the cap is hit / target unknown.
   */
  createClone(fromId: string, targetName?: string): string | null {
    let sourceId = fromId;
    if (targetName && targetName.trim() !== '' && targetName.trim().toLowerCase() !== 'myself') {
      const target = this.findByName(targetName);
      if (!target) return null;
      sourceId = target[0];
    }
    if (!this.objects.has(sourceId)) return null;
    if (this.activeClones.size >= MAX_CLONES) return null;
    const cloneId = `${sourceId}#clone${++this.cloneSeq}`;
    this.activeClones.add(cloneId);
    this.onSpawnClone?.(sourceId, cloneId);
    return cloneId;
  }

  deleteClone(id: string): boolean {
    if (!this.activeClones.has(id)) return false;
    this.activeClones.delete(id);
    this.onDespawnClone?.(id);
    return true;
  }

  private findByName(name: string): [string, WorldObjectHooks] | null {
    const wanted = name.trim().toLowerCase();
    for (const entry of this.objects) {
      if (entry[1].name.trim().toLowerCase() === wanted) return entry;
    }
    return null;
  }

  /** 3D center distance between an object and another named object. 0 if unknown. */
  distanceTo(fromId: string, targetName: string): number {
    const a = this.objects.get(fromId);
    const target = this.findByName(targetName);
    if (!a || !target || target[0] === fromId) return 0;
    const pa = a.getPosition();
    const pb = target[1].getPosition();
    return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
  }

  /** Overlap test by bounding radii. Empty targetName = any other object. */
  touching(fromId: string, targetName = ''): boolean {
    const a = this.objects.get(fromId);
    const canTouch = (object: WorldObjectHooks) => object.touchable !== false && object.isTouchable?.() !== false;
    if (!a || !canTouch(a)) return false;
    const pa = a.getPosition();
    const ra = a.getRadius();
    const check = (id: string, b: WorldObjectHooks) => {
      if (id === fromId || !canTouch(b)) return false;
      const pb = b.getPosition();
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
      return d <= ra + b.getRadius() + 0.001;
    };
    if (targetName.trim() === '') {
      for (const [id, b] of this.objects) if (check(id, b)) return true;
      return false;
    }
    const target = this.findByName(targetName);
    return target ? check(target[0], target[1]) : false;
  }
}

/** A started broadcast script; used by broadcast_and_wait to poll completion. */
export interface ScriptHandle {
  isRunning(): boolean;
}

type Yield = { type: 'frame' } | { type: 'wait'; seconds: number };
type BlockGen = Generator<Yield, void, void>;

const FRAME: Yield = { type: 'frame' };

export interface RuntimeContext {
  /** Live keyboard state (React replaces its keys object, so read it lazily). */
  getKeys(): Record<string, boolean>;
  /** Accumulate a world-unit movement for this frame. */
  move(dx: number, dz: number): void;
  jump(): void;
  /** Rotate by degrees (applied instantly). Relative — accumulates on top of base. */
  rotate(xDeg: number, yDeg: number, zDeg: number): void;
  /** Multiply uniform scale. */
  scaleBy(factor: number): void;
  /**
   * Play a sound at the given volume (0-1). May return the sound's duration in
   * seconds so `play sound until done` knows how long to wait.
   */
  playSound(name: string, volume?: number): number | void;
  /** Stop all currently playing sounds (Scratch `stop all sounds`). */
  stopAllSounds?(): void;

  // --- Phase 5a: motion writers / readers ---
  /** Read self position in world units. */
  getPosition?(): { x: number; y: number; z: number };
  /** Read self rotation in degrees. */
  getRotation?(): { x: number; y: number; z: number };
  /** Absolute position write (teleport). */
  setPosition?(x: number, y: number, z: number): void;
  /** Add to current position. */
  changePosition?(dx: number, dy: number, dz: number): void;
  /** Write a single axis. */
  setPositionAxis?(axis: 'x' | 'y' | 'z', v: number): void;
  /** Absolute rotation write in degrees (replaces base). */
  setRotation?(xDeg: number, yDeg: number, zDeg: number): void;
  /** Rotate around Y to face the target's XZ position. */
  pointTowards?(targetX: number, targetZ: number): void;

  // --- Phase 5b: looks basics ---
  setVisible?(v: boolean): void;
  getVisible?(): boolean;
  setSize?(pct: number): void;
  changeSizeBy?(deltaPct: number): void;
  getSize?(): number;
  say?(text: string, seconds?: number, style?: 'say' | 'think'): void;
  clearBubble?(): void;
  setColor?(hex: string): void;

  // --- Phase 5c: AI ---
  /** Fire an async AI call; the callback fires once with the response text. */
  askAI?(prompt: string, cb: (result: string) => void, options?: { choices?: string[] }): void;

  // --- Scene switching (Scratch backdrop-switch analog) ---
  /** Activate the scene with this name (case-insensitive). Unknown name is a no-op. */
  switchScene?(name: string): void;
  /** Activate the next scene by order_index, wrapping at the end. */
  nextScene?(): void;

  // --- Costumes (Scratch costume analog) ---
  /** Switch to the costume with this name (case-insensitive). Unknown name is a no-op. */
  switchCostume?(name: string): void;
  /** Advance to the next costume in the list, wrapping at the end. */
  nextCostume?(): void;
  /** Current costume state; number is 1-based like Scratch. */
  getCostume?(): { number: number; name: string };

  /**
   * Play an animation saved on this object by the Animation Editor.
   * 'stop' (or an unknown name) returns the model to its rest pose.
   */
  switchAnimation?(name: string): void;

  // --- Music extension. Each returns the duration in seconds so the
  // interpreter can block for it, matching Scratch's timing. ---
  playNote?(note: number, beats: number): number;
  playDrum?(drum: string, beats: number): number;
  restForBeats?(beats: number): number;
  setInstrument?(id: string): void;
  setTempo?(bpm: number): void;
  changeTempoBy?(delta: number): void;

  // --- Pen extension. In 3D the "trail" is a ribbon of points left behind. ---
  penDown?(down: boolean): void;
  penClear?(): void;
  penSetColor?(hex: string): void;
  penSetSize?(size: number): void;

  /**
   * Speak text aloud. When `untilDone` the promise resolves when speech ends,
   * so the block can block; otherwise it is fire-and-forget.
   */
  speak?(text: string, untilDone: boolean): Promise<void> | void;

  /** Translate text; resolves with the translation, or '' on failure. */
  translate?(text: string, language: string): Promise<string>;

  // --- Graphic effects ---
  /** Apply a named effect ('ghost' | 'brightness' | 'color') at an already-clamped value. */
  setEffect?(effect: string, value: number): void;
  /** Read the current value of a named effect; 0 when unset. */
  getEffect?(effect: string): number;
  /** Reset every effect to 0. */
  clearEffects?(): void;

  // --- Layer ordering ---
  goToLayer?(layer: 'front' | 'back'): void;
  /** Positive moves forward (towards the camera), negative backward. */
  changeLayerBy?(delta: number): void;

  // --- Sensing ---
  /** Prompt the player and resolve with their typed answer (Scratch "ask and wait"). */
  ask?(prompt: string): Promise<string>;
}

interface ScriptState {
  hat: LogicBlock | null; // null = implicit always-on script (legacy hatless blocks)
  body: LogicBlock[];
  gen: BlockGen | null;
  waitRemaining: number;
  startFired: boolean;
  /** when_clicked edge detection: last click count this script has consumed. */
  handledClicks: number;
  /** Set by broadcasts; the script starts on its next step (with the real frame time). */
  pendingStart: boolean;
}

export const HAT_TYPES = new Set(['on_start', 'on_key_press', 'when_clicked', 'when_touches', 'when_receive', 'when_clone_start', 'when_scene_starts', 'when_video_motion', 'define_custom_block']);

/**
 * Return the world-units-per-second rate emitted by an authored key → move
 * pair. This is the same `distance / 100` conversion used in `runBlock`.
 */
export function movementRateForKey(
  blocks: readonly { block_type: string; inputs?: Record<string, unknown> }[],
  key: string,
): number {
  const wantedKey = key.toLowerCase();
  for (let index = 0; index < blocks.length - 1; index += 1) {
    const hat = blocks[index];
    const move = blocks[index + 1];
    if (hat.block_type !== 'on_key_press' || String(hat.inputs?.key ?? '').toLowerCase() !== wantedKey) continue;
    if (move.block_type !== 'move') return 0;
    return Math.abs(toNumber((move.inputs?.distance ?? 0) as any) / 100);
  }
  return 0;
}

/** Parse a define_custom_block hat into its name + parameter list. */
function definitionSpec(hat: LogicBlock): { name: string; params: string[] } {
  const data = blockData(hat);
  const name = String(hat.inputs?.name ?? data.inputs?.name ?? data.name ?? data.parameter?.name ?? '');
  const rawParams = hat.inputs?.params ?? data.inputs?.params ?? data.params ?? data.parameter?.params ?? [];
  let params: string[] = [];
  if (Array.isArray(rawParams)) params = rawParams.map(String);
  else if (typeof rawParams === 'string') {
    try {
      const parsed = JSON.parse(rawParams);
      if (Array.isArray(parsed)) params = parsed.map(String);
    } catch {
      params = rawParams.trim() ? [rawParams.trim()] : [];
    }
  }
  return { name: name.trim(), params };
}

/** Thrown through the coroutine stack to abort the current script (Scratch `stop`). */
const STOP_SCRIPT = Symbol('stop_script');

/**
 * Legacy on_key_press hats encode the action on the hat block itself
 * (block_data.action = move_up/move_down/move_left/move_right/jump).
 * Movement used MOVE_SPEED * delta, so reproduce it as a move block
 * with distance 500 (500/100 = 5 world units/sec).
 */
function legacyHatBody(hat: LogicBlock): LogicBlock | null {
  if (hat.block_type !== 'on_key_press') return null;
  const data = blockData(hat);
  const inputs = { ...(data.parameter ?? {}), ...(data.inputs ?? {}), ...(hat.inputs ?? {}) };
  const action = String(inputs.action ?? data.action ?? '');
  const key = String(inputs.key ?? data.key ?? data.direction ?? '').toUpperCase();
  const mk = (direction: string): LogicBlock => ({
    id: `${hat.id}:legacy`,
    block_type: 'move',
    inputs: { direction, distance: 500 },
  });
  switch (action) {
    case 'move_up':
      return mk('up');
    case 'move_down':
      return mk('down');
    case 'move_left':
      return mk('left');
    case 'move_right':
      return mk('right');
    case 'jump':
      return { id: `${hat.id}:legacy`, block_type: 'jump' };
  }
  // Hats with no explicit action but a directional key also moved in legacy code.
  if (key === 'UP' || key === 'ARROWUP') return mk('up');
  if (key === 'DOWN' || key === 'ARROWDOWN') return mk('down');
  if (key === 'LEFT' || key === 'ARROWLEFT') return mk('left');
  if (key === 'RIGHT' || key === 'ARROWRIGHT') return mk('right');
  if (key === 'SPACE') return { id: `${hat.id}:legacy`, block_type: 'jump' };
  return null;
}

export class ObjectRuntime {
  private scripts: ScriptState[] = [];
  private frameDelta = 0;
  /** Per-object sound volume, 0-100 (Scratch semantics). */
  private volume = 100;
  /** Custom-block definitions (Scratch "My Blocks"), keyed by lowercase name. Per-object, like Scratch. */
  private definitions = new Map<string, { params: string[]; body: LogicBlock[] }>();
  /** Parameter frames for in-flight custom-block calls (innermost last). */
  private localStack: Array<Record<string, Value>> = [];

  constructor(
    private objectId: string,
    blocks: LogicBlock[],
    private vars: VariableStore,
    private ctx: RuntimeContext,
    private world?: RuntimeWorld,
    private options?: { isClone?: boolean }
  ) {
    let current: ScriptState | null = null;
    const defineScripts: ScriptState[] = [];
    for (const block of blocks ?? []) {
      if (HAT_TYPES.has(block.block_type)) {
        current = { hat: block, body: [], gen: null, waitRemaining: 0, startFired: false, handledClicks: 0, pendingStart: false };
        // Legacy AI-generated hats carry the action on the hat itself
        // (block_data.action) instead of as body blocks.
        const legacyBody = legacyHatBody(block);
        if (legacyBody) current.body.push(legacyBody);
        // Definitions are grouped like scripts (so flat following blocks attach
        // to them) but are stored apart and never executed on their own.
        if (block.block_type === 'define_custom_block') defineScripts.push(current);
        else this.scripts.push(current);
      } else if (current) {
        current.body.push(block);
      } else {
        current = { hat: null, body: [block], gen: null, waitRemaining: 0, startFired: false, handledClicks: 0, pendingStart: false };
        this.scripts.push(current);
      }
    }
    for (const def of defineScripts) {
      const spec = definitionSpec(def.hat!);
      // Body: explicit children win; otherwise the flat blocks that followed the hat.
      const body = blockChildren(def.hat!) ?? def.body;
      if (spec.name) this.definitions.set(spec.name.toLowerCase(), { params: spec.params, body });
    }
  }

  get hasScripts(): boolean {
    return this.scripts.some((s) => s.body.length > 0);
  }

  private env(time: number): EvalEnv {
    return { objectId: this.objectId, vars: this.vars, keys: this.ctx.getKeys(), time, world: this.world, locals: this.localStack, ctx: this.ctx, getVolume: () => this.volume, pointer: this.world?.pointer, language: this.world?.language };
  }

  step(delta: number, time: number) {
    this.frameDelta = delta;
    for (const script of this.scripts) {
      // Scripts start when their hat fires; once running they always finish
      // (releasing a key mid-script does not cancel it).
      if (!script.gen && (script.pendingStart || this.shouldStart(script))) {
        script.pendingStart = false;
        script.gen = this.runBlocks(script.body, time, script);
        script.waitRemaining = 0;
      }
      if (script.gen) this.advance(script, delta, time);
      // Keep click edge-detection in sync even while running, so clicks
      // during execution don't queue up a restart afterwards.
      if (script.hat?.block_type === 'when_clicked' && this.world) {
        script.handledClicks = Math.max(script.handledClicks, this.world.clickCount(this.objectId));
      }
    }
  }

  private shouldStart(script: ScriptState): boolean {
    if (!script.hat) return true; // implicit always-on
    switch (script.hat.block_type) {
      case 'when_video_motion': {
        // Level-triggered, like `when touching`: it runs while the motion is
        // above the threshold rather than once on the crossing. That matches
        // how a child uses it — keep waving, keep going.
        const threshold = toNumber((script.hat?.inputs?.threshold ?? 10) as any);
        return this.world ? this.world.videoMotion() > threshold : false;
      }
      case 'on_start':
      // when_scene_starts: the player remounts a scene's objects on activation,
      // creating fresh runtimes — so "fires once per runtime" = "fires on every
      // scene entry", which is the intended Scratch backdrop-hat behavior.
      case 'when_scene_starts':
        // Clones don't run the green-flag scripts — they run when_clone_start.
        return !this.options?.isClone && !script.startFired;
      case 'when_clone_start':
        return !!this.options?.isClone && !script.startFired;
      case 'on_key_press': {
        const key = String(getInput(script.hat, 'key', this.env(0), ''));
        return key !== '' && isKeyDown(this.ctx.getKeys(), key);
      }
      case 'when_clicked': {
        if (!this.world) return false;
        const count = this.world.clickCount(this.objectId);
        if (count > script.handledClicks) {
          script.handledClicks = count;
          return true;
        }
        return false;
      }
      case 'when_touches': {
        if (!this.world) return false;
        const target = String(getInput(script.hat, 'target', this.env(0), ''));
        return this.world.touching(this.objectId, target);
      }
      // when_receive scripts are started by RuntimeWorld.broadcast, never polled.
      default:
        return false;
    }
  }

  /** Start `when I receive <message>` scripts (already-lowercased message). Returns handles for the ones started. */
  startBroadcast(wantedMessage: string): ScriptHandle[] {
    const handles: ScriptHandle[] = [];
    for (const script of this.scripts) {
      if (script.hat?.block_type !== 'when_receive' || script.gen || script.pendingStart) continue;
      const message = String(getInput(script.hat, 'message', this.env(0), '')).trim().toLowerCase();
      if (message !== wantedMessage) continue;
      script.pendingStart = true;
      handles.push({ isRunning: () => script.pendingStart || script.gen !== null });
    }
    return handles;
  }

  /** Stop every script on this object (optionally sparing one). */
  stopAll(except?: ScriptState) {
    for (const script of this.scripts) {
      if (script !== except) {
        script.gen = null;
        script.waitRemaining = 0;
        script.pendingStart = false;
        // A stopped one-shot hat stays consumed — it must not refire next frame.
        if (script.hat?.block_type === 'on_start' || script.hat?.block_type === 'when_clone_start' || script.hat?.block_type === 'when_scene_starts') script.startFired = true;
      }
    }
  }

  private stopOthers(current: ScriptState) {
    this.stopAll(current);
  }

  private advance(script: ScriptState, delta: number, time: number) {
    const gen = script.gen;
    if (!gen) return;

    if (script.waitRemaining > 0) {
      script.waitRemaining -= delta;
      if (script.waitRemaining > 0) return;
    }

    // Pump the coroutine until it suspends on a frame/wait boundary or finishes.
    for (let guard = 0; guard < 10000; guard++) {
      let result: IteratorResult<Yield, void>;
      try {
        result = gen.next();
      } catch (e) {
        if (e === STOP_SCRIPT) {
          script.gen = null;
          if (script.hat?.block_type === 'on_start' || script.hat?.block_type === 'when_clone_start' || script.hat?.block_type === 'when_scene_starts') script.startFired = true;
          return;
        }
        throw e;
      }
      const { done, value } = result;
      if (done) {
        script.gen = null;
        if (script.hat?.block_type === 'on_start' || script.hat?.block_type === 'when_clone_start' || script.hat?.block_type === 'when_scene_starts') script.startFired = true;
        return;
      }
      if (value && value.type === 'wait') {
        script.waitRemaining = Math.max(0, value.seconds);
        if (script.waitRemaining > 0) return;
        // zero-length wait falls through to the next statement this frame
      } else {
        return; // 'frame' yield — resume next frame
      }
    }
    // Runaway script protection: abandon scripts that never yield.
    script.gen = null;
  }

  private *runBlocks(blocks: LogicBlock[], time: number, script: ScriptState): BlockGen {
    for (const block of blocks) {
      yield* this.runBlock(block, time, script);
    }
  }

  private *runBlock(block: LogicBlock, time: number, script: ScriptState): BlockGen {
    const env = this.env(time);
    try {
      switch (block.block_type) {
        case 'move': {
          const direction = String(getInput(block, 'direction', env, '')).toLowerCase();
          const distance = toNumber(getInput(block, 'distance', env, 5));
          const step = (distance / 100) * this.frameDelta; // world units this frame, matching legacy behavior
          if (direction === 'up' || direction === 'forward') this.ctx.move(0, -step);
          else if (direction === 'down' || direction === 'backward') this.ctx.move(0, step);
          else if (direction === 'left') this.ctx.move(-step, 0);
          else if (direction === 'right') this.ctx.move(step, 0);
          return;
        }
        case 'jump':
          this.ctx.jump();
          return;
        case 'rotate':
          this.ctx.rotate(
            toNumber(getInput(block, 'x', env, 0)),
            toNumber(getInput(block, 'y', env, toNumber(getInput(block, 'degrees', env, 0)))),
            toNumber(getInput(block, 'z', env, 0))
          );
          return;
        case 'scale': {
          const factor = toNumber(getInput(block, 'factor', env, toNumber(getInput(block, 'value', env, 1))));
          if (factor > 0) this.ctx.scaleBy(factor);
          return;
        }
        case 'play_sound':
          this.ctx.playSound(String(getInput(block, 'sound', env, getInput(block, 'name', env, 'click'))), this.volume / 100);
          return;
        case 'play_sound_until_done': {
          const name = String(getInput(block, 'sound', env, getInput(block, 'name', env, 'click')));
          const duration = this.ctx.playSound(name, this.volume / 100);
          const seconds = typeof duration === 'number' && isFinite(duration) ? Math.max(0, duration) : 0;
          if (seconds > 0) yield { type: 'wait', seconds };
          return;
        }
        case 'stop_all_sounds':
          this.ctx.stopAllSounds?.();
          return;
        case 'set_volume':
          this.volume = Math.max(0, Math.min(100, toNumber(getInput(block, 'value', env, 100))));
          return;
        case 'change_volume_by':
          this.volume = Math.max(0, Math.min(100, this.volume + toNumber(getInput(block, 'value', env, -10))));
          return;
        case 'wait': {
          const seconds = toNumber(getInput(block, 'seconds', env, toNumber(getInput(block, 'duration', env, 1))));
          yield { type: 'wait', seconds };
          return;
        }
        case 'if_then': {
          const cond = getInput(block, 'condition', env, false);
          const branch = toBool(cond) ? blockChildren(block) : blockElseChildren(block);
          if (branch?.length) yield* this.runBlocks(branch, time, script);
          return;
        }
        case 'repeat': {
          const times = Math.max(0, Math.floor(toNumber(getInput(block, 'times', env, toNumber(getInput(block, 'count', env, 1))))));
          for (let i = 0; i < times; i++) {
            const kids = blockChildren(block);
            if (kids?.length) yield* this.runBlocks(kids, time, script);
            yield FRAME; // one loop iteration per frame, Scratch-style
          }
          return;
        }
        case 'repeat_until': {
          let guard = 0;
          while (!toBool(getInput(block, 'condition', env, true))) {
            const kids = blockChildren(block);
            if (kids?.length) yield* this.runBlocks(kids, time, script);
            yield FRAME;
            if (++guard > 1_000_000) return; // runaway protection
          }
          return;
        }
        case 'forever': {
          while (true) {
            const kids = blockChildren(block);
            if (kids?.length) yield* this.runBlocks(kids, time, script);
            yield FRAME; // keeps the coroutine frame-stepped; advance() caps runaway pumps
          }
        }
        case 'wait_until': {
          while (!toBool(getInput(block, 'condition', env, false))) {
            yield FRAME;
          }
          return;
        }
        case 'you_win':
        case 'game_over': {
          const message = String(getInput(block, 'message', env,
            block.block_type === 'you_win' ? 'You win!' : 'Game over!'));
          this.world?.endGame(block.block_type === 'you_win' ? 'won' : 'lost', message);
          throw STOP_SCRIPT;
        }
        case 'show_message':
          // No clock passed: the world and the overlay must share one.
          this.world?.showMessage(
            String(getInput(block, 'text', env, '')),
            toNumber(getInput(block, 'seconds', env, 2))
          );
          return;
        case 'clear_message':
          this.world?.clearMessage();
          return;
        case 'stop': {
          const option = String(getInput(block, 'option', env, 'this_script')).toLowerCase();
          if (option === 'all') {
            this.world?.stopAll();
            throw STOP_SCRIPT;
          }
          if (option === 'other_scripts') {
            this.stopOthers(script);
            return;
          }
          throw STOP_SCRIPT; // 'this_script'
        }
        case 'broadcast': {
          const message = String(getInput(block, 'message', env, ''));
          if (message) this.world?.broadcast(message);
          return;
        }
        case 'broadcast_and_wait': {
          const message = String(getInput(block, 'message', env, ''));
          if (!message || !this.world) return;
          const handles = this.world.broadcast(message);
          while (handles.some((h) => h.isRunning())) {
            yield FRAME;
          }
          return;
        }
        case 'call_custom_block': {
          const name = String(getInput(block, 'name', env, '')).trim().toLowerCase();
          const def = this.definitions.get(name);
          if (!def) return; // unknown block: no-op
          if (this.localStack.length >= 64) return; // recursion guard
          // Args are evaluated in the caller's scope, then bound by param name.
          const frame: Record<string, Value> = {};
          for (const param of def.params) {
            frame[param] = getInput(block, param, env, 0);
          }
          this.localStack.push(frame);
          try {
            yield* this.runBlocks(def.body, time, script);
          } finally {
            this.localStack.pop();
          }
          return;
        }
        case 'create_clone_of': {
          const target = String(getInput(block, 'target', env, 'myself'));
          this.world?.createClone(this.objectId, target);
          return;
        }
        case 'delete_clone':
          // No-op on non-clones (Scratch behavior).
          if (this.world?.deleteClone(this.objectId)) throw STOP_SCRIPT;
          return;
        case 'add_to_list':
          this.vars.listAdd(
            this.objectId,
            String(getInput(block, 'name', env, 'list')),
            getInput(block, 'item', env, getInput(block, 'value', env, '')),
            String(getInput(block, 'scope', env, 'global')) === 'object' ? 'object' : 'global'
          );
          return;
        case 'delete_from_list':
          this.vars.listDelete(
            this.objectId,
            String(getInput(block, 'name', env, 'list')),
            getInput(block, 'index', env, 1),
            String(getInput(block, 'scope', env, 'global')) === 'object' ? 'object' : 'global'
          );
          return;
        case 'insert_into_list':
          this.vars.listInsert(
            this.objectId,
            String(getInput(block, 'name', env, 'list')),
            getInput(block, 'index', env, 1),
            getInput(block, 'item', env, getInput(block, 'value', env, '')),
            String(getInput(block, 'scope', env, 'global')) === 'object' ? 'object' : 'global'
          );
          return;
        case 'replace_in_list':
          this.vars.listReplace(
            this.objectId,
            String(getInput(block, 'name', env, 'list')),
            getInput(block, 'index', env, 1),
            getInput(block, 'item', env, getInput(block, 'value', env, '')),
            String(getInput(block, 'scope', env, 'global')) === 'object' ? 'object' : 'global'
          );
          return;
        case 'delete_all_of_list':
          this.vars.listDelete(
            this.objectId,
            String(getInput(block, 'name', env, 'list')),
            'all',
            String(getInput(block, 'scope', env, 'global')) === 'object' ? 'object' : 'global'
          );
          return;
        case 'show_list':
        case 'hide_list':
          // Reuses variable visibility: the watcher overlay renders list rows
          // when the underlying VariableEntry has visible=true and value is an array.
          this.vars.setVisible(
            this.objectId,
            String(getInput(block, 'name', env, 'list')),
            block.block_type === 'show_list',
            String(getInput(block, 'scope', env, 'global')) === 'object' ? 'object' : 'global'
          );
          return;
        case 'set_variable':
          this.vars.set(
            this.objectId,
            String(getInput(block, 'name', env, 'variable')),
            getInput(block, 'value', env, 0),
            String(getInput(block, 'scope', env, 'global')) === 'object' ? 'object' : 'global'
          );
          return;
        case 'change_variable':
          this.vars.change(
            this.objectId,
            String(getInput(block, 'name', env, 'variable')),
            getInput(block, 'value', env, getInput(block, 'by', env, 1)),
            String(getInput(block, 'scope', env, 'global')) === 'object' ? 'object' : 'global'
          );
          return;
        case 'show_variable':
        case 'hide_variable':
          this.vars.setVisible(
            this.objectId,
            String(getInput(block, 'name', env, 'variable')),
            block.block_type === 'show_variable',
            String(getInput(block, 'scope', env, 'global')) === 'object' ? 'object' : 'global'
          );
          return;

        // --- Phase 5a: motion writers ---
        case 'goto_xyz': {
          this.ctx.setPosition?.(
            toNumber(getInput(block, 'x', env, 0)),
            toNumber(getInput(block, 'y', env, 0)),
            toNumber(getInput(block, 'z', env, 0))
          );
          return;
        }
        case 'goto_object': {
          const target = String(getInput(block, 'target', env, ''));
          const p = this.world?.getObjectPositionByName(target);
          if (p) this.ctx.setPosition?.(p.x, p.y, p.z);
          return;
        }
        case 'change_xyz': {
          this.ctx.changePosition?.(
            toNumber(getInput(block, 'dx', env, 0)),
            toNumber(getInput(block, 'dy', env, 0)),
            toNumber(getInput(block, 'dz', env, 0))
          );
          return;
        }
        case 'set_x':
          this.ctx.setPositionAxis?.('x', toNumber(getInput(block, 'value', env, 0)));
          return;
        case 'set_y':
          this.ctx.setPositionAxis?.('y', toNumber(getInput(block, 'value', env, 0)));
          return;
        case 'set_z':
          this.ctx.setPositionAxis?.('z', toNumber(getInput(block, 'value', env, 0)));
          return;
        case 'set_rotation':
          this.ctx.setRotation?.(
            toNumber(getInput(block, 'x', env, 0)),
            toNumber(getInput(block, 'y', env, 0)),
            toNumber(getInput(block, 'z', env, 0))
          );
          return;
        case 'point_towards': {
          const target = String(getInput(block, 'target', env, ''));
          const p = this.world?.getObjectPositionByName(target);
          if (!p) return;
          this.ctx.pointTowards?.(p.x, p.z);
          return;
        }
        case 'glide_to_xyz': {
          const seconds = Math.max(0, toNumber(getInput(block, 'seconds', env, 1)));
          const targetX = toNumber(getInput(block, 'x', env, 0));
          const targetY = toNumber(getInput(block, 'y', env, 0));
          const targetZ = toNumber(getInput(block, 'z', env, 0));
          const start = this.ctx.getPosition?.() ?? { x: 0, y: 0, z: 0 };
          if (seconds <= 0) {
            this.ctx.setPosition?.(targetX, targetY, targetZ);
            return;
          }
          let elapsed = 0;
          while (elapsed < seconds) {
            elapsed += this.frameDelta;
            const t = Math.min(1, elapsed / seconds);
            this.ctx.setPosition?.(
              start.x + (targetX - start.x) * t,
              start.y + (targetY - start.y) * t,
              start.z + (targetZ - start.z) * t
            );
            if (elapsed < seconds) yield FRAME;
          }
          return;
        }

        // --- Phase 5b: looks basics ---
        case 'show':
          this.ctx.setVisible?.(true);
          return;
        case 'hide':
          this.ctx.setVisible?.(false);
          return;
        case 'set_size':
          this.ctx.setSize?.(toNumber(getInput(block, 'pct', env, getInput(block, 'value', env, 100))));
          return;
        case 'change_size_by':
          this.ctx.changeSizeBy?.(toNumber(getInput(block, 'delta', env, getInput(block, 'value', env, 10))));
          return;
        case 'say': {
          const text = String(getInput(block, 'text', env, ''));
          const rawSeconds = getInput(block, 'seconds', env, '');
          const seconds = rawSeconds === '' || rawSeconds === undefined ? undefined : toNumber(rawSeconds);
          this.ctx.say?.(text, seconds, 'say');
          return;
        }
        case 'think': {
          const text = String(getInput(block, 'text', env, ''));
          const rawSeconds = getInput(block, 'seconds', env, '');
          const seconds = rawSeconds === '' || rawSeconds === undefined ? undefined : toNumber(rawSeconds);
          this.ctx.say?.(text, seconds, 'think');
          return;
        }
        case 'clear_bubble':
          this.ctx.clearBubble?.();
          return;
        case 'set_color':
          this.ctx.setColor?.(String(getInput(block, 'hex', env, getInput(block, 'value', env, '#ffffff'))));
          return;

        // --- Graphic effects ---
        // Effects are clamped to Scratch's ranges: ghost 0..100, brightness
        // -100..100, colour wraps modulo 200.
        case 'set_effect': {
          const effect = String(getInput(block, 'effect', env, 'ghost'));
          const raw = toNumber(getInput(block, 'value', env, 0));
          this.ctx.setEffect?.(effect, clampEffect(effect, raw));
          return;
        }
        case 'change_effect_by': {
          const effect = String(getInput(block, 'effect', env, 'ghost'));
          const delta = toNumber(getInput(block, 'delta', env, getInput(block, 'value', env, 0)));
          const current = this.ctx.getEffect?.(effect) ?? 0;
          this.ctx.setEffect?.(effect, clampEffect(effect, current + delta));
          return;
        }
        case 'clear_effects':
          this.ctx.clearEffects?.();
          return;

        // --- Layer ordering ---
        case 'go_to_layer':
          this.ctx.goToLayer?.(String(getInput(block, 'layer', env, 'front')) === 'back' ? 'back' : 'front');
          return;
        case 'change_layer_by': {
          const amount = Math.trunc(toNumber(getInput(block, 'amount', env, 1)));
          const backward = String(getInput(block, 'direction', env, 'forward')) === 'backward';
          this.ctx.changeLayerBy?.(backward ? -amount : amount);
          return;
        }

        // --- Sensing statements ---
        // ask_and_wait suspends the script until the player answers, exactly
        // like Scratch's "ask and wait".
        case 'ask_and_wait': {
          const prompt = String(getInput(block, 'prompt', env, ''));
          if (!this.ctx.ask) return;
          let settled = false;
          let answer = '';
          this.ctx.ask(prompt).then(
            (response: string) => { answer = String(response ?? ''); settled = true; },
            () => { answer = ''; settled = true; }
          );
          while (!settled) yield { type: 'frame' };
          this.world?.setAnswer(answer);
          return;
        }
          // getInput, not block.inputs: a block round-tripped through the
        // database carries its fields under block_data, and reading `inputs`
        // directly meant every effect silently fell back to the default. The
        // dropdown looked like it worked and did nothing.
        case 'camera_follow':
          this.world?.cameraFollow(String(getInput(block, 'target', env, '')));
          return;
        case 'camera_stop_following':
          this.world?.cameraFollow(null);
          return;
        case 'camera_shake':
          this.world?.cameraShake(
            toNumber(getInput(block, 'strength', env, 1)),
            toNumber(getInput(block, 'seconds', env, 0.4))
          );
          return;
        case 'camera_zoom':
          this.world?.cameraZoom(toNumber(getInput(block, 'value', env, 1)));
          return;
        case 'camera_zoom_by':
          this.world?.cameraZoomBy(toNumber(getInput(block, 'value', env, 0.2)));
          return;
        case 'burst_particles':
          this.world?.burstParticlesFor(
            this.objectId,
            String(getInput(block, 'effect', env, 'sparkle'))
          );
          return;
        case 'start_particles':
          this.world?.setParticleTrailFor(
            this.objectId,
            String(getInput(block, 'effect', env, 'sparkle'))
          );
          return;
        case 'set_particle_size':
          this.world?.setParticleSizeFor(
            this.objectId, toNumber(getInput(block, 'value', env, 100))
          );
          return;
        case 'set_particle_amount':
          this.world?.setParticleAmountFor(
            this.objectId, toNumber(getInput(block, 'value', env, 100))
          );
          return;
        case 'set_particle_color':
          this.world?.setParticleColourFor(
            this.objectId, String(getInput(block, 'colour', env, '#FFCC33'))
          );
          return;
        case 'stop_particles':
          this.world?.setParticleTrailFor(this.objectId, null);
          return;
        case 'set_video': {
          const state = String(block.inputs?.state ?? 'on');
          this.world?.requestVideo(state === 'off' ? 'off' : state === 'flipped' ? 'flipped' : 'on');
          return;
        }
        case 'set_video_transparency':
          this.world?.requestVideoTransparency(
            Math.max(0, Math.min(100, toNumber(getInput(block, 'value', env, 50))))
          );
          return;
      case 'reset_timer':
          this.world?.resetTimer(time);
          return;

        // --- Scene switching ---
        // If the switch succeeds the player unmounts this object (killing the
        // runtime); if the name is unknown it's a no-op and the script continues.
        case 'switch_to_scene':
          this.ctx.switchScene?.(String(getInput(block, 'name', env, '')));
          return;
        case 'next_scene':
          this.ctx.nextScene?.();
          return;

        // --- Costumes ---
        case 'switch_costume_to':
          this.ctx.switchCostume?.(String(getInput(block, 'name', env, '')));
          return;
        case 'next_costume':
          this.ctx.nextCostume?.();
          return;
        // --- Music extension ---
        // play note/drum and rest all block for their duration, matching
        // Scratch, so a melody written as a stack plays in sequence.
        case 'play_note': {
          const note = toNumber(getInput(block, 'note', env, 60));
          const beats = toNumber(getInput(block, 'beats', env, 1));
          const seconds = this.ctx.playNote?.(note, beats) ?? 0;
          if (seconds > 0) yield { type: 'wait', seconds };
          return;
        }
        case 'play_drum': {
          const drum = String(getInput(block, 'drum', env, 'snare'));
          const beats = toNumber(getInput(block, 'beats', env, 0.25));
          const seconds = this.ctx.playDrum?.(drum, beats) ?? 0;
          if (seconds > 0) yield { type: 'wait', seconds };
          return;
        }
        case 'rest_for_beats': {
          const beats = toNumber(getInput(block, 'beats', env, 1));
          const seconds = this.ctx.restForBeats?.(beats) ?? 0;
          if (seconds > 0) yield { type: 'wait', seconds };
          return;
        }
        case 'set_instrument':
          this.ctx.setInstrument?.(String(getInput(block, 'instrument', env, 'piano')));
          return;
        case 'set_tempo':
          this.ctx.setTempo?.(toNumber(getInput(block, 'tempo', env, 60)));
          return;
        case 'change_tempo_by':
          this.ctx.changeTempoBy?.(toNumber(getInput(block, 'delta', env, 20)));
          return;

        // --- Translate extension ---
        // Blocks until the translation returns, like ask_ai, so the next block
        // sees the finished value.
        case 'translate_to': {
          const text = String(getInput(block, 'text', env, ''));
          const language = String(getInput(block, 'language', env, 'en'));
          const intoVar = String(getInput(block, 'into_var', env, 'translation'));
          if (!this.ctx.translate || !text) return;
          let settled = false;
          let result = '';
          Promise.resolve(this.ctx.translate(text, language)).then(
            (value) => { result = String(value ?? ''); settled = true; },
            () => { result = ''; settled = true; }
          );
          while (!settled) yield { type: 'frame' };
          this.vars.set(this.objectId, intoVar, result, 'global');
          return;
        }

        // --- Text-to-speech ---
        case 'speak':
          this.ctx.speak?.(String(getInput(block, 'text', env, '')), false);
          return;
        case 'speak_until_done': {
          const text = String(getInput(block, 'text', env, ''));
          if (!this.ctx.speak) return;
          let done = false;
          Promise.resolve(this.ctx.speak(text, true)).then(
            () => { done = true; },
            () => { done = true; }
          );
          while (!done) yield { type: 'frame' };
          return;
        }

        // --- Pen extension ---
        case 'pen_down':
          this.ctx.penDown?.(true);
          return;
        case 'pen_up':
          this.ctx.penDown?.(false);
          return;
        case 'pen_clear':
          this.ctx.penClear?.();
          return;
        case 'pen_set_color':
          this.ctx.penSetColor?.(String(getInput(block, 'hex', env, '#ff3b30')));
          return;
        case 'pen_set_size':
          this.ctx.penSetSize?.(toNumber(getInput(block, 'size', env, 4)));
          return;

        case 'switch_animation_to':
          this.ctx.switchAnimation?.(String(getInput(block, 'name', env, '')));
          return;

        // --- Phase 5c: AI blocks ---
        // ask_ai/ai_decide fire an async call and suspend the coroutine until it resolves,
        // then write the response into the named variable.
        case 'ask_ai':
        case 'ai_decide': {
          const prompt = String(getInput(block, 'prompt', env, ''));
          const intoVar = String(getInput(block, 'into_var', env, getInput(block, 'variable', env, 'answer')));
          const scope = String(getInput(block, 'scope', env, 'global')) === 'object' ? 'object' : 'global';
          let choices: string[] | undefined;
          if (block.block_type === 'ai_decide') {
            const raw = getInput(block, 'choices', env, '');
            if (typeof raw === 'string' && raw.trim() !== '') {
              choices = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
            } else if (Array.isArray(raw)) {
              choices = raw.map(String);
            }
          }
          if (!this.ctx.askAI || !prompt) return;
          let done = false;
          let result: string = '';
          this.ctx.askAI(prompt, (r) => {
            done = true;
            result = r;
          }, choices ? { choices } : undefined);
          while (!done) yield FRAME;
          this.vars.set(this.objectId, intoVar, result, scope);
          return;
        }

        default:
          return; // unknown op: skip, never throw
      }
    } catch (e) {
      if (e === STOP_SCRIPT) throw e;
      // A bad block must not kill the frame loop.
      return;
    }
  }
}
