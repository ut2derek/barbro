import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import {
  useServiceCategories,
  useServices,
  useSwapServiceOrder,
  type ServiceOption,
} from '@/features/services/queries';
import { t } from '@/i18n';
import { formatDuration, formatPrice } from '@/lib/format';
import { useTheme } from '@/theme';

/** Cennik salonu. Edytuje go właściciel, pracownik tylko podgląda. */
export default function ServicesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();
  const { data: services, isPending, refetch, isRefetching } = useServices({ salonId: salon?.salonId });
  const { data: categories } = useServiceCategories(salon?.salonId);
  const swapOrder = useSwapServiceOrder();

  const isOwner = salon?.role === 'owner';

  const groups: { id: string | null; name: string; services: ServiceOption[] }[] = [
    ...(categories ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      services: (services ?? []).filter((service) => service.categoryId === category.id),
    })),
    {
      id: null,
      name: t('services.noCategory'),
      services: (services ?? []).filter((service) => service.categoryId === null),
    },
  ].filter((group) => group.services.length > 0);

  function move(group: ServiceOption[], index: number, direction: -1 | 1) {
    const second = group[index + direction];
    if (!second) return;
    swapOrder.mutate({ first: group[index], second });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        <Text variant="display">{t('services.title')}</Text>

        {isPending ? (
          <Text tone="muted">{t('common.loading')}</Text>
        ) : groups.length === 0 ? (
          <Card>
            <Text variant="heading">{t('services.emptyTitle')}</Text>
            <Text tone="secondary">{t('services.emptyDescription')}</Text>
          </Card>
        ) : (
          groups.map((group) => (
            <Fragment key={group.id ?? 'brak'}>
              <Text variant="heading">{group.name}</Text>

              {group.services.map((service, index) => (
                <Card key={service.id} style={{ gap: theme.spacing.sm }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => isOwner && router.push(`/(app)/services/${service.id}`)}
                    style={{ gap: theme.spacing.xxs }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                      }}
                    >
                      <Text variant="bodyStrong" style={{ flex: 1 }}>
                        {service.name}
                      </Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text variant="bodyStrong">{formatPrice(service.priceGrosz)}</Text>
                        {service.promoActive ? (
                          <Text
                            variant="small"
                            tone="muted"
                            style={{ textDecorationLine: 'line-through' }}
                          >
                            {formatPrice(service.regularPriceGrosz)}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <Text variant="small" tone="muted">
                      {formatDuration(service.durationMinutes)}
                      {service.bufferAfterMinutes > 0
                        ? ` + ${service.bufferAfterMinutes} min ${t('services.buffer')}`
                        : ''}
                    </Text>

                    {service.promoActive && service.lowestPriceBeforePromoGrosz !== null ? (
                      <Text variant="small" tone="muted">
                        {t('services.lowestPrice', {
                          price: formatPrice(service.lowestPriceBeforePromoGrosz),
                        })}
                      </Text>
                    ) : null}

                    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                      {service.promoActive ? <Badge label={t('services.promo')} tone="success" /> : null}
                      {!service.visible ? <Badge label={t('services.hidden')} tone="muted" /> : null}
                    </View>
                  </Pressable>

                  {isOwner ? (
                    <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                      <Button
                        label="↑"
                        variant="secondary"
                        style={{ flex: 1 }}
                        disabled={index === 0}
                        onPress={() => move(group.services, index, -1)}
                      />
                      <Button
                        label="↓"
                        variant="secondary"
                        style={{ flex: 1 }}
                        disabled={index === group.services.length - 1}
                        onPress={() => move(group.services, index, 1)}
                      />
                      <Button
                        label={t('services.edit')}
                        variant="secondary"
                        style={{ flex: 2 }}
                        onPress={() => router.push(`/(app)/services/${service.id}`)}
                      />
                    </View>
                  ) : null}
                </Card>
              ))}
            </Fragment>
          ))
        )}

        {isOwner ? (
          <>
            <Button
              label={t('services.addService')}
              onPress={() => router.push('/(app)/services/new')}
            />
            <Button
              label={t('services.manageCategories')}
              variant="secondary"
              onPress={() => router.push('/(app)/services/categories')}
            />
            <Button
              label={t('addonsAdmin.title')}
              variant="secondary"
              onPress={() => router.push('/(app)/addons')}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
