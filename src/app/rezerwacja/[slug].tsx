import { useLocalSearchParams, useRouter } from 'expo-router';
import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddonsSheet } from '@/components/public/addons-sheet';
import { DayStrip } from '@/components/public/day-strip';
import { SalonHeader } from '@/components/public/salon-header';
import { StaffPicker } from '@/components/public/staff-picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Stars } from '@/components/ui/stars';
import { Text } from '@/components/ui/text';
import {
  useCreatePublicBooking,
  usePublicCatalog,
  usePublicReviews,
  usePublicSlots,
  type ChosenAddons,
  type PublicBookingResult,
} from '@/features/public-booking/queries';
import { t } from '@/i18n';
import { formatDuration, formatFullDate, formatPrice, formatTime, plural } from '@/lib/format';
import { useTheme } from '@/theme';

const ZONE = 'Europe/Warsaw';
const STRIP_DAYS = 14;

type Step = 'services' | 'term' | 'data';

/**
 * Strona rezerwacji dla klienta — podgląd w aplikacji.
 *
 * Trzy kroki: usługa (z opcjonalnymi dodatkami), termin, dane. Nic nie liczy
 * się tutaj: wolne godziny, ceny i zapis wizyty robi funkcja serwerowa,
 * z której skorzysta też docelowa strona rezerwacji salonu.
 */
export default function PublicBookingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const { data: catalog, isPending, error } = usePublicCatalog(slug);
  const { data: reviews } = usePublicReviews(slug);
  const createBooking = useCreatePublicBooking();

  const zone = catalog?.salon.timezone ?? ZONE;

  const [step, setStep] = useState<Step>('services');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [chosenAddons, setChosenAddons] = useState<ChosenAddons>({});
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [stripStart, setStripStart] = useState(() => DateTime.now().setZone(ZONE).startOf('day'));
  const [day, setDay] = useState(() => DateTime.now().setZone(ZONE).startOf('day'));
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', phone: '', email: '', note: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<PublicBookingResult | null>(null);

  const chosenServices = useMemo(
    () => (catalog?.services ?? []).filter((service) => serviceIds.includes(service.id)),
    [catalog, serviceIds],
  );

  /** Dodatki przypisane do wybranych usług oraz te ogólne, bez wskazanej usługi. */
  const relevantAddons = useMemo(
    () =>
      (catalog?.addons ?? []).filter(
        (addon) => addon.serviceId === null || serviceIds.includes(addon.serviceId),
      ),
    [catalog, serviceIds],
  );

  const addonSummary = useMemo(() => {
    const lines = relevantAddons
      .filter((addon) => (chosenAddons[addon.id] ?? 0) > 0)
      .map((addon) => ({ addon, quantity: chosenAddons[addon.id] }));

    return {
      lines,
      minutes: lines.reduce((sum, line) => sum + line.addon.durationMinutes * line.quantity, 0),
      price: lines.reduce((sum, line) => sum + line.addon.priceGrosz * line.quantity, 0),
    };
  }, [relevantAddons, chosenAddons]);

  const totalMinutes =
    chosenServices.reduce((sum, service) => sum + service.durationMinutes, 0) + addonSummary.minutes;
  const totalPrice =
    chosenServices.reduce((sum, service) => sum + service.priceGrosz, 0) + addonSummary.price;

  const availableStaff = useMemo(
    () =>
      (catalog?.staff ?? []).filter((member) =>
        serviceIds.every((serviceId) => member.serviceIds.includes(serviceId)),
      ),
    [catalog, serviceIds],
  );

  const { data: slots, isPending: slotsPending } = usePublicSlots({
    slug,
    serviceIds,
    day,
    staffId,
    extraMinutes: addonSummary.minutes,
    enabled: step === 'term' && serviceIds.length > 0,
  });

  function chooseService(serviceId: string) {
    setServiceIds([serviceId]);
    setChosenAddons({});
    setStaffId(null);
    setPendingSlot(null);

    const hasAddons = (catalog?.addons ?? []).some(
      (addon) => addon.serviceId === null || addon.serviceId === serviceId,
    );

    // Bez dodatków nie ma po co pokazywać pustego kroku.
    if (hasAddons) setAddonsOpen(true);
    else setStep('term');
  }

  function toggleService(serviceId: string) {
    setServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId],
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

    try {
      const result = await createBooking.mutateAsync({
        slug: slug!,
        serviceIds,
        startsAt: pendingSlot!,
        staffId,
        addons: Object.entries(chosenAddons).map(([id, quantity]) => ({ id, quantity })),
        client: { firstName: form.firstName, email: form.email, phone: form.phone },
        note: form.note,
      });
      setConfirmed(result);
    } catch (cause) {
      setFormError((cause as Error).message || t('publicBooking.bookingError'));
    }
  }

  if (isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Text tone="muted">{t('common.loading')}</Text>
      </Screen>
    );
  }

  if (error || !catalog) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Text variant="title">{t('publicBooking.notFoundTitle')}</Text>
        <Text tone="secondary">{t('publicBooking.notFoundDescription')}</Text>
      </Screen>
    );
  }

  // ---------------------------------------------------------------- potwierdzenie
  if (confirmed) {
    const booking = confirmed.booking;

    return (
      <Screen scroll edges={['top', 'bottom']}>
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

        <Button
          label={t('publicBooking.bookAnother')}
          variant="secondary"
          onPress={() => {
            setConfirmed(null);
            setServiceIds([]);
            setChosenAddons({});
            setPendingSlot(null);
            setStep('services');
            setForm({ firstName: '', phone: '', email: '', note: '' });
          }}
        />
      </Screen>
    );
  }

  // ------------------------------------------------------------------- wybór usług
  if (step === 'services') {
    return (
      <>
        <Screen scroll edges={['top', 'bottom']}>
          <SalonHeader
            name={catalog.salon.name}
            address={catalog.salon.address}
            logoUrl={catalog.salon.logoUrl}
            coverUrl={catalog.salon.coverUrl}
            brandColor={catalog.salon.brandColor}
            rating={catalog.salon.rating}
            reviewsCount={catalog.salon.reviewsCount}
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
                      label={t('publicBooking.bookService', {
                        price: formatPrice(service.priceGrosz),
                      })}
                      onPress={() => chooseService(service.id)}
                    />
                  </View>
                );
              })}

              {serviceIds.length > 1 ? (
                <Button
                  label={t('publicBooking.continueWithChosen', {
                    count: `${serviceIds.length}`,
                    price: formatPrice(totalPrice),
                  })}
                  onPress={() => setStep('term')}
                />
              ) : null}
            </>
          )}

          <Text variant="heading">{t('reviews.sectionTitle')}</Text>

          {(reviews ?? []).length === 0 ? (
            <Text tone="muted" variant="small">
              {t('reviews.empty')}
            </Text>
          ) : (
            (reviews ?? []).slice(0, 5).map((review) => (
              <Card key={review.id}>
                <Stars value={review.rating} count={null} />
                <Text variant="small" tone="muted">
                  {review.authorName} · {review.staffName}
                </Text>
                {review.comment ? <Text>{review.comment}</Text> : null}
                {review.salonReply ? (
                  <>
                    <Text variant="label" tone="secondary">
                      {t('reviews.salonReply')}
                    </Text>
                    <Text variant="small">{review.salonReply}</Text>
                  </>
                ) : null}
              </Card>
            ))
          )}

          <Button
            label={t('publicBooking.backToApp')}
            variant="secondary"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        </Screen>

        <AddonsSheet
          visible={addonsOpen}
          serviceName={chosenServices[0]?.name ?? ''}
          addons={relevantAddons}
          chosen={chosenAddons}
          onChange={setChosenAddons}
          onClose={() => setAddonsOpen(false)}
          onContinue={() => {
            setAddonsOpen(false);
            setStep('term');
          }}
        />
      </>
    );
  }

  // ------------------------------------------------------------------ wybór terminu
  if (step === 'term') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            gap: theme.spacing.md,
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('publicBooking.back')}
              onPress={() => setStep('services')}
              style={{
                width: theme.minTouchTarget,
                height: theme.minTouchTarget,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surface,
              }}
            >
              <Text variant="heading">‹</Text>
            </Pressable>
            <Text variant="title" style={{ flex: 1 }}>
              {t('publicBooking.pickDateTitle')}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="heading" style={{ flex: 1 }}>
              {day.setLocale('pl').toLocaleString({ month: 'long', year: 'numeric' })}
            </Text>
            <Button
              label="‹"
              variant="secondary"
              onPress={() => setStripStart(stripStart.minus({ days: 7 }))}
            />
            <Button
              label="›"
              variant="secondary"
              onPress={() => setStripStart(stripStart.plus({ days: 7 }))}
            />
          </View>

          <DayStrip
            from={stripStart as DateTime<true>}
            days={STRIP_DAYS}
            selected={day as DateTime<true>}
            onSelect={(next) => {
              setDay(next);
              setPendingSlot(null);
            }}
          />
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: theme.spacing.lg,
            gap: theme.spacing.lg,
            paddingBottom: theme.spacing.xxxl,
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          }}
        >
          {slotsPending ? (
            <Text tone="muted">{t('common.loading')}</Text>
          ) : (slots ?? []).length === 0 ? (
            <Card>
              <Text variant="heading">{t('publicBooking.noSlotsTitle')}</Text>
              <Text tone="secondary">{t('publicBooking.noSlotsDescription')}</Text>
            </Card>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {/* Przy „dowolnym fryzjerze” ta sama godzina wraca kilka razy. */}
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
                      borderRadius: theme.radius.pill,
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

          <Card>
            <Text variant="heading">{t('publicBooking.yourOrder')}</Text>

            {chosenServices.map((service) => (
              <View
                key={service.id}
                style={{ flexDirection: 'row', justifyContent: 'space-between' }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{service.name}</Text>
                  <Text variant="small" tone="muted">
                    {formatDuration(service.durationMinutes)}
                  </Text>
                </View>
                <Text variant="bodyStrong">{formatPrice(service.priceGrosz)}</Text>
              </View>
            ))}

            {relevantAddons.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setAddonsOpen(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: theme.minTouchTarget,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.border,
                  paddingTop: theme.spacing.sm,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text tone={addonSummary.lines.length > 0 ? 'primary' : 'muted'}>
                    {t('addons.summaryRow')}
                  </Text>
                  {addonSummary.lines.map((line) => (
                    <Text key={line.addon.id} variant="small" tone="secondary">
                      {t('addons.chosen', { count: line.quantity, name: line.addon.name })}
                    </Text>
                  ))}
                </View>
                <Text tone="secondary">
                  {addonSummary.price > 0 ? formatPrice(addonSummary.price) : t('addons.none')} ›
                </Text>
              </Pressable>
            ) : null}
          </Card>

          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="heading">{t('publicBooking.availableStaff')}</Text>
            <StaffPicker
              staff={availableStaff}
              selected={staffId}
              onSelect={(next) => {
                setStaffId(next);
                setPendingSlot(null);
              }}
            />
          </View>

          <Button
            label={t('publicBooking.addAnotherService')}
            variant="secondary"
            onPress={() => setStep('services')}
          />
        </ScrollView>

        {/* Podsumowanie zawsze pod ręką, tak jak w koszyku. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            padding: theme.spacing.lg,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="small" tone="muted">
              {t('publicBooking.servicesCount', {
                count: `${chosenServices.length} ${plural(chosenServices.length, 'usługa', 'usługi', 'usług')}`,
                duration: formatDuration(totalMinutes),
              })}
            </Text>
            <Text variant="title">{formatPrice(totalPrice)}</Text>
          </View>
          <Button
            label={t('publicBooking.next')}
            disabled={!pendingSlot}
            onPress={() => setStep('data')}
          />
        </View>

        <AddonsSheet
          visible={addonsOpen}
          serviceName={chosenServices.map((service) => service.name).join(' + ')}
          addons={relevantAddons}
          chosen={chosenAddons}
          onChange={(next) => {
            setChosenAddons(next);
            // Zmiana dodatków zmienia długość wizyty, więc wybrana godzina
            // przestaje być pewna — prosimy o wybór jeszcze raz.
            setPendingSlot(null);
          }}
          onClose={() => setAddonsOpen(false)}
          onContinue={() => setAddonsOpen(false)}
        />
      </SafeAreaView>
    );
  }

  // --------------------------------------------------------------------- dane klienta
  return (
    <Screen scroll edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('publicBooking.back')}
          onPress={() => setStep('term')}
          style={{
            width: theme.minTouchTarget,
            height: theme.minTouchTarget,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text variant="heading">‹</Text>
        </Pressable>
        <Text variant="title" style={{ flex: 1 }}>
          {t('publicBooking.stepData')}
        </Text>
      </View>

      <Card>
        <Text variant="heading">{formatFullDate(pendingSlot!, zone)}</Text>
        <Text variant="title">{formatTime(pendingSlot!, zone)}</Text>
        <Text tone="secondary">
          {chosenServices.map((service) => service.name).join(' + ')}
          {addonSummary.lines.length > 0
            ? ` + ${addonSummary.lines.map((line) => line.addon.name).join(' + ')}`
            : ''}
        </Text>
        <Text variant="bodyStrong">
          {formatPrice(totalPrice)} · {formatDuration(totalMinutes)}
        </Text>
      </Card>

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
          time: formatTime(pendingSlot!, zone),
          price: formatPrice(totalPrice),
        })}
        loading={createBooking.isPending}
        onPress={() => void submit()}
      />

      {catalog.salon.cancellationPolicy ? (
        <Text variant="small" tone="muted">
          {catalog.salon.cancellationPolicy}
        </Text>
      ) : null}
    </Screen>
  );
}
