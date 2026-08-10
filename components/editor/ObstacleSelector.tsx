'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import ShapePreview from './ShapePreview';
import { SelectorModal, SelectorTile, SelectorSection } from './SelectorModal';
import { PALETTE } from '../common/design';

interface ObstacleSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (obstacle: any) => void;
}

const BASIC_OBSTACLES = [
  { id: 'block', name: 'Block', color: '#EF4444', shape: 'box', size: 60, description: 'Solid impassable cube' },
  { id: 'pillar', name: 'Pillar', color: '#6B7280', shape: 'cylinder', size: 70, description: 'Tall stone pillar' },
  { id: 'boulder', name: 'Boulder', color: '#9CA3AF', shape: 'sphere', size: 55, description: 'Rolling boulder' },
  { id: 'pyramid', name: 'Pyramid', color: '#D97706', shape: 'pyramid', size: 60, description: 'Sharp pyramid' },
];

const HAZARD_OBSTACLES = [
  { id: 'cone-spike', name: 'Spike', color: '#374151', shape: 'cone', size: 60, description: 'Pointy spike' },
  { id: 'ring-spike', name: 'Ring Trap', color: '#F59E0B', shape: 'torus', size: 50, description: 'Hazard ring' },
  { id: 'capsule-bumper', name: 'Bumper', color: '#10B981', shape: 'capsule', size: 60, description: 'Bouncy bumper' },
];

export default function ObstacleSelector({
  isOpen,
  onClose,
  onSelect,
}: ObstacleSelectorProps) {
  const [tab, setTab] = useState<'basics' | 'hazards'>('basics');
  const current = tab === 'basics' ? BASIC_OBSTACLES : HAZARD_OBSTACLES;

  return (
    <SelectorModal
      isOpen={isOpen}
      onClose={onClose}
      title="Choose an obstacle"
      eyebrow="Add object"
      icon={<ShieldAlert className="w-5 h-5" />}
      accent={PALETTE.lists}
      tabs={[
        { id: 'basics', label: 'Solid blocks' },
        { id: 'hazards', label: 'Hazards' },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as typeof tab)}
    >
      <SelectorSection
        title={tab === 'basics' ? 'Impassable blockers' : 'Damaging hazards'}
        description={
          tab === 'basics'
            ? "Objects the player can't move through. Great for walls, terrain, and puzzles."
            : 'Combine with a `when touching` block to subtract lives or reset the level.'
        }
        accent={PALETTE.lists}
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
