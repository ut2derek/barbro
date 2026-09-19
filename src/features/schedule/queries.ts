import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import type { Database } from '@/lib/database.types';
import { parseRows } from '@/lib/parse';
import { invalidateSchedule, queryKeys } from '@/lib/query-keys';
import { getSupabase } from '@/lib/supabase';

export type TimeWindow = {
  id: string;
  weekday: number;
  from: string;
  to: string;
};

export type ScheduleException = {
  id: string;
  staffId: string | null;
  staffName: string | null;
  type: Database['public']['Enums']['schedule_exception_type'];
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
};

/** Poniedziałek = 1, niedziela = 7 — tak samo liczy to Postgres. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Godziny w bazie mają sekundy; interfejs pokazuje same godziny i minuty. */
function trimTime(value: string): string {
  return value.slice(0, 5);
}

export function useSalonHours(salonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.salonHours(salonId),
    enabled: Boolean(salonId),
    queryFn: async (): Promise<TimeWindow[]> => {
      const { data, error } = await getSupabase()
        .from('salon_hours')
        .select('id, weekday, open_time, close_time')
        .eq('salon_id', salonId!)
        .order('weekday')
        .order('open_time');

      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        weekday: row.weekday,
        from: trimTime(row.open_time),
        to: trimTime(row.close_time),
      }));
    },
  });
}

export function useWorkingHours(args: { salonId: string | undefined; staffId: string | null }) {
  return useQuery({
    queryKey: queryKeys.workingHours(args.salonId, args.staffId),
    enabled: Boolean(args.salonId) && Boolean(args.staffId),
    queryFn: async (): Promise<TimeWindow[]> => {
      const { data, error } = await getSupabase()
        .from('working_hours')
        .select('id, weekday, start_time, end_time')
        .eq('staff_id', args.staffId!)
        .order('weekday')
        .order('start_time');

      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        weekday: row.weekday,
        from: trimTime(row.start_time),
        to: trimTime(row.end_time),
      }));
    },
  });
}

/**
 * Kształt wiersza z dołączoną tabelą `staff`. Supabase nie potrafi otypować
 * dołączeń, więc wcześniej stało tu `as unknown as` — zapis, który wyłącza
 * sprawdzanie typów. Schemat sprawdza to naprawdę.
 */
const exceptionRow = z.object({
  id: z.string(),
  staff_id: z.string().nullable(),
  exception_type: z.string(),
  starts_on: z.string(),
  ends_on: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  reason: z.string().nullable(),
  staff: z.object({ display_name: z.string() }).nullable(),
});

export function useScheduleExceptions(salonId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.scheduleExceptions(salonId),
    enabled: Boolean(salonId),
    queryFn: async (): Promise<ScheduleException[]> => {
      const { data, error } = await getSupabase()
        .from('schedule_exceptions')
        .select(
          'id, staff_id, exception_type, starts_on, ends_on, start_time, end_time, reason, staff ( display_name )',
        )
        .eq('salon_id', salonId!)
        .gte('ends_on', new Date().toISOString().slice(0, 10))
        .order('starts_on');

      if (error) throw error;

      return parseRows(exceptionRow, data, 'wyjątki w grafiku').map((row) => ({
        id: row.id,
        staffId: row.staff_id,
        staffName: row.staff?.display_name ?? null,
        type: row.exception_type as ScheduleException['type'],
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        startTime: row.start_time ? trimTime(row.start_time) : null,
        endTime: row.end_time ? trimTime(row.end_time) : null,
        reason: row.reason,
      }));
    },
  });
}

/**
 * Zmiana grafiku przelicza wolne terminy — także te, które widzi klient na
 * stronie rezerwacji. Co dokładnie odświeżyć, mówi `query-keys.ts`.
 */
function useScheduleInvalidation() {
  const queryClient = useQueryClient();

  return () => invalidateSchedule(queryClient);
}

export function useAddSalonHours() {
  const invalidate = useScheduleInvalidation();

  return useMutation({
    mutationFn: async (args: { salonId: string; weekday: number; from: string; to: string }) => {
      const { error } = await getSupabase().from('salon_hours').insert({
        salon_id: args.salonId,
        weekday: args.weekday,
        open_time: args.from,
        close_time: args.to,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRemoveSalonHours() {
  const invalidate = useScheduleInvalidation();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from('salon_hours').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useAddWorkingHours() {
  const invalidate = useScheduleInvalidation();

  return useMutation({
    mutationFn: async (args: {
      salonId: string;
      staffId: string;
      weekday: number;
      from: string;
      to: string;
    }) => {
      const { error } = await getSupabase().from('working_hours').insert({
        salon_id: args.salonId,
        staff_id: args.staffId,
        weekday: args.weekday,
        start_time: args.from,
        end_time: args.to,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRemoveWorkingHours() {
  const invalidate = useScheduleInvalidation();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from('working_hours').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Kopiowanie jednego dnia na pozostałe dni robocze — najczęstszy układ w salonie. */
export function useCopyWorkingDay() {
  const invalidate = useScheduleInvalidation();

  return useMutation({
    mutationFn: async (args: {
      salonId: string;
      staffId: string;
      source: TimeWindow[];
      targetWeekdays: number[];
    }) => {
      const supabase = getSupabase();

      const { error: clearError } = await supabase
        .from('working_hours')
        .delete()
        .eq('staff_id', args.staffId)
        .in('weekday', args.targetWeekdays);
      if (clearError) throw clearError;

      if (args.source.length === 0) return;

      const rows = args.targetWeekdays.flatMap((weekday) =>
        args.source.map((window) => ({
          salon_id: args.salonId,
          staff_id: args.staffId,
          weekday,
          start_time: window.from,
          end_time: window.to,
        })),
      );

      const { error } = await supabase.from('working_hours').insert(rows);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useAddScheduleException() {
  const invalidate = useScheduleInvalidation();

  return useMutation({
    mutationFn: async (args: {
      salonId: string;
      staffId: string | null;
      type: Database['public']['Enums']['schedule_exception_type'];
      startsOn: string;
      endsOn: string;
      startTime?: string | null;
      endTime?: string | null;
      reason?: string;
    }) => {
      const { error } = await getSupabase().from('schedule_exceptions').insert({
        salon_id: args.salonId,
        staff_id: args.staffId,
        exception_type: args.type,
        starts_on: args.startsOn,
        ends_on: args.endsOn,
        start_time: args.startTime ?? null,
        end_time: args.endTime ?? null,
        reason: args.reason?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRemoveScheduleException() {
  const invalidate = useScheduleInvalidation();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from('schedule_exceptions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}