import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useSalonStaff } from '@/features/bookings/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import {
  useAddSalonHours,
  useAddWorkingHours,
  useCopyWorkingDay,
  useRemoveSalonHours,
  useRemoveWorkingHours,
  useSalonHours,
  useWorkingHours,
  WEEKDAYS,
  type TimeWindow,
} from '@/features/schedule/queries';
import { t } from '@/i18n';
import { useTheme } from '@/theme';

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

function weekdayName(weekday: number): string {
  return t(`weekday.${weekday}` as 'weekday.1');
}

function normalize(value: string): string | null {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

/** Jeden dzień tygodnia z oknami pracy i możliwością dodania kolejnego. */
function DayRow({
  weekday,
  windows,
  onAdd,
  onRemove,
  busy,
}: {
  weekday: number;
  windows: TimeWindow[];
  onAdd: (from: string, to: string) => void;
  onRemove: (id: string) => void;
  busy: boolean;
}) {
  const theme = useTheme();
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('17:00');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const start = normalize(from);
    const end = normalize(to);

    if (!start || !end) return setError(t('schedule.badTime'));
    if (end <= start) return setError(t('schedule.badRange'));

    setError(null);
    onAdd(start, end);
    setAdding(false);
  }

  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Text variant="bodyStrong">{weekdayName(weekday)}</Text>

      {windows.length === 0 ? (
        <Text tone="muted" variant="small">
          {t('schedule.dayOff')}
        </Text>
      ) : (
        windows.map((window) => (
          <View
            key={window.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.sm,
            }}
          >
            <Text>
              {window.from}–{window.to}
            </Text>
            <Button
              label={t('schedule.removeWindow')}
              variant="secondary"
              disabled={busy}
              onPress={() => onRemove(window.id)}
            />
          </View>
        ))
      )}

      {adding ? (
        <>
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <Input label={t('schedule.from')} value={from} onChangeText={setFrom} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('schedule.to')} value={to} onChangeText={setTo} />
            </View>
          </View>
          {error ? <Text tone="danger" variant="small">{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Button label={t('common.save')} style={{ flex: 1 }} onPress={submit} />
            <Button
              label={t('common.cancel')}
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => setAdding(false)}
            />
          </View>
        </>
      ) : (
        <Button
          label={t('schedule.addWindow')}
          variant="secondary"
          onPress={() => setAdding(true)}
        />
      )}
    </Card>
  );
}

export default function ScheduleScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();
  const { data: staff } = useSalonStaff(salon?.salonId);

  const [staffId, setStaffId] = useState<string | null>(null);
  const [showSalonHours, setShowSalonHours] = useState(false);

  const effectiveStaffId = staffId ?? staff?.[0]?.id ?? null;
  const isOwner = salon?.role === 'owner';

  const { data: salonHours } = useSalonHours(salon?.salonId);
  const { data: workingHours } = useWorkingHours({
    salonId: salon?.salonId,
    staffId: effectiveStaffId,
  });

  const addSalonHours = useAddSalonHours();
  const removeSalonHours = useRemoveSalonHours();
  const addWorkingHours = useAddWorkingHours();
  const removeWorkingHours = useRemoveWorkingHours();
  const copyDay = useCopyWorkingDay();

  const mondayWindows = (workingHours ?? []).filter((window) => window.weekday === 1);

  return (
    <Screen scroll>
      <Text variant="title">{t('schedule.title')}</Text>

      {isOwner ? (
        <Card>
          <Text variant="heading">{t('schedule.salonHoursTitle')}</Text>
          <Text tone="secondary" variant="small">
            {t('schedule.salonHoursDescription')}
          </Text>
          <Button
            label={showSalonHours ? t('schedule.hideSalonHours') : t('schedule.showSalonHours')}
            variant="secondary"
            onPress={() => setShowSalonHours(!showSalonHours)}
          />
        </Card>
      ) : null}

      {isOwner && showSalonHours
        ? WEEKDAYS.map((weekday) => (
            <DayRow
              key={`salon-${weekday}`}
              weekday={weekday}
              windows={(salonHours ?? []).filter((window) => window.weekday === weekday)}
              busy={addSalonHours.isPending || removeSalonHours.isPending}
              onAdd={(from, to) =>
                addSalonHours.mutate({ salonId: salon!.salonId, weekday, from, to })
              }
              onRemove={(id) => removeSalonHours.mutate(id)}
            />
          ))
        : null}

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

      <Text variant="heading">{t('schedule.staffHoursTitle')}</Text>
      <Text tone="secondary" variant="small">
        {t('schedule.staffHoursDescription')}
      </Text>

      {WEEKDAYS.map((weekday) => (
        <DayRow
          key={`staff-${weekday}`}
          weekday={weekday}
          windows={(workingHours ?? []).filter((window) => window.weekday === weekday)}
          busy={addWorkingHours.isPending || removeWorkingHours.isPending}
          onAdd={(from, to) =>
            addWorkingHours.mutate({
              salonId: salon!.salonId,
              staffId: effectiveStaffId!,
              weekday,
              from,
              to,
            })
          }
          onRemove={(id) => removeWorkingHours.mutate(id)}
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

      <Button
        label={t('exceptions.title')}
        onPress={() => router.push('/(app)/schedule/exceptions')}
      />

      <Button
        label={t('common.back')}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)'))}
      />
    </Screen>
  );
}
