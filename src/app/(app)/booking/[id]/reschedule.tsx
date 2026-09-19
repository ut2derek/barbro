import { useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAvailableSlots, useBooking, useRescheduleBooking } from '@/features/bookings/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { t } from '@/i18n';
import { formatFullDate, formatTime, formatTimeRange } from '@/lib/format';
import { useTheme } from '@/theme';

const ZONE = 'Europe/Warsaw';

/**
 * Nowy termin sprawdzany jest tą samą logiką dostępności co rezerwacja
 * z internetu — aplikacja pyta bazę o wolne sloty, sama niczego nie liczy.
 */
export default function RescheduleScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: salon } = useCurrentSalon();
  const { data: booking } = useBooking(id);
  const reschedule = useRescheduleBooking();

  const [day, setDay] = useState(() => DateTime.now().setZone(ZONE).startOf('day'));
  const [error, setError] = useState<string | null>(null);

  const { data: slots, isPending } = useAvailableSlots({
    salonId: salon?.salonId,
    serviceIds: booking?.serviceIds ?? [],
    day,
    zone: ZONE,
    staffId: booking?.staffId,
    enabled: Boolean(booking),
  });

  async function pick(slotStart: string) {
    setError(null);
    try {
      const newId = await reschedule.mutateAsync({ bookingId: id, newStartsAt: slotStart });
      router.replace(`/(app)/booking/${newId}`);
    } catch {
      setError(t('booking.rescheduleError'));
    }
  }

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">{t('booking.rescheduleTitle')}</Text>
        {booking ? (
          <Text tone="secondary">
            {t('booking.currentTerm', {
              term: `${formatFullDate(booking.startsAt, ZONE)}, ${formatTimeRange(booking.startsAt, booking.endsAt, ZONE)}`,
            })}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Button label="‹" variant="secondary" onPress={() => setDay(day.minus({ days: 1 }))} />
        <Text variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          {formatFullDate(day.toISO()!, ZONE)}
        </Text>
        <Button label="›" variant="secondary" onPress={() => setDay(day.plus({ days: 1 }))} />
      </View>

      {error ? <Text tone="danger">{error}</Text> : null}

      {isPending ? (
        <Text tone="muted">{t('common.loading')}</Text>
      ) : slots && slots.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {slots.map((slot) => (
            <Pressable
              key={slot.slot_start}
              accessibilityRole="button"
              onPress={() => void pick(slot.slot_start)}
              style={{
                minHeight: theme.minTouchTarget,
                minWidth: 88,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.lg,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              }}
            >
              <Text variant="bodyStrong">{formatTime(slot.slot_start, ZONE)}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Card>
          <Text variant="heading">{t('booking.noSlotsTitle')}</Text>
          <Text tone="secondary">{t('booking.noSlotsDescription')}</Text>
        </Card>
      )}

      <Button
        label={t('common.cancel')}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
      />
    </Screen>
  );
}