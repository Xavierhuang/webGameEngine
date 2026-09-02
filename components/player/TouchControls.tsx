'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslator } from '../common/LocaleProvider';

interface TouchControlsProps {
  /** Press/release a logical key, using the same names the keyboard handler uses. */
  onKeyChange: (key: string, down: boolean) => void;
}

/**
 * Each D-pad button presses the arrow key AND its WASD twin. The key dropdown
 * offers both, so a game authored with `when [w] key pressed` was unplayable
 * on a tablet — the pad only ever sent arrows.
 */
const PAD_KEYS: Record<string, string[]> = {
  up: ['arrowup', 'w'],
  down: ['arrowdown', 's'],
  left: ['arrowleft', 'a'],
  right: ['arrowright', 'd'],
  jump: [' '],
};

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
  const t = useTranslator();
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

  const press = (pad: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    for (const key of PAD_KEYS[pad]) {
      heldRef.current.add(key);
      onKeyChange(key, true);
    }
  };

  const release = (pad: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    for (const key of PAD_KEYS[pad]) {
      heldRef.current.delete(key);
      onKeyChange(key, false);
    }
  };

  const padButton = (pad: string, label: string, Icon: typeof ChevronUp, className: string) => (
    <button
      type="button"
      aria-label={label}
      className={`pointer-events-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/25 text-white backdrop-blur-sm transition active:bg-white/45 ${className}`}
      onPointerDown={press(pad)}
      onPointerUp={release(pad)}
      onPointerCancel={release(pad)}
      onPointerLeave={release(pad)}
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
        {padButton('up', t('player.touch.forward'), ChevronUp, '')}
        <span />
        {padButton('left', t('player.touch.left'), ChevronLeft, '')}
        <span />
        {padButton('right', t('player.touch.right'), ChevronRight, '')}
        <span />
        {padButton('down', t('player.touch.backward'), ChevronDown, '')}
        <span />
      </div>

      <button
        type="button"
        aria-label={t('player.touch.jump')}
        className="pointer-events-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/25 text-base font-bold uppercase text-white backdrop-blur-sm transition active:bg-white/45"
        onPointerDown={press('jump')}
        onPointerUp={release('jump')}
        onPointerCancel={release('jump')}
        onPointerLeave={release('jump')}
        onContextMenu={(e) => e.preventDefault()}
      >
        {t('player.touch.jump')}
      </button>
    </div>
  );
}
