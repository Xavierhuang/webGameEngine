'use client';

import { Box, Circle, Star, User, Music, Sparkles, Plus } from 'lucide-react';
import { useTranslator } from '../common/LocaleProvider';
import { PALETTE } from '../common/design';

interface ToolbarProps {
  onAddObject: (type: string) => void;
  onOpenAI?: () => void;
}

type ToolbarItem = {
  type: string;
  name: string;
  icon: typeof Box;
  description: string;
  accent: string;
};

// Accent colors mirror the block palette used elsewhere in the app so a kid
// forming a mental map of "characters are blue, obstacles are red" carries
// that intuition into the block editor.
const GAME_OBJECTS: ToolbarItem[] = [
  { type: 'character', name: 'Character', icon: User, description: 'A hero, enemy, or NPC', accent: PALETTE.motion },
  { type: 'platform', name: 'Platform', icon: Box, description: 'Ground, walls, and terrain', accent: PALETTE.control },
  { type: 'collectible', name: 'Collectible', icon: Star, description: 'Coins, stars, keys', accent: PALETTE.events },
  { type: 'obstacle', name: 'Obstacle', icon: Circle, description: 'Hazards to avoid', accent: PALETTE.lists },
  { type: 'particles', name: 'Effect', icon: Sparkles, description: 'Sparkles, fire, smoke', accent: PALETTE.looks },
  { type: 'sound', name: 'Sound', icon: Music, description: 'Music and sound effects', accent: PALETTE.sound },
];

/**
 * Toolbar labels are translated at render time — GAME_OBJECTS is module-level
 * data, so it can't call a hook itself.
 */
const TOOLBAR_LABELS: Record<string, any> = {
  character: 'toolbar.character',
  platform: 'toolbar.platform',
  collectible: 'toolbar.collectible',
  obstacle: 'toolbar.obstacle',
  particles: 'toolbar.particles',
  sound: 'toolbar.sound',
};

export default function Toolbar({ onAddObject, onOpenAI }: ToolbarProps) {
  const t = useTranslator();
  return (
    <div className="p-4">
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
        Add to scene
      </div>
      <div className="space-y-1.5">
        {GAME_OBJECTS.map((obj) => {
          const Icon = obj.icon;
          return (
            <button
              key={obj.type}
              onClick={() => onAddObject(obj.type)}
              className="w-full group flex items-center gap-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm p-2.5 transition text-left"
            >
              <span
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-white shrink-0"
                style={{ background: obj.accent }}
              >
                <Icon className="w-4 h-4" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-slate-900 text-sm truncate">
                  {TOOLBAR_LABELS[obj.type] ? t(TOOLBAR_LABELS[obj.type]) : obj.name}
                </span>
                <span className="block text-[11px] text-slate-500 truncate">
                  {obj.description}
                </span>
              </span>
              <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition" />
            </button>
          );
        })}
      </div>

      {onOpenAI && (
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Or describe it
          </div>
          <button
            onClick={onOpenAI}
            className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold text-white rounded-xl py-3 shadow-sm transition hover:opacity-95"
            style={{
              background: `linear-gradient(135deg, ${PALETTE.ai}, ${PALETTE.motion})`,
            }}
          >
            <Sparkles className="w-4 h-4" />
            Ask AI to build it
          </button>
          <p className="mt-2 text-[11px] text-slate-500 leading-snug">
            Describe the world you want and lingplay will scaffold objects, blocks, and behaviors.
          </p>
        </div>
      )}
    </div>
  );
}
