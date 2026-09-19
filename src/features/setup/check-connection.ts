import { env } from '@/lib/env';

/**
 * Najprostszy możliwy test: czy adres projektu i klucz anon są poprawne.
 * Odpytujemy korzeń API REST — bez żadnej tabeli, więc działa od pierwszego dnia.
 */
export async function checkSupabaseConnection(): Promise<void> {
  const response = await fetch(`${env.supabaseUrl}/rest/v1/`, {
    headers: { apikey: env.supabaseAnonKey },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}
