import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingCard } from '@/components/bookings/booking-card';
import {
  CalendarHeader,
  type CalendarMode,
} from '@/components/bookings/calendar/calendar-header';
import { MonthGrid } from '@/components/bookings/calendar/month-grid';
import { MonthPickerSheet } from '@/components/bookings/calendar/month-picker-sheet';
import { WeekList } from '@/components/bookings/calendar/week-list';
import { CancelSheet } from '@/components/bookings/cancel-sheet';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import {
  useBookingsInRange,
  useChangeBookingStatus,
  useDayBookings,
  useDayTimeBlocks,
  useSalonStaff,
  type BookingListItem,
} from '@/features/bookings/queries';
import { useQuickBookingAction } from '@/features/bookings/use-quick-action';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { useSalonTimezone } from '@/features/salon/use-salon-timezone';
import { t } from '@/i18n';
import { formatFullDate, formatShortDate, formatTimeRange } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Kalendarz salonu w trzech trybach. Ten plik decyduje, co pokazać i o co
 * zapytać serwer; rysowanie poszczególnych widoków siedzi w `components/
 * bookings/calendar/`. Dołożenie czwartego trybu to nowy plik obok, a nie
 * kolejne piętro warunków tutaj.
 */
export default function CalendarScreen() {
  const zone = useSalonTimezone();
  const theme = useTheme();
  const router = useRouter();

  const { data: salon } = useCurrentSalon();
  const { data: staff } = useSalonStaff(salon?.salonId);
  const quickAction = useQuickBookingAction();
  const changeStatus = useChangeBookingStatus();

  const [cancelling, setCancelling] = useState<BookingListItem | null>(null);
  const [mode, setMode] = useState<CalendarMode>('day');
  const [day, setDay] = useState<DateTime<true>>(
    () => DateTime.now().setZone(zone).startOf('day') as DateTime<true>,
  );
  const [staffId, setStaffId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const weekStart = day.startOf('week') as DateTime<true>;
  const monthStart = day.startOf('month') as DateTime<true>;
  // Siatka zaczyna się od poniedziałku tygodnia, w którym wypada pierwszy dzień
  // miesiąca, i zawsze ma pełne tygodnie.
  const gridStart = monthStart.startOf('week') as DateTime<true>;
  const gridDays = Math.ceil(monthStart.endOf('month').endOf('week').diff(gridStart, 'days').days);

  const dayQuery = useDayBookings({ salonId: salon?.salonId, zone, day, staffId });
  const rangeQuery = useBookingsInRange({
    salonId: salon?.salonId,
    zone,
    from: mode === 'month' ? gridStart : weekStart,
    days: mode === 'month' ? gridDays : 7,
    staffId,
  });
  const blocksQuery = useDayTimeBlocks({ salonId: salon?.salonId, zone, day, staffId });

  const active = mode === 'day' ? dayQuery : rangeQuery;
  const isToday = day.hasSame(DateTime.now().setZone(zone), 'day');

  /** Wizyty pogrupowane po dniu — siatka miesiąca i lista tygodnia liczą z tego. */
  const byDay = useMemo(() => {
    const map = new Map<string, BookingListItem[]>();
    for (const booking of rangeQuery.data ?? []) {
      const key = DateTime.fromISO(booking.startsAt).setZone(zone).toISODate()!;
      map.set(key, [...(map.get(key) ?? []), booking]);
    }
    return map;
  }, [rangeQuery.data, zone]);

  function bookingsOf(target: DateTime<true>): BookingListItem[] {
    return byDay.get(target.toISODate()!) ?? [];
  }

  function shift(direction: 1 | -1) {
    const unit = mode === 'day' ? 'days' : mode === 'week' ? 'weeks' : 'months';
    setDay(day.plus({ [unit]: direction }) as DateTime<true>);
  }

  function openBooking(booking: BookingListItem) {
    router.push(`/(app)/booking/${booking.id}`);
  }

  const title =
    mode === 'day'
      ? formatFullDate(day.toISO()!, zone)
      : mode === 'week'
        ? `${formatShortDate(weekStart)} – ${formatShortDate(weekStart.plus({ days: 6 }))}`
        : monthStart.setLocale('pl').toLocaleString({ month: 'long', year: 'numeric' });

  const selectedDayBookings = bookingsOf(day);
  // Pracownik widzi kalendarz całego salonu, ale wyborem fryzjerów zarządza
  // właściciel — jemu pokazujemy przełączniki.
  const staffChips = salon?.role === 'owner' ? (staff ?? []) : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <CalendarHeader
        mode={mode}
        onModeChange={setMode}
        title={title}
        isToday={isToday}
        onShift={shift}
        onOpenMonthPicker={() => setPickerOpen(true)}
        onBackToToday={() => setDay(DateTime.now().setZone(zone).startOf('day') as DateTime<true>)}
        staff={staffChips}
        staffId={staffId}
        onStaffChange={setStaffId}
      />

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
            ) : (
              <DayBookings
                bookings={dayQuery.data ?? []}
                zone={zone}
                showStaff={staffId === null}
                onOpenBooking={openBooking}
                onQuickAction={quickAction}
                onCancel={setCancelling}
              />
            )}

            {(blocksQuery.data ?? []).map((block) => (
              <Card key={block.id} style={{ backgroundColor: theme.colors.accentMuted }}>
                <Text variant="bodyStrong">
                  {formatTimeRange(block.startsAt, block.endsAt, zone)} · {t('timeBlock.label')}
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
            <WeekList
              weekStart={weekStart}
              zone={zone}
              showStaff={staffId === null}
              bookingsOf={bookingsOf}
              onOpenDay={(weekDay) => {
                setDay(weekDay);
                setMode('day');
              }}
              onOpenBooking={openBooking}
              onQuickAction={quickAction}
              onCancel={setCancelling}
            />
          )
        ) : (
          <>
            <MonthGrid
              gridStart={gridStart}
              gridDays={gridDays}
              monthStart={monthStart}
              selectedDay={day}
              zone={zone}
              bookingsOf={bookingsOf}
              onSelectDay={setDay}
            />

            <Text variant="heading">{formatFullDate(day.toISO()!, zone)}</Text>

            <DayBookings
              bookings={selectedDayBookings}
              zone={zone}
              showStaff={staffId === null}
              onOpenBooking={openBooking}
              onQuickAction={quickAction}
              onCancel={setCancelling}
            />
          </>
        )}
      </ScrollView>

      <CancelSheet
        booking={cancelling}
        zone={zone}
        busy={changeStatus.isPending}
        onClose={() => setCancelling(null)}
        // Identyfikator bierzemy z arkusza, a nie z wykrzyknikiem ze stanu —
        // odczyt pola na wartości, która bywa pusta, wywracał renderowanie.
        onConfirm={async (comment, bookingId) => {
          await changeStatus.mutateAsync({ bookingId, status: 'cancelled_by_salon', comment });
          setCancelling(null);
        }}
      />

      <MonthPickerSheet
        // Klucz z oglądanym miesiącem: arkusz otwiera się zawsze na właściwym roku.
        key={monthStart.toISODate()}
        visible={pickerOpen}
        current={day}
        zone={zone}
        onClose={() => setPickerOpen(false)}
        onPick={(target) => {
          setDay(target);
          setMode('month');
          setPickerOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

/** Lista wizyt jednego dnia albo informacja, że dzień jest wolny. */
function DayBookings({
  bookings,
  zone,
  showStaff,
  onOpenBooking,
  onQuickAction,
  onCancel,
}: {
  bookings: BookingListItem[];
  zone: string;
  showStaff: boolean;
  onOpenBooking: (booking: BookingListItem) => void;
  onQuickAction: React.ComponentProps<typeof BookingCard>['onQuickAction'];
  onCancel: (booking: BookingListItem) => void;
}) {
  if (bookings.length === 0) {
    return (
      <Card>
        <Text variant="heading">{t('calendar.emptyTitle')}</Text>
        <Text tone="secondary">{t('calendar.emptyDescription')}</Text>
      </Card>
    );
  }

  return (
    <>
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
    </>
  );
}
