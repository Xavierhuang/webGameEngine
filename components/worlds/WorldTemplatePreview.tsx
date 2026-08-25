'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import GamePlayer from '@/components/player/GamePlayer';
import type { Project } from '@/types/game';
import type { WorldTemplateCardData } from './WorldTemplateCard';

export default function WorldTemplatePreview({
  template,
  project,
  onClose,
  closeLabel,
  previewLabel,
}: {
  template: WorldTemplateCardData;
  project: Project;
  onClose: () => void;
  closeLabel: string;
  previewLabel: string;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const dialogLabel = `${previewLabel} ${template.title}`;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={dialogLabel}
    >
      <section className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/30 bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-white/15 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-sky-200">{previewLabel}</p>
            <h2 className="text-lg font-black">{template.title}</h2>
          </div>
          <button
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
      </section>
    </div>
  );
}
