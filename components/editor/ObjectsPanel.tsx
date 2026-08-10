'use client';

import { Box, Circle, Star, User, Image } from 'lucide-react';

interface ObjectsPanelProps {
  scene: any;
  selectedObject?: any;
  onSelect: (obj: any) => void;
}

const typeToIcon: Record<string, any> = {
  character: User,
  obstacle: Box,
  platform: Box,
  collectible: Star,
  sprite: Image,
  sound: Circle,
};

export default function ObjectsPanel({ scene, selectedObject, onSelect }: ObjectsPanelProps) {
  const objects = scene?.game_objects || [];
  return (
    <div className="p-4 border-t border-gray-200">
      <h3 className="text-lg font-bold text-gray-800 mb-3">Scene Objects</h3>
      {objects.length === 0 ? (
        <div className="text-gray-500 text-sm">No objects yet</div>
      ) : (
        <ul className="space-y-2">
          {objects.map((obj: any) => {
            const Icon = typeToIcon[obj.type] || Box;
            const isSelected = selectedObject?.id === obj.id;
            return (
              <li key={obj.id}>
                <button
                  onClick={() => onSelect(obj)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border ${
                    isSelected ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4 text-gray-600" />
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-gray-800 truncate">{obj.name || 'Object'}</div>
                    <div className="text-xs text-gray-500">{obj.type}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


