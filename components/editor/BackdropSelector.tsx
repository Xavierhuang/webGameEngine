'use client';

import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { SelectorModal, SelectorTile, SelectorSection } from './SelectorModal';
import { PALETTE } from '../common/design';
import { useTranslator } from '../common/LocaleProvider';
import {
  BACKDROPS,
  BACKDROP_CATEGORIES,
  backdropsByCategory,
  type BackdropCategory,
} from '@/lib/models/backdrops';

interface BackdropSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current scene backdrop url, so the active one can be marked. */
  currentUrl?: string | null;
  onSelect: (url: string | null) => void;
}

/**
 * Pick a backdrop for the current scene.
 *
 * Backdrops are the one Scratch staple that had schema support and rendering
 * but no images and no way to choose one.
 */
export default function BackdropSelector({
  isOpen,
  onClose,
  currentUrl,
  onSelect,
}: BackdropSelectorProps) {
  const t = useTranslator();
  const [tab, setTab] = useState<BackdropCategory>('outdoor');
  const items = backdropsByCategory(tab);

  const categoryLabel: Record<BackdropCategory, string> = {
    outdoor: t('editor.backdropPicker.category.outdoor'),
    space: t('editor.backdropPicker.category.space'),
    water: t('editor.backdropPicker.category.water'),
    indoor: t('editor.backdropPicker.category.indoor'),
    fantasy: t('editor.backdropPicker.category.fantasy'),
    abstract: t('editor.backdropPicker.category.abstract'),
  };

  return (
    <SelectorModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('editor.backdropPicker.title')}
      eyebrow={t('editor.backdropPicker.eyebrow')}
      icon={<ImageIcon className="h-5 w-5" />}
      accent={PALETTE.sensing}
      tabs={BACKDROP_CATEGORIES.map((c) => ({ id: c, label: categoryLabel[c] }))}
      activeTab={tab}
      onTabChange={(id) => setTab(id as BackdropCategory)}
    >
      <SelectorSection
        title={categoryLabel[tab]}
        description={t('editor.backdropPicker.description')}
        accent={PALETTE.sensing}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {/* Clearing returns the scene to its flat background colour. */}
          <SelectorTile
            title={t('editor.backdropPicker.none.title')}
            description={t('editor.backdropPicker.none.description')}
            onClick={() => {
              onSelect(null);
              onClose();
            }}
          >
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs font-semibold text-slate-400">
              {t('editor.backdropPicker.none.label')}
            </div>
          </SelectorTile>

          {items.map((b) => (
            <SelectorTile
              key={b.id}
              title={b.name}
              onClick={() => {
                onSelect(b.url);
                onClose();
              }}
              badge={currentUrl === b.url ? t('editor.backdropPicker.current') : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.url} alt={b.name} className="h-full w-full object-cover" />
            </SelectorTile>
          ))}
        </div>
      </SelectorSection>
    </SelectorModal>
  );
}

export { BACKDROPS };
