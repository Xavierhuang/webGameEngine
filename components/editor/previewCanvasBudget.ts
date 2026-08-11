export type PreviewCanvasKind = 'model' | 'primitive';

interface PreviewCanvasBudgetOptions {
  maximum?: number;
  reservedModelSlots?: number;
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
  private readonly listeners = new Set<() => void>();
  private readonly maximum: number;
  private readonly primitiveMaximum: number;

  constructor({ maximum = 8, reservedModelSlots = 1 }: PreviewCanvasBudgetOptions = {}) {
    if (!Number.isInteger(maximum) || maximum < 1) {
      throw new Error('Preview canvas maximum must be a positive integer.');
    }
    if (!Number.isInteger(reservedModelSlots) || reservedModelSlots < 0 || reservedModelSlots >= maximum) {
      throw new Error('Reserved model slots must be an integer smaller than the maximum.');
    }

    this.maximum = maximum;
    this.primitiveMaximum = maximum - reservedModelSlots;
  }

  get size() {
    return this.allocations.size;
  }

  has(id: string) {
    return this.allocations.has(id);
  }

  acquire(id: string, kind: PreviewCanvasKind) {
    if (this.allocations.has(id)) return true;

    const limit = kind === 'model' ? this.maximum : this.primitiveMaximum;
    if (this.allocations.size >= limit) return false;

    this.allocations.set(id, kind);
    this.notify();
    return true;
  }

  release(id: string) {
    if (!this.allocations.delete(id)) return;
    this.notify();
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
    this.options.budget.release(this.options.id);
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

export const selectorPreviewCanvasBudget = new PreviewCanvasBudget();
