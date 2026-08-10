'use client';

import { useState } from 'react';
import { Music2, Volume2, Sparkles } from 'lucide-react';
import { SelectorModal, SelectorTile, SelectorSection } from './SelectorModal';
import { PALETTE } from '../common/design';

interface SoundSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sound: any) => void;
}

// Waveform sizes hint at each sound's character: short bars = clicks, wide
// bars = beats. Purely visual — the runtime plays them via AudioManager.
type Sound = {
  id: string;
  name: string;
  color: string;
  description: string;
  bpm?: number;
};

const UI_SOUNDS: Sound[] = [
  { id: 'click', name: 'Click', color: PALETTE.motion, description: 'Sharp UI click' },
  { id: 'confirm', name: 'Confirm', color: PALETTE.control, description: 'Positive chime' },
  { id: 'error', name: 'Error', color: PALETTE.lists, description: 'Error buzz' },
];

const GAMEPLAY_SOUNDS: Sound[] = [
  { id: 'pickup', name: 'Pickup', color: PALETTE.events, description: 'Collectible reward' },
  { id: 'jump', name: 'Jump', color: PALETTE.looks, description: 'Player jump' },
  { id: 'hit', name: 'Hit', color: PALETTE.variables, description: 'Damage / impact' },
];

const BEAT_LOOPS: (Sound & { bpm: number })[] = [
  { id: 'simple', name: 'Simple 4/4', color: PALETTE.control, description: 'Kick / snare / hat loop', bpm: 120 },
  { id: 'chill', name: 'Chill 90', color: PALETTE.sensing, description: 'Slower mellow loop', bpm: 90 },
  { id: 'fast', name: 'Fast 140', color: PALETTE.sound, description: 'Energetic loop', bpm: 140 },
];

export default function SoundSelector({
  isOpen,
  onClose,
  onSelect,
}: SoundSelectorProps) {
  const [tab, setTab] = useState<'ui' | 'gameplay' | 'beats'>('ui');

  const handleSelect = (item: Sound) => {
    const selection: any = {
      id: item.id,
      name: item.name,
      color: item.color,
      shape: 'box',
      size: 40,
      description: item.description,
      properties: {},
    };
    if (tab === 'beats') {
      selection.properties.beat = item.id;
      selection.properties.bpm = item.bpm ?? 120;
      selection.properties.autoplay_beat = true;
    } else {
      selection.properties.soundType = item.id;
    }
    onSelect(selection);
    onClose();
  };

  const current =
    tab === 'ui' ? UI_SOUNDS : tab === 'gameplay' ? GAMEPLAY_SOUNDS : BEAT_LOOPS;

  return (
    <SelectorModal
      isOpen={isOpen}
      onClose={onClose}
      title="Choose a sound"
      eyebrow="Add object"
      icon={<Music2 className="w-5 h-5" />}
      accent={PALETTE.sound}
      tabs={[
        { id: 'ui', label: 'UI' },
        { id: 'gameplay', label: 'Gameplay' },
        { id: 'beats', label: 'Beats' },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as typeof tab)}
    >
      <SelectorSection
        title={
          tab === 'ui'
            ? 'Interface sounds'
            : tab === 'gameplay'
            ? 'Gameplay effects'
            : 'Background beats'
        }
        description={
          tab === 'beats'
            ? 'Autoplaying loops that keep going in the background. Adjust BPM after adding.'
            : 'One-shot sound effects triggered by `play sound` blocks.'
        }
        accent={PALETTE.sound}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {current.map((item) => (
            <SelectorTile
              key={item.id}
              title={item.name}
              description={item.description}
              onClick={() => handleSelect(item)}
              badge={'bpm' in item ? `${(item as any).bpm} BPM` : undefined}
            >
              <SoundPreview color={item.color} isBeat={tab === 'beats'} />
            </SelectorTile>
          ))}
        </div>
      </SelectorSection>
    </SelectorModal>
  );
}

function SoundPreview({ color, isBeat }: { color: string; isBeat: boolean }) {
  // Stylized waveform — 8 bars whose heights hint at the sound character.
  // Beats get a "pulse" pattern; one-shots get a decaying tail.
  const heights = isBeat
    ? [40, 80, 40, 100, 40, 90, 40, 100]
    : [30, 100, 90, 60, 40, 30, 20, 15];
  return (
    <div className="w-full h-full flex items-end justify-center gap-1 p-6 relative">
      <div
        className="absolute inset-0 opacity-20"
        style={{ background: `radial-gradient(circle at center, ${color}, transparent 70%)` }}
      />
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full"
          style={{
            height: `${h}%`,
            background: color,
            opacity: 0.85,
          }}
        />
      ))}
      <div
        className="absolute top-3 right-3 inline-flex items-center justify-center w-7 h-7 rounded-full text-white shadow-sm"
        style={{ background: color }}
      >
        {isBeat ? <Sparkles className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
      </div>
    </div>
  );
}
