import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateTeam, queryKeys } from '@/lib/query-keys';
import { getSupabase } from '@/lib/supabase';

export type TeamMember = {
  id: string;
  displayName: string;
  bio: string | null;
  active: boolean;
  sortOrder: number;
  /** Pusty = pracownik bez konta; kalendarz prowadzi właściciel. */
  hasAccount: boolean;
  role: 'owner' | 'staff' | null;
};

export type StaffServiceAssignment = {
  serviceId: string;
  serviceName: string;
  assigned: boolean;
  priceOverrideGrosz: number | null;
  durationOverrideMinutes: number | null;
  basePriceGrosz: number;
  baseDurationMinutes: number;
};

export function useTeam(salonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.team(salonId),
    enabled: Boolean(salonId),
    queryFn: async (): Promise<TeamMember[]> => {
      const supabase = getSupabase();

      const [staffResult, membersResult] = await Promise.all([
        supabase
          .from('staff')
          .select('id, display_name, bio, active, sort_order, user_id')
          .eq('salon_id', salonId!)
          .order('sort_order'),
        supabase.from('salon_members').select('user_id, role').eq('salon_id', salonId!),
      ]);

      if (staffResult.error) throw staffResult.error;
      if (membersResult.error) throw membersResult.error;

      const roles = new Map(membersResult.data.map((row) => [row.user_id, row.role]));

      return staffResult.data.map((member) => ({
        id: member.id,
        displayName: member.display_name,
        bio: member.bio,
        active: member.active,
        sortOrder: member.sort_order,
        hasAccount: member.user_id !== null,
        role: member.user_id ? (roles.get(member.user_id) ?? null) : null,
      }));
    },
  });
}

function useTeamInvalidation() {
  const queryClient = useQueryClient();

  return () => invalidateTeam(queryClient);
}

export function useSaveStaff() {
  const invalidate = useTeamInvalidation();

  return useMutation({
    mutationFn: async (args: {
      salonId: string;
      id?: string;
      displayName: string;
      bio: string | null;
      active: boolean;
      sortOrder?: number;
    }): Promise<string> => {
      const supabase = getSupabase();
      const payload = {
        salon_id: args.salonId,
        display_name: args.displayName.trim(),
        bio: args.bio?.trim() || null,
        active: args.active,
        ...(args.sortOrder !== undefined ? { sort_order: args.sortOrder } : {}),
      };

      if (args.id) {
        const { error } = await supabase.from('staff').update(payload).eq('id', args.id);
        if (error) throw error;
        return args.id;
      }

      const { data, error } = await supabase.from('staff').insert(payload).select('id').single();
      if (error) throw error;

      // Nowy fryzjer domyślnie wykonuje wszystkie usługi salonu — inaczej
      // nie dałoby się go wybrać przy rezerwacji.
      const { data: services, error: servicesError } = await supabase
        .from('services')
        .select('id')
        .eq('salon_id', args.salonId);
      if (servicesError) throw servicesError;

      if (services.length > 0) {
        const { error: assignError } = await supabase.from('staff_services').insert(
          services.map((service) => ({
            salon_id: args.salonId,
            staff_id: data.id,
            service_id: service.id,
          })),
        );
        if (assignError) throw assignError;
      }

      return data.id;
    },
    onSuccess: invalidate,
  });
}

export function useStaffServices(args: { salonId: string | undefined; staffId: string | undefined }) {
  return useQuery({
    queryKey: queryKeys.staffServices(args.salonId, args.staffId),
    enabled: Boolean(args.salonId) && Boolean(args.staffId),
    queryFn: async (): Promise<StaffServiceAssignment[]> => {
      const supabase = getSupabase();

      const [servicesResult, assignmentsResult] = await Promise.all([
        supabase
          .from('services')
          .select('id, name, price_grosz, duration_minutes')
          .eq('salon_id', args.salonId!)
          .order('sort_order'),
        supabase
          .from('staff_services')
          .select('service_id, price_grosz_override, duration_minutes_override')
          .eq('staff_id', args.staffId!),
      ]);

      if (servicesResult.error) throw servicesResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;

      const assignments = new Map(assignmentsResult.data.map((row) => [row.service_id, row]));

      return servicesResult.data.map((service) => {
        const assignment = assignments.get(service.id);
        return {
          serviceId: service.id,
          serviceName: service.name,
          assigned: Boolean(assignment),
          priceOverrideGrosz: assignment?.price_grosz_override ?? null,
          durationOverrideMinutes: assignment?.duration_minutes_override ?? null,
          basePriceGrosz: service.price_grosz,
          baseDurationMinutes: service.duration_minutes,
        };
      });
    },
  });
}

export function useToggleStaffService() {
  const invalidate = useTeamInvalidation();

  return useMutation({
    mutationFn: async (args: {
      salonId: string;
      staffId: string;
      serviceId: string;
      assign: boolean;
    }) => {
      const supabase = getSupabase();

      if (args.assign) {
        const { error } = await supabase.from('staff_services').insert({
          salon_id: args.salonId,
          staff_id: args.staffId,
          service_id: args.serviceId,
        });
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('staff_services')
        .delete()
        .eq('staff_id', args.staffId)
        .eq('service_id', args.serviceId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetStaffServiceOverride() {
  const invalidate = useTeamInvalidation();

  return useMutation({
    mutationFn: async (args: {
      staffId: string;
      serviceId: string;
      priceGrosz: number | null;
      durationMinutes: number | null;
    }) => {
      const { error } = await getSupabase()
        .from('staff_services')
        .update({
          price_grosz_override: args.priceGrosz,
          duration_minutes_override: args.durationMinutes,
        })
        .eq('staff_id', args.staffId)
        .eq('service_id', args.serviceId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}