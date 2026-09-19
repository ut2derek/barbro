// WIZYTA ODCZYTANA Z LINKU
//
// Klient nie ma konta. Jedynym dowodem, że wizyta jest jego, jest token
// z maila. W bazie trzymamy wyłącznie jego skrót, więc nawet dostęp do bazy
// nie pozwala odtworzyć wysłanego linku.
//
// WAŻNE: data ważności linku jest sprawdzana TUTAJ, przy odczycie wizyty.
// Wcześniej sprawdzał ją tylko podgląd wizyty, a potwierdzenie i odwołanie
// nie — wygasły link nadal pozwalał odwołać cudzą wizytę.

import { admin } from '../_shared/admin.ts';
import { json } from '../_shared/http.ts';

const BOOKING_COLUMNS =
  'id, salon_id, starts_at, ends_at, status, total_price_grosz, manage_token_expires_at, ' +
  'staff ( display_name ), clients ( first_name ), booking_items ( name_snapshot, item_order ), ' +
  'salons ( name, timezone, client_cancel_lead_hours, auto_accept, cancellation_policy_text )';

export function newToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type Joined = {
  id: string;
  salon_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  total_price_grosz: number;
  manage_token_expires_at: string | null;
  staff: { display_name: string } | null;
  clients: { first_name: string } | null;
  booking_items: { name_snapshot: string; item_order: number }[];
  salons: {
    name: string;
    timezone: string;
    client_cancel_lead_hours: number;
    auto_accept: boolean;
    cancellation_policy_text: string | null;
  };
};

export type FoundBooking =
  | { ok: true; booking: Joined }
  | { ok: false; response: Response };

/**
 * Wizyta spod tokenu albo gotowa odpowiedź z odmową. Każda operacja na linku
 * przechodzi tędy — nie ma drogi obok sprawdzenia ważności.
 */
export async function bookingByToken(token: string): Promise<FoundBooking> {
  const { data, error } = await admin
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('manage_token_hash', await hashToken(token))
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return { ok: false, response: json({ error: 'Link jest nieprawidłowy albo wygasł' }, 404) };
  }

  const booking = data as unknown as Joined;
  const expiresAt = booking.manage_token_expires_at;

  if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
    return { ok: false, response: json({ error: 'Link wygasł' }, 410) };
  }

  return { ok: true, booking };
}

/** Wizyta w postaci, którą pokazujemy klientowi. Bez danych innych osób. */
export function describe(booking: Joined) {
  const salon = booking.salons;
  const hoursToVisit = (new Date(booking.starts_at).getTime() - Date.now()) / (60 * 60 * 1000);

  return {
    id: booking.id,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    status: booking.status,
    totalPriceGrosz: booking.total_price_grosz,
    staffName: booking.staff?.display_name ?? '',
    clientName: booking.clients?.first_name ?? '',
    services: [...booking.booking_items]
      .sort((a, b) => a.item_order - b.item_order)
      .map((item) => item.name_snapshot),
    salonName: salon.name,
    timezone: salon.timezone,
    cancellationPolicy: salon.cancellation_policy_text,
    // Reguła salonu: do ilu godzin przed wizytą klient może ją sam odwołać.
    canCancel:
      ['pending_confirmation', 'pending_approval', 'confirmed'].includes(booking.status) &&
      hoursToVisit >= salon.client_cancel_lead_hours,
    cancelLeadHours: salon.client_cancel_lead_hours,
  };
}
