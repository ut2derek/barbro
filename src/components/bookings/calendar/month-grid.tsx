import { DateTime } from 'luxon';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { BookingListItem } from '@/features/bookings/queries';
import { ACTIVE_STATUSES } from '@/features/bookings/status';
import { formatFullDate, plural } from '@/lib/format';
import { useTheme } from '@/theme';

/** Skróty dni tygodnia nad siatką: pon … niedz. */
const WEEKDAY_HEADS = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  DateTime.fromObject({ weekday: weekday as 1 })
    .setLocale('pl')
    .toFormat('ccccc'),
);

/**
 * Siatka miesiąca: liczba wizyt przy każdym dniu. Wybrany dzień rozwija się
 * listą pod spodem — to już zadanie ekranu, nie tego komponentu.
 *
 * Liczymy wyłącznie wizyty aktywne; odwołane nie powinny zawyżać liczby.
 */
export function MonthGrid({
  gridStart,
  gridDays,
  monthStart,
  selectedDay,
  zone,
  bookingsOf,
  onSelectDay,
}: {
  gridStart: DateTime;
  gridDays: number;
  monthStart: DateTime;
  selectedDay: DateTime;
  zone: string;
  bookingsOf: (day: DateTime) => BookingListItem[];
  onSelectDay: (day: DateTime) => void;
}) {
  const theme = useTheme();
  const today = DateTime.now().setZone(zone);

  return (
    <>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_HEADS.map((head, index) => (
          <Text
            key={`${head}-${index}`}
            variant="small"
            tone="muted"
            style={{ flex: 1, textAlign: 'center' }}
          >
            {head}
          </Text>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {Array.from({ length: gridDays }, (_, index) => gridStart.plus({ days: index })).map(
          (cellDay) => {
            const bookings = bookingsOf(cellDay).filter((booking) =>
              ACTIVE_STATUSES.includes(booking.status),
            );
            const inMonth = cellDay.hasSame(monthStart, 'month');
            const isSelected = cellDay.hasSame(selectedDay, 'day');
            const isCurrentDay = cellDay.hasSame(today, 'day');

            return (
              <Pressable
                key={cellDay.toISODate()}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${formatFullDate(cellDay.toISO()!, zone)}, ${
                  bookings.length
                } ${plural(bookings.length, 'wizyta', 'wizyty', 'wizyt')}`}
                onPress={() => onSelectDay(cellDay)}
                style={{
                  width: `${100 / 7}%`,
                  aspectRatio: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  paddingVertical: theme.spacing.xs,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: theme.radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isSelected ? theme.colors.accent : 'transparent',
                    borderWidth: isCurrentDay && !isSelected ? 1 : 0,
                    borderColor: theme.colors.borderStrong,
                  }}
                >
                  <Text variant="body" tone={isSelected ? 'onAccent' : inMonth ? 'primary' : 'muted'}>
                    {cellDay.day}
                  </Text>
                </View>

                {/* Liczba wizyt jako czerwone kółko — ten sam znak, co kropka
                    na zakładce „Dziś”, więc oko czyta go tak samo w obu
                    miejscach. Dni bez wizyt dostają pusty placeholder tej samej
                    wysokości, żeby wiersze siatki nie skakały. */}
                <View
                  style={{
                    minWidth: 18,
                    height: 18,
                    paddingHorizontal: 5,
                    borderRadius: theme.radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: bookings.length > 0 ? theme.colors.danger : 'transparent',
                  }}
                >
                  {bookings.length > 0 ? (
                    <Text
                      variant="small"
                      tone="onAccent"
                      style={{ fontSize: 11, lineHeight: 14, fontWeight: '600' }}
                    >
                      {bookings.length}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          },
        )}
      </View>
    </>
  );
}
