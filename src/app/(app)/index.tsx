import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingCard } from '@/components/bookings/booking-card';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useDayBookings } from '@/features/bookings/queries';
import { ACTIVE_STATUSES } from '@/features/bookings/status';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { t } from '@/i18n';
import { formatFullDate, formatPrice } from '@/lib/format';
import { useTheme } from '@/theme';

/** Ekran „Dziś” — to, co barber ma przed sobą w danym dniu. */
export default function TodayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();
  const zone = 'Europe/Warsaw';
  const today = DateTime.now().setZone(zone);

  const { data: bookings, isPending, error, refetch, isRefetching } = useDayBookings({
    salonId: salon?.salonId,
    zone,
    day: today,
  });

  const active = (bookings ?? []).filter((b) => ACTIVE_STATUSES.includes(b.status));
  const revenue = active
    .filter((b) => b.status !== 'pending_confirmation')
    .reduce((sum, b) => sum + b.totalPriceGrosz, 0);

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
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="display">{t('today.title')}</Text>
          <Text tone="secondary">{formatFullDate(today.toISO()!, zone)}</Text>
        </View>

        {salon ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <Card style={{ flex: 1 }}>
              <Text variant="label" tone="secondary">
                {t('today.visitsCount')}
              </Text>
              <Text variant="title">{active.length}</Text>
            </Card>
            <Card style={{ flex: 1 }}>
              <Text variant="label" tone="secondary">
                {t('today.revenue')}
              </Text>
              <Text variant="title">{formatPrice(revenue)}</Text>
            </Card>
          </View>
        ) : null}

        {isPending ? (
          <Text tone="muted">{t('common.loading')}</Text>
        ) : error ? (
          <Text tone="danger">{t('today.loadError')}</Text>
        ) : bookings && bookings.length > 0 ? (
          bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              zone={zone}
              showStaff
              onPress={() => router.push(`/(app)/booking/${booking.id}`)}
            />
          ))
        ) : (
          <Card>
            <Text variant="heading">{t('today.emptyTitle')}</Text>
            <Text tone="secondary">{t('today.emptyDescription')}</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}