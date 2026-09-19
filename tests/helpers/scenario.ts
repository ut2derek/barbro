import { DateTime } from 'luxon';

import type { Db } from './db';

/**
 * Budowanie scenariuszy pod testy dostępności.
 * Każdy test tworzy własny salon, więc nie zależy od danych testowych ani
 * od innych testów — a transakcja i tak jest na końcu wycofywana.
 */

export const TZ = 'Europe/Warsaw';

type SalonOptions = {
  slotStep?: number;
  minLead?: number;
  horizon?: number;
  timezone?: string;
  active?: boolean;
};

export async function createSalon(db: Db, options: SalonOptions = {}): Promise<string> {
  const { rows } = await db.query(
    `insert into public.salons
       (name, slug, slot_step_minutes, min_lead_minutes, booking_horizon_days, timezone, active)
     values ('Salon testowy', 'test-' || replace(gen_random_uuid()::text, '-', ''), $1, $2, $3, $4, $5)
     returning id`,
    [
      options.slotStep ?? 15,
      options.minLead ?? 0,
      options.horizon ?? 365,
      options.timezone ?? TZ,
      options.active ?? true,
    ],
  );
  return rows[0].id;
}

export async function addStaff(db: Db, salonId: string, name = 'Fryzjer'): Promise<string> {
  const { rows } = await db.query(
    `insert into public.staff (salon_id, display_name) values ($1, $2) returning id`,
    [salonId, name],
  );
  return rows[0].id;
}

export async function addService(
  db: Db,
  salonId: string,
  options: { duration: number; buffer?: number; name?: string },
): Promise<string> {
  const { rows } = await db.query(
    `insert into public.services (salon_id, name, duration_minutes, buffer_after_minutes, price_grosz)
     values ($1, $2, $3, $4, 10000) returning id`,
    [salonId, options.name ?? 'Usługa', options.duration, options.buffer ?? 0],
  );
  return rows[0].id;
}

export async function assignService(
  db: Db,
  salonId: string,
  staffId: string,
  serviceId: string,
  overrides: { duration?: number; price?: number } = {},
): Promise<void> {
  await db.query(
    `insert into public.staff_services (salon_id, staff_id, service_id, duration_minutes_override, price_grosz_override)
     values ($1, $2, $3, $4, $5)`,
    [salonId, staffId, serviceId, overrides.duration ?? null, overrides.price ?? null],
  );
}

export async function setSalonHours(
  db: Db,
  salonId: string,
  weekday: number,
  open: string,
  close: string,
): Promise<void> {
  await db.query(
    // „set”, nie „add” — ponowne ustawienie tego samego dnia ma nadpisać
    // godziny, a nie wywrócić się na unikalności.
    `insert into public.salon_hours (salon_id, weekday, open_time, close_time)
     values ($1, $2, $3, $4)
     on conflict (salon_id, weekday, open_time) do update set close_time = excluded.close_time`,
    [salonId, weekday, open, close],
  );
}

export async function setWorkingHours(
  db: Db,
  salonId: string,
  staffId: string,
  weekday: number,
  start: string,
  end: string,
): Promise<void> {
  await db.query(
    `insert into public.working_hours (salon_id, staff_id, weekday, start_time, end_time) values ($1, $2, $3, $4, $5)`,
    [salonId, staffId, weekday, start, end],
  );
}

export type Slot = { slot_start: Date; slot_end: Date; staff_id: string };

export async function availableSlots(
  db: Db,
  salonId: string,
  serviceIds: string[],
  day: string,
  staffId?: string,
): Promise<Slot[]> {
  const { rows } = await db.query(
    `select slot_start, slot_end, staff_id
     from public.get_available_slots($1, $2::uuid[], $3::date, $4::date, $5)`,
    [salonId, serviceIds, day, day, staffId ?? null],
  );
  return rows;
}

/** Godziny slotów w strefie salonu, w kolejności — wygodne do porównań w testach. */
export function localTimes(slots: Slot[], zone = TZ): string[] {
  return slots.map((s) => DateTime.fromJSDate(s.slot_start).setZone(zone).toFormat('HH:mm'));
}

export function utcTimes(slots: Slot[]): string[] {
  return slots.map((s) => DateTime.fromJSDate(s.slot_start).toUTC().toFormat('HH:mm'));
}

/** Poniedziałek oddalony o co najmniej cztery tygodnie — daleko od „dziś”. */
export function futureMonday(): { date: string; weekday: number } {
  const monday = DateTime.now().setZone(TZ).plus({ days: 28 }).startOf('week');
  return { date: monday.toFormat('yyyy-MM-dd'), weekday: 1 };
}

export function dayAfter(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: TZ }).plus({ days }).toFormat('yyyy-MM-dd');
}

/** Znacznik czasu z godziny lokalnej danego dnia — tak samo liczy to aplikacja. */
export function at(date: string, time: string, zone = TZ): Date {
  return DateTime.fromISO(`${date}T${time}`, { zone }).toJSDate();
}