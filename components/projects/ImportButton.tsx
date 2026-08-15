'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { useTranslator } from '../common/LocaleProvider';

/** Import a `.lingplay` file exported from another account or instance. */
export function ImportButton() {
  const router = useRouter();
  const t = useTranslator();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        setError("That file isn't a valid lingplay project.");
        return;
      }

      const response = await fetch('/api/projects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.project?.id) {
        setError(data?.error || 'Could not import that project.');
        return;
      }
      router.push(`/editor/${data.project.id}`);
    } catch {
      setError('Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-col">
      <input
        ref={inputRef}
        type="file"
        accept=".lingplay,application/json"
        aria-label="Choose a .lingplay project file to import"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-300 disabled:opacity-60"
        title="Import a .lingplay project file"
      >
        <Upload className="h-3.5 w-3.5" />
        {busy ? t('projects.importing') : t('projects.import')}
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </div>
  );
}
