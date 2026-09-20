import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Switch, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useClient, useClientBookings, useUpdateClient } from '@/features/clients/queries';
import { statusLabel, statusTone } from '@/features/bookings/status';
import type { BookingStatus } from '@/features/bookings/queries';
import { useSalonTimezone } from '@/features/salon/use-salon-timezone';
import { t } from '@/i18n';
import { useSyncedForm } from '@/lib/use-synced-form';
import { formatFullDate, formatPrice, formatTimeRange } from '@/lib/format';
import { useTheme } from '@/theme';

/** Karta klienta: kontakt, notatka salonu i pełna historia wizyt. */
export default function ClientScreen() {
  const zone = useSalonTimezone();
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: client, isPending } = useClient(id);
  const { data: bookings } = useClientBookings(id);
  const updateClient = useUpdateClient();

  // Notatka wypełnia się danymi klienta, ale odświeżenie listy nie kasuje
  // tego, co barber właśnie pisze.
  const [note, setNote] = useSyncedForm(client, client?.id, (c) => c.internalNote ?? '', '');
  const [noteSaved, setNoteSaved] = useState(false);

  // Historia siedzi na samym dole karty klienta, za notatką i ustawieniami.
  // Kafelek „Wizyty" jest do niej skrótem, żeby barber nie przewijał w ciemno.
  //
  // Pozycję mierzymy dopiero przy dotknięciu, a nie przez `onLayout` przy
  // rysowaniu: na webie to zdarzenie potrafi nie przyjść i odnośnik cicho
  // przestaje działać. Gdyby pomiar zawiódł, zjeżdżamy na sam dół — historia
  // i tak jest ostatnią sekcją.
  const scrollRef = useRef<ScrollView>(null);
  const historyRef = useRef<View>(null);

  function showHistory() {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const toEnd = () => scroller.scrollToEnd({ animated: true });

    if (!historyRef.current) {
      toEnd();
      return;
    }

    historyRef.current.measureLayout(
      scroller.getScrollableNode(),
      (_x, y) => scroller.scrollTo({ y: Math.max(y - 16, 0), animated: true }),
      toEnd,
    );
  }

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
    <Screen scroll scrollRef={scrollRef}>
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('clients.goToHistory')}
          style={{ flex: 1 }}
          onPress={showHistory}
        >
          <Card>
            <Text variant="label" tone="secondary">
              {t('clients.visitsDone')}
            </Text>
            <Text variant="title">{completed.length}</Text>
            <Text variant="small" tone="accent">
              {t('clients.goToHistory')}
            </Text>
          </Card>
        </Pressable>
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

      <View ref={historyRef}>
        <Text variant="heading">{t('clients.history')}</Text>
      </View>

      {(bookings ?? []).length === 0 ? (
        <Text tone="muted">{t('clients.noHistory')}</Text>
      ) : (
        (bookings ?? []).map((booking) => (
          <Card key={booking.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyStrong">{formatFullDate(booking.startsAt, zone)}</Text>
              <Badge
                label={statusLabel(booking.status as BookingStatus)}
                tone={statusTone(booking.status as BookingStatus)}
              />
            </View>
            <Text tone="secondary" variant="small">
              {formatTimeRange(booking.startsAt, booking.endsAt, zone)} · {booking.staffName}
            </Text>
            <Text variant="small">{booking.services.join(' + ')}</Text>
            <Text variant="small" tone="secondary">
              {formatPrice(booking.totalPriceGrosz)}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}