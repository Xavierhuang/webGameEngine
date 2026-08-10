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
    case 'timer':
      return env.time;
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
  /** Approximate bounding radius in world units. */
  getRadius(): number;
  /** Whether other objects can "touch" this one (platforms are scenery — default true). */
  touchable?: boolean;
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
  private cloneSeq = 0;
  /** Player hooks: spawn/despawn the clone's visual object. */
  onSpawnClone?: (sourceId: string, cloneId: string) => void;
  onDespawnClone?: (cloneId: string) => void;

  register(id: string, hooks: WorldObjectHooks) {
    this.objects.set(id, hooks);
    this.vars.registerObject(id, hooks.name);
  }

  unregister(id: string) {
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
    if (!a) return false;
    const pa = a.getPosition();
    const ra = a.getRadius();
    const check = (id: string, b: WorldObjectHooks) => {
      if (id === fromId || b.touchable === false) return false;
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
  /** Rotate by degrees (applied instantly). */
  rotate(xDeg: number, yDeg: number, zDeg: number): void;
  /** Multiply uniform scale. */
  scaleBy(factor: number): void;
  playSound(name: string): void;
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

export const HAT_TYPES = new Set(['on_start', 'on_key_press', 'when_clicked', 'when_touches', 'when_receive', 'when_clone_start', 'define_custom_block']);

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
    return { objectId: this.objectId, vars: this.vars, keys: this.ctx.getKeys(), time, world: this.world, locals: this.localStack };
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
      case 'on_start':
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
        if (script.hat?.block_type === 'on_start' || script.hat?.block_type === 'when_clone_start') script.startFired = true;
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
          if (script.hat?.block_type === 'on_start' || script.hat?.block_type === 'when_clone_start') script.startFired = true;
          return;
        }
        throw e;
      }
      const { done, value } = result;
      if (done) {
        script.gen = null;
        if (script.hat?.block_type === 'on_start' || script.hat?.block_type === 'when_clone_start') script.startFired = true;
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
          this.ctx.playSound(String(getInput(block, 'sound', env, getInput(block, 'name', env, 'click'))));
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
