import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { Linking, Pressable, ScrollView, Switch, View } from 'react-native';

import { BookingPhotos } from '@/components/bookings/booking-photos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useBookingPhotos } from '@/features/bookings/photos';
import { useClient, useClientBookings, useUpdateClient } from '@/features/clients/queries';
import { useCurrentSalon, useMyStaffId } from '@/features/salon/use-current-salon';
import { statusLabel, statusTone } from '@/features/bookings/status';
import type { BookingStatus } from '@/features/bookings/queries';
import { useSalonTimezone } from '@/features/salon/use-salon-timezone';
import { t } from '@/i18n';
import { useAutosave } from '@/lib/use-autosave';
import { useSyncedForm } from '@/lib/use-synced-form';
import { formatDayAndTime, formatPrice } from '@/lib/format';
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

  const { data: salon } = useCurrentSalon();
  const { data: myStaffId } = useMyStaffId();

  // Zdjęcia całej historii jednym zapytaniem — patrz `useBookingPhotos`.
  const { data: photos, isPending: photosPending } = useBookingPhotos(
    (bookings ?? []).map((booking) => booking.id),
  );

  /** Właściciel prowadzi każdą wizytę, pracownik tylko swoje. */
  function mogeZmieniac(staffId: string | null): boolean {
    return salon?.role === 'owner' || (staffId !== null && staffId === myStaffId);
  }

  // Notatka wypełnia się danymi klienta, ale odświeżenie listy nie kasuje
  // tego, co barber właśnie pisze.
  const [note, setNote] = useSyncedForm(client, client?.id, (c) => c.internalNote ?? '', '');
  const noteStatus = useAutosave({
    value: note,
    saved: client?.internalNote ?? '',
    save: (internalNote) => updateClient.mutateAsync({ clientId: id, internalNote }),
  });

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
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          placeholder={t('clients.notePlaceholder')}
        />

        {/* Jedna linijka, która zawsze mówi, co się dzieje z tekstem — bez niej
            autozapis byłby niewidoczny i barber nie wiedziałby, czy notatka
            jest już bezpieczna. */}
        {noteStatus === 'saving' || noteStatus === 'pending' ? (
          <Text variant="small" tone="muted">
            {t('clients.noteSaving')}
          </Text>
        ) : noteStatus === 'saved' ? (
          <Text variant="small" tone="success">
            {t('clients.noteSaved')}
          </Text>
        ) : noteStatus === 'error' ? (
          <Text variant="small" tone="danger">
            {t('clients.noteError')}
          </Text>
        ) : (
          <Text variant="small" tone="muted">
            {t('clients.noteAutosave')}
          </Text>
        )}
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
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {formatDayAndTime(booking.startsAt, booking.endsAt, zone).day}{' '}
                <Text variant="body" tone="secondary">
                  {formatDayAndTime(booking.startsAt, booking.endsAt, zone).time}
                </Text>
              </Text>
              <Badge
                label={statusLabel(booking.status as BookingStatus)}
                tone={statusTone(booking.status as BookingStatus)}
              />
            </View>
            <Text tone="secondary" variant="small">
              {booking.staffName}
            </Text>
            <Text variant="small">{booking.services.join(' + ')}</Text>
            <Text variant="small" tone="secondary">
              {formatPrice(booking.totalPriceGrosz)}
            </Text>

            <BookingPhotos
              bookingId={booking.id}
              salonId={salon?.salonId}
              photos={photos?.[booking.id] ?? []}
              loading={photosPending}
              canEdit={mogeZmieniac(booking.staffId)}
            />
          </Card>
        ))
      )}
    </Screen>
  );
}