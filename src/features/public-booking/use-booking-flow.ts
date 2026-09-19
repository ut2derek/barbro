import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';

import {
  useCreatePublicBooking,
  usePublicCatalog,
  usePublicReviews,
  usePublicSlots,
  type ChosenAddons,
  type PublicBookingResult,
} from './queries';

/**
 * CAŁA LOGIKA REZERWACJI PRZEZ KLIENTA W JEDNYM MIEJSCU
 *
 * Wcześniej ekran strony rezerwacji miał 703 linie: stan, wyliczenia i trzy
 * różne widoki naraz. Teraz stan i wyliczenia siedzą tutaj, a ekrany tylko
 * pokazują to, co dostaną — dzięki czemu można dołożyć krok albo zmienić
 * wygląd bez dotykania reguł.
 *
 * Czego tu NIE MA i być nie może: liczenia wolnych terminów i cen. To robi
 * baza, a pośredniczy funkcja serwerowa — i to samo widzi aplikacja barbera.
 */

export type Step = 'services' | 'term' | 'data';

export const STRIP_DAYS = 14;

export type BookingForm = { firstName: string; phone: string; email: string; note: string };

const EMPTY_FORM: BookingForm = { firstName: '', phone: '', email: '', note: '' };

export function usePublicBookingFlow(slug: string | undefined) {
  const catalog = usePublicCatalog(slug);
  const reviews = usePublicReviews(slug);
  const createBooking = useCreatePublicBooking();

  // Strefa czasowa salonu, nie urządzenia i nie wpisana na sztywno.
  // Do czasu wczytania katalogu nie rysujemy żadnej godziny.
  const zone = catalog.data?.salon.timezone ?? 'UTC';

  const [step, setStep] = useState<Step>('services');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [chosenAddons, setChosenAddons] = useState<ChosenAddons>({});
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [stripStart, setStripStart] = useState(() => DateTime.now().startOf('day'));
  const [day, setDay] = useState(() => DateTime.now().startOf('day'));
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const [form, setForm] = useState<BookingForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<PublicBookingResult | null>(null);

  const chosenServices = useMemo(
    () => (catalog.data?.services ?? []).filter((service) => serviceIds.includes(service.id)),
    [catalog.data, serviceIds],
  );

  /** Dodatki przypisane do wybranych usług oraz te ogólne, bez wskazanej usługi. */
  const relevantAddons = useMemo(
    () =>
      (catalog.data?.addons ?? []).filter(
        (addon) => addon.serviceId === null || serviceIds.includes(addon.serviceId),
      ),
    [catalog.data, serviceIds],
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

  /** Fryzjerzy, którzy wykonują wszystkie wybrane usługi. */
  const availableStaff = useMemo(
    () =>
      (catalog.data?.staff ?? []).filter((member) =>
        serviceIds.every((serviceId) => member.serviceIds.includes(serviceId)),
      ),
    [catalog.data, serviceIds],
  );

  const slots = usePublicSlots({
    slug,
    serviceIds,
    day,
    staffId,
    extraMinutes: addonSummary.minutes,
    enabled: step === 'term' && serviceIds.length > 0,
  });

  /** Wybór usługi przyciskiem „Umów": od razu dodatki albo od razu termin. */
  function chooseService(serviceId: string) {
    setServiceIds([serviceId]);
    setChosenAddons({});
    setStaffId(null);
    setPendingSlot(null);

    const hasAddons = (catalog.data?.addons ?? []).some(
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

  function selectDay(next: DateTime<true>) {
    setDay(next);
    setPendingSlot(null);
  }

  function selectStaff(next: string | null) {
    setStaffId(next);
    setPendingSlot(null);
  }

  /**
   * Zmiana dodatków zmienia długość wizyty, więc wybrana godzina przestaje
   * być pewna — prosimy o wybór jeszcze raz.
   */
  function changeAddons(next: ChosenAddons) {
    setChosenAddons(next);
    setPendingSlot(null);
  }

  function startOver() {
    setConfirmed(null);
    setServiceIds([]);
    setChosenAddons({});
    setPendingSlot(null);
    setStep('services');
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function submit(missingDataMessage: string, genericErrorMessage: string) {
    setFormError(null);

    if (!form.firstName.trim() || !form.phone.trim() || !form.email.trim()) {
      setFormError(missingDataMessage);
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
      setFormError((cause as Error).message || genericErrorMessage);
    }
  }

  return {
    catalog,
    reviews: reviews.data ?? [],
    zone,

    step,
    setStep,
    serviceIds,
    chosenServices,
    relevantAddons,
    chosenAddons,
    addonSummary,
    addonsOpen,
    setAddonsOpen,
    availableStaff,
    staffId,
    stripStart,
    setStripStart,
    day,
    pendingSlot,
    setPendingSlot,
    form,
    setForm,
    formError,
    confirmed,

    totalMinutes,
    totalPrice,
    slots: slots.data,
    slotsPending: slots.isPending,
    submitting: createBooking.isPending,

    chooseService,
    toggleService,
    selectDay,
    selectStaff,
    changeAddons,
    startOver,
    submit,
  };
}

export type BookingFlow = ReturnType<typeof usePublicBookingFlow>;
