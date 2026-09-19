import type { Session, User } from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isSupabaseConfigured } from './env';
import { getSupabase } from './supabase';

type AuthState = {
  /** null = niezalogowany, undefined = jeszcze nie wiemy (sprawdzamy zapisaną sesję) */
  session: Session | null | undefined;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string, redirectTo: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(
    isSupabaseConfigured ? undefined : null,
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = getSupabase();

    // Sesja zapisana na urządzeniu — logowanie przeżywa zamknięcie aplikacji.
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));

    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,

      async signIn(email, password) {
        const { error } = await getSupabase().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },

      async signOut() {
        const { error } = await getSupabase().auth.signOut();
        if (error) throw error;
      },

      async sendPasswordReset(email, redirectTo) {
        const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
          redirectTo,
        });
        if (error) throw error;
      },

      async updatePassword(password) {
        const { error } = await getSupabase().auth.updateUser({ password });
        if (error) throw error;
      },

      /**
       * Usunięcie konta musi dziać się po stronie serwera — aplikacja nie ma
       * (i nie może mieć) uprawnień do kasowania kont.
       */
      async deleteAccount() {
        const supabase = getSupabase();
        const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
        if (error) throw error;
        await supabase.auth.signOut();
      },
    }),
    [session],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth musi być użyte wewnątrz AuthProvider');
  return value;
}
