'use client';

import { Ghost } from 'lucide-react';
import { FriendlyErrorScreen } from '@/components/common/FriendlyErrorScreen';
import { useTranslator } from '@/components/common/LocaleProvider';

export default function NotFound() {
  const t = useTranslator();
  return (
    <FriendlyErrorScreen
      icon={<Ghost className="h-7 w-7" />}
      title={t('common.notFound.title')}
      body={t('common.notFound.body')}
      backHref="/"
      backLabelKey="common.backHome"
    />
  );
}
