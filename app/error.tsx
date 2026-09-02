'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { FriendlyErrorScreen } from '@/components/common/FriendlyErrorScreen';
import { useTranslator } from '@/components/common/LocaleProvider';

/**
 * Route-level error boundary. A throw during server rendering used to show
 * Next's default error page; a child now gets a sentence they can read and a
 * way back. The error itself still reaches `/api/errors` via ErrorReporter
 * for anything thrown on the client, and the server log for the rest.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslator();
  useEffect(() => {
    console.error('[route error]', error);
  }, [error]);
  return (
    <FriendlyErrorScreen
      icon={<AlertTriangle className="h-7 w-7" />}
      title={t('common.somethingWrong')}
      body={t('common.somethingWrongBody')}
      onRetry={reset}
    />
  );
}
