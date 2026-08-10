'use client';

import { useState } from 'react';
import { X, ShieldAlert } from 'lucide-react';
import ShapePreview from './ShapePreview';

interface ObstacleSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (obstacle: any) => void;
}

export default function ObstacleSelector({
  isOpen,
  onClose,
  onSelect,
}: ObstacleSelectorProps) {
  const [activeTab, setActiveTab] = useState<'basics' | 'spikes'>('basics');

  if (!isOpen) return null;

  const basicObstacles = [
    { id: 'block', name: 'Block', color: '#EF4444', shape: 'box', size: 60, description: 'Solid cube block' },
    { id: 'pillar', name: 'Pillar', color: '#6B7280', shape: 'cylinder', size: 70, description: 'Tall cylinder pillar' },
    { id: 'boulder', name: 'Boulder', color: '#9CA3AF', shape: 'sphere', size: 55, description: 'Round boulder' },
    { id: 'pyramid', name: 'Pyramid', color: '#D97706', shape: 'pyramid', size: 60, description: 'Sharp pyramid' },
  ];

  const spikeObstacles = [
    { id: 'cone-spike', name: 'Cone Spike', color: '#374151', shape: 'cone', size: 60, description: 'Pointy cone spike' },
    { id: 'ring-spike', name: 'Ring Trap', color: '#F59E0B', shape: 'torus', size: 50, description: 'Hazardous ring' },
    { id: 'capsule-bumper', name: 'Bumper', color: '#10B981', shape: 'capsule', size: 60, description: 'Rounded bumper' },
  ];

  const current = activeTab === 'basics' ? basicObstacles : spikeObstacles;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden">
        <div className="bg-gradient-to-r from-red-500 to-gray-600 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6" />
            <h2 className="text-2xl font-bold">Choose an Obstacle</h2>
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
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'basics' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Basics
            </button>
            <button
              onClick={() => setActiveTab('spikes')}
              className={`px-4 py-2 rounded-lg font-medium ${activeTab === 'spikes' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            >
              Spikes & Traps
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
                className="bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-red-500 hover:shadow-lg transition-all group"
              >
                <div
                  className="w-full aspect-square rounded-lg mb-3 flex items-center justify-center overflow-hidden"
                  style={{ backgroundColor: item.color }}
                >
                  <div className="w-full h-full">
                    <ShapePreview shape={item.shape} color={item.color} />
                  </div>
                </div>
                <h4 className="font-bold text-gray-800 group-hover:text-red-600">
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


