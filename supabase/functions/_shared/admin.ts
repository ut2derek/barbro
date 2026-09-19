// Klient bazy z pełnymi uprawnieniami. Używany wyłącznie w funkcjach
// serwerowych, które same pilnują, komu wolno co zobaczyć.

import { createClient } from 'jsr:@supabase/supabase-js@2';

export const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/**
 * Dzień kalendarzowy w strefie salonu.
 *
 * Wcześniej dzień liczyliśmy przez `toISOString()`, czyli w czasie UTC.
 * Latem, przy przesunięciu +2 h, termin o 00:30 czasu polskiego wypadał
 * „wczoraj" i rezerwacja u dowolnego fryzjera kończyła się komunikatem
 * „termin nie jest już dostępny".
 */
export function dayInZone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}