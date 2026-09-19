import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingCard } from '@/components/bookings/booking-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import {
  useDayBookings,
  useDayTimeBlocks,
  useSalonStaff,
  useWeekBookings,
  type BookingListItem,
} from '@/features/bookings/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { t } from '@/i18n';
import { formatFullDate, formatShortDate, formatTimeRange, formatWeekday } from '@/lib/format';
import { useTheme } from '@/theme';

const ZONE = 'Europe/Warsaw';

type Mode = 'day' | 'week';

export default function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();
  const { data: staff } = useSalonStaff(salon?.salonId);

  const [mode, setMode] = useState<Mode>('day');
  const [day, setDay] = useState(() => DateTime.now().setZone(ZONE).startOf('day'));
  const [staffId, setStaffId] = useState<string | null>(null);

  const weekStart = day.startOf('week');

  const dayQuery = useDayBookings({ salonId: salon?.salonId, zone: ZONE, day, staffId });
  const weekQuery = useWeekBookings({ salonId: salon?.salonId, zone: ZONE, weekStart, staffId });
  const blocksQuery = useDayTimeBlocks({ salonId: salon?.salonId, zone: ZONE, day, staffId });

  const active = mode === 'day' ? dayQuery : weekQuery;
  const isToday = day.hasSame(DateTime.now().setZone(ZONE), 'day');

  function shift(direction: 1 | -1) {
    setDay(day.plus({ [mode === 'day' ? 'days' : 'weeks']: direction }));
  }

  const weekDays = Array.from({ length: 7 }, (_, index) => weekStart.plus({ days: index }));

  function bookingsOf(target: DateTime): BookingListItem[] {
    return (weekQuery.data ?? []).filter((booking) =>
      DateTime.fromISO(booking.startsAt).setZone(ZONE).hasSame(target, 'day'),
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          gap: theme.spacing.md,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Chip label={t('calendar.modeDay')} selected={mode === 'day'} onPress={() => setMode('day')} />
          <Chip
            label={t('calendar.modeWeek')}
            selected={mode === 'week'}
            onPress={() => setMode('week')}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('calendar.previous')}
            onPress={() => shift(-1)}
            style={{
              width: theme.minTouchTarget,
              height: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text variant="heading">‹</Text>
          </Pressable>

          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="heading">
              {mode === 'day'
                ? formatFullDate(day.toISO()!, ZONE)
                : `${formatShortDate(weekStart)} – ${formatShortDate(weekStart.plus({ days: 6 }))}`}
            </Text>
            {isToday && mode === 'day' ? (
              <Text variant="small" tone="muted">
                {t('calendar.today')}
              </Text>
            ) : (
              <Pressable onPress={() => setDay(DateTime.now().setZone(ZONE).startOf('day'))}>
                <Text variant="small" tone="accent">
                  {t('calendar.backToToday')}
                </Text>
              </Pressable>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('calendar.next')}
            onPress={() => shift(1)}
            style={{
              width: theme.minTouchTarget,
              height: theme.minTouchTarget,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text variant="heading">›</Text>
          </Pressable>
        </View>

        {salon?.role === 'owner' && staff && staff.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Chip
                label={t('calendar.allStaff')}
                selected={staffId === null}
                onPress={() => setStaffId(null)}
              />
              {staff.map((member) => (
                <Chip
                  key={member.id}
                  label={member.display_name}
                  selected={staffId === member.id}
                  onPress={() => setStaffId(member.id)}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.md,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
        refreshControl={
          <RefreshControl refreshing={active.isRefetching} onRefresh={() => void active.refetch()} />
        }
      >
        {mode === 'day' ? (
          <>
            {dayQuery.isPending ? (
              <Text tone="muted">{t('common.loading')}</Text>
            ) : (dayQuery.data ?? []).length > 0 ? (
              (dayQuery.data ?? []).map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  zone={ZONE}
                  showStaff={staffId === null}
                  onPress={() => router.push(`/(app)/booking/${booking.id}`)}
                />
              ))
            ) : (
              <Card>
                <Text variant="heading">{t('calendar.emptyTitle')}</Text>
                <Text tone="secondary">{t('calendar.emptyDescription')}</Text>
              </Card>
            )}

            {(blocksQuery.data ?? []).map((block) => (
              <Card key={block.id} style={{ backgroundColor: theme.colors.accentMuted }}>
                <Text variant="bodyStrong">
                  {formatTimeRange(block.startsAt, block.endsAt, ZONE)} · {t('timeBlock.label')}
                </Text>
                <Text tone="secondary" variant="small">
                  {block.reason ?? t('timeBlock.noReason')}
                </Text>
              </Card>
            ))}
          </>
        ) : weekQuery.isPending ? (
          <Text tone="muted">{t('common.loading')}</Text>
        ) : (
          weekDays.map((weekDay) => {
            const bookings = bookingsOf(weekDay);
            return (
              <View key={weekDay.toISODate()} style={{ gap: theme.spacing.sm }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setDay(weekDay);
                    setMode('day');
                  }}
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
                      : t('calendar.weekCount', { count: bookings.length })}
                  </Text>
                </Pressable>

                {bookings.map((booking) => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    zone={ZONE}
                    showStaff={staffId === null}
                    onPress={() => router.push(`/(app)/booking/${booking.id}`)}
                  />
                ))}
              </View>
            );
          })
        )}

        <Button label={t('newBooking.title')} onPress={() => router.push('/(app)/new-booking')} />
        <Button
          label={t('timeBlock.title')}
          variant="secondary"
          onPress={() => router.push('/(app)/time-block')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}