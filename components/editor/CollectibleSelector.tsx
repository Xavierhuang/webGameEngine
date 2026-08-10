'use client';

import { useState } from 'react';
import { X, Gift } from 'lucide-react';
import ShapePreview from './ShapePreview';

interface CollectibleSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (collectible: any) => void;
}

export default function CollectibleSelector({
  isOpen,
  onClose,
  onSelect,
}: CollectibleSelectorProps) {
  const [activeTab, setActiveTab] = useState<'basics' | 'fancy'>('basics');

  if (!isOpen) return null;

  const basicCollectibles = [
    { id: 'coin', name: 'Coin', color: '#FBBF24', shape: 'cylinder', size: 40, description: 'Gold coin (thin cylinder)', extra: { scaleY: 0.3 } },
    { id: 'orb', name: 'Orb', color: '#60A5FA', shape: 'sphere', size: 35, description: 'Shiny orb' },
    { id: 'gem', name: 'Gem', color: '#A78BFA', shape: 'box', size: 30, description: 'Simple gem block' },
    { id: 'ring', name: 'Ring', color: '#F59E0B', shape: 'torus', size: 35, description: 'Treasure ring' },
  ];

  const fancyCollectibles = [
    { id: 'star', name: 'Star', color: '#FCD34D', shape: 'cone', size: 30, description: 'Stylized star (cone proxy)' },
    { id: 'ruby', name: 'Ruby', color: '#EF4444', shape: 'pyramid', size: 32, description: 'Red pyramid gem' },
    { id: 'capsule', name: 'Capsule', color: '#10B981', shape: 'capsule', size: 35, description: 'Health capsule' },
  ];

  const current = activeTab === 'basics' ? basicCollectibles : fancyCollectibles;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-rose-500 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Gift className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Choose a Collectible</h2>
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
              onClick={() => setActiveTab('basics')}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'basics' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Basics
            </button>
            <button
              onClick={() => setActiveTab('fancy')}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'fancy' ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Fancy
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {current.map((item) => (
              <button
                key={item.id}
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
                className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-amber-500 hover:shadow-lg transition-all group"
              >
                <div
                  className="w-full aspect-square rounded-lg mb-3 flex items-center justify-center overflow-hidden"
                  style={{ backgroundColor: item.color }}
                >
                  <div className="w-full h-full">
                    <ShapePreview shape={item.shape} color={item.color} />
                  </div>
                </div>
                <h4 className="font-bold text-gray-800 group-hover:text-amber-600">
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


