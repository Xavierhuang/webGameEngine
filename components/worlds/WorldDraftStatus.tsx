interface WorldDraftStatusProps {
  templateTitle: string;
  revision: number;
}

/** Server-sourced draft identity. This intentionally has no publication action. */
export default function WorldDraftStatus({ templateTitle, revision }: WorldDraftStatusProps) {
  return (
    <p className="hidden rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 md:block">
      Private draft · {templateTitle} · Revision {revision}
    </p>
  );
}
