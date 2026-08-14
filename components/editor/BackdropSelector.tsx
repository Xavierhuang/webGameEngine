'use client';

import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { SelectorModal, SelectorTile, SelectorSection } from './SelectorModal';
import { PALETTE } from '../common/design';
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

const CATEGORY_LABELS: Record<BackdropCategory, string> = {
  outdoor: 'Outdoors',
  space: 'Space',
  water: 'Water',
  indoor: 'Indoors',
  fantasy: 'Fantasy',
  abstract: 'Patterns',
};

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
  const [tab, setTab] = useState<BackdropCategory>('outdoor');
  const items = backdropsByCategory(tab);

  return (
    <SelectorModal
      isOpen={isOpen}
      onClose={onClose}
      title="Choose a backdrop"
      eyebrow="Scene"
      icon={<ImageIcon className="h-5 w-5" />}
      accent={PALETTE.sensing}
      tabs={BACKDROP_CATEGORIES.map((c) => ({ id: c, label: CATEGORY_LABELS[c] }))}
      activeTab={tab}
      onTabChange={(id) => setTab(id as BackdropCategory)}
    >
      <SelectorSection
        title={CATEGORY_LABELS[tab]}
        description="The backdrop fills the sky behind your scene."
        accent={PALETTE.sensing}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {/* Clearing returns the scene to its flat background colour. */}
          <SelectorTile
            title="No backdrop"
            description="Use the plain background colour"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
          >
            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs font-semibold text-slate-400">
              None
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
              badge={currentUrl === b.url ? 'Current' : undefined}
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
