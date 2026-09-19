// LIMIT ZAPYTAŃ DLA FUNKCJI PUBLICZNYCH
//
// Funkcja rezerwacji jest dostępna bez logowania, więc bez limitu każdy mógł
// w pętli zakładać klientów i tworzyć niepotwierdzone rezerwacje — a każda
// z nich blokuje realny termin na `hold_minutes` (domyślnie 20 minut).
//
// Licznik trzymamy w bazie, nie w pamięci funkcji: ta sama funkcja działa
// w wielu kopiach naraz, więc licznik w pamięci policzyłby ułamek zapytań.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { reportError } from './observability.ts';

export type Limit = { limit: number; windowSeconds: number };

/**
 * Limity dobrane tak, żeby nie przeszkadzały człowiekowi:
 * przeglądanie oferty jest tanie, zapis wizyty i wystawienie opinii — drogie.
 */
export const LIMITS: Record<string, Limit> = {
  catalog: { limit: 120, windowSeconds: 60 },
  slots: { limit: 120, windowSeconds: 60 },
  reviews: { limit: 60, windowSeconds: 60 },
  booking: { limit: 60, windowSeconds: 60 },
  reviewState: { limit: 60, windowSeconds: 60 },
  confirm: { limit: 20, windowSeconds: 60 },
  cancel: { limit: 20, windowSeconds: 60 },
  submitReview: { limit: 10, windowSeconds: 60 },
  book: { limit: 5, windowSeconds: 300 },
};

const DEFAULT_LIMIT: Limit = { limit: 30, windowSeconds: 60 };

/**
 * Zwraca `true`, gdy zapytanie mieści się w limicie.
 *
 * Gdy licznik jest niedostępny (awaria bazy), przepuszczamy. Rezerwacje mają
 * przestać działać z powodu awarii licznika — to gorsze niż chwilowy brak
 * ochrony, a prawdziwą blokadę podwójnej rezerwacji i tak trzyma baza.
 */
export async function withinLimit(
  admin: SupabaseClient,
  action: string,
  ip: string,
): Promise<boolean> {
  const { limit, windowSeconds } = LIMITS[action] ?? DEFAULT_LIMIT;

  const { data, error } = await admin.rpc('rate_limit_take', {
    p_bucket: `${action}:${ip}`,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    reportError(error, 'limit zapytań', { action });
    return true;
  }

  return data !== false;
}
