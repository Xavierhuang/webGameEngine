'use client';

export interface WorldTemplateCardData {
  id: string;
  version: number;
  title: string;
  description: string;
  genre: string;
  cardArt: string;
  missions: Array<{ id: string }>;
}

const ART: Record<string, { emoji: string; gradient: string }> = {
  platformer: { emoji: '☁️', gradient: 'from-sky-300 via-blue-200 to-indigo-200' },
  obby: { emoji: '🌈', gradient: 'from-pink-300 via-amber-200 to-cyan-200' },
  racing: { emoji: '🏎️', gradient: 'from-orange-300 via-rose-200 to-violet-200' },
  story: { emoji: '🏰', gradient: 'from-violet-300 via-purple-200 to-amber-100' },
  pet: { emoji: '🐶', gradient: 'from-lime-300 via-emerald-200 to-sky-100' },
};

export default function WorldTemplateCard({
  template,
  selected,
  onSelect,
  selectLabel = 'Choose',
  missionLabel = '{count} missions',
}: {
  template: WorldTemplateCardData;
  selected: boolean;
  onSelect: (template: WorldTemplateCardData) => void;
  selectLabel?: string;
  missionLabel?: string;
}) {
  const art = ART[template.id] ?? { emoji: '🎮', gradient: 'from-slate-300 via-slate-200 to-slate-100' };
  const descriptionId = `${template.id}-description`;
  const missionCount = missionLabel.replace('{count}', String(template.missions.length));

  return (
    <article className={`relative min-h-56 overflow-hidden rounded-2xl border-2 text-left transition ${
        selected
          ? 'border-slate-900 bg-slate-50 shadow-lg shadow-slate-900/10'
          : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md'
      }`}>
      <div aria-hidden className={`flex h-24 items-center justify-center bg-gradient-to-br text-5xl ${art.gradient}`}>
        {art.emoji}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-black text-slate-900">{template.title}</h2>
          {selected && <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">✓</span>}
        </div>
        <p className="mt-1 text-sm leading-5 text-slate-600">{template.description}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
          <span className="rounded-full bg-slate-100 px-2.5 py-1">{template.genre}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1">
            {missionCount}
          </span>
        </div>
      </div>
      <p id={descriptionId} className="sr-only">
        {template.title}. {template.description}. {template.genre}. {missionCount}.
      </p>
      <button
        type="button"
        aria-label={`${selectLabel} ${template.title}`}
        aria-describedby={descriptionId}
        aria-pressed={selected}
        onClick={() => onSelect(template)}
        className="absolute inset-0 rounded-2xl focus:outline-none focus:ring-4 focus:ring-slate-300"
      >
        <span className="sr-only">{selectLabel} {template.title}</span>
      </button>
    </article>
  );
}
