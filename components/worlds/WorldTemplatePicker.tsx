'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { ensureGuestSession } from '@/lib/auth/guestSessionClient';
import { useTranslator } from '@/components/common/LocaleProvider';
import WorldTemplateCard, { type WorldTemplateCardData } from './WorldTemplateCard';

interface TemplateResponse {
  templates?: WorldTemplateCardData[];
  error?: string;
}

export default function WorldTemplatePicker() {
  const t = useTranslator();
  const router = useRouter();
  const [templates, setTemplates] = useState<WorldTemplateCardData[]>([]);
  const [selected, setSelected] = useState<WorldTemplateCardData | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const catalogError = t('worlds.error.catalog');

  useEffect(() => {
    let active = true;
    const loadTemplates = async () => {
      try {
        await ensureGuestSession();
        const response = await fetch('/api/world-templates');
        const data = await response.json() as TemplateResponse;
        if (!response.ok || !Array.isArray(data.templates)) throw new Error(data.error || catalogError);
        if (active) setTemplates(data.templates);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : catalogError);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadTemplates();
    return () => { active = false; };
  }, [catalogError]);

  const createWorld = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !title.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/worlds/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selected.id,
          templateVersion: selected.version,
          title: title.trim(),
          description: description.trim(),
        }),
      });
      const data = await response.json() as { projectId?: string; error?: string };
      if (!response.ok || !data.projectId) throw new Error(data.error || t('worlds.error.create'));
      router.push(`/editor/${data.projectId}?worldBuilder=1`);
    } catch (err) {
      // Do not reset the choice or fields: correcting an error should never
      // make a child start the selection process over.
      setError(err instanceof Error ? err.message : t('worlds.error.create'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-8">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">{t('worlds.eyebrow')}</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{t('worlds.title')}</h1>
        <p className="mt-3 text-slate-600">{t('worlds.subtitle')}</p>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-slate-600" role="status">{t('worlds.loading')}</p>
      ) : (
        <form className="mt-8 space-y-7" onSubmit={createWorld}>
          <fieldset>
            <legend className="text-base font-bold text-slate-900">{t('worlds.chooseTemplate')}</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <WorldTemplateCard
                  key={`${template.id}-${template.version}`}
                  template={template}
                  selected={selected?.id === template.id && selected.version === template.version}
                  onSelect={setSelected}
                  selectLabel={t('worlds.card.choose')}
                  missionLabel={t('worlds.card.missions')}
                />
              ))}
            </div>
          </fieldset>

          {selected && (
            <div className="grid gap-5 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-800">
                {t('worlds.field.title')}
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={50}
                  required
                  autoFocus
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-slate-900"
                  placeholder={t('worlds.field.titlePlaceholder')}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-800">
                {t('worlds.field.description')}
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  rows={3}
                  className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 focus:border-transparent focus:ring-2 focus:ring-slate-900"
                  placeholder={t('worlds.field.descriptionPlaceholder')}
                />
              </label>
            </div>
          )}

          <p className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">
            {t('worlds.privateDraft')}
          </p>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={!selected || !title.trim() || submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Sparkles className="h-4 w-4" />
            {submitting ? t('worlds.createLoading') : t('worlds.create')}
          </button>
        </form>
      )}
    </section>
  );
}
