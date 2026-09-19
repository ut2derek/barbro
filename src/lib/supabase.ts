import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from './database.types';
import { env, isSupabaseConfigured } from './env';

let client: SupabaseClient<Database> | null = null;

/**
 * Klient Supabase, otypowany schematem bazy (`database.types.ts`, generowane
 * przez `npm run db:types`). Dzięki temu literówka w nazwie kolumny wychodzi
 * przy sprawdzaniu typów, a nie u barbera na telefonie.
 * Tworzony przy pierwszym użyciu, żeby aplikacja uruchamiała się
 * także bez konfiguracji (przydatne na starcie projektu i w testach).
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Brak konfiguracji Supabase. Uzupełnij EXPO_PUBLIC_SUPABASE_URL i EXPO_PUBLIC_SUPABASE_ANON_KEY w pliku .env.local.',
    );
  }

  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // W aplikacji natywnej sesja nigdy nie przychodzi w adresie URL.
        detectSessionInUrl: Platform.OS === 'web',
      },
    });

    // Odświeżanie tokenu tylko gdy aplikacja jest na wierzchu.
    AppState.addEventListener('change', (state) => {
      if (!client) return;
      if (state === 'active') {
        void client.auth.startAutoRefresh();
      } else {
        void client.auth.stopAutoRefresh();
      }
    });
  }

  return client;
}