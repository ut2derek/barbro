import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';

export type Membership = {
  salonId: string;
  salonName: string;
  brandColor: string | null;
  role: 'owner' | 'staff';
};

/**
 * Salon zalogowanego użytkownika wraz z rolą. RLS pilnuje, żeby zapytanie
 * zwróciło wyłącznie salony, do których faktycznie należy.
 */
export function useCurrentSalon() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['current-salon', user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<Membership | null> => {
      // Pracownik widzi skład całego salonu, więc bez tego warunku zapytanie
      // potrafiło zwrócić wiersz właściciela i nadać mu jego rolę w interfejsie.
      const { data, error } = await getSupabase()
        .from('salon_members')
        .select('role, salons (id, name, brand_color)')
        .eq('user_id', user!.id)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data?.salons) return null;

      const salon = data.salons as unknown as { id: string; name: string; brand_color: string | null };

      return {
        salonId: salon.id,
        salonName: salon.name,
        brandColor: salon.brand_color,
        role: data.role as Membership['role'],
      };
    },
  });
}
