import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { useAuth } from '@/lib/auth';
import { parseRow } from '@/lib/parse';
import { queryKeys } from '@/lib/query-keys';
import { getSupabase } from '@/lib/supabase';

export type Membership = {
  salonId: string;
  salonName: string;
  salonSlug: string;
  brandColor: string | null;
  timezone: string;
  role: 'owner' | 'staff';
};

const membershipRow = z.object({
  role: z.enum(['owner', 'staff']),
  salons: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    brand_color: z.string().nullable(),
    timezone: z.string(),
  }),
});

/**
 * Salon zalogowanego użytkownika wraz z rolą. RLS pilnuje, żeby zapytanie
 * zwróciło wyłącznie salony, do których faktycznie należy.
 */
export function useCurrentSalon() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.currentSalon(user?.id),
    enabled: Boolean(user),
    queryFn: async (): Promise<Membership | null> => {
      // Pracownik widzi skład całego salonu, więc bez tego warunku zapytanie
      // potrafiło zwrócić wiersz właściciela i nadać mu jego rolę w interfejsie.
      const { data, error } = await getSupabase()
        .from('salon_members')
        .select('role, salons (id, name, slug, brand_color, timezone)')
        .eq('user_id', user!.id)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data?.salons) return null;

      const row = parseRow(membershipRow, data, 'salon zalogowanego użytkownika');

      return {
        salonId: row.salons.id,
        salonName: row.salons.name,
        salonSlug: row.salons.slug,
        brandColor: row.salons.brand_color,
        timezone: row.salons.timezone,
        role: row.role,
      };
    },
  });
}

/**
 * Wpis fryzjera odpowiadający zalogowanemu użytkownikowi.
 * Pracownik prowadzi swój grafik i swoje nieobecności — musi trafić na własny
 * wiersz, a nie na pierwszy z brzegu.
 */
export function useMyStaffId() {
  const { data: salon } = useCurrentSalon();

  return useQuery({
    queryKey: queryKeys.myStaffId(salon?.salonId),
    enabled: Boolean(salon?.salonId),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await getSupabase().rpc('current_staff_id', {
        p_salon_id: salon!.salonId,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}
