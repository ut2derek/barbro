import { useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { SalonHeader } from '@/components/public/salon-header';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import {
  useCreatePublicBooking,
  usePublicCatalog,
  usePublicSlots,
  type PublicBookingResult,
} from '@/features/public-booking/queries';
import { t } from '@/i18n';
import { formatDuration, formatFullDate, formatPrice, formatTime } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Strona rezerwacji dla klienta — wersja podglądowa w aplikacji.
 *
 * Nie wymaga logowania i nie dotyka bazy: wszystko idzie przez funkcję
 * serwerową, z której skorzysta też docelowa strona rezerwacji salonu.
 */
export default function PublicBookingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { data: catalog, isPending, error } = usePublicCatalog(slug);
  const createBooking = useCreatePublicBooking();

  const zone = catalog?.salon.timezone ?? 'Europe/Warsaw';

  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [day, setDay] = useState(() => DateTime.now().setZone('Europe/Warsaw').startOf('day'));
  const [form, setForm] = useState({ firstName: '', phone: '', email: '', note: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<PublicBookingResult | null>(null);
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);

  const { data: slots, isPending: slotsPending } = usePublicSlots({
    slug,
    serviceIds,
    day,
    staffId,
    enabled: serviceIds.length > 0,
  });

  /** Fryzjerzy wykonujący wszystkie wybrane usługi. */
  const availableStaff = useMemo(() => {
    if (!catalog) return [];
    return catalog.staff.filter((member) =>
      serviceIds.every((serviceId) => member.serviceIds.includes(serviceId)),
    );
  }, [catalog, serviceIds]);

  const summary = useMemo(() => {
    const chosen = (catalog?.services ?? []).filter((service) => serviceIds.includes(service.id));
    return {
      minutes: chosen.reduce((sum, service) => sum + service.durationMinutes, 0),
      price: chosen.reduce((sum, service) => sum + service.priceGrosz, 0),
    };
  }, [catalog, serviceIds]);

  function toggleService(id: string) {
    setServiceIds((current) =>
      current.includes(id) ? current.filter((serviceId) => serviceId !== id) : [...current, id],
    );
    setStaffId(null);
    setPendingSlot(null);
  }

  async function submit() {
    setFormError(null);

    if (!form.firstName.trim() || !form.phone.trim() || !form.email.trim()) {
      setFormError(t('publicBooking.dataRequired'));
      return;
    }
    if (!pendingSlot) {
      setFormError(t('publicBooking.pickSlotFirst'));
      return;
    }

    try {
      const result = await createBooking.mutateAsync({
        slug: slug!,
        serviceIds,
        startsAt: pendingSlot,
        staffId,
        client: {
          firstName: form.firstName,
          email: form.email,
          phone: form.phone,
        },
        note: form.note,
      });
      setConfirmed(result);
    } catch (cause) {
      setFormError((cause as Error).message || t('publicBooking.bookingError'));
    }
  }

  if (isPending) {
    return (
      <Screen>
        <Text tone="muted">{t('common.loading')}</Text>
      </Screen>
    );
  }

  if (error || !catalog) {
    return (
      <Screen>
        <Text variant="title">{t('publicBooking.notFoundTitle')}</Text>
        <Text tone="secondary">{t('publicBooking.notFoundDescription')}</Text>
      </Screen>
    );
  }

  if (confirmed) {
    const booking = confirmed.booking;

    return (
      <Screen scroll>
        <Text variant="display">{t('publicBooking.confirmedTitle')}</Text>
        <Card>
          <Text variant="heading">{formatFullDate(booking.startsAt, zone)}</Text>
          <Text variant="title">
            {formatTime(booking.startsAt, zone)}–{formatTime(booking.endsAt, zone)}
          </Text>
          <Text tone="secondary">{booking.staffName}</Text>
          <Text variant="bodyStrong">{formatPrice(booking.totalPriceGrosz)}</Text>
        </Card>

        <Card>
          <Text variant="heading">{t('publicBooking.whatNextTitle')}</Text>
          <Text tone="secondary">{t('publicBooking.whatNextDescription')}</Text>
          {__DEV__ && confirmed.devConfirmationPath ? (
            <>
              <Text variant="small" tone="warning">
                {t('publicBooking.mailNotReady')}
              </Text>
              <Button
                label={t('publicBooking.openConfirmationLink')}
                onPress={() => router.push(confirmed.devConfirmationPath as '/')}
              />
            </>
          ) : null}
        </Card>

        {catalog.salon.cancellationPolicy ? (
          <Card>
            <Text variant="label" tone="secondary">
              {t('publicBooking.policy')}
            </Text>
            <Text variant="small">{catalog.salon.cancellationPolicy}</Text>
          </Card>
        ) : null}

        <Button
          label={t('publicBooking.bookAnother')}
          variant="secondary"
          onPress={() => {
            setConfirmed(null);
            setServiceIds([]);
            setPendingSlot(null);
            setForm({ firstName: '', phone: '', email: '', note: '' });
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <SalonHeader
        name={catalog.salon.name}
        address={catalog.salon.address}
        logoUrl={catalog.salon.logoUrl}
        coverUrl={catalog.salon.coverUrl}
        brandColor={catalog.salon.brandColor}
      />

      {!catalog.salon.onlineBookingEnabled ? (
        <Card>
          <Text variant="heading">{t('publicBooking.disabledTitle')}</Text>
          <Text tone="secondary">
            {t('publicBooking.disabledDescription', { phone: catalog.salon.phone ?? '' })}
          </Text>
        </Card>
      ) : (
        <>
          <Text variant="heading">{t('publicBooking.stepServices')}</Text>

          <Text variant="small" tone="muted">
            {t('publicBooking.servicesHint')}
          </Text>

          {catalog.services.map((service) => {
            const selected = serviceIds.includes(service.id);
            return (
              // Kafelek jest kontenerem: treść przełącza wybór, przycisk obok
              // umawia od razu tę jedną usługę.
              <View
                key={service.id}
                style={{
                  padding: theme.spacing.lg,
                  borderRadius: theme.radius.lg,
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                  backgroundColor: selected ? theme.colors.accentMuted : theme.colors.surface,
                  gap: theme.spacing.sm,
                }}
              >
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={t('publicBooking.toggleService', { name: service.name })}
                  onPress={() => toggleService(service.id)}
                  style={{ gap: theme.spacing.xxs }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {service.name}
                    </Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="bodyStrong">{formatPrice(service.priceGrosz)}</Text>
                      {service.promoActive ? (
                        <Text
                          variant="small"
                          tone="muted"
                          style={{ textDecorationLine: 'line-through' }}
                        >
                          {formatPrice(service.regularPriceGrosz)}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <Text variant="small" tone="muted">
                    {formatDuration(service.durationMinutes)}
                    {service.categoryName ? ` · ${service.categoryName}` : ''}
                  </Text>

                  {service.description ? (
                    <Text variant="small" tone="secondary">
                      {service.description}
                    </Text>
                  ) : null}

                  {/* Wymóg ustawy o informowaniu o cenach. */}
                  {service.promoActive && service.lowestPriceBeforePromoGrosz !== null ? (
                    <Text variant="small" tone="muted">
                      {t('services.lowestPrice', {
                        price: formatPrice(service.lowestPriceBeforePromoGrosz),
                      })}
                    </Text>
                  ) : null}
                </Pressable>

                <Button
                  label={
                    selected && serviceIds.length === 1
                      ? t('publicBooking.serviceChosen', { price: formatPrice(service.priceGrosz) })
                      : selected
                        ? t('publicBooking.bookOnlyThis', { price: formatPrice(service.priceGrosz) })
                        : t('publicBooking.bookService', { price: formatPrice(service.priceGrosz) })
                  }
                  variant={selected && serviceIds.length === 1 ? 'secondary' : 'primary'}
                  disabled={selected && serviceIds.length === 1}
                  onPress={() => {
                    setServiceIds([service.id]);
                    setStaffId(null);
                    setPendingSlot(null);
                  }}
                />
              </View>
            );
          })}

          {serviceIds.length > 0 ? (
            <>
              <Text tone="secondary">
                {t('publicBooking.summary', {
                  duration: formatDuration(summary.minutes),
                  price: formatPrice(summary.price),
                })}
              </Text>

              <Text variant="heading">{t('publicBooking.stepStaff')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                <Chip
                  label={t('publicBooking.anyStaff')}
                  selected={staffId === null}
                  onPress={() => {
                    setStaffId(null);
                    setPendingSlot(null);
                  }}
                />
                {availableStaff.map((member) => (
                  <Chip
                    key={member.id}
                    label={member.name}
                    selected={staffId === member.id}
                    onPress={() => {
                      setStaffId(member.id);
                      setPendingSlot(null);
                    }}
                  />
                ))}
              </View>

              <Text variant="heading">{t('publicBooking.stepTerm')}</Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                <Button
                  label="‹"
                  variant="secondary"
                  onPress={() => {
                    setDay(day.minus({ days: 1 }));
                    setPendingSlot(null);
                  }}
                />
                <Text variant="heading" style={{ flex: 1, textAlign: 'center' }}>
                  {formatFullDate(day.toISO()!, zone)}
                </Text>
                <Button
                  label="›"
                  variant="secondary"
                  onPress={() => {
                    setDay(day.plus({ days: 1 }));
                    setPendingSlot(null);
                  }}
                />
              </View>

              {slotsPending ? (
                <Text tone="muted">{t('common.loading')}</Text>
              ) : (slots ?? []).length === 0 ? (
                <Card>
                  <Text variant="heading">{t('publicBooking.noSlotsTitle')}</Text>
                  <Text tone="secondary">{t('publicBooking.noSlotsDescription')}</Text>
                </Card>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {/* Przy „dowolnym fryzjerze” ta sama godzina może wrócić
                      kilka razy — pokazujemy ją klientowi raz. */}
                  {Array.from(new Set((slots ?? []).map((slot) => slot.slot_start))).map((start) => {
                    const selected = pendingSlot === start;
                    return (
                      <Pressable
                        key={start}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setPendingSlot(start)}
                        style={{
                          minHeight: theme.minTouchTarget,
                          minWidth: 88,
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingHorizontal: theme.spacing.lg,
                          borderRadius: theme.radius.md,
                          borderWidth: 1,
                          borderColor: selected ? theme.colors.accent : theme.colors.border,
                          backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
                        }}
                      >
                        <Text variant="bodyStrong" tone={selected ? 'onAccent' : 'primary'}>
                          {formatTime(start, zone)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {pendingSlot ? (
                <>
                  <Text variant="heading">{t('publicBooking.stepData')}</Text>
                  <Input
                    label={t('publicBooking.firstName')}
                    value={form.firstName}
                    onChangeText={(firstName) => setForm({ ...form, firstName })}
                  />
                  <Input
                    label={t('publicBooking.phone')}
                    value={form.phone}
                    onChangeText={(phone) => setForm({ ...form, phone })}
                    keyboardType="phone-pad"
                  />
                  <Input
                    label={t('publicBooking.email')}
                    value={form.email}
                    onChangeText={(email) => setForm({ ...form, email })}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    hint={t('publicBooking.emailHint')}
                  />
                  <Input
                    label={t('publicBooking.note')}
                    value={form.note}
                    onChangeText={(note) => setForm({ ...form, note })}
                    multiline
                    numberOfLines={2}
                  />

                  {formError ? <Text tone="danger">{formError}</Text> : null}

                  <Button
                    label={t('publicBooking.submit', {
                      time: formatTime(pendingSlot, zone),
                      price: formatPrice(summary.price),
                    })}
                    loading={createBooking.isPending}
                    onPress={() => void submit()}
                  />

                  {catalog.salon.cancellationPolicy ? (
                    <Text variant="small" tone="muted">
                      {catalog.salon.cancellationPolicy}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </>
      )}

      <Button
        label={t('publicBooking.backToApp')}
        variant="secondary"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </Screen>
  );
}
