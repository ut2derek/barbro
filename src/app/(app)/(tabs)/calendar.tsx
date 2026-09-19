import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingCard } from '@/components/bookings/booking-card';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import {
  useBookingsInRange,
  useDayBookings,
  useDayTimeBlocks,
  useSalonStaff,
  type BookingListItem,
} from '@/features/bookings/queries';
import { useQuickBookingAction } from '@/features/bookings/use-quick-action';
import { ACTIVE_STATUSES } from '@/features/bookings/status';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { t } from '@/i18n';
import {
  formatFullDate,
  formatShortDate,
  formatTimeRange,
  formatWeekday,
  plural,
} from '@/lib/format';
import { useTheme } from '@/theme';

const ZONE = 'Europe/Warsaw';

type Mode = 'day' | 'week' | 'month';

/** Skróty dni tygodnia nad siatką miesiąca: pon … niedz. */
const WEEKDAY_HEADS = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
  DateTime.fromObject({ weekday: weekday as 1 }).setLocale('pl').toFormat('ccccc'),
);

export default function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();
  const { data: staff } = useSalonStaff(salon?.salonId);
  const quickAction = useQuickBookingAction();

  const [mode, setMode] = useState<Mode>('day');
  const [day, setDay] = useState(() => DateTime.now().setZone(ZONE).startOf('day'));
  const [staffId, setStaffId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => DateTime.now().setZone(ZONE).year);

  const weekStart = day.startOf('week');
  const monthStart = day.startOf('month');
  // Siatka zaczyna się od poniedziałku tygodnia, w którym wypada pierwszy dzień
  // miesiąca, i zawsze ma pełne tygodnie.
  const gridStart = monthStart.startOf('week');
  const gridDays = Math.ceil(monthStart.endOf('month').endOf('week').diff(gridStart, 'days').days);

  const dayQuery = useDayBookings({ salonId: salon?.salonId, zone: ZONE, day, staffId });
  const rangeQuery = useBookingsInRange({
    salonId: salon?.salonId,
    zone: ZONE,
    from: mode === 'month' ? gridStart : weekStart,
    days: mode === 'month' ? gridDays : 7,
    staffId,
  });
  const blocksQuery = useDayTimeBlocks({ salonId: salon?.salonId, zone: ZONE, day, staffId });

  const active = mode === 'day' ? dayQuery : rangeQuery;
  const isToday = day.hasSame(DateTime.now().setZone(ZONE), 'day');

  function shift(direction: 1 | -1) {
    const unit = mode === 'day' ? 'days' : mode === 'week' ? 'weeks' : 'months';
    setDay(day.plus({ [unit]: direction }));
  }

  /** Wizyty pogrupowane po dniu — siatka miesiąca i lista tygodnia liczą z tego. */
  const byDay = useMemo(() => {
    const map = new Map<string, BookingListItem[]>();
    for (const booking of rangeQuery.data ?? []) {
      const key = DateTime.fromISO(booking.startsAt).setZone(ZONE).toISODate()!;
      map.set(key, [...(map.get(key) ?? []), booking]);
    }
    return map;
  }, [rangeQuery.data]);

  function bookingsOf(target: DateTime): BookingListItem[] {
    return byDay.get(target.toISODate()!) ?? [];
  }

  const title =
    mode === 'day'
      ? formatFullDate(day.toISO()!, ZONE)
      : mode === 'week'
        ? `${formatShortDate(weekStart)} – ${formatShortDate(weekStart.plus({ days: 6 }))}`
        : monthStart.setLocale('pl').toLocaleString({ month: 'long', year: 'numeric' });

  const selectedDayBookings = bookingsOf(day);

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
          <Chip
            label={t('calendar.modeMonth')}
            selected={mode === 'month'}
            onPress={() => setMode('month')}
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
            {/* Nagłówek jest przyciskiem — otwiera wybór miesiąca i roku. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('calendar.pickMonth')}
              onPress={() => {
                setPickerYear(day.year);
                setPickerOpen(true);
              }}
              style={{ minHeight: theme.minTouchTarget, justifyContent: 'center' }}
            >
              <Text variant="heading">{title} ⌄</Text>
            </Pressable>

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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
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
                  onQuickAction={quickAction}
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
        ) : mode === 'week' ? (
          rangeQuery.isPending ? (
            <Text tone="muted">{t('common.loading')}</Text>
          ) : (
            Array.from({ length: 7 }, (_, index) => weekStart.plus({ days: index })).map((weekDay) => {
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
                        : `${bookings.length} ${plural(bookings.length, 'wizyta', 'wizyty', 'wizyt')}`}
                    </Text>
                  </Pressable>

                  {bookings.map((booking) => (
                    <BookingCard
                      key={booking.id}
                      booking={booking}
                      zone={ZONE}
                      showStaff={staffId === null}
                      onPress={() => router.push(`/(app)/booking/${booking.id}`)}
                      onQuickAction={quickAction}
                    />
                  ))}
                </View>
              );
            })
          )
        ) : (
          <>
            {/* Siatka miesiąca: liczba wizyt przy każdym dniu, wybrany dzień
                rozwija się listą pod spodem. */}
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
                  const isSelected = cellDay.hasSame(day, 'day');
                  const isCurrentDay = cellDay.hasSame(DateTime.now().setZone(ZONE), 'day');

                  return (
                    <Pressable
                      key={cellDay.toISODate()}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${formatFullDate(cellDay.toISO()!, ZONE)}, ${
                        bookings.length
                      } ${plural(bookings.length, 'wizyta', 'wizyty', 'wizyt')}`}
                      onPress={() => setDay(cellDay)}
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
                        <Text
                          variant="body"
                          tone={isSelected ? 'onAccent' : inMonth ? 'primary' : 'muted'}
                        >
                          {cellDay.day}
                        </Text>
                      </View>

                      {bookings.length > 0 ? (
                        <Text variant="small" tone={isSelected ? 'accent' : 'muted'}>
                          {bookings.length}
                        </Text>
                      ) : (
                        <Text variant="small" tone="muted">
                          {' '}
                        </Text>
                      )}
                    </Pressable>
                  );
                },
              )}
            </View>

            <Text variant="heading">{formatFullDate(day.toISO()!, ZONE)}</Text>

            {selectedDayBookings.length > 0 ? (
              selectedDayBookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  zone={ZONE}
                  showStaff={staffId === null}
                  onPress={() => router.push(`/(app)/booking/${booking.id}`)}
                  onQuickAction={quickAction}
                />
              ))
            ) : (
              <Card>
                <Text variant="heading">{t('calendar.emptyTitle')}</Text>
                <Text tone="secondary">{t('calendar.emptyDescription')}</Text>
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {/* Wybór miesiąca i roku */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        {/* Tło zamykające arkusz leży pod nim, a nie wokół niego — inaczej
            przyciski w arkuszu byłyby przyciskami w przycisku. */}
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            onPress={() => setPickerOpen(false)}
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.overlay }]}
          />
          <View
            style={{
              backgroundColor: theme.colors.surfaceElevated,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              padding: theme.spacing.lg,
              gap: theme.spacing.lg,
              paddingBottom: theme.spacing.xxl,
            }}
          >
            <Text variant="heading">{t('calendar.pickMonth')}</Text>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('calendar.previousYear')}
                onPress={() => setPickerYear(pickerYear - 1)}
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

              <Text variant="title">{pickerYear}</Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('calendar.nextYear')}
                onPress={() => setPickerYear(pickerYear + 1)}
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

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
                const label = DateTime.fromObject({ month })
                  .setLocale('pl')
                  .toLocaleString({ month: 'short' });
                const selected = day.month === month && day.year === pickerYear;

                return (
                  <Pressable
                    key={month}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      // Zachowujemy dzień miesiąca, o ile istnieje w nowym miesiącu.
                      const target = DateTime.fromObject(
                        { year: pickerYear, month, day: 1 },
                        { zone: ZONE },
                      );
                      setDay(target.set({ day: Math.min(day.day, target.daysInMonth ?? 28) }));
                      setMode('month');
                      setPickerOpen(false);
                    }}
                    style={{
                      width: '30%',
                      minHeight: theme.minTouchTarget,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: theme.radius.md,
                      borderWidth: 1,
                      borderColor: selected ? theme.colors.accent : theme.colors.border,
                      backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
                    }}
                  >
                    <Text variant="label" tone={selected ? 'onAccent' : 'secondary'}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
