import type { DateTime } from 'luxon';
import { Pressable, View } from 'react-native';

import { BookingCard } from '@/components/bookings/booking-card';
import { Text } from '@/components/ui/text';
import type { BookingListItem, BookingStatus } from '@/features/bookings/queries';
import { t } from '@/i18n';
import { formatShortDate, formatWeekday, plural } from '@/lib/format';
import { useTheme } from '@/theme';

/** Tydzień jako lista dni — dotknięcie nagłówka dnia przechodzi do widoku dnia. */
export function WeekList({
  weekStart,
  zone,
  showStaff,
  bookingsOf,
  onOpenDay,
  onOpenBooking,
  onQuickAction,
  onCancel,
}: {
  weekStart: DateTime;
  zone: string;
  showStaff: boolean;
  bookingsOf: (day: DateTime) => BookingListItem[];
  onOpenDay: (day: DateTime) => void;
  onOpenBooking: (booking: BookingListItem) => void;
  onQuickAction: (booking: BookingListItem, status: BookingStatus, label: string) => void;
  onCancel: (booking: BookingListItem) => void;
}) {
  const theme = useTheme();

  return (
    <>
      {Array.from({ length: 7 }, (_, index) => weekStart.plus({ days: index })).map((weekDay) => {
        const bookings = bookingsOf(weekDay);

        return (
          <View key={weekDay.toISODate()} style={{ gap: theme.spacing.sm }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onOpenDay(weekDay)}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: theme.spacing.sm,
              }}
            >
              <Text variant="bodyStrong">
                {formatWeekday(weekDay)} {formatShortDate(weekDay)}
              </Text>
              <Text variant="small" tone="muted">
                {bookings.length === 0
                  ? t('calendar.weekFree')
                  : `${bookings.length} ${plural(bookings.length, 'wizyta', 'wizyty', 'wizyt')}`}
              </Text>
            </Pressable>

            {bookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                zone={zone}
                showStaff={showStaff}
                onPress={() => onOpenBooking(booking)}
                onQuickAction={onQuickAction}
                onCancel={onCancel}
              />
            ))}
          </View>
        );
      })}
    </>
  );
}