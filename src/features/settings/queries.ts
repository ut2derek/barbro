import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { getSupabase } from '@/lib/supabase';

export type SalonSettings = {
  id: string;
  name: string;
  slug: string;
  brandColor: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  autoAccept: boolean;
  holdMinutes: number;
  minLeadMinutes: number;
  bookingHorizonDays: number;
  slotStepMinutes: number;
  clientCancelLeadHours: number;
  cancellationPolicyText: string | null;
  onlineBookingEnabled: boolean;
  calendarEventTitleTemplate: string;
};

export function useSalonSettings(salonId: string | undefined) {
  return useQuery({
    queryKey: ['salon-settings', salonId],
    enabled: Boolean(salonId),
    queryFn: async (): Promise<SalonSettings> => {
      const { data, error } = await getSupabase()
        .from('salons')
        .select('*')
        .eq('id', salonId!)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        name: data.name,
        slug: data.slug,
        brandColor: data.brand_color,
        addressLine: data.address_line,
        postalCode: data.postal_code,
        city: data.city,
        phone: data.phone,
        email: data.email,
        autoAccept: data.auto_accept,
        holdMinutes: data.hold_minutes,
        minLeadMinutes: data.min_lead_minutes,
        bookingHorizonDays: data.booking_horizon_days,
        slotStepMinutes: data.slot_step_minutes,
        clientCancelLeadHours: data.client_cancel_lead_hours,
        cancellationPolicyText: data.cancellation_policy_text,
        onlineBookingEnabled: data.online_booking_enabled,
        calendarEventTitleTemplate: data.calendar_event_title_template,
      };
    },
  });
}

export function useUpdateSalonSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (args: { salonId: string; changes: Partial<SalonSettings> }) => {
      const { changes } = args;

      // Kształt zgodny ze schematem bazy — literówka w nazwie kolumny nie przejdzie.
      const payload: Database['public']['Tables']['salons']['Update'] = {};
      if (changes.name !== undefined) payload.name = changes.name.trim();
      if (changes.brandColor !== undefined) payload.brand_color = changes.brandColor;
      if (changes.addressLine !== undefined) payload.address_line = changes.addressLine;
      if (changes.postalCode !== undefined) payload.postal_code = changes.postalCode;
      if (changes.city !== undefined) payload.city = changes.city;
      if (changes.phone !== undefined) payload.phone = changes.phone;
      if (changes.email !== undefined) payload.email = changes.email;
      if (changes.autoAccept !== undefined) payload.auto_accept = changes.autoAccept;
      if (changes.holdMinutes !== undefined) payload.hold_minutes = changes.holdMinutes;
      if (changes.minLeadMinutes !== undefined) payload.min_lead_minutes = changes.minLeadMinutes;
      if (changes.bookingHorizonDays !== undefined)
        payload.booking_horizon_days = changes.bookingHorizonDays;
      if (changes.slotStepMinutes !== undefined) payload.slot_step_minutes = changes.slotStepMinutes;
      if (changes.clientCancelLeadHours !== undefined)
        payload.client_cancel_lead_hours = changes.clientCancelLeadHours;
      if (changes.cancellationPolicyText !== undefined)
        payload.cancellation_policy_text = changes.cancellationPolicyText;
      if (changes.onlineBookingEnabled !== undefined)
        payload.online_booking_enabled = changes.onlineBookingEnabled;
      if (changes.calendarEventTitleTemplate !== undefined)
        payload.calendar_event_title_template = changes.calendarEventTitleTemplate;

      const { error } = await getSupabase().from('salons').update(payload).eq('id', args.salonId);
      if (error) throw error;
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['salon-settings', variables.salonId] });
      void queryClient.invalidateQueries({ queryKey: ['current-salon'] });
      // Zmiana siatki, wyprzedzenia czy horyzontu zmienia wolne terminy.
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
    },
  });
}
