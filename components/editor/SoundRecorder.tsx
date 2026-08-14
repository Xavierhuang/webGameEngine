'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Play, Trash2, Save, AlertCircle } from 'lucide-react';

/** Recordings are capped so a forgotten tab can't fill the disk. */
const MAX_SECONDS = 30;

interface SoundRecorderProps {
  /** Called with the stored URL and the name once saved. */
  onSaved: (sound: { url: string; name: string }) => void;
  projectId?: string;
}

/**
 * Record a sound from the microphone.
 *
 * The built-in library is synthesized, and shipping a thousand licensed samples
 * isn't an option — recording is how a child gets a *real* sound into a game.
 * Scratch has had this for years.
 *
 * The microphone is only opened when recording starts and every track is
 * stopped immediately afterwards, so the browser's in-use indicator reflects
 * reality. Nothing leaves the browser until the child presses Save.
 */
export function SoundRecorder({ onSaved, projectId }: SoundRecorderProps) {
  const [state, setState] = useState<'idle' | 'recording' | 'recorded' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [name, setName] = useState('My sound');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Release the microphone and any object URL. */
  const cleanup = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    return () => {
      cleanup();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const start = async () => {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        blobRef.current = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blobRef.current);
        // Release the mic as soon as recording ends, not when the modal closes.
        cleanup();
        setState('recorded');
      };

      recorder.start();
      setSeconds(0);
      setState('recording');
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) stop();
          return s + 1;
        });
      }, 1000);
    } catch (e: any) {
      cleanup();
      setError(
        e?.name === 'NotAllowedError'
          ? 'Microphone permission was blocked. Allow it in your browser to record.'
          : "Couldn't start recording."
      );
    }
  };

  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const preview = () => {
    if (!urlRef.current) return;
    new Audio(urlRef.current).play().catch(() => setError("Couldn't play that back."));
  };

  const discard = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    blobRef.current = null;
    setSeconds(0);
    setState('idle');
  };

  const save = async () => {
    if (!blobRef.current) return;
    setState('saving');
    setError(null);
    try {
      const form = new FormData();
      form.append('audio', blobRef.current, 'recording.webm');
      form.append('name', name.trim() || 'My sound');
      if (projectId) form.append('projectId', projectId);

      const response = await fetch('/api/uploads/audio', { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.url) {
        setError(data?.error || "Couldn't save that recording.");
        setState('recorded');
        return;
      }
      onSaved({ url: data.url, name: name.trim() || 'My sound' });
      discard();
    } catch {
      setError('Could not reach the server. Try again.');
      setState('recorded');
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        {state === 'recording' ? (
          <button
            onClick={stop}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600"
            aria-label="Stop recording"
          >
            <Square className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={start}
            disabled={state === 'saving'}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 disabled:opacity-50"
            aria-label="Start recording"
          >
            <Mic className="h-5 w-5" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          {state === 'recording' ? (
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-semibold text-slate-900">
                Recording… {seconds}s
              </span>
              <span className="text-xs text-slate-500">(max {MAX_SECONDS}s)</span>
            </div>
          ) : state === 'recorded' || state === 'saving' ? (
            <div className="text-sm font-semibold text-slate-900">Recorded {seconds}s</div>
          ) : (
            <div className="text-sm text-slate-600">
              Tap the microphone to record your own sound.
            </div>
          )}
        </div>
      </div>

      {(state === 'recorded' || state === 'saving') && (
        <div className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name your sound"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <div className="flex gap-2">
            <button
              onClick={preview}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
            >
              <Play className="h-3 w-3" />
              Listen
            </button>
            <button
              onClick={discard}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300"
            >
              <Trash2 className="h-3 w-3" />
              Discard
            </button>
            <div className="flex-1" />
            <button
              onClick={save}
              disabled={state === 'saving'}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              <Save className="h-3 w-3" />
              {state === 'saving' ? 'Saving…' : 'Save sound'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
