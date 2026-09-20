import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { useServiceAddons, type ServiceAddon } from '@/features/services/queries';
import { t } from '@/i18n';
import { formatPrice } from '@/lib/format';
import { useTheme } from '@/theme';

/** Dodatki do usług — drobne zabiegi doczepiane przy rezerwacji. */
export default function AddonsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();
  const { data: addons, isPending } = useServiceAddons(salon?.salonId);

  if (salon && salon.role !== 'owner') {
    return (
      <Screen>
        <Text variant="title">{t('addonsAdmin.title')}</Text>
        <Text tone="secondary">{t('addonsAdmin.ownerOnly')}</Text>
      </Screen>
    );
  }

  // Najpierw dodatki ogólne, potem przypisane do konkretnych usług.
  const groups: { key: string; title: string; items: ServiceAddon[] }[] = [
    {
      key: 'general',
      title: t('addonsAdmin.generalGroup'),
      items: (addons ?? []).filter((addon) => addon.serviceId === null),
    },
    ...Array.from(
      new Map(
        (addons ?? [])
          .filter((addon) => addon.serviceId !== null)
          .map((addon) => [addon.serviceId!, addon.serviceName ?? '']),
      ),
    ).map(([serviceId, serviceName]) => ({
      key: serviceId,
      title: serviceName,
      items: (addons ?? []).filter((addon) => addon.serviceId === serviceId),
    })),
  ].filter((group) => group.items.length > 0);

  return (
    <Screen scroll>
      <Text variant="title">{t('addonsAdmin.title')}</Text>
      <Text tone="secondary">{t('addonsAdmin.description')}</Text>

      {isPending ? (
        <Text tone="muted">{t('common.loading')}</Text>
      ) : groups.length === 0 ? (
        <Card>
          <Text variant="heading">{t('addonsAdmin.emptyTitle')}</Text>
          <Text tone="secondary">{t('addonsAdmin.emptyDescription')}</Text>
        </Card>
      ) : (
        groups.map((group) => (
          <Fragment key={group.key}>
            <Text variant="heading">{group.title}</Text>

            {group.items.map((addon) => (
              <Card key={addon.id}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                  }}
                >
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {addon.name}
                  </Text>
                  <Text variant="bodyStrong">{formatPrice(addon.priceGrosz)}</Text>
                </View>

                <Text variant="small" tone="muted">
                  {addon.durationMinutes > 0
                    ? t('addonsAdmin.extendsBy', { minutes: addon.durationMinutes })
                    : t('addonsAdmin.noExtraTime')}
                  {addon.maxQuantity > 1
                    ? ` · ${t('addonsAdmin.maxQuantity', { count: addon.maxQuantity })}`
                    : ''}
                </Text>

                {addon.description ? (
                  <Text variant="small" tone="secondary">
                    {addon.description}
                  </Text>
                ) : null}

                {!addon.active ? <Badge label={t('addonsAdmin.inactive')} tone="muted" /> : null}

                <Button
                  label={t('services.edit')}
                  variant="secondary"
                  onPress={() => router.push(`/(app)/addons/${addon.id}`)}
                />
              </Card>
            ))}
          </Fragment>
        ))
      )}

      <Button label={t('addonsAdmin.add')} onPress={() => router.push('/(app)/addons/new')} />
    </Screen>
  );
}