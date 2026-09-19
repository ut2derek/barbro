import { DateTime } from 'luxon';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import {
  useCreateTimeBlock,
  useDayTimeBlocks,
  useDeleteTimeBlock,
  useSalonStaff,
} from '@/features/bookings/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { t } from '@/i18n';
import { formatFullDate, formatTimeRange } from '@/lib/format';
import { useTheme } from '@/theme';
import { useSalonTimezone } from '@/features/salon/use-salon-timezone';

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/** Blokada czasu — dostawa, wizyta u lekarza, przerwa. Zajmuje termin tak jak wizyta. */
export default function TimeBlockScreen() {
  const zone = useSalonTimezone();
  const theme = useTheme();
  const { data: salon } = useCurrentSalon();
  const { data: staff } = useSalonStaff(salon?.salonId);

  const [staffId, setStaffId] = useState<string | null>(null);
  const [day, setDay] = useState(() => DateTime.now().setZone(zone).startOf('day'));
  const [from, setFrom] = useState('12:00');
  const [to, setTo] = useState('13:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const effectiveStaffId = staffId ?? staff?.[0]?.id ?? null;

  const { data: blocks } = useDayTimeBlocks({
    salonId: salon?.salonId,
    zone: zone,
    day,
    staffId: effectiveStaffId,
  });
  const createBlock = useCreateTimeBlock();
  const deleteBlock = useDeleteTimeBlock();

  function parse(value: string): DateTime | null {
    const match = TIME_PATTERN.exec(value.trim());
    if (!match) return null;
    return day.set({ hour: Number(match[1]), minute: Number(match[2]), second: 0, millisecond: 0 });
  }

  async function save() {
    setError(null);

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

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Button label="‹" variant="secondary" onPress={() => setDay(day.minus({ days: 1 }))} />
        <Text variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          {formatFullDate(day.toISO()!, zone)}
        </Text>
        <Button label="›" variant="secondary" onPress={() => setDay(day.plus({ days: 1 }))} />
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <View style={{ flex: 1 }}>
          <Input label={t('timeBlock.from')} value={from} onChangeText={setFrom} placeholder="12:00" />
        </View>
        <View style={{ flex: 1 }}>
          <Input label={t('timeBlock.to')} value={to} onChangeText={setTo} placeholder="13:00" />
        </View>
      </View>

      <Input
        label={t('timeBlock.reason')}
        value={reason}
        onChangeText={setReason}
        placeholder={t('timeBlock.reasonPlaceholder')}
      />

      {error ? <Text tone="danger">{error}</Text> : null}

      <Button label={t('timeBlock.save')} loading={createBlock.isPending} onPress={() => void save()} />

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

    </Screen>
  );
}
