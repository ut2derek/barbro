import { useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useClientSearch, useCreateClient } from '@/features/clients/queries';
import { useAvailableSlots, useCreateBooking, useSalonStaff } from '@/features/bookings/queries';
import { useCurrentSalon } from '@/features/salon/use-current-salon';
import { useServices } from '@/features/services/queries';
import { t } from '@/i18n';
import { formatDuration, formatFullDate, formatPrice, formatTime } from '@/lib/format';
import { useTheme } from '@/theme';

const ZONE = 'Europe/Warsaw';

/**
 * Ręczne dopisanie wizyty — klient z ulicy albo umówiony przez telefon.
 * Wolne terminy liczy baza; barber może też wpisać godzinę spoza grafiku,
 * bo w salonie zdarza się kogoś wcisnąć.
 */
export default function NewBookingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: salon } = useCurrentSalon();

  const [staffId, setStaffId] = useState<string | null>(null);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [newClient, setNewClient] = useState({ firstName: '', phone: '', email: '' });
  const [creatingClient, setCreatingClient] = useState(false);
  const [day, setDay] = useState(() => DateTime.now().setZone(ZONE).startOf('day'));
  const [customTime, setCustomTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: staff } = useSalonStaff(salon?.salonId);
  const effectiveStaffId = staffId ?? staff?.[0]?.id ?? null;

  const { data: services } = useServices({ salonId: salon?.salonId, staffId: effectiveStaffId });
  const { data: clients } = useClientSearch({ salonId: salon?.salonId, query: clientQuery });
  const { data: slots } = useAvailableSlots({
    salonId: salon?.salonId,
    serviceIds,
    day,
    zone: ZONE,
    staffId: effectiveStaffId,
    enabled: serviceIds.length > 0,
  });

  const createBooking = useCreateBooking();
  const createClient = useCreateClient();

  const summary = useMemo(() => {
    const chosen = (services ?? []).filter((service) => serviceIds.includes(service.id));
    return {
      minutes: chosen.reduce((sum, s) => sum + s.durationMinutes, 0),
      price: chosen.reduce((sum, s) => sum + s.priceGrosz, 0),
      names: chosen.map((s) => s.name),
    };
  }, [services, serviceIds]);

  function toggleService(id: string) {
    setServiceIds((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
    );
  }

  async function save(startsAt: string) {
    setError(null);

    let finalClientId = clientId;

    try {
      if (!finalClientId) {
        if (!newClient.firstName.trim() || !newClient.phone.trim() || !newClient.email.trim()) {
          setError(t('newBooking.clientRequired'));
          return;
        }
        finalClientId = await createClient.mutateAsync({
          salonId: salon!.salonId,
          firstName: newClient.firstName,
          phone: newClient.phone,
          email: newClient.email,
        });
      }

      const bookingId = await createBooking.mutateAsync({
        salonId: salon!.salonId,
        staffId: effectiveStaffId!,
        clientId: finalClientId,
        serviceIds,
        startsAt,
      });

      router.replace(`/(app)/booking/${bookingId}`);
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      setError(code === '23P01' ? t('newBooking.slotTaken') : t('newBooking.saveError'));
    }
  }

  function saveCustomTime() {
    const match = /^(\d{1,2}):(\d{2})$/.exec(customTime.trim());
    if (!match) {
      setError(t('newBooking.badTime'));
      return;
    }
    const startsAt = day.set({ hour: Number(match[1]), minute: Number(match[2]) }).toISO();
    if (!startsAt) {
      setError(t('newBooking.badTime'));
      return;
    }
    void save(startsAt);
  }

  const ready = serviceIds.length > 0 && (clientId !== null || creatingClient);

  return (
    <Screen scroll>
      <Text variant="title">{t('newBooking.title')}</Text>

      {staff && staff.length > 1 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" tone="secondary">
            {t('newBooking.staff')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              {staff.map((member) => (
                <Chip
                  key={member.id}
                  label={member.display_name}
                  selected={effectiveStaffId === member.id}
                  onPress={() => {
                    setStaffId(member.id);
                    setServiceIds([]);
                  }}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" tone="secondary">
          {t('newBooking.services')}
        </Text>
        {(services ?? []).map((service) => {
          const selected = serviceIds.includes(service.id);
          return (
            <Pressable
              key={service.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              onPress={() => toggleService(service.id)}
              style={{
                minHeight: theme.minTouchTarget,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: selected ? theme.colors.accent : theme.colors.border,
                backgroundColor: selected ? theme.colors.accentMuted : theme.colors.surface,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View>
                <Text variant="bodyStrong">{service.name}</Text>
                <Text variant="small" tone="muted">
                  {formatDuration(service.durationMinutes)}
                </Text>
              </View>
              <Text tone="secondary">{formatPrice(service.priceGrosz)}</Text>
            </Pressable>
          );
        })}

        {serviceIds.length > 0 ? (
          <Text tone="secondary" variant="small">
            {t('newBooking.summary', {
              duration: formatDuration(summary.minutes),
              price: formatPrice(summary.price),
            })}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="label" tone="secondary">
          {t('newBooking.client')}
        </Text>

        {creatingClient ? (
          <Card>
            <Input
              label={t('newBooking.firstName')}
              value={newClient.firstName}
              onChangeText={(firstName) => setNewClient({ ...newClient, firstName })}
            />
            <Input
              label={t('newBooking.phone')}
              value={newClient.phone}
              onChangeText={(phone) => setNewClient({ ...newClient, phone })}
              keyboardType="phone-pad"
            />
            <Input
              label={t('newBooking.email')}
              value={newClient.email}
              onChangeText={(email) => setNewClient({ ...newClient, email })}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Button
              label={t('newBooking.pickExisting')}
              variant="secondary"
              onPress={() => setCreatingClient(false)}
            />
          </Card>
        ) : (
          <>
            <Input
              label={t('newBooking.searchClient')}
              value={clientQuery}
              onChangeText={(value) => {
                setClientQuery(value);
                setClientId(null);
              }}
              placeholder={t('newBooking.searchPlaceholder')}
            />
            {(clients ?? []).slice(0, 6).map((client) => (
              <Pressable
                key={client.id}
                accessibilityRole="button"
                onPress={() => setClientId(client.id)}
                style={{
                  minHeight: theme.minTouchTarget,
                  padding: theme.spacing.md,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: clientId === client.id ? theme.colors.accent : theme.colors.border,
                  backgroundColor:
                    clientId === client.id ? theme.colors.accentMuted : theme.colors.surface,
                }}
              >
                <Text variant="bodyStrong">{client.name}</Text>
                <Text variant="small" tone="muted">
                  {client.phone}
                  {client.noShowCount > 0
                    ? ` · ${t('newBooking.noShows', { count: client.noShowCount })}`
                    : ''}
                </Text>
              </Pressable>
            ))}
            <Button
              label={t('newBooking.newClient')}
              variant="secondary"
              onPress={() => {
                setCreatingClient(true);
                setClientId(null);
              }}
            />
          </>
        )}
      </View>

      {ready ? (
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="label" tone="secondary">
            {t('newBooking.term')}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Button label="‹" variant="secondary" onPress={() => setDay(day.minus({ days: 1 }))} />
            <Text variant="heading" style={{ flex: 1, textAlign: 'center' }}>
              {formatFullDate(day.toISO()!, ZONE)}
            </Text>
            <Button label="›" variant="secondary" onPress={() => setDay(day.plus({ days: 1 }))} />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {(slots ?? []).map((slot) => (
              <Pressable
                key={slot.slot_start}
                accessibilityRole="button"
                onPress={() => void save(slot.slot_start)}
                style={{
                  minHeight: theme.minTouchTarget,
                  minWidth: 88,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: theme.spacing.lg,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                }}
              >
                <Text variant="bodyStrong">{formatTime(slot.slot_start, ZONE)}</Text>
              </Pressable>
            ))}
          </View>

          {(slots ?? []).length === 0 ? (
            <Text tone="muted" variant="small">
              {t('newBooking.noSlots')}
            </Text>
          ) : null}

          <Card>
            <Text variant="label" tone="secondary">
              {t('newBooking.customTimeTitle')}
            </Text>
            <Text variant="small" tone="muted">
              {t('newBooking.customTimeDescription')}
            </Text>
            <Input
              label={t('newBooking.customTime')}
              value={customTime}
              onChangeText={setCustomTime}
              placeholder="18:30"
            />
            <Button
              label={t('newBooking.saveCustom')}
              variant="secondary"
              loading={createBooking.isPending}
              onPress={saveCustomTime}
            />
          </Card>
        </View>
      ) : null}

      {error ? <Text tone="danger">{error}</Text> : null}

      <Button
        label={t('common.cancel')}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)'))}
      />
    </Screen>
  );
}