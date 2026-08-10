'use client';

import { Box, Circle, Star, User, Music } from 'lucide-react';

interface ToolbarProps {
  onAddObject: (type: string) => void;
  onOpenAI?: () => void;
}

const gameObjects = [
  { type: 'character', name: 'Character', icon: User, color: 'bg-blue-100' },
  { type: 'platform', name: 'Platform', icon: Box, color: 'bg-green-100' },
  { type: 'collectible', name: 'Collectible', icon: Star, color: 'bg-yellow-100' },
  { type: 'obstacle', name: 'Obstacle', icon: Circle, color: 'bg-red-100' },
  { type: 'sound', name: 'Sound', icon: Music, color: 'bg-pink-100' },
];

export default function Toolbar({ onAddObject, onOpenAI }: ToolbarProps) {
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Add Objects</h2>
      <div className="space-y-2">
        {gameObjects.map((obj) => {
          const Icon = obj.icon;
          return (
            <button
              key={obj.type}
              onClick={() => onAddObject(obj.type)}
              className={`w-full ${obj.color} hover:shadow-lg p-4 rounded-lg flex items-center gap-3 transition-all hover:scale-105`}
            >
              <Icon className="w-6 h-6 text-gray-700" />
              <span className="font-medium text-gray-800">{obj.name}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-bold text-gray-800 mb-3">Quick Actions</h3>
        <button
          onClick={() => onOpenAI && onOpenAI()}
          className="w-full bg-gradient-to-r from-purple-400 to-pink-400 text-white p-3 rounded-lg font-bold hover:scale-105 transition-transform"
        >
          Generate with AI
        </button>
      </div>
    </div>
  );
}

