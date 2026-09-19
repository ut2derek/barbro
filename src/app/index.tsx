import { useMutation } from '@tanstack/react-query';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { checkSupabaseConnection } from '@/features/setup/check-connection';
import { t } from '@/i18n';
import { env, isSentryConfigured, isSupabaseConfigured } from '@/lib/env';

/**
 * Ekran tymczasowy (Etap 0): potwierdza, że fundament stoi.
 * Zostanie zastąpiony ekranem logowania w Etapie 4.
 */
export default function SetupScreen() {
  const check = useMutation({ mutationFn: checkSupabaseConnection });

  return (
    <Screen scroll>
      <View>
        <Text variant="display">{t('common.appName')}</Text>
        <Text variant="title" tone="secondary">
          {t('setup.title')}
        </Text>
      </View>

      <Text tone="secondary">{t('setup.subtitle')}</Text>

      <Card>
        <Text variant="heading">{t('setup.envHeading')}</Text>
        <Text tone={isSupabaseConfigured ? 'success' : 'danger'}>
          {isSupabaseConfigured ? t('setup.supabaseOk') : t('setup.supabaseMissing')}
        </Text>
        <Text tone={isSentryConfigured ? 'success' : 'muted'}>
          {isSentryConfigured ? t('setup.sentryOk') : t('setup.sentryMissing')}
        </Text>
        <Text tone="muted">{t('setup.environment', { environment: env.environment })}</Text>
      </Card>

      <Button
        label={t('setup.connectionCheck')}
        onPress={() => check.mutate()}
        disabled={!isSupabaseConfigured}
        loading={check.isPending}
      />

      {check.isSuccess && <Text tone="success">{t('setup.connectionOk')}</Text>}
      {check.isError && (
        <Text tone="danger">{t('setup.connectionFailed', { message: check.error.message })}</Text>
      )}
    </Screen>
  );
}
