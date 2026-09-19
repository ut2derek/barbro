import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
    queryKey: ['clients', args.salonId, term],
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
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}