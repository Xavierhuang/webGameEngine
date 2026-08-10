'use client';

import { useSyncExternalStore } from 'react';
import type { VariableStore, WatcherSnapshot } from '../../lib/runtime/interpreter';

const EMPTY: WatcherSnapshot[] = [];

/** Scratch-style variable watchers overlaid on the game canvas. */
export default function VariableWatchers({ vars }: { vars: VariableStore }) {
  const watchers = useSyncExternalStore(
    (cb) => vars.subscribe(cb),
    () => vars.watcherSnapshot(),
    () => EMPTY
  );

  if (watchers.length === 0) return null;

  return (
    <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 pointer-events-none">
      {watchers.map((w) => (
        <div
          key={w.label}
          className="bg-black bg-opacity-60 text-white text-sm font-mono px-3 py-1 rounded shadow"
        >
          {w.items ? (
            <div>
              <div className="font-bold mb-0.5">{w.label}</div>
              {w.items.length === 0 ? (
                <div className="text-gray-400 italic">(empty)</div>
              ) : (
                w.items.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-gray-400">{i + 1}.</span>
                    <span>{String(item)}</span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              {w.label}: {String(w.value)}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
