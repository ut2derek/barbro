import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { DateRangeSheet } from '@/components/schedule/date-range-sheet';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import {
  useCreateTimeBlock,
  useDayTimeBlocks,
  useDeleteTimeBlock,
  useSalonStaff,
} from '@/features/bookings/queries';
import { useAddScheduleException } from '@/features/schedule/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { useSalonTimezone } from '@/features/salon/use-salon-timezone';
import { t } from '@/i18n';
import { formatFullDate, formatTimeRange } from '@/lib/format';
import { useTheme } from '@/theme';

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/** Blokada czasu — dostawa, wizyta u lekarza, przerwa. Zajmuje termin tak jak wizyta. */
export default function TimeBlockScreen() {
  const zone = useSalonTimezone();
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();
  const { data: staff } = useSalonStaff(salon?.salonId);

  const [staffId, setStaffId] = useState<string | null>(null);
  const [day, setDay] = useState<DateTime<boolean>>(() =>
    DateTime.now().setZone(zone).startOf('day'),
  );
  const [from, setFrom] = useState('12:00');
  const [to, setTo] = useState('13:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  /** Ostatni dzień nieobecności. Równy `day` = zwykła blokada godzin na jeden dzień. */
  const [lastDay, setLastDay] = useState<DateTime<boolean> | null>(null);
  const [saved, setSaved] = useState(false);

  const effectiveStaffId = staffId ?? staff?.[0]?.id ?? null;

  const { data: blocks } = useDayTimeBlocks({
    salonId: salon?.salonId,
    zone: zone,
    day,
    staffId: effectiveStaffId,
  });
  const createBlock = useCreateTimeBlock();
  const deleteBlock = useDeleteTimeBlock();
  const addException = useAddScheduleException();

  /** Kilka dni to nie przerwa w ciągu dnia, tylko nieobecność — inny wpis w grafiku. */
  const manyDays = lastDay !== null && !lastDay.hasSame(day, 'day');

  function parse(value: string): DateTime | null {
    const match = TIME_PATTERN.exec(value.trim());
    if (!match) return null;
    return day.set({ hour: Number(match[1]), minute: Number(match[2]), second: 0, millisecond: 0 });
  }

  async function save() {
    setError(null);
    setSaved(false);

    if (manyDays) {
      try {
        await addException.mutateAsync({
          salonId: salon!.salonId,
          staffId: effectiveStaffId,
          type: 'day_off',
          startsOn: day.toISODate()!,
          endsOn: lastDay!.toISODate()!,
          reason,
        });
        setReason('');
        setLastDay(null);
        setSaved(true);
      } catch {
        setError(t('timeBlock.saveError'));
      }
      return;
    }

    const start = parse(from);
    const end = parse(to);

    if (!start || !end) {
      setError(t('timeBlock.badTime'));
      return;
    }
    if (end <= start) {
      setError(t('timeBlock.badRange'));
      return;
    }

    try {
      await createBlock.mutateAsync({
        salonId: salon!.salonId,
        staffId: effectiveStaffId!,
        startsAt: start.toISO()!,
        endsAt: end.toISO()!,
        reason,
      });
      setReason('');
    } catch {
      setError(t('timeBlock.saveError'));
    }
  }

  return (
    <Screen scroll>
      <Text variant="title">{t('timeBlock.title')}</Text>
      <Text tone="secondary">{t('timeBlock.description')}</Text>

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

      {/* Strzałki do przeskakiwania po dniach zostają — nieobecność „na dziś”
          to najczęstszy przypadek. Ikona kalendarza otwiera pełny miesiąc,
          żeby dało się zaznaczyć urlop za miesiąc bez klikania dzień po dniu. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <IconButton
          glyph="‹"
          label={t('calendar.previousDay')}
          onPress={() => {
            setDay(day.minus({ days: 1 }));
            setLastDay(null);
          }}
        />
        <Text variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          {manyDays
            ? t('timeBlock.absenceRange', {
                from: day.setLocale('pl').toFormat('d LLL'),
                to: lastDay!.setLocale('pl').toFormat('d LLL'),
              })
            : formatFullDate(day.toISO()!, zone)}
        </Text>
        <IconButton
          glyph="›"
          label={t('calendar.nextDay')}
          onPress={() => {
            setDay(day.plus({ days: 1 }));
            setLastDay(null);
          }}
        />
        <IconButton
          glyph="🗓"
          label={t('calendarRange.openCalendar')}
          onPress={() => setCalendarOpen(true)}
        />
      </View>

      {manyDays ? (
        <Text tone="secondary" variant="small">
          {t('timeBlock.rangeHint')}
        </Text>
      ) : null}

      {/* Godziny dotyczą przerwy w ciągu dnia. Przy nieobecności na kilka dni
          nie ma czego wpisywać — wtedy znika cały wiersz. */}
      {manyDays ? null : (
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input
              label={t('timeBlock.from')}
              value={from}
              onChangeText={setFrom}
              placeholder="12:00"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input label={t('timeBlock.to')} value={to} onChangeText={setTo} placeholder="13:00" />
          </View>
        </View>
      )}

      <Input
        label={t('timeBlock.reason')}
        value={reason}
        onChangeText={setReason}
        placeholder={t('timeBlock.reasonPlaceholder')}
      />

      {error ? <Text tone="danger">{error}</Text> : null}
      {saved ? <Text tone="success">{t('timeBlock.absenceSaved')}</Text> : null}

      <Button
        label={manyDays ? t('timeBlock.saveAbsence') : t('timeBlock.save')}
        loading={createBlock.isPending || addException.isPending}
        onPress={() => void save()}
      />

      {(blocks ?? []).length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" tone="secondary">
            {t('timeBlock.existing')}
          </Text>
          {(blocks ?? []).map((block) => (
            <Card key={block.id}>
              <Text variant="bodyStrong">
                {formatTimeRange(block.startsAt, block.endsAt, zone)}
              </Text>
              <Text tone="secondary" variant="small">
                {block.reason ?? t('timeBlock.noReason')}
              </Text>
              <Button
                label={t('timeBlock.remove')}
                variant="secondary"
                loading={deleteBlock.isPending}
                onPress={() => void deleteBlock.mutateAsync(block.id)}
              />
            </Card>
          ))}
        </View>
      ) : null}

      <Button
        label={t('common.back')}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />

      <DateRangeSheet
        // Klucz sprawia, że kalendarz otwiera się na oglądanym dniu za każdym razem.
        key={day.toISODate() ?? 'kalendarz'}
        visible={calendarOpen}
        initial={day}
        zone={zone}
        onClose={() => setCalendarOpen(false)}
        onPick={(range) => {
          setDay(range.from);
          setLastDay(range.to.hasSame(range.from, 'day') ? null : range.to);
          setSaved(false);
          setCalendarOpen(false);
        }}
      />
    </Screen>
  );
}