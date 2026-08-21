'use client';

import { useState } from 'react';
import { Music2, Volume2, Sparkles } from 'lucide-react';
import { SelectorModal, SelectorTile, SelectorSection } from './SelectorModal';
import { PALETTE } from '../common/design';
import { useTranslator } from '../common/LocaleProvider';
import { soundsByCategory, type SoundCategory } from '@/lib/audio/soundCatalog';
import AudioManager from '@/lib/audio/AudioManager';
import { SoundRecorder } from './SoundRecorder';

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

const CATEGORY_ORDER: SoundCategory[] = ['ui', 'game', 'animal', 'music', 'ambient'];

const CATEGORY_COLORS: Record<SoundCategory, string> = {
  ui: PALETTE.motion,
  game: PALETTE.events,
  animal: PALETTE.looks,
  music: PALETTE.sound,
  ambient: PALETTE.sensing,
};

export default function SoundSelector({
  isOpen,
  onClose,
  onSelect,
}: SoundSelectorProps) {
  const t = useTranslator();
  const [tab, setTab] = useState<SoundCategory | 'beats' | 'record'>('ui');

  const categoryLabel = (c: SoundCategory | 'beats' | 'record'): string => {
    switch (c) {
      case 'ui': return t('editor.soundPicker.tab.ui');
      case 'game': return t('editor.soundPicker.tab.game');
      case 'animal': return t('editor.soundPicker.tab.animal');
      case 'music': return t('editor.soundPicker.tab.music');
      case 'ambient': return t('editor.soundPicker.tab.ambient');
      case 'beats': return t('editor.soundPicker.tab.beats');
      case 'record': return t('editor.soundPicker.tab.record');
    }
  };

  const BEAT_LOOPS: (Sound & { bpm: number })[] = [
    { id: 'simple', name: t('editor.soundPicker.beat.simple.name'), color: PALETTE.control, description: t('editor.soundPicker.beat.simple.description'), bpm: 120 },
    { id: 'chill', name: t('editor.soundPicker.beat.chill.name'), color: PALETTE.sensing, description: t('editor.soundPicker.beat.chill.description'), bpm: 90 },
    { id: 'fast', name: t('editor.soundPicker.beat.fast.name'), color: PALETTE.sound, description: t('editor.soundPicker.beat.fast.description'), bpm: 140 },
  ];

  /** Audition the sound before adding it — the picker used to be silent. */
  const preview = (item: Sound) => {
    try {
      if (tab === 'beats') AudioManager.get().startBeat(item.id, item.bpm ?? 120);
      else AudioManager.get().playSfx(item.id, 1);
    } catch {
      /* audio unavailable — the tile still selects fine */
    }
  };

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
    try { AudioManager.get().stopBeat(); } catch { /* noop */ }
    onSelect(selection);
    onClose();
  };

  const describeSpec = (duration: number, layers: number): string => {
    const durKey = duration < 0.25 ? 'short' : duration < 0.6 ? 'medium' : 'long';
    const dur = t(`editor.soundPicker.duration.${durKey}` as any);
    const layerKey = layers === 1 ? 'one' : 'many';
    const layer = t(`editor.soundPicker.layer.${layerKey}` as any).replace('%d', String(layers));
    return `${dur} · ${layer}`;
  };

  const current: Sound[] =
    tab === 'beats'
      ? BEAT_LOOPS
      : tab === 'record'
      ? [] // the Record tab renders the recorder, not a tile grid
      : soundsByCategory(tab).map((spec) => ({
          id: spec.id,
          name: spec.name,
          color: CATEGORY_COLORS[spec.category],
          description: describeSpec(spec.duration, spec.layers.length),
        }));

  return (
    <SelectorModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('editor.soundPicker.title')}
      eyebrow={t('editor.soundPicker.eyebrow')}
      icon={<Music2 className="w-5 h-5" />}
      accent={PALETTE.sound}
      tabs={[
        ...CATEGORY_ORDER.map((c) => ({ id: c, label: categoryLabel(c) })),
        { id: 'beats' as const, label: categoryLabel('beats') },
        { id: 'record' as const, label: categoryLabel('record') },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as typeof tab)}
    >
      {tab === 'record' ? (
        <SelectorSection
          title={t('editor.soundPicker.record.title')}
          description={t('editor.soundPicker.record.description')}
          accent={PALETTE.sound}
        >
          <SoundRecorder
            onSaved={({ url, name }) => {
              // A recorded sound is referenced by URL; AudioManager plays URLs
              // through its sample path rather than the synth catalog.
              onSelect({
                id: url,
                name,
                color: PALETTE.sound,
                shape: 'box',
                size: 40,
                description: t('editor.soundPicker.record.recorded'),
                properties: { soundType: url, recorded: true },
              });
              onClose();
            }}
          />
        </SelectorSection>
      ) : (
      <SelectorSection
        title={
          tab === 'beats'
            ? t('editor.soundPicker.bgm.title')
            : t('editor.soundPicker.section.sounds').replace('%@', categoryLabel(tab))
        }
        description={
          tab === 'beats'
            ? t('editor.soundPicker.bgm.description')
            : t('editor.soundPicker.sfx.description')
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
              onMouseEnter={() => preview(item)}
              badge={'bpm' in item ? `${(item as any).bpm} BPM` : undefined}
            >
              <SoundPreview color={item.color} isBeat={tab === 'beats'} />
            </SelectorTile>
          ))}
        </div>
      </SelectorSection>
      )}
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
