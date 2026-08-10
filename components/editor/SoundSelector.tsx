'use client';

import { useState } from 'react';
import { X, Music2 } from 'lucide-react';

interface SoundSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sound: any) => void;
}

export default function SoundSelector({
  isOpen,
  onClose,
  onSelect,
}: SoundSelectorProps) {
  const [activeTab, setActiveTab] = useState<'ui' | 'gameplay' | 'beats'>('ui');

  if (!isOpen) return null;

  const uiSounds = [
    { id: 'click', name: 'Click', color: '#3B82F6', shape: 'box', size: 40, description: 'UI click sound' },
    { id: 'confirm', name: 'Confirm', color: '#10B981', shape: 'box', size: 40, description: 'Confirm chime' },
    { id: 'error', name: 'Error', color: '#EF4444', shape: 'box', size: 40, description: 'Error buzz' },
  ];

  const gameplaySounds = [
    { id: 'pickup', name: 'Pickup', color: '#F59E0B', shape: 'box', size: 40, description: 'Collectible pickup' },
    { id: 'jump', name: 'Jump', color: '#8B5CF6', shape: 'box', size: 40, description: 'Player jump' },
    { id: 'hit', name: 'Hit', color: '#6B7280', shape: 'box', size: 40, description: 'Obstacle hit' },
  ];

  const beatLoops = [
    { id: 'simple', name: 'Simple 4/4', color: '#10B981', shape: 'box', size: 40, description: 'Kick/snare/hat loop', bpm: 120 },
    { id: 'chill', name: 'Chill 90', color: '#06B6D4', shape: 'box', size: 40, description: 'Slower mellow loop', bpm: 90 },
    { id: 'fast', name: 'Fast 140', color: '#F43F5E', shape: 'box', size: 40, description: 'Energetic loop', bpm: 140 },
  ];

  const current = activeTab === 'ui' ? uiSounds : activeTab === 'gameplay' ? gameplaySounds : beatLoops;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-emerald-500 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Music2 className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Choose a Sound</h2>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(80vh-160px)]">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab('ui')}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'ui' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              UI
            </button>
            <button
              onClick={() => setActiveTab('gameplay')}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'gameplay' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Gameplay
            </button>
            <button
              onClick={() => setActiveTab('beats')}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'beats' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Beats
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {current.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  const selection: any = {
                    id: item.id,
                    name: item.name,
                    color: item.color,
                    shape: item.shape,
                    size: item.size,
                    description: item.description,
                    properties: {},
                  };
                  if (activeTab === 'ui' || activeTab === 'gameplay') {
                    selection.properties.soundType = item.id;
                  } else if (activeTab === 'beats') {
                    selection.properties.beat = item.id;
                    selection.properties.bpm = (item as any).bpm || 120;
                    selection.properties.autoplay_beat = true;
                  }
                  onSelect(selection);
                  onClose();
                }}
                className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-indigo-500 hover:shadow-lg transition-all group"
              >
                <div
                  className="w-full aspect-square rounded-lg mb-3 flex items-center justify-center"
                  style={{ backgroundColor: item.color }}
                >
                  <Music2 className="w-12 h-12 text-white opacity-60" />
                </div>
                <h4 className="font-bold text-gray-800 group-hover:text-indigo-600">
                  {item.name}
                </h4>
                <p className="text-xs text-gray-500 mt-1">{item.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


