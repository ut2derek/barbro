import { DateTime } from 'luxon';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useSalonStaff } from '@/features/bookings/queries';
import { useCurrentSalon, useMyStaffId } from '@/features/salon/use-current-salon';
import {
  useAddScheduleException,
  useRemoveScheduleException,
  useScheduleExceptions,
} from '@/features/schedule/queries';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { useSalonTimezone } from '@/features/salon/use-salon-timezone';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Urlopy, dni wolne i dni z innymi godzinami. */
export default function ExceptionsScreen() {
  const zone = useSalonTimezone();
  const theme = useTheme();
  const { data: salon } = useCurrentSalon();
  const { data: staff } = useSalonStaff(salon?.salonId);
  const { data: myStaffId } = useMyStaffId();
  const { data: exceptions } = useScheduleExceptions(salon?.salonId);

  const addException = useAddScheduleException();
  const removeException = useRemoveScheduleException();

  const today = DateTime.now().setZone(zone).toFormat('yyyy-MM-dd');

  const [scope, setScope] = useState<'staff' | 'salon'>('staff');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [type, setType] = useState<'day_off' | 'custom_hours'>('day_off');
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('14:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isOwner = salon?.role === 'owner';
  const effectiveStaffId = isOwner ? (staffId ?? staff?.[0]?.id ?? null) : myStaffId ?? null;

  async function save() {
    setError(null);

    if (!DATE_PATTERN.test(startsOn) || !DATE_PATTERN.test(endsOn)) {
      setError(t('exceptions.badDate'));
      return;
    }
    if (endsOn < startsOn) {
      setError(t('exceptions.badRange'));
      return;
    }

    try {
      await addException.mutateAsync({
        salonId: salon!.salonId,
        staffId: scope === 'salon' ? null : effectiveStaffId,
        type,
        startsOn,
        endsOn,
        startTime: type === 'custom_hours' ? startTime : null,
        endTime: type === 'custom_hours' ? endTime : null,
        reason,
      });
      setReason('');
    } catch {
      setError(t('exceptions.saveError'));
    }
  }

  return (
    <Screen scroll>
      <Text tone="secondary">{t('exceptions.description')}</Text>

      {(exceptions ?? []).length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="heading">{t('exceptions.upcoming')}</Text>
          {(exceptions ?? []).map((exception) => (
            <Card key={exception.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="bodyStrong">
                  {exception.startsOn === exception.endsOn
                    ? exception.startsOn
                    : `${exception.startsOn} – ${exception.endsOn}`}
                </Text>
                <Badge
                  label={
                    exception.type === 'day_off'
                      ? t('exceptions.typeDayOff')
                      : t('exceptions.typeCustom')
                  }
                  tone={exception.type === 'day_off' ? 'danger' : 'warning'}
                />
              </View>
              <Text tone="secondary" variant="small">
                {exception.staffName ?? t('exceptions.wholeSalon')}
                {exception.startTime ? ` · ${exception.startTime}–${exception.endTime}` : ''}
              </Text>
              {exception.reason ? <Text variant="small">{exception.reason}</Text> : null}
              <Button
                label={t('exceptions.remove')}
                variant="secondary"
                onPress={() => removeException.mutate(exception.id)}
              />
            </Card>
          ))}
        </View>
      ) : null}

      <Card style={{ gap: theme.spacing.md }}>
        <Text variant="heading">{t('exceptions.addTitle')}</Text>

        {isOwner ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Chip
              label={t('exceptions.scopeStaff')}
              selected={scope === 'staff'}
              onPress={() => setScope('staff')}
            />
            <Chip
              label={t('exceptions.scopeSalon')}
              selected={scope === 'salon'}
              onPress={() => setScope('salon')}
            />
          </View>
        ) : null}

        {isOwner && scope === 'staff' && staff && staff.length > 1 ? (
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

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Chip
            label={t('exceptions.typeDayOff')}
            selected={type === 'day_off'}
            onPress={() => setType('day_off')}
          />
          <Chip
            label={t('exceptions.typeCustom')}
            selected={type === 'custom_hours'}
            onPress={() => setType('custom_hours')}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input
              label={t('exceptions.startsOn')}
              value={startsOn}
              onChangeText={setStartsOn}
              placeholder="2026-12-24"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label={t('exceptions.endsOn')}
              value={endsOn}
              onChangeText={setEndsOn}
              placeholder="2026-12-26"
            />
          </View>
        </View>

        {type === 'custom_hours' ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <Input label={t('schedule.from')} value={startTime} onChangeText={setStartTime} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label={t('schedule.to')} value={endTime} onChangeText={setEndTime} />
            </View>
          </View>
        ) : null}

        <Input
          label={t('exceptions.reason')}
          value={reason}
          onChangeText={setReason}
          placeholder={t('exceptions.reasonPlaceholder')}
        />

        {error ? <Text tone="danger">{error}</Text> : null}

        <Button label={t('exceptions.add')} loading={addException.isPending} onPress={() => void save()} />
      </Card>

    </Screen>
  );
}
