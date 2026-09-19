import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Switch, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useClient, useClientBookings, useUpdateClient } from '@/features/clients/queries';
import { statusLabel, statusTone } from '@/features/bookings/status';
import type { BookingStatus } from '@/features/bookings/queries';
import { t } from '@/i18n';
import { formatFullDate, formatPrice, formatTimeRange } from '@/lib/format';
import { useTheme } from '@/theme';

const ZONE = 'Europe/Warsaw';

/** Karta klienta: kontakt, notatka salonu i pełna historia wizyt. */
export default function ClientScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: client, isPending } = useClient(id);
  const { data: bookings } = useClientBookings(id);
  const updateClient = useUpdateClient();

  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    if (client) setNote(client.internalNote ?? '');
  }, [client]);

  if (isPending || !client) {
    return (
      <Screen>
        <Text tone="muted">{t('common.loading')}</Text>
      </Screen>
    );
  }

  const completed = (bookings ?? []).filter((booking) => booking.status === 'completed');
  const spent = completed.reduce((sum, booking) => sum + booking.totalPriceGrosz, 0);

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">{client.name}</Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          {client.blocked ? <Badge label={t('clients.blocked')} tone="danger" /> : null}
          {client.noShowCount > 0 ? (
            <Badge label={t('clients.noShows', { count: client.noShowCount })} tone="warning" />
          ) : null}
        </View>
      </View>

      <Card>
        <Text tone="secondary">{client.phone}</Text>
        <Text tone="secondary">{client.email}</Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Button
            label={t('booking.call')}
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => void Linking.openURL(`tel:${client.phone.replace(/\s/g, '')}`)}
          />
          <Button
            label={t('clients.bookAgain')}
            style={{ flex: 1 }}
            onPress={() => router.push('/(app)/new-booking')}
          />
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Card style={{ flex: 1 }}>
          <Text variant="label" tone="secondary">
            {t('clients.visitsDone')}
          </Text>
          <Text variant="title">{completed.length}</Text>
        </Card>
        <Card style={{ flex: 1 }}>
          <Text variant="label" tone="secondary">
            {t('clients.totalSpent')}
          </Text>
          <Text variant="title">{formatPrice(spent)}</Text>
        </Card>
      </View>

      <Card>
        <Text variant="heading">{t('clients.note')}</Text>
        <Text variant="small" tone="muted">
          {t('clients.noteHint')}
        </Text>
        <Input
          label={t('clients.note')}
          value={note}
          onChangeText={(value) => {
            setNote(value);
            setNoteSaved(false);
          }}
          multiline
          numberOfLines={3}
          placeholder={t('clients.notePlaceholder')}
        />
        {noteSaved ? <Text tone="success" variant="small">{t('settings.saved')}</Text> : null}
        <Button
          label={t('common.save')}
          variant="secondary"
          loading={updateClient.isPending}
          onPress={async () => {
            await updateClient.mutateAsync({ clientId: id, internalNote: note });
            setNoteSaved(true);
          }}
        />
      </Card>

      <Card>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: theme.minTouchTarget,
          }}
        >
          <Text style={{ flex: 1 }}>{t('clients.blockClient')}</Text>
          <Switch
            value={client.blocked}
            onValueChange={(blocked) => updateClient.mutate({ clientId: id, blocked })}
          />
        </View>
        <Text variant="small" tone="muted">
          {t('clients.blockHint')}
        </Text>
      </Card>

      <Text variant="heading">{t('clients.history')}</Text>

      {(bookings ?? []).length === 0 ? (
        <Text tone="muted">{t('clients.noHistory')}</Text>
      ) : (
        (bookings ?? []).map((booking) => (
          <Card key={booking.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyStrong">{formatFullDate(booking.startsAt, ZONE)}</Text>
              <Badge
                label={statusLabel(booking.status as BookingStatus)}
                tone={statusTone(booking.status as BookingStatus)}
              />
            </View>
            <Text tone="secondary" variant="small">
              {formatTimeRange(booking.startsAt, booking.endsAt, ZONE)} · {booking.staffName}
            </Text>
            <Text variant="small">{booking.services.join(' + ')}</Text>
            <Text variant="small" tone="secondary">
              {formatPrice(booking.totalPriceGrosz)}
            </Text>
          </Card>
        ))
      )}

      <Button
        label={t('common.back')}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/(tabs)/clients'))}
      />
    </Screen>
  );
}
