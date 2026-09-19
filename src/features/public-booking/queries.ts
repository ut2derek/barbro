import { useMutation, useQuery } from '@tanstack/react-query';
import type { DateTime } from 'luxon';

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
  address: string;
  phone: string | null;
  timezone: string;
  cancellationPolicy: string | null;
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
  bio: string | null;
  serviceIds: string[];
};

export type PublicCatalog = {
  salon: PublicSalon;
  services: PublicService[];
  staff: PublicStaff[];
};

export type PublicSlot = { slot_start: string; slot_end: string; staff_id: string };

async function callPublicBooking<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke('public-booking', { body });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export function usePublicCatalog(slug: string | undefined) {
  return useQuery({
    queryKey: ['public-catalog', slug],
    enabled: Boolean(slug),
    queryFn: () => callPublicBooking<PublicCatalog>({ action: 'catalog', slug }),
  });
}

export function usePublicSlots(args: {
  slug: string | undefined;
  serviceIds: string[];
  day: DateTime;
  staffId: string | null;
  enabled: boolean;
}) {
  const dayKey = args.day.toISODate();

  return useQuery({
    queryKey: ['public-slots', args.slug, dayKey, args.staffId ?? 'any', args.serviceIds.join(',')],
    enabled: args.enabled && Boolean(args.slug) && args.serviceIds.length > 0,
    queryFn: async () => {
      const result = await callPublicBooking<{ slots: PublicSlot[] }>({
        action: 'slots',
        slug: args.slug,
        serviceIds: args.serviceIds,
        from: dayKey,
        to: dayKey,
        staffId: args.staffId,
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
};

export function useCreatePublicBooking() {
  return useMutation({
    mutationFn: (args: {
      slug: string;
      serviceIds: string[];
      startsAt: string;
      staffId: string | null;
      client: { firstName: string; lastName?: string; email: string; phone: string };
      note?: string;
    }) => callPublicBooking<PublicBookingResult>({ action: 'book', ...args }),
  });
}