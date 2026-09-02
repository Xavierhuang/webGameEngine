'use client';

import { Lock } from 'lucide-react';
import { FriendlyErrorScreen } from '@/components/common/FriendlyErrorScreen';
import { useTranslator } from '@/components/common/LocaleProvider';

/** A private, deleted, or mistyped game link. Never reveals which. */
export default function EditorNotFound() {
  const t = useTranslator();
  return (
    <FriendlyErrorScreen
      icon={<Lock className="h-7 w-7" />}
      title={t('common.gameNotFound.title')}
      body={t('common.gameNotFound.body')}
    />
  );
}
