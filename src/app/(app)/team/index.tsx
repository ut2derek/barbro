import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { useTeam } from '@/features/team/queries';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

/** Zespół salonu. Pracownik może istnieć bez konta — kalendarz prowadzi wtedy właściciel. */
export default function TeamScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();
  const { data: team, isPending } = useTeam(salon?.salonId);

  if (salon && salon.role !== 'owner') {
    return (
      <Screen>
        <Text variant="title">{t('team.title')}</Text>
        <Text tone="secondary">{t('team.ownerOnly')}</Text>
        <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Text variant="title">{t('team.title')}</Text>

      {isPending ? (
        <Text tone="muted">{t('common.loading')}</Text>
      ) : (
        (team ?? []).map((member) => (
          <Card key={member.id}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: theme.spacing.sm,
              }}
            >
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {member.displayName}
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
                {member.role === 'owner' ? <Badge label={t('team.owner')} tone="neutral" /> : null}
                {!member.active ? <Badge label={t('team.inactive')} tone="muted" /> : null}
                {!member.hasAccount ? <Badge label={t('team.noAccount')} tone="warning" /> : null}
              </View>
            </View>

            {member.bio ? (
              <Text tone="secondary" variant="small">
                {member.bio}
              </Text>
            ) : null}

            <Button
              label={t('team.edit')}
              variant="secondary"
              onPress={() => router.push(`/(app)/team/${member.id}`)}
            />
          </Card>
        ))
      )}

      <Text variant="small" tone="muted">
        {t('team.noAccountExplanation')}
      </Text>

      <Button label={t('team.add')} onPress={() => router.push('/(app)/team/new')} />

      <Button
        label={t('common.back')}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
      />
    </Screen>
  );
}