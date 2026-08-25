'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import GamePlayer from '@/components/player/GamePlayer';
import type { Project } from '@/types/game';
import type { WorldTemplateCardData } from './WorldTemplateCard';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function WorldTemplatePreview({
  template,
  project,
  onClose,
  closeLabel,
  previewLabel,
  returnFocusRef,
}: {
  template: WorldTemplateCardData;
  project: Project;
  onClose: () => void;
  closeLabel: string;
  previewLabel: string;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current?.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onClose, returnFocusRef]);

  const dialogLabel = `${previewLabel} ${template.title}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        tabIndex={-1}
        className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/30 bg-slate-950 shadow-2xl"
      >
        <header className="flex items-center justify-between gap-4 border-b border-white/15 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-sky-200">{previewLabel}</p>
            <h2 className="text-lg font-black text-white">{template.title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="rounded-full p-2 text-slate-200 transition hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-300"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto bg-slate-950 p-3 sm:p-5">
          <GamePlayer
            project={project}
            worldIdentity={{ templateId: template.id, templateVersion: template.version }}
          />
        </div>
      </div>
    </div>
  );
}
