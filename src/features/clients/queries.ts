import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import type { Database } from '@/lib/database.types';
import { parseRows } from '@/lib/parse';
import { invalidateClients, queryKeys } from '@/lib/query-keys';
import { getSupabase } from '@/lib/supabase';

export type ClientOption = {
  id: string;
  name: string;
  phone: string;
  email: string;
  noShowCount: number;
  blocked: boolean;
};

/** Wyszukiwanie klienta po imieniu, nazwisku, telefonie albo mailu. */
export function useClientSearch(args: { salonId: string | undefined; query: string }) {
  const term = args.query.trim();

  return useQuery({
    queryKey: queryKeys.clients(args.salonId, term),
    enabled: Boolean(args.salonId),
    queryFn: async (): Promise<ClientOption[]> => {
      let request = getSupabase()
        .from('clients')
        .select('id, first_name, last_name, phone, email, no_show_count, blocked')
        .eq('salon_id', args.salonId!)
        .order('first_name')
        .limit(20);

      if (term.length >= 2) {
        const pattern = `%${term}%`;
        request = request.or(
          `first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`,
        );
      }

      const { data, error } = await request;
      if (error) throw error;

      return data.map((client) => ({
        id: client.id,
        name: [client.first_name, client.last_name].filter(Boolean).join(' '),
        phone: client.phone,
        email: client.email,
        noShowCount: client.no_show_count,
        blocked: client.blocked,
      }));
    },
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      salonId: string;
      firstName: string;
      lastName?: string;
      phone: string;
      email: string;
    }): Promise<string> => {
      const { data, error } = await getSupabase()
        .from('clients')
        .insert({
          salon_id: args.salonId,
          first_name: args.firstName.trim(),
          last_name: args.lastName?.trim() || null,
          phone: args.phone.trim(),
          email: args.email.trim().toLowerCase(),
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      invalidateClients(queryClient);
    },
  });
}

export type ClientDetails = ClientOption & {
  firstName: string;
  lastName: string | null;
  internalNote: string | null;
  /** Ocena rzetelności wystawiona przez salon — klient jej nie widzi. */
  internalRating: number | null;
  createdAt: string;
};

export function useClient(clientId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.client(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ClientDetails> => {
      const { data, error } = await getSupabase()
        .from('clients')
        .select(
          'id, first_name, last_name, phone, email, no_show_count, blocked, internal_note, internal_rating, created_at',
        )
        .eq('id', clientId!)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: [data.first_name, data.last_name].filter(Boolean).join(' '),
        firstName: data.first_name,
        lastName: data.last_name,
        phone: data.phone,
        email: data.email,
        noShowCount: data.no_show_count,
        blocked: data.blocked,
        internalNote: data.internal_note,
        internalRating: data.internal_rating,
        createdAt: data.created_at,
      };
    },
  });
}

export type ClientBooking = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  totalPriceGrosz: number;
  staffName: string;
  services: string[];
};

const clientBookingRow = z.object({
  id: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.string(),
  total_price_grosz: z.number(),
  staff: z.object({ display_name: z.string() }).nullable(),
  booking_items: z.array(z.object({ name_snapshot: z.string(), item_order: z.number() })),
});

/** Historia wizyt klienta — od najnowszej. */
export function useClientBookings(clientId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.clientBookings(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ClientBooking[]> => {
      const { data, error } = await getSupabase()
        .from('bookings')
        .select(
          'id, starts_at, ends_at, status, total_price_grosz, staff ( display_name ), booking_items ( name_snapshot, item_order )',
        )
        .eq('client_id', clientId!)
        .order('starts_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return parseRows(clientBookingRow, data, 'historia wizyt klienta').map((row) => ({
        id: row.id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status,
        totalPriceGrosz: row.total_price_grosz,
        staffName: row.staff?.display_name ?? '',
        services: [...row.booking_items]
          .sort((a, b) => a.item_order - b.item_order)
          .map((item) => item.name_snapshot),
      }));
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      clientId: string;
      internalNote?: string | null;
      internalRating?: number | null;
      blocked?: boolean;
      phone?: string;
      email?: string;
    }) => {
      const payload: Database['public']['Tables']['clients']['Update'] = {};
      if (args.internalNote !== undefined) payload.internal_note = args.internalNote?.trim() || null;
      if (args.internalRating !== undefined) payload.internal_rating = args.internalRating;
      if (args.blocked !== undefined) payload.blocked = args.blocked;
      if (args.phone !== undefined) payload.phone = args.phone.trim();
      if (args.email !== undefined) payload.email = args.email.trim().toLowerCase();

      const { error } = await getSupabase().from('clients').update(payload).eq('id', args.clientId);
      if (error) throw error;
    },
    onSuccess: () => invalidateClients(queryClient),
  });
}
