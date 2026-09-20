import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { DateRangeSheet } from '@/components/schedule/date-range-sheet';
import { DayHoursSheet, type DraftWindow } from '@/components/schedule/day-hours-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useSalonStaff } from '@/features/bookings/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { useSalonTimezone } from '@/features/salon/use-salon-timezone';
import {
  useAddScheduleException,
  useCopyWorkingDay,
  useRemoveScheduleException,
  useSalonHours,
  useScheduleExceptions,
  useSetSalonDayHours,
  useSetWorkingDayHours,
  useWorkingHours,
  WEEKDAYS,
  type TimeWindow,
} from '@/features/schedule/queries';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

function weekdayName(weekday: number): string {
  return t(`weekday.${weekday}` as 'weekday.1');
}

/** Którą listę dni edytujemy — salonu czy fryzjera — i który dzień. */
type Editing = { scope: 'salon' | 'staff'; weekday: number };

/**
 * Jeden dzień na liście: nazwa, godziny i „Edytuj".
 *
 * Cały wiersz jest dotykalny, bo na telefonie łatwiej trafić w wiersz niż
 * w napis na jego końcu.
 */
function DayRow({
  weekday,
  windows,
  closedLabel,
  onPress,
}: {
  weekday: number;
  windows: TimeWindow[];
  /** „Zamknięte" dla salonu, „Wolne" dla fryzjera. */
  closedLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${weekdayName(weekday)} — ${t('schedule.edit')}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.minTouchTarget,
        paddingVertical: theme.spacing.sm,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        {weekdayName(weekday)}
      </Text>

      {/* Godziny nie mogą się łamać na dwie linijki — „09:00–18:00" czyta się
          jednym rzutem oka tylko wtedy, gdy stoi w jednym kawałku. */}
      <View style={{ alignItems: 'flex-end' }}>
        {windows.length === 0 ? (
          <Text tone="muted">{closedLabel}</Text>
        ) : (
          windows.map((window) => (
            <Text key={window.id} tone="secondary" numberOfLines={1}>
              {window.from}–{window.to}
            </Text>
          ))
        )}
      </View>

      <Text variant="small" tone="accent">
        {t('schedule.edit')}
      </Text>
    </Pressable>
  );
}

export default function ScheduleScreen() {
  const theme = useTheme();
  const router = useRouter();
  const zone = useSalonTimezone();
  const { data: salon } = useCurrentSalon();
  const { data: staff } = useSalonStaff(salon?.salonId);

  const [staffId, setStaffId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [closedDayOpen, setClosedDayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveStaffId = staffId ?? staff?.[0]?.id ?? null;
  const isOwner = salon?.role === 'owner';

  const { data: salonHours } = useSalonHours(salon?.salonId);
  const { data: workingHours } = useWorkingHours({
    salonId: salon?.salonId,
    staffId: effectiveStaffId,
  });
  const { data: exceptions } = useScheduleExceptions(salon?.salonId);

  const setSalonDay = useSetSalonDayHours();
  const setWorkingDay = useSetWorkingDayHours();
  const addException = useAddScheduleException();
  const removeException = useRemoveScheduleException();
  const copyDay = useCopyWorkingDay();

  const mondayWindows = (workingHours ?? []).filter((window) => window.weekday === 1);

  /** Jednorazowe zamknięcia całego salonu — urlopy fryzjerów są osobnym ekranem. */
  const salonClosures = (exceptions ?? []).filter(
    (exception) => exception.staffId === null && exception.type === 'day_off',
  );

  function windowsFor(scope: 'salon' | 'staff', weekday: number): TimeWindow[] {
    const source = scope === 'salon' ? (salonHours ?? []) : (workingHours ?? []);
    return source.filter((window) => window.weekday === weekday);
  }

  async function saveDay(windows: DraftWindow[]) {
    if (!editing || !salon) return;
    setError(null);

    try {
      if (editing.scope === 'salon') {
        await setSalonDay.mutateAsync({
          salonId: salon.salonId,
          weekday: editing.weekday,
          windows,
        });
      } else {
        await setWorkingDay.mutateAsync({
          salonId: salon.salonId,
          staffId: effectiveStaffId!,
          weekday: editing.weekday,
          windows,
        });
      }
      setEditing(null);
    } catch {
      // Arkusz zostaje otwarty — inaczej wpisane godziny przepadają razem z błędem.
      setError(t('schedule.saveError'));
    }
  }

  /** Data zamknięcia po polsku: „24 gru 2026", zakres ze średnikiem myślnika. */
  function closureLabel(startsOn: string, endsOn: string): string {
    const from = DateTime.fromISO(startsOn).setLocale('pl').toFormat('d LLL yyyy');
    if (startsOn === endsOn) return from;
    return `${from} – ${DateTime.fromISO(endsOn).setLocale('pl').toFormat('d LLL yyyy')}`;
  }

  return (
    <Screen scroll>
      <Text variant="title">{t('schedule.title')}</Text>

      {error ? <Text tone="danger">{error}</Text> : null}

      {isOwner ? (
        <Card>
          <Text variant="heading">{t('schedule.salonHoursTitle')}</Text>
          <Text tone="secondary" variant="small">
            {t('schedule.salonHoursDescription')}
          </Text>

          {WEEKDAYS.map((weekday) => (
            <DayRow
              key={`salon-${weekday}`}
              weekday={weekday}
              windows={windowsFor('salon', weekday)}
              closedLabel={t('schedule.closed')}
              onPress={() => setEditing({ scope: 'salon', weekday })}
            />
          ))}
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">{t('schedule.staffHoursTitle')}</Text>
        <Text tone="secondary" variant="small">
          {t('schedule.staffHoursDescription')}
        </Text>

        {staff && staff.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              {staff.map((member) => (
                <Chip
                  key={member.id}
                  label={member.display_name}
                  selected={effectiveStaffId === member.id}
                  onPress={() => setStaffId(member.id)}
                />
              ))}
            </View>
          </ScrollView>
        ) : null}

        {WEEKDAYS.map((weekday) => (
          <DayRow
            key={`staff-${weekday}`}
            weekday={weekday}
            windows={windowsFor('staff', weekday)}
            closedLabel={t('schedule.dayOff')}
            onPress={() => setEditing({ scope: 'staff', weekday })}
          />
        ))}

        {mondayWindows.length > 0 ? (
          <Button
            label={t('schedule.copyMonday')}
            variant="secondary"
            loading={copyDay.isPending}
            onPress={() =>
              copyDay.mutate({
                salonId: salon!.salonId,
                staffId: effectiveStaffId!,
                source: mondayWindows,
                targetWeekdays: [2, 3, 4, 5],
              })
            }
          />
        ) : null}
      </Card>

      {isOwner ? (
        <Card>
          <Text variant="heading">{t('schedule.closedDayTitle')}</Text>
          <Text tone="secondary" variant="small">
            {t('schedule.closedDayDescription')}
          </Text>

          {salonClosures.map((closure) => (
            <View
              key={closure.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: theme.spacing.sm,
              }}
            >
              <Text>{closureLabel(closure.startsOn, closure.endsOn)}</Text>
              <Button
                label={t('exceptions.remove')}
                variant="secondary"
                disabled={removeException.isPending}
                onPress={() => removeException.mutate(closure.id)}
              />
            </View>
          ))}

          <Button
            label={t('schedule.closedDayPick')}
            variant="secondary"
            loading={addException.isPending}
            onPress={() => setClosedDayOpen(true)}
          />
        </Card>
      ) : null}

      <Button
        label={t('exceptions.title')}
        onPress={() => router.push('/(app)/schedule/exceptions')}
      />

      {editing ? (
        <DayHoursSheet
          // Klucz zeruje stan arkusza przy przejściu na inny dzień.
          key={`${editing.scope}-${editing.weekday}`}
          visible
          title={weekdayName(editing.weekday)}
          windows={windowsFor(editing.scope, editing.weekday)}
          closeDayLabel={
            editing.scope === 'salon' ? t('schedule.closeSalonDay') : t('schedule.setDayOff')
          }
          saving={setSalonDay.isPending || setWorkingDay.isPending}
          saveError={error}
          onClose={() => {
            setEditing(null);
            setError(null);
          }}
          onSave={(windows) => void saveDay(windows)}
        />
      ) : null}

      {closedDayOpen ? (
        <DateRangeSheet
          visible
          initial={DateTime.now().setZone(zone)}
          zone={zone}
          onClose={() => setClosedDayOpen(false)}
          onPick={(range) => {
            setClosedDayOpen(false);
            setError(null);
            addException.mutate(
              {
                salonId: salon!.salonId,
                staffId: null,
                type: 'day_off',
                startsOn: range.from.toISODate()!,
                endsOn: range.to.toISODate()!,
                reason: t('schedule.closedDayReason'),
              },
              { onError: () => setError(t('exceptions.saveError')) },
            );
          }}
        />
      ) : null}
    </Screen>
  );
}
