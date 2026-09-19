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
  onlineBookingEnabled: boolean;
  rating: number | null;
  reviewsCount: number;
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

export type PublicStaff = {
  id: string;
  name: string;
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

/** Wybrane dodatki: ile sztuk którego. */
export type ChosenAddons = Record<string, number>;

export type PublicSlot = { slot_start: string; slot_end: string; staff_id: string };

/**
 * Błąd, który wolno pokazać klientowi — z komunikatem prosto od serwera.
 *
 * Kody 4xx to nie awaria, tylko odpowiedź „tak się nie da" (zły adres e-mail,
 * zajęty termin, przekroczony limit). Oznaczamy je, żeby nie trafiały do
 * Sentry — inaczej każda literówka klienta wyglądałaby tam jak usterka.
 */
export class PublicBookingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PublicBookingError';
    if (status >= 400 && status < 500) markExpected(this);
  }
}

/**
 * Wywołanie funkcji serwerowej rezerwacji.
 *
 * Gdy funkcja odpowie kodem błędu, biblioteka Supabase rzuca wyjątek z suchym
 * „Edge Function returned a non-2xx status code" i chowa treść odpowiedzi
 * w polu `context`. Klient zobaczyłby ten techniczny tekst zamiast „Podaj
 * prawidłowy adres e-mail", więc wyciągamy z odpowiedzi nasz komunikat.
 */
async function callPublicBooking<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke('public-booking', { body });

  if (error) {
    const response = (error as { context?: unknown }).context;

    if (response instanceof Response) {
      const payload = await response.json().catch(() => null);
      const message = (payload as { error?: string } | null)?.error;
      if (message) throw new PublicBookingError(message, response.status);
      throw new PublicBookingError(error.message, response.status);
    }

    throw error;
  }

  // Zapas na wypadek błędu odesłanego z kodem 200.
  if ((data as { error?: string })?.error) {
    throw new PublicBookingError((data as { error: string }).error, 200);
  }

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
  extraMinutes: number;
  enabled: boolean;
}) {
  const dayKey = args.day.toISODate();

  return useQuery({
    queryKey: queryKeys.publicSlots(
      args.slug,
      dayKey ?? '',
      args.staffId ?? 'any',
      args.serviceIds.join(','),
      args.extraMinutes,
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
        extraMinutes: args.extraMinutes,
      });
      return result.slots;
    },
  });
}

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
  canCancel: boolean;
  cancelLeadHours: number;
};

/** Wizyta otwarta z linku — bez konta, na podstawie samego tokenu. */
export function usePublicBookingByToken(token: string | undefined) {
  return useQuery({
    queryKey: queryKeys.clientBooking(token),
    enabled: Boolean(token),
    queryFn: async () => {
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

export type PublicBookingResult = {
  booking: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    totalPriceGrosz: number;
    staffName: string;
  };
  /** Ścieżka do wizyty dla klienta — trafi do maila potwierdzającego. */
  confirmationPath: string;
  /** To samo, ale zwracane wyłącznie lokalnie, żeby dało się testować bez poczty. */
  devConfirmationPath?: string;
};

export function useCreatePublicBooking() {
  return useMutation({
    mutationFn: (args: {
      slug: string;
      serviceIds: string[];
      startsAt: string;
      staffId: string | null;
      addons: { id: string; quantity: number }[];
      client: { firstName: string; lastName?: string; email: string; phone: string };
      note?: string;
    }) => callPublicBooking<PublicBookingResult>({ action: 'book', ...args }),
  });
}

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
    queryFn: async () => {
      const result = await callPublicBooking<{ reviews: PublicReview[] }>({
        action: 'reviews',
        slug,
      });
      return result.reviews;
    },
  });
}

export type ReviewState = {
  canReview: boolean;
  review: { rating: number; comment: string | null; salonReply: string | null } | null;
};

/** Czy z tego linku można ocenić wizytę — i czy ocena już jest. */
export function useReviewState(token: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reviewState(token),
    enabled: Boolean(token),
    queryFn: () => callPublicBooking<ReviewState>({ action: 'reviewState', token }),
  });
}

export function useSubmitReview() {
  return useMutation({
    mutationFn: (args: { token: string; rating: number; comment?: string }) =>
      callPublicBooking<{ ok: true }>({ action: 'submitReview', ...args }),
  });
}
