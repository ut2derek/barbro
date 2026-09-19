import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

/** Ekran „Dziś” — na razie potwierdza, kto jest zalogowany. Treść dojdzie w Etapie 5. */
export default function TodayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { data: salon, isPending, error } = useCurrentSalon();

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="display">{t('today.title')}</Text>
        <Text tone="secondary">{user?.email}</Text>
      </View>

      <Card>
        {isPending ? (
          <Text tone="muted">{t('common.loading')}</Text>
        ) : error ? (
          <Text tone="danger">{t('today.salonError')}</Text>
        ) : salon ? (
          <>
            <Text variant="heading">{salon.salonName}</Text>
            <Text tone="secondary">
              {salon.role === 'owner' ? t('today.roleOwner') : t('today.roleStaff')}
            </Text>
          </>
        ) : (
          <Text tone="muted">{t('today.noSalon')}</Text>
        )}
      </Card>

      <Card>
        <Text variant="heading">{t('today.nextStep')}</Text>
        <Text tone="secondary">{t('today.nextStepDescription')}</Text>
      </Card>

      <Button
        label={t('account.title')}
        variant="secondary"
        onPress={() => router.push('/(app)/account')}
      />
    </Screen>
  );
}
