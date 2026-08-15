'use client';

import { useEffect } from 'react';
import { X, Search } from 'lucide-react';
import { PALETTE } from '../common/design';

/**
 * Shared modal shell used by every "add object" selector (Character,
 * Collectible, Obstacle, Sound). Centralises the chrome — backdrop, close
 * button, header, tabs — so each concrete selector only has to describe its
 * own tile grid and any tab-specific content.
 */
export function SelectorModal({
  isOpen,
  onClose,
  title,
  eyebrow,
  icon,
  accent,
  tabs,
  activeTab,
  onTabChange,
  search,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  /** Small icon shown in the header accent chip. */
  icon: React.ReactNode;
  /** Header accent color (hex). Defaults to slate. */
  accent?: string;
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /**
   * Optional search box. Filtering is the caller's job — this only owns the
   * field, so every picker gets the same one.
   *
   * The character picker shipped with no way to search at all. That was
   * survivable at 39 starters because a child could scan them; it stops being
   * survivable somewhere around a hundred, which is exactly the direction the
   * library is growing.
   */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    /** Shown beside the field so an empty grid is explained, not mysterious. */
    resultCount?: number;
  };
  children: React.ReactNode;
}) {
  // Escape key closes the modal — table-stakes accessibility.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const chipColor = accent ?? PALETTE.motion;

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white shrink-0"
              style={{ background: chipColor }}
            >
              {icon}
            </span>
            <div className="min-w-0">
              {eyebrow && (
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-none mb-0.5">
                  {eyebrow}
                </div>
              )}
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 truncate">
                {title}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        {tabs && tabs.length > 0 && (
          <div className="px-6 pt-3 border-b border-slate-100">
            <div className="flex gap-1 overflow-x-auto -mb-px">
              {tabs.map((t) => {
                const isActive = t.id === activeTab;
                return (
                  <button
                    key={t.id}
                    onClick={() => onTabChange?.(t.id)}
                    className={`text-sm font-semibold px-4 py-2.5 rounded-t-lg border-b-2 transition whitespace-nowrap ${
                      isActive
                        ? 'text-slate-900 border-slate-900'
                        : 'text-slate-500 border-transparent hover:text-slate-800'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search */}
        {search && (
          <div className="px-6 pt-4">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                type="search"
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder={search.placeholder ?? 'Search'}
                aria-label={search.placeholder ?? 'Search'}
                className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-slate-400"
              />
            </div>
            {search.value.trim() !== '' && (
              <p className="mt-2 px-1 text-xs text-slate-500">
                {search.resultCount === 0
                  ? `Nothing matches “${search.value.trim()}”. Try a different word.`
                  : `${search.resultCount} match${search.resultCount === 1 ? '' : 'es'}`}
              </p>
            )}
          </div>
        )}

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * A single asset tile — used inside SelectorModal to show a picker option.
 * Always renders the same shape/spacing so grids look uniform across pickers.
 */
export function SelectorTile({
  title,
  description,
  onClick,
  onMouseEnter,
  children,
  badge,
}: {
  title: string;
  description?: string;
  onClick: () => void;
  /** Optional hover handler — used by the sound picker to audition a sound. */
  onMouseEnter?: () => void;
  /** The preview shown in the top square of the tile (usually a ShapePreview). */
  children: React.ReactNode;
  /** Optional label overlaid on the preview (e.g., "NEW"). */
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="group text-left rounded-2xl border border-slate-200 bg-white p-3 hover:border-slate-300 hover:shadow-md transition"
    >
      <div className="relative aspect-square rounded-xl bg-slate-50 mb-3 overflow-hidden">
        <div className="absolute inset-0">{children}</div>
        {badge && (
          <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider bg-white/90 text-slate-700 rounded-full px-2 py-0.5 shadow-sm">
            {badge}
          </span>
        )}
      </div>
      <div className="font-bold text-slate-900 text-sm truncate">{title}</div>
      {description && (
        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 min-h-[2.2em]">
          {description}
        </div>
      )}
    </button>
  );
}

/**
 * A section within a modal body — title + description + slot for a grid or
 * custom children. Keeps section spacing consistent across selectors.
 */
export function SelectorSection({
  title,
  description,
  children,
  accent,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <section className="mb-8 last:mb-2">
      <div className="flex items-center gap-2 mb-3">
        {accent && (
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: accent }}
          />
        )}
        <h3 className="font-bold text-slate-900">{title}</h3>
      </div>
      {description && <p className="text-sm text-slate-600 mb-4 max-w-2xl">{description}</p>}
      {children}
    </section>
  );
}
