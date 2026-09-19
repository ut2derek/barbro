import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { parseRows } from '@/lib/parse';
import { invalidateServices, queryKeys } from '@/lib/query-keys';
import { getSupabase } from '@/lib/supabase';

export type ServiceOption = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferAfterMinutes: number;
  /** Cena, którą system faktycznie zapisze w rezerwacji — liczy ją baza. */
  priceGrosz: number;
  /** Cena z cennika; pokazujemy ją przekreśloną, gdy trwa promocja. */
  regularPriceGrosz: number;
  /** Wymóg ustawy: najniższa cena z 30 dni przed obniżką. */
  lowestPriceBeforePromoGrosz: number | null;
  promoActive: boolean;
  promoEndsAt: string | null;
  visible: boolean;
  sortOrder: number;
  categoryId: string | null;
  categoryName: string | null;
};

export type ServiceCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

const serviceRow = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  duration_minutes: z.number(),
  buffer_after_minutes: z.number(),
  price_grosz: z.number(),
  visible: z.boolean(),
  sort_order: z.number(),
  category_id: z.string().nullable(),
  service_categories: z.object({ name: z.string(), sort_order: z.number() }).nullable(),
});

/**
 * Usługi wraz z cenami. Ceny liczy funkcja w bazie — ta sama, której użyje
 * strona rezerwacji — więc aplikacja nie powiela reguł promocji.
 */
export function useServices(args: { salonId: string | undefined; staffId?: string | null }) {
  const { salonId, staffId } = args;

  return useQuery({
    queryKey: queryKeys.services(salonId, staffId ?? 'all'),
    enabled: Boolean(salonId),
    queryFn: async (): Promise<ServiceOption[]> => {
      const supabase = getSupabase();

      const [servicesResult, pricingResult] = await Promise.all([
        supabase
          .from('services')
          .select(
            'id, name, description, duration_minutes, buffer_after_minutes, price_grosz, visible, sort_order, category_id, service_categories ( name, sort_order )',
          )
          .eq('salon_id', salonId!)
          .order('sort_order'),
        supabase.rpc('service_pricing', { p_salon_id: salonId!, p_staff_id: staffId ?? undefined }),
      ]);

      if (servicesResult.error) throw servicesResult.error;
      if (pricingResult.error) throw pricingResult.error;

      const pricing = new Map(pricingResult.data.map((row) => [row.service_id, row]));

      return parseRows(serviceRow, servicesResult.data, 'usługi salonu')
        .filter((service) => pricing.has(service.id))
        .map((service) => {
          const price = pricing.get(service.id)!;

          return {
            id: service.id,
            name: service.name,
            description: service.description,
            durationMinutes: price.duration_minutes,
            bufferAfterMinutes: service.buffer_after_minutes,
            priceGrosz: price.price_grosz,
            regularPriceGrosz: price.regular_price_grosz,
            lowestPriceBeforePromoGrosz: price.lowest_price_before_promo_grosz,
            promoActive: price.promo_active,
            promoEndsAt: price.promo_ends_at,
            visible: service.visible,
            sortOrder: service.sort_order,
            categoryId: service.category_id,
            categoryName: service.service_categories?.name ?? null,
          };
        });
    },
  });
}

export function useServiceCategories(salonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.serviceCategories(salonId),
    enabled: Boolean(salonId),
    queryFn: async (): Promise<ServiceCategory[]> => {
      const { data, error } = await getSupabase()
        .from('service_categories')
        .select('id, name, sort_order')
        .eq('salon_id', salonId!)
        .order('sort_order');

      if (error) throw error;
      return data.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order }));
    },
  });
}

/**
 * Zmiana w cenniku dotyka wszystkiego, co pokazuje usługi i wolne terminy —
 * także strony rezerwacji dla klienta. Lista jest jedna, w `lib/query-keys`.
 */
function useServiceInvalidation() {
  const queryClient = useQueryClient();
  return () => invalidateServices(queryClient);
}

export type ServiceInput = {
  salonId: string;
  id?: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  durationMinutes: number;
  bufferAfterMinutes: number;
  priceGrosz: number;
  visible: boolean;
  promoPriceGrosz: number | null;
  promoStartsAt: string | null;
  promoEndsAt: string | null;
};

export function useSaveService() {
  const invalidate = useServiceInvalidation();

  return useMutation({
    mutationFn: async (input: ServiceInput): Promise<string> => {
      const supabase = getSupabase();
      const payload = {
        salon_id: input.salonId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        category_id: input.categoryId,
        duration_minutes: input.durationMinutes,
        buffer_after_minutes: input.bufferAfterMinutes,
        price_grosz: input.priceGrosz,
        visible: input.visible,
        promo_price_grosz: input.promoPriceGrosz,
        promo_starts_at: input.promoStartsAt,
        promo_ends_at: input.promoEndsAt,
      };

      if (input.id) {
        const { error } = await supabase.from('services').update(payload).eq('id', input.id);
        if (error) throw error;
        return input.id;
      }

      const { data, error } = await supabase.from('services').insert(payload).select('id').single();
      if (error) throw error;

      // Usługa, której nikt nie wykonuje, nie pojawi się przy rezerwacji.
      // Domyślnie przypisujemy ją całemu zespołowi — właściciel może to zmienić
      // na ekranie zespołu.
      const { data: team, error: teamError } = await supabase
        .from('staff')
        .select('id')
        .eq('salon_id', input.salonId)
        .eq('active', true);
      if (teamError) throw teamError;

      if (team.length > 0) {
        const { error: assignError } = await supabase.from('staff_services').insert(
          team.map((member) => ({
            salon_id: input.salonId,
            staff_id: member.id,
            service_id: data.id,
          })),
        );
        if (assignError) throw assignError;
      }

      return data.id;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteService() {
  const invalidate = useServiceInvalidation();

  return useMutation({
    mutationFn: async (serviceId: string) => {
      const { error } = await getSupabase().from('services').delete().eq('id', serviceId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Zamiana kolejności z sąsiadem — prościej w obsłudze niż przeciąganie na telefonie. */
export function useSwapServiceOrder() {
  const invalidate = useServiceInvalidation();

  return useMutation({
    mutationFn: async (args: { first: ServiceOption; second: ServiceOption }) => {
      const supabase = getSupabase();

      const { error: firstError } = await supabase
        .from('services')
        .update({ sort_order: args.second.sortOrder })
        .eq('id', args.first.id);
      if (firstError) throw firstError;

      const { error: secondError } = await supabase
        .from('services')
        .update({ sort_order: args.first.sortOrder })
        .eq('id', args.second.id);
      if (secondError) throw secondError;
    },
    onSuccess: invalidate,
  });
}

export function useSaveCategory() {
  const invalidate = useServiceInvalidation();

  return useMutation({
    mutationFn: async (args: { salonId: string; id?: string; name: string; sortOrder: number }) => {
      const supabase = getSupabase();
      const payload = { salon_id: args.salonId, name: args.name.trim(), sort_order: args.sortOrder };

      if (args.id) {
        const { error } = await supabase.from('service_categories').update(payload).eq('id', args.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from('service_categories').insert(payload);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useServiceInvalidation();

  return useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await getSupabase()
        .from('service_categories')
        .delete()
        .eq('id', categoryId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export type ServiceAddon = {
  id: string;
  /** Puste = dodatek proponowany przy każdej usłudze salonu. */
  serviceId: string | null;
  serviceName: string | null;
  name: string;
  description: string | null;
  priceGrosz: number;
  durationMinutes: number;
  maxQuantity: number;
  active: boolean;
  sortOrder: number;
};

const addonRow = z.object({
  id: z.string(),
  service_id: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  price_grosz: z.number(),
  duration_minutes: z.number(),
  max_quantity: z.number(),
  active: z.boolean(),
  sort_order: z.number(),
  services: z.object({ name: z.string() }).nullable(),
});

export function useServiceAddons(salonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.addons(salonId),
    enabled: Boolean(salonId),
    queryFn: async (): Promise<ServiceAddon[]> => {
      const { data, error } = await getSupabase()
        .from('service_addons')
        .select(
          'id, service_id, name, description, price_grosz, duration_minutes, max_quantity, active, sort_order, services ( name )',
        )
        .eq('salon_id', salonId!)
        .order('sort_order');

      if (error) throw error;

      return parseRows(addonRow, data, 'dodatki do usług').map((addon) => ({
        id: addon.id,
        serviceId: addon.service_id,
        serviceName: addon.services?.name ?? null,
        name: addon.name,
        description: addon.description,
        priceGrosz: addon.price_grosz,
        durationMinutes: addon.duration_minutes,
        maxQuantity: addon.max_quantity,
        active: addon.active,
        sortOrder: addon.sort_order,
      }));
    },
  });
}

export type AddonInput = {
  salonId: string;
  id?: string;
  serviceId: string | null;
  name: string;
  description: string | null;
  priceGrosz: number;
  durationMinutes: number;
  maxQuantity: number;
  active: boolean;
  sortOrder?: number;
};

export function useSaveAddon() {
  const invalidate = useServiceInvalidation();

  return useMutation({
    mutationFn: async (input: AddonInput) => {
      const payload = {
        salon_id: input.salonId,
        service_id: input.serviceId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        price_grosz: input.priceGrosz,
        duration_minutes: input.durationMinutes,
        max_quantity: input.maxQuantity,
        active: input.active,
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      };

      const supabase = getSupabase();

      if (input.id) {
        const { error } = await supabase.from('service_addons').update(payload).eq('id', input.id);
        if (error) throw error;
        return input.id;
      }

      const { data, error } = await supabase
        .from('service_addons')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAddon() {
  const invalidate = useServiceInvalidation();

  return useMutation({
    mutationFn: async (addonId: string) => {
      const { error } = await getSupabase().from('service_addons').delete().eq('id', addonId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
