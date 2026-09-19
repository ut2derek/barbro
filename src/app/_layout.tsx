import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';

import { AuthProvider } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';
import { initSentry } from '@/lib/sentry';
import { AppThemeProvider, useTheme } from '@/theme';

initSentry();

/** Motyw nawigacji karmiony naszymi tokenami, żeby nie było dwóch źródeł kolorów. */
function NavigationTheme({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const base = theme.name === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          background: theme.colors.background,
          card: theme.colors.surfaceElevated,
          text: theme.colors.textPrimary,
          border: theme.colors.border,
          primary: theme.colors.accent,
        },
      }}
    >
      {children}
      <StatusBar style={theme.name === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppThemeProvider>
          <NavigationTheme>
            <Stack screenOptions={{ headerShown: false }} />
          </NavigationTheme>
        </AppThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}