export type PreviewCanvasKind = 'model' | 'primitive';

interface PreviewCanvasBudgetOptions {
  maximum?: number;
  reservedModelSlots?: number;
  retirementGraceMs?: number;
  scheduler?: PreviewRetirementScheduler;
}

export interface PreviewRetirementScheduler {
  schedule(callback: () => void, delayMs: number): void;
}

interface PreviewCanvasLeaseControllerOptions {
  id: string;
  kind: PreviewCanvasKind;
  budget: PreviewCanvasBudget;
  onLeaseChange?: (hasCanvas: boolean) => void;
}

/**
 * A shared, deterministic lease pool for WebGL-backed selector previews.
 * Primitive tiles keep one slot available for a model preview so the dragon
 * remains visible even when a large viewport shows the whole starter grid.
 */
export class PreviewCanvasBudget {
  private readonly allocations = new Map<string, PreviewCanvasKind>();
  private readonly retirements = new Map<number, { id: string; kind: PreviewCanvasKind }>();
  private readonly listeners = new Set<() => void>();
  private readonly maximum: number;
  private readonly primitiveMaximum: number;
  private readonly retirementGraceMs: number;
  private readonly scheduler: PreviewRetirementScheduler;
  private nextRetirementId = 1;

  constructor({
    maximum = 6,
    reservedModelSlots = 1,
    retirementGraceMs = 650,
    scheduler = {
      schedule: (callback, delayMs) => {
        globalThis.setTimeout(callback, delayMs);
      },
    },
  }: PreviewCanvasBudgetOptions = {}) {
    if (!Number.isInteger(maximum) || maximum < 1) {
      throw new Error('Preview canvas maximum must be a positive integer.');
    }
    if (!Number.isInteger(reservedModelSlots) || reservedModelSlots < 0 || reservedModelSlots >= maximum) {
      throw new Error('Reserved model slots must be an integer smaller than the maximum.');
    }
    if (!Number.isFinite(retirementGraceMs) || retirementGraceMs < 0) {
      throw new Error('Preview retirement grace must be a non-negative number.');
    }

    this.maximum = maximum;
    this.primitiveMaximum = maximum - reservedModelSlots;
    this.retirementGraceMs = retirementGraceMs;
    this.scheduler = scheduler;
  }

  get capacity() {
    return this.maximum;
  }

  get size() {
    return this.activeSize + this.retiringSize;
  }

  get activeSize() {
    return this.allocations.size;
  }

  get retiringSize() {
    return this.retirements.size;
  }

  has(id: string) {
    return this.allocations.has(id);
  }

  acquire(id: string, kind: PreviewCanvasKind) {
    if (this.allocations.has(id)) return true;

    // If the budget is full but only because leases are still cooling down in
    // the retirement queue, evict the oldest retirement so the visible tile
    // that's asking for a slot doesn't stay stranded at "Loading preview…"
    // for the full grace period.
    if (this.size >= this.maximum) this.evictOldestRetirement();
    if (this.size >= this.maximum) return false;
    if (kind === 'primitive' && this.primitiveCount >= this.primitiveMaximum) {
      return false;
    }

    this.allocations.set(id, kind);
    this.notify();
    return true;
  }

  private evictOldestRetirement() {
    // Map iteration order is insertion order, so the first key is the oldest.
    const oldestId = this.retirements.keys().next().value;
    if (oldestId === undefined) return;
    this.retirements.delete(oldestId);
    // No notify — the caller either fills the slot immediately (which will
    // notify) or bails out, and either way the notify would be redundant.
  }

  release(id: string, options?: { immediate?: boolean }) {
    const kind = this.allocations.get(id);
    if (!kind || !this.allocations.delete(id)) return;

    if (options?.immediate) {
      // Skip retirement — used on dispose, since the tile isn't coming back
      // and there's no reason to hold its slot against new tiles.
      this.notify();
      return;
    }

    const retirementId = this.nextRetirementId++;
    this.retirements.set(retirementId, { id, kind });
    this.scheduler.schedule(() => {
      if (!this.retirements.delete(retirementId)) return;
      this.notify();
    }, this.retirementGraceMs);
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  private get primitiveCount() {
    let count = 0;
    this.allocations.forEach((kind) => {
      if (kind === 'primitive') count += 1;
    });
    this.retirements.forEach(({ kind }) => {
      if (kind === 'primitive') count += 1;
    });
    return count;
  }
}

/** Bridges visibility changes to a budget lease and owns unmount cleanup. */
export class PreviewCanvasLeaseController {
  private visible = false;
  private disposed = false;
  private leased = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly options: PreviewCanvasLeaseControllerOptions) {
    this.unsubscribe = options.budget.subscribe(() => this.sync());
  }

  get hasCanvas() {
    return this.leased;
  }

  setVisible(visible: boolean) {
    if (this.disposed) return;
    this.visible = visible;
    this.sync();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    // Immediate release on unmount so a closed-then-reopened picker isn't
    // starved by leases still cooling down in the retirement queue.
    this.options.budget.release(this.options.id, { immediate: true });
    this.setLease(false);
  }

  private sync() {
    if (this.disposed) return;

    const hasCanvas = this.visible
      ? this.options.budget.acquire(this.options.id, this.options.kind)
      : (this.options.budget.release(this.options.id), false);
    this.setLease(hasCanvas);
  }

  private setLease(hasCanvas: boolean) {
    if (this.leased === hasCanvas) return;
    this.leased = hasCanvas;
    this.options.onLeaseChange?.(hasCanvas);
  }
}

export const selectorPreviewCanvasBudget = new PreviewCanvasBudget({
  // Bumped from 6 → 10. Chrome/Safari cap at ~16 concurrent WebGL contexts
  // per page, so 10 leaves headroom for the editor canvas + a few extras
  // while comfortably covering a row-and-a-half of tiles in the picker.
  maximum: 10,
  // 30 seconds of grace so a tile briefly scrolled past the IntersectionObserver
  // margin keeps its canvas — scrolling back within ~half a minute is instant.
  // Slots still count against capacity while retiring, so busy pickers still
  // rotate correctly under scroll load.
  retirementGraceMs: 30_000,
});
