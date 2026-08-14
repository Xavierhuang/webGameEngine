'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface TouchControlsProps {
  /** Press/release a logical key, using the same names the keyboard handler uses. */
  onKeyChange: (key: string, down: boolean) => void;
}

/**
 * On-screen D-pad and jump button.
 *
 * The player only ever listened for `keydown`/`keyup`, so on a tablet or phone
 * nothing could move — Scratch works on tablets and this did not. These write
 * into exactly the same key state the keyboard does, so no block or runtime
 * change is needed.
 *
 * Rendered only when the device actually reports coarse-pointer input, so
 * desktop mouse users don't get a D-pad over their game.
 */
export function TouchControls({ onKeyChange }: TouchControlsProps) {
  const [isTouch, setIsTouch] = useState(false);
  // Keys currently held via touch, so we can release them all if a pointer is
  // lost outside the button (pointercancel, or a finger sliding off).
  const heldRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setIsTouch(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  // Release everything on unmount so a key can't stay stuck down.
  useEffect(() => {
    const held = heldRef.current;
    return () => {
      for (const key of held) onKeyChange(key, false);
      held.clear();
    };
  }, [onKeyChange]);

  if (!isTouch) return null;

  const press = (key: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    heldRef.current.add(key);
    onKeyChange(key, true);
  };

  const release = (key: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    heldRef.current.delete(key);
    onKeyChange(key, false);
  };

  const padButton = (key: string, label: string, Icon: typeof ChevronUp, className: string) => (
    <button
      type="button"
      aria-label={label}
      className={`pointer-events-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/25 text-white backdrop-blur-sm transition active:bg-white/45 ${className}`}
      onPointerDown={press(key)}
      onPointerUp={release(key)}
      onPointerCancel={release(key)}
      onPointerLeave={release(key)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Icon className="h-7 w-7" />
    </button>
  );

  return (
    // touch-none stops the browser scrolling/zooming the page while playing.
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex touch-none select-none items-end justify-between p-4">
      <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
        <span />
        {padButton('arrowup', 'Move forward', ChevronUp, '')}
        <span />
        {padButton('arrowleft', 'Move left', ChevronLeft, '')}
        <span />
        {padButton('arrowright', 'Move right', ChevronRight, '')}
        <span />
        {padButton('arrowdown', 'Move backward', ChevronDown, '')}
        <span />
      </div>

      <button
        type="button"
        aria-label="Jump"
        className="pointer-events-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/25 text-base font-bold text-white backdrop-blur-sm transition active:bg-white/45"
        onPointerDown={press(' ')}
        onPointerUp={release(' ')}
        onPointerCancel={release(' ')}
        onPointerLeave={release(' ')}
        onContextMenu={(e) => e.preventDefault()}
      >
        JUMP
      </button>
    </div>
  );
}
