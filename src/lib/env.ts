import Constants from 'expo-constants';

/**
 * Konfiguracja przez zmienne środowiskowe — w repozytorium nie ma żadnych sekretów.
 * Zmienne z przedrostkiem EXPO_PUBLIC_ trafiają do aplikacji (klucz anon jest
 * publiczny z założenia; dane chroni RLS w bazie, nie ukrywanie klucza).
 */

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

/** Czy adres wskazuje na bazę uruchomioną na tym samym komputerze. */
function isLocalAddress(url: string): boolean {
  return /localhost|127\.0\.0\.1|(?:^|\/\/)(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url);
}

/**
 * Adres lokalnej bazy ustalamy z adresu, spod którego załadowała się sama
 * aplikacja. Dzięki temu telefon trafia po adresie IP komputera, przeglądarka
 * po localhost, a zmiana sieci Wi-Fi niczego nie psuje — wcześniej wpisany
 * na sztywno adres przestawał działać po zmianie adresu IP i wyglądało to
 * jak zepsute logowanie.
 */
function resolveSupabaseUrl(): string {
  if (!__DEV__ || !configuredUrl || !isLocalAddress(configuredUrl)) return configuredUrl;

  // np. „192.168.0.162:8081” albo „localhost:8082”
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  if (!host) return configuredUrl;

  const port = configuredUrl.split(':')[2] ?? '54321';
  return `http://${host}:${port}`;
}

export const env = {
  supabaseUrl: resolveSupabaseUrl(),
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? 'development',
} as const;

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isSentryConfigured = Boolean(env.sentryDsn);