import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { TablesUpdate } from '@/lib/database.types';
import { getSupabase } from '@/lib/supabase';
import { invalidateClients, queryKeys } from '@/lib/query-keys';

/** Klient na liście i w wyszukiwarce. */
export type ClientOption = {
  id: string;
  name: string;
  phone: string;
  email: string;
  noShowCount: number;
  blocked: boolean;
};

/** Pozycja listy klientów — to samo co wyżej plus daty wizyt. */
export type ClientListItem = ClientOption & {
  /** Ostatnia odbyta wizyta. Puste = klient jeszcze u nas nie był. */
  lastVisitAt: string | null;
  /** Najbliższa umówiona wizyta. Puste = nic nie ma w kalendarzu. */
  nextVisitAt: string | null;
};

/**
 * Kolejność listy klientów. Sortuje baza — przy większej kartotece układanie
 * tego w aplikacji znaczyłoby ściąganie wszystkich klientów naraz.
 */
export type ClientSort = 'name' | 'newest' | 'recentVisit' | 'oldestVisit';

const SORT_COLUMNS: Record<ClientSort, { column: string; ascending: boolean }> = {
  name: { column: 'first_name', ascending: true },
  newest: { column: 'created_at', ascending: false },
  recentVisit: { column: 'last_visit_at', ascending: false },
  oldestVisit: { column: 'last_visit_at', ascending: true },
};

/** Karta klienta — to samo co wyżej plus dane, których lista nie potrzebuje. */
export type ClientDetails = ClientOption & {
  firstName: string;
  lastName: string | null;
  internalNote: string | null;
  createdAt: string;
};

/** Wizyta na karcie klienta — historia, nie kalendarz. */
export type ClientBooking = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  totalPriceGrosz: number;
  staffName: string;
  services: string[];
};

/** Imię i nazwisko w jedno pole — wyświetlamy je razem wszędzie. */
function pelneImie(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ');
}

/** Wyszukiwanie klienta po imieniu, nazwisku, telefonie albo mailu. */
export function useClientSearch(args: {
  salonId: string | undefined;
  query: string;
  sort?: ClientSort;
}) {
  const term = args.query.trim();
  const sort = args.sort ?? 'name';

  return useQuery({
    queryKey: queryKeys.clients(args.salonId, term, sort),
    enabled: Boolean(args.salonId),
    queryFn: async (): Promise<ClientListItem[]> => {
      const order = SORT_COLUMNS[sort];

      let request = getSupabase()
        .from('client_overview')
        .select(
          'id, first_name, last_name, phone, email, no_show_count, blocked, last_visit_at, next_visit_at',
        )
        .eq('salon_id', args.salonId!)
        // Klienci bez wizyt lądują na końcu przy obu porządkach „po wizytach” —
        // inaczej przy „najstarsze wizyty” puste wartości zajęłyby cały ekran.
        .order(order.column, { ascending: order.ascending, nullsFirst: false })
        .limit(50);

      if (term.length >= 2) {
        const pattern = `%${term}%`;
        request = request.or(
          `first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`,
        );
      }

      const { data, error } = await request;
      if (error) throw error;

      return data.map((client) => ({
        id: client.id!,
        name: pelneImie(client.first_name!, client.last_name),
        phone: client.phone!,
        email: client.email!,
        noShowCount: client.no_show_count!,
        blocked: client.blocked!,
        lastVisitAt: client.last_visit_at,
        nextVisitAt: client.next_visit_at,
      }));
    },
  });
}

/** Karta jednego klienta. */
export function useClient(clientId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.client(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<ClientDetails> => {
      const { data, error } = await getSupabase()
        .from('clients')
        .select(
          'id, first_name, last_name, phone, email, no_show_count, blocked, internal_note, created_at',
        )
        .eq('id', clientId!)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: pelneImie(data.first_name, data.last_name),
        firstName: data.first_name,
        lastName: data.last_name,
        phone: data.phone,
        email: data.email,
        noShowCount: data.no_show_count,
        blocked: data.blocked,
        internalNote: data.internal_note,
        createdAt: data.created_at,
      };
    },
  });
}

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

      return data.map((row) => ({
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
    onSuccess: () => invalidateClients(queryClient),
  });
}

/**
 * Zmiana danych klienta. Pola nieprzekazane zostają bez zmian — dzięki temu
 * jeden przełącznik „zablokowany" nie nadpisuje notatki wpisanej obok.
 */
export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      clientId: string;
      internalNote?: string | null;
      blocked?: boolean;
      phone?: string;
      email?: string;
    }) => {
      const payload: TablesUpdate<'clients'> = {};
      if (args.internalNote !== undefined) payload.internal_note = args.internalNote?.trim() || null;
      if (args.blocked !== undefined) payload.blocked = args.blocked;
      if (args.phone !== undefined) payload.phone = args.phone.trim();
      if (args.email !== undefined) payload.email = args.email.trim().toLowerCase();

      const { error } = await getSupabase().from('clients').update(payload).eq('id', args.clientId);
      if (error) throw error;
    },
    onSuccess: () => invalidateClients(queryClient),
  });
}
