'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

/**
 * Small in-app notices, replacing `window.alert`.
 *
 * The editor used native alerts for a dozen error paths. They block the page,
 * follow the browser's locale rather than the app's, and several told a
 * nine-year-old to "check the console". A toast is dismissible, translated by
 * the caller, and never traps focus.
 *
 * Module-level bus so any component can call `toast()` without threading a
 * context through the tree. If no <Toaster/> is mounted it degrades to
 * `alert`, so a message is never silently lost.
 */

export type ToastKind = 'error' | 'success' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

const listeners = new Set<(item: ToastItem) => void>();
let seq = 0;

export function toast(text: string, kind: ToastKind = 'error') {
  const item: ToastItem = { id: ++seq, kind, text };
  if (listeners.size === 0) {
    if (typeof window !== 'undefined') window.alert(text);
    return;
  }
  for (const listener of listeners) listener(item);
}

const ICONS = {
  error: AlertTriangle,
  success: CheckCircle2,
  info: Info,
} as const;

const STYLES: Record<ToastKind, string> = {
  error: 'border-red-200 bg-white text-red-800',
  success: 'border-emerald-200 bg-white text-emerald-800',
  info: 'border-slate-200 bg-white text-slate-800',
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const listener = (item: ToastItem) => {
      setItems((prev) => [...prev.slice(-2), item]);
      timers.set(
        item.id,
        setTimeout(() => {
          timers.delete(item.id);
          setItems((prev) => prev.filter((i) => i.id !== item.id));
        }, 6000),
      );
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4"
    >
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
            className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl border px-4 py-3 text-left text-sm font-medium shadow-lg ${STYLES[item.kind]}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{item.text}</span>
          </button>
        );
      })}
    </div>
  );
}
