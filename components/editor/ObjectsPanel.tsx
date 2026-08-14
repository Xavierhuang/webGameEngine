'use client';

import { Box, Circle, Star, User, Image, Copy, ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslator } from '../common/LocaleProvider';

interface ObjectsPanelProps {
  scene: any;
  selectedObject?: any;
  onSelect: (obj: any) => void;
  onDuplicate?: (obj: any) => void;
  /** Move a sprite up or down in the list. */
  onReorder?: (obj: any, direction: -1 | 1) => void;
}

const typeToIcon: Record<string, any> = {
  character: User,
  obstacle: Box,
  platform: Box,
  collectible: Star,
  sprite: Image,
  sound: Circle,
};

export default function ObjectsPanel({ scene, selectedObject, onSelect, onDuplicate, onReorder }: ObjectsPanelProps) {
  const t = useTranslator();
  const objects = scene?.game_objects || [];
  return (
    <div className="p-4 border-t border-gray-200">
      <h3 className="text-lg font-bold text-gray-800 mb-3">{t('editor.sceneObjects')}</h3>
      {objects.length === 0 ? (
        <div className="text-gray-500 text-sm">{t('editor.noObjects')}</div>
      ) : (
        <ul className="space-y-2">
          {objects.map((obj: any, index: number) => {
            const Icon = typeToIcon[obj.type] || Box;
            const isSelected = selectedObject?.id === obj.id;
            return (
              <li key={obj.id}>
                <div
                  className={`group flex items-center gap-1 rounded-lg border ${
                    isSelected ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <button
                    onClick={() => onSelect(obj)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-gray-600" />
                    <div className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-medium text-gray-800">{obj.name || 'Object'}</div>
                      <div className="text-xs text-gray-500">{obj.type}</div>
                    </div>
                  </button>
                  {onReorder && (
                    <span className="flex shrink-0 flex-col opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => onReorder(obj, -1)}
                        disabled={index === 0}
                        className="rounded p-0.5 text-gray-400 hover:bg-white hover:text-gray-700 disabled:opacity-30"
                        title="Move up"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onReorder(obj, 1)}
                        disabled={index === objects.length - 1}
                        className="rounded p-0.5 text-gray-400 hover:bg-white hover:text-gray-700 disabled:opacity-30"
                        title="Move down"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                  {onDuplicate && (
                    <button
                      onClick={() => onDuplicate(obj)}
                      className="mr-2 shrink-0 rounded p-1 text-gray-400 opacity-0 transition hover:bg-white hover:text-gray-700 group-hover:opacity-100"
                      title={`Duplicate ${obj.name || 'object'}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


