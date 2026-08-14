'use client';

import { useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { useTranslator } from '../common/LocaleProvider';

interface SceneTabsProps {
  scenes: any[];
  currentSceneId: string | null;
  onSelect: (scene: any) => void;
  onAdd: () => void;
  onRename: (sceneId: string, name: string) => void;
  onDelete: (sceneId: string) => void;
  /** Open the backdrop picker for the active scene. */
  onChooseBackdrop?: () => void;
  currentBackdropUrl?: string | null;
}

/**
 * Scene switcher for the editor.
 *
 * Scenes are LingPlay's backdrop/level analog. The table, the runtime and the
 * three scene blocks all existed, but with no UI and no API every project was
 * stuck on a single "Main Scene".
 */
export default function SceneTabs({
  scenes,
  currentSceneId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onChooseBackdrop,
  currentBackdropUrl,
}: SceneTabsProps) {
  const t = useTranslator();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const commitRename = () => {
    if (editingId && draft.trim()) onRename(editingId, draft.trim());
    setEditingId(null);
  };

  return (
    <div className="border-b border-slate-200 bg-white px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {t('editor.scenes')}
        </span>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
          title="Add a scene"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('editor.addScene')}
        </button>
      </div>

      <ul className="space-y-0.5">
        {scenes.map((scene) => {
          const active = scene.id === currentSceneId;
          return (
            <li key={scene.id}>
              {editingId === scene.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none"
                />
              ) : (
                <div
                  className={`group flex items-center gap-1 rounded-lg px-2 py-1 text-sm transition ${
                    active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <button
                    onClick={() => onSelect(scene)}
                    className="min-w-0 flex-1 truncate text-left"
                    title={scene.name}
                  >
                    {scene.name}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(scene.id);
                      setDraft(scene.name ?? '');
                    }}
                    className={`shrink-0 opacity-0 transition group-hover:opacity-100 ${
                      active ? 'text-slate-300 hover:text-white' : 'text-slate-400 hover:text-slate-700'
                    }`}
                    title="Rename scene"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  {scenes.length > 1 && (
                    <button
                      onClick={() => onDelete(scene.id)}
                      className={`shrink-0 opacity-0 transition group-hover:opacity-100 ${
                        active ? 'text-slate-300 hover:text-white' : 'text-slate-400 hover:text-red-600'
                      }`}
                      title="Delete scene"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {onChooseBackdrop && (
        <button
          onClick={onChooseBackdrop}
          className="mt-2 flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left text-xs font-semibold text-slate-600 transition hover:border-slate-300"
          title="Choose a backdrop for this scene"
        >
          <span
            className="h-6 w-9 shrink-0 rounded border border-slate-200 bg-slate-100 bg-cover bg-center"
            style={currentBackdropUrl ? { backgroundImage: `url(${currentBackdropUrl})` } : undefined}
          />
          {currentBackdropUrl ? 'Change backdrop' : 'Add a backdrop'}
        </button>
      )}
    </div>
  );
}
