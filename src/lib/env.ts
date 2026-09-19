/**
 * Konfiguracja przez zmienne środowiskowe — w repozytorium nie ma żadnych sekretów.
 * Zmienne z przedrostkiem EXPO_PUBLIC_ trafiają do aplikacji (klucz anon jest
 * publiczny z założenia; dane chroni RLS w bazie, nie ukrywanie klucza).
 */

export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? 'development',
} as const;

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isSentryConfigured = Boolean(env.sentryDsn);
