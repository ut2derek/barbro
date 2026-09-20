import { useMutation, useQuery } from '@tanstack/react-query';
import type { DateTime } from 'luxon';

import { queryKeys } from '@/lib/query-keys';
import { markExpected } from '@/lib/sentry';
import { getSupabase } from '@/lib/supabase';

/**
 * Strona rezerwacji dla klienta rozmawia wyłącznie z funkcją serwerową —
 * nie dotyka bazy. Ta sama funkcja obsłuży osobną stronę rezerwacji salonu.
 */

export type PublicSalon = {
  id: string;
  name: string;
  slug: string;
  brandColor: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  address: string;
  phone: string | null;
  timezone: string;
  cancellationPolicy: string | null;
  /** Średnia ocen; puste, gdy salon nie ma jeszcze opinii. */
  rating: number | null;
  reviewsCount: number;
  onlineBookingEnabled: boolean;
};

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  categoryName: string | null;
  durationMinutes: number;
  priceGrosz: number;
  regularPriceGrosz: number;
  lowestPriceBeforePromoGrosz: number | null;
  promoActive: boolean;
};

export type PublicStaff = {
  id: string;
  name: string;
  /** Stopień nadany przez salon: „Master”, „Barber”, „Praktykant”. */
  title: string | null;
  bio: string | null;
  photoUrl: string | null;
  rating: number | null;
  reviewsCount: number;
  serviceIds: string[];
};

export type PublicCatalog = {
  salon: PublicSalon;
  services: PublicService[];
  addons: PublicAddon[];
  staff: PublicStaff[];
};

export type PublicSlot = { slot_start: string; slot_end: string; staff_id: string };

/**
 * Błąd, który klient ma zobaczyć: „Nieprawidłowy adres e-mail", „Ten termin
 * jest już zajęty". Oznaczony jako spodziewany, więc nie idzie do Sentry.
 */
export class PublicBookingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicBookingError';
    markExpected(this);
  }
}

/**
 * Komunikat od serwera, a nie od biblioteki.
 *
 * Przy odpowiedzi spoza zakresu 2xx `functions.invoke` zwraca własny błąd
 * („Edge Function returned a non-2xx status code"), a prawdziwą odpowiedź
 * chowa w polu `context`. Bez tego klient widział zdanie po angielsku
 * o funkcji brzegowej zamiast „Nieprawidłowy adres e-mail".
 */
async function serverMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;

  try {
    const body = await context.clone().json();
    const message = (body as { error?: unknown }).error;
    return typeof message === 'string' && message.length > 0 ? message : null;
  } catch {
    return null;
  }
}

async function callPublicBooking<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke('public-booking', { body });

  if (error) {
    const message = await serverMessage(error);
    if (message) throw new PublicBookingError(message);
    throw error;
  }

  // Funkcja odpowiedziała 200, ale z opisem problemu w treści.
  const failure = (data as { error?: string } | null)?.error;
  if (failure) throw new PublicBookingError(failure);

  return data as T;
}

export function usePublicCatalog(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.publicCatalog(slug),
    enabled: Boolean(slug),
    queryFn: () => callPublicBooking<PublicCatalog>({ action: 'catalog', slug }),
  });
}

export function usePublicSlots(args: {
  slug: string | undefined;
  serviceIds: string[];
  day: DateTime;
  staffId: string | null;
  /** Minuty dobranych dodatków — wydłużają wizytę, więc zmieniają wolne terminy. */
  extraMinutes?: number;
  enabled: boolean;
}) {
  const dayKey = args.day.toISODate() ?? '';
  const extraMinutes = args.extraMinutes ?? 0;

  return useQuery({
    queryKey: queryKeys.publicSlots(
      args.slug,
      dayKey,
      args.staffId ?? 'any',
      args.serviceIds.join(','),
      extraMinutes,
    ),
    enabled: args.enabled && Boolean(args.slug) && args.serviceIds.length > 0,
    queryFn: async () => {
      const result = await callPublicBooking<{ slots: PublicSlot[] }>({
        action: 'slots',
        slug: args.slug,
        serviceIds: args.serviceIds,
        from: dayKey,
        to: dayKey,
        staffId: args.staffId,
        extraMinutes,
      });
      return result.slots;
    },
  });
}

export type PublicBookingResult = {
  booking: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    totalPriceGrosz: number;
    staffName: string;
  };
  /** Adres strony wizyty, który normalnie trafia do klienta mailem. */
  confirmationPath: string;
  /**
   * To samo, ale tylko na lokalnej bazie — pozwala otworzyć wizytę bez maila
   * przy testowaniu. Na produkcji serwer tego pola nie odsyła.
   */
  devConfirmationPath?: string;
};

export function useCreatePublicBooking() {
  return useMutation({
    mutationFn: (args: {
      slug: string;
      serviceIds: string[];
      startsAt: string;
      staffId: string | null;
      /** Dobrane dodatki: identyfikator i liczba sztuk. Ceny liczy serwer. */
      addons?: { id: string; quantity: number }[];
      client: { firstName: string; lastName?: string; email: string; phone: string };
      note?: string;
    }) => callPublicBooking<PublicBookingResult>({ action: 'book', ...args }),
  });
}
// ──────────────────── dodatki i opinie na stronie klienta ────────────────────

export type PublicAddon = {
  id: string;
  /** Puste = dodatek proponowany przy każdej usłudze. */
  serviceId: string | null;
  name: string;
  description: string | null;
  priceGrosz: number;
  durationMinutes: number;
  maxQuantity: number;
};

/** Wybrane dodatki: identyfikator dodatku → ile sztuk. */
export type ChosenAddons = Record<string, number>;

export type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  salonReply: string | null;
  createdAt: string;
  staffName: string;
  authorName: string;
};

export function usePublicReviews(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.publicReviews(slug),
    enabled: Boolean(slug),
    queryFn: async (): Promise<PublicReview[]> => {
      const result = await callPublicBooking<{ reviews: PublicReview[] }>({
        action: 'reviews',
        slug,
      });
      return result.reviews;
    },
  });
}

// ─────────────────────── wizyta klienta spod linku z maila ───────────────────────
// Kształt odpowiada dokładnie temu, co zwraca `describe()` w funkcji serwerowej
// (supabase/functions/public-booking/token.ts) — jedno źródło prawdy o wizycie.

export type ClientBookingView = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  totalPriceGrosz: number;
  staffName: string;
  clientName: string;
  services: string[];
  salonName: string;
  timezone: string;
  cancellationPolicy: string | null;
  /** Czy klient może jeszcze sam odwołać — liczy to serwer, nie aplikacja. */
  canCancel: boolean;
  cancelLeadHours: number;
};

export function usePublicBookingByToken(token: string | undefined) {
  return useQuery({
    queryKey: queryKeys.clientBooking(token),
    enabled: Boolean(token),
    queryFn: async (): Promise<ClientBookingView> => {
      const result = await callPublicBooking<{ booking: ClientBookingView }>({
        action: 'booking',
        token,
      });
      return result.booking;
    },
  });
}

export function useConfirmBookingByToken() {
  return useMutation({
    mutationFn: (token: string) =>
      callPublicBooking<{ booking: ClientBookingView }>({ action: 'confirm', token }),
  });
}

export function useCancelBookingByToken() {
  return useMutation({
    mutationFn: (token: string) =>
      callPublicBooking<{ booking: ClientBookingView }>({ action: 'cancel', token }),
  });
}
