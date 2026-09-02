'use client';

/**
 * Last-resort boundary for a failure inside the root layout itself. It must
 * render its own <html>/<body> and cannot rely on providers, so the copy is
 * plain English on purpose: if the layout is broken, so is the locale.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc', color: '#0f172a' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 8px' }}>Something went wrong</h1>
            <p style={{ color: '#475569', margin: '0 0 20px' }}>
              The page could not load. Your saved games are safe.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{ background: '#0f172a', color: '#fff', border: 0, borderRadius: 999, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              style={{ background: 'transparent', color: '#0f172a', border: 0, marginLeft: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Back to home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
