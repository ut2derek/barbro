import { useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { View } from 'react-native';

import { SlotPicker } from '@/components/bookings/slot-picker';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAvailableSlots, useBooking, useRescheduleBooking } from '@/features/bookings/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { useSalonTimezone } from '@/features/salon/use-salon-timezone';
import { t } from '@/i18n';
import { formatFullDate, formatTimeRange } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Nowy termin sprawdzany jest tą samą logiką dostępności co rezerwacja
 * z internetu — aplikacja pyta bazę o wolne sloty, sama niczego nie liczy.
 */
export default function RescheduleScreen() {
  const zone = useSalonTimezone();
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: salon } = useCurrentSalon();
  const { data: booking } = useBooking(id);
  const reschedule = useRescheduleBooking();

  const [day, setDay] = useState(() => DateTime.now().setZone(zone).startOf('day'));
  const [error, setError] = useState<string | null>(null);

  const { data: slots, isPending } = useAvailableSlots({
    salonId: salon?.salonId,
    serviceIds: booking?.serviceIds ?? [],
    day,
    zone: zone,
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
              term: `${formatFullDate(booking.startsAt, zone)}, ${formatTimeRange(booking.startsAt, booking.endsAt, zone)}`,
            })}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Button label="‹" variant="secondary" onPress={() => setDay(day.minus({ days: 1 }))} />
        <Text variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          {formatFullDate(day.toISO()!, zone)}
        </Text>
        <Button label="›" variant="secondary" onPress={() => setDay(day.plus({ days: 1 }))} />
      </View>

      {error ? <Text tone="danger">{error}</Text> : null}

      <SlotPicker
        slots={slots}
        zone={zone}
        loading={isPending}
        onSelect={(slotStart) => void pick(slotStart)}
      />

      <Button
        label={t('common.cancel')}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </Screen>
  );
}