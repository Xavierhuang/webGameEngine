'use client';

import { useEffect } from 'react';

/**
 * Reports uncaught browser exceptions so failures are visible without SSHing
 * into the droplet and reading journalctl.
 *
 * This exists because a deploy once white-screened every page with a
 * client-side exception while the server logged nothing at all and every status
 * code stayed 200.
 *
 * Renders nothing and never interferes with the page.
 */
export function ErrorReporter() {
  useEffect(() => {
    // Only report the first few per page load: an error inside a render loop
    // would otherwise fire continuously.
    let sent = 0;
    const MAX = 3;

    const report = (message: string, stack?: string) => {
      if (sent >= MAX) return;
      sent++;
      // keepalive so a report still goes out if the error precedes a navigation.
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, stack, url: window.location.pathname }),
        keepalive: true,
      }).catch(() => {
        /* reporting must never surface an error of its own */
      });
    };

    const onError = (e: ErrorEvent) => report(e.message, e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) =>
      report(
        `Unhandled rejection: ${e.reason?.message ?? String(e.reason)}`,
        e.reason?.stack
      );

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
