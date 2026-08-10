'use client';

import { useState } from 'react';
import { Gift } from 'lucide-react';
import ShapePreview from './ShapePreview';
import { SelectorModal, SelectorTile, SelectorSection } from './SelectorModal';
import { PALETTE } from '../common/design';

interface CollectibleSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (collectible: any) => void;
}

const BASIC_COLLECTIBLES = [
  { id: 'coin', name: 'Coin', color: '#FBBF24', shape: 'cylinder', size: 40, description: 'Classic gold coin' },
  { id: 'orb', name: 'Orb', color: '#60A5FA', shape: 'sphere', size: 35, description: 'Glowing orb' },
  { id: 'gem', name: 'Gem', color: '#A78BFA', shape: 'box', size: 30, description: 'Precious gem' },
  { id: 'ring', name: 'Ring', color: '#F59E0B', shape: 'torus', size: 35, description: 'Treasure ring' },
];

const FANCY_COLLECTIBLES = [
  { id: 'star', name: 'Star', color: '#FCD34D', shape: 'cone', size: 30, description: 'Bonus star' },
  { id: 'ruby', name: 'Ruby', color: '#EF4444', shape: 'pyramid', size: 32, description: 'Rare ruby' },
  { id: 'capsule', name: 'Potion', color: '#10B981', shape: 'capsule', size: 35, description: 'Healing potion' },
];

export default function CollectibleSelector({
  isOpen,
  onClose,
  onSelect,
}: CollectibleSelectorProps) {
  const [tab, setTab] = useState<'basics' | 'fancy'>('basics');
  const current = tab === 'basics' ? BASIC_COLLECTIBLES : FANCY_COLLECTIBLES;

  return (
    <SelectorModal
      isOpen={isOpen}
      onClose={onClose}
      title="Choose a collectible"
      eyebrow="Add object"
      icon={<Gift className="w-5 h-5" />}
      accent={PALETTE.events}
      tabs={[
        { id: 'basics', label: 'Basics' },
        { id: 'fancy', label: 'Fancy' },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as typeof tab)}
    >
      <SelectorSection
        title={tab === 'basics' ? 'Basic pickups' : 'Fancier pickups'}
        description="Pop one into your scene, then use a `when touching` block to reward the player."
        accent={PALETTE.events}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {current.map((item) => (
            <SelectorTile
              key={item.id}
              title={item.name}
              description={item.description}
              onClick={() => {
                onSelect({
                  id: item.id,
                  name: item.name,
                  color: item.color,
                  shape: item.shape,
                  size: item.size,
                  description: item.description,
                });
                onClose();
              }}
            >
              <ShapePreview shape={item.shape} color={item.color} />
            </SelectorTile>
          ))}
        </div>
      </SelectorSection>
    </SelectorModal>
  );
}
