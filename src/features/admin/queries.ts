import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { queryKeys } from '@/lib/query-keys';
import { getSupabase } from '@/lib/supabase';

export type SalonOverview = {
  salonId: string;
  name: string;
  slug: string;
  city: string | null;
  active: boolean;
  onlineBookingEnabled: boolean;
  createdAt: string;
  ownerCount: number;
  staffCount: number;
  bookingsLast30Days: number;
  upcomingBookings: number;
};

/** Czy zalogowany użytkownik jest administratorem platformy. */
export function useIsAppAdmin() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.isAppAdmin(user?.id),
    enabled: Boolean(user),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await getSupabase().rpc('is_app_admin');
      if (error) throw error;
      return data === true;
    },
  });
}

export function useSalonOverview(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adminSalons(),
    enabled,
    queryFn: async (): Promise<SalonOverview[]> => {
      const { data, error } = await getSupabase().rpc('admin_salon_overview');
      if (error) throw error;

      return data.map((row) => ({
        salonId: row.salon_id,
        name: row.name,
        slug: row.slug,
        city: row.city,
        active: row.active,
        onlineBookingEnabled: row.online_booking_enabled,
        createdAt: row.created_at,
        ownerCount: row.owner_count,
        staffCount: row.staff_count,
        bookingsLast30Days: row.bookings_last_30_days,
        upcomingBookings: row.upcoming_bookings,
      }));
    },
  });
}

export function useSetSalonActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { salonId: string; active: boolean }) => {
      const { error } = await getSupabase().rpc('admin_set_salon_active', {
        p_salon_id: args.salonId,
        p_active: args.active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSalons() });
    },
  });
}

export type CreatedSalon = {
  salonId: string;
  slug: string;
  ownerId: string;
  /** Hasło pokazywane jeden raz — do czasu podłączenia poczty. */
  temporaryPassword: string | null;
};

export function useCreateSalon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      salonName: string;
      ownerEmail: string;
      ownerName: string;
      city: string;
    }): Promise<CreatedSalon> => {
      const { data, error } = await getSupabase().functions.invoke('admin-create-salon', {
        body: args,
      });
      if (error) throw error;
      return data as CreatedSalon;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSalons() });
    },
  });
}
