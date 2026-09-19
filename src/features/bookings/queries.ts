import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';

import type { Database } from '@/lib/database.types';
import { getSupabase } from '@/lib/supabase';

export type BookingStatus = Database['public']['Enums']['booking_status'];

export type BookingListItem = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  totalPriceGrosz: number;
  staffId: string;
  staffName: string;
  clientName: string;
  clientPhone: string;
  clientNote: string | null;
  cancellationComment: string | null;
  services: string[];
  serviceIds: string[];
};

const BOOKING_FIELDS = `
  id, starts_at, ends_at, status, total_price_grosz, client_note, cancellation_comment, staff_id,
  staff ( display_name ),
  clients ( first_name, last_name, phone, email, no_show_count ),
  booking_items ( service_id, name_snapshot, price_grosz, duration_minutes, item_order )
` as const;

type BookingRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  total_price_grosz: number;
  client_note: string | null;
  cancellation_comment: string | null;
  staff_id: string;
  staff: { display_name: string } | null;
  clients: { first_name: string; last_name: string | null; phone: string; email: string; no_show_count: number } | null;
  booking_items: {
    service_id: string | null;
    name_snapshot: string;
    price_grosz: number;
    duration_minutes: number;
    item_order: number;
  }[];
};

function toListItem(row: BookingRow): BookingListItem {
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    totalPriceGrosz: row.total_price_grosz,
    staffId: row.staff_id,
    staffName: row.staff?.display_name ?? '',
    clientName: [row.clients?.first_name, row.clients?.last_name].filter(Boolean).join(' '),
    clientPhone: row.clients?.phone ?? '',
    clientNote: row.client_note,
    cancellationComment: row.cancellation_comment,
    services: [...row.booking_items]
      .sort((a, b) => a.item_order - b.item_order)
      .map((item) => item.name_snapshot),
    serviceIds: [...row.booking_items]
      .sort((a, b) => a.item_order - b.item_order)
      .map((item) => item.service_id)
      .filter((id): id is string => Boolean(id)),
  };
}

/** Wizyty jednego dnia w strefie salonu. */
export function useDayBookings(args: {
  salonId: string | undefined;
  zone: string;
  day: DateTime;
  staffId?: string | null;
}) {
  const { salonId, zone, day, staffId } = args;
  const dayKey = day.setZone(zone).toISODate();

  return useQuery({
    queryKey: ['bookings', salonId, dayKey, staffId ?? 'all'],
    enabled: Boolean(salonId),
    queryFn: async (): Promise<BookingListItem[]> => {
      const start = day.setZone(zone).startOf('day');
      const end = start.plus({ days: 1 });

      let request = getSupabase()
        .from('bookings')
        .select(BOOKING_FIELDS)
        .eq('salon_id', salonId!)
        .gte('starts_at', start.toISO()!)
        .lt('starts_at', end.toISO()!)
        .order('starts_at');

      if (staffId) request = request.eq('staff_id', staffId);

      const { data, error } = await request;
      if (error) throw error;

      return (data as unknown as BookingRow[]).map(toListItem);
    },
  });
}

export function useBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: ['booking', bookingId],
    enabled: Boolean(bookingId),
    queryFn: async (): Promise<BookingListItem> => {
      const { data, error } = await getSupabase()
        .from('bookings')
        .select(BOOKING_FIELDS)
        .eq('id', bookingId!)
        .single();

      if (error) throw error;
      return toListItem(data as unknown as BookingRow);
    },
  });
}

/** Zmiana statusu przechodzi przez funkcję w bazie, która pilnuje dozwolonych przejść. */
export function useChangeBookingStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { bookingId: string; status: BookingStatus; comment?: string }) => {
      const { error } = await getSupabase().rpc('change_booking_status', {
        p_booking_id: args.bookingId,
        p_status: args.status,
        p_comment: args.comment ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['booking'] });
    },
  });
}

export function useRescheduleBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { bookingId: string; newStartsAt: string; staffId?: string }) => {
      const { data, error } = await getSupabase().rpc('reschedule_booking', {
        p_booking_id: args.bookingId,
        p_new_starts_at: args.newStartsAt,
        p_new_staff_id: args.staffId ?? undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['booking'] });
    },
  });
}

export function useSalonStaff(salonId: string | undefined) {
  return useQuery({
    queryKey: ['staff', salonId],
    enabled: Boolean(salonId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('staff')
        .select('id, display_name, active')
        .eq('salon_id', salonId!)
        .eq('active', true)
        .order('sort_order');

      if (error) throw error;
      return data;
    },
  });
}

/** Wolne terminy liczy baza — aplikacja tylko pyta. */
export function useAvailableSlots(args: {
  salonId: string | undefined;
  serviceIds: string[];
  day: DateTime;
  zone: string;
  staffId?: string | null;
  enabled?: boolean;
}) {
  const dayKey = args.day.setZone(args.zone).toISODate();

  return useQuery({
    queryKey: ['slots', args.salonId, dayKey, args.staffId ?? 'all', args.serviceIds.join(',')],
    enabled: Boolean(args.salonId) && args.serviceIds.length > 0 && args.enabled !== false,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('get_available_slots', {
        p_salon_id: args.salonId!,
        p_service_ids: args.serviceIds,
        p_from: dayKey!,
        p_to: dayKey!,
        p_staff_id: args.staffId ?? undefined,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
