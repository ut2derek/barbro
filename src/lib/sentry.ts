import * as Sentry from '@sentry/react-native';

import { env, isSentryConfigured } from './env';

/** Bez adresu DSN Sentry po prostu się nie włącza — aplikacja działa normalnie. */
export function initSentry() {
  if (!isSentryConfigured) return;

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.environment,
    // Bez profilowania i nagrywania sesji — mniej danych, mniej zgód do zebrania.
    sendDefaultPii: false,
    tracesSampleRate: env.environment === 'production' ? 0.2 : 1.0,
  });
}

/**
 * Zgłoszenie błędu. Jedyna droga, którą błąd ma opuścić aplikację — nie
 * używamy `console.error`, bo na telefonie użytkownika nikt go nie przeczyta.
 *
 * `where` to krótka nazwa miejsca („zapis usługi", „lista wizyt"), żeby
 * w Sentry dało się grupować bez czytania stosu wywołań.
 */
export function captureError(error: unknown, where: string, extra?: Record<string, unknown>) {
  if (__DEV__) {
    console.error(`[${where}]`, error, extra ?? '');
  }

  if (!isSentryConfigured) return;

  Sentry.captureException(error, {
    tags: { where },
    // Nigdy nie wysyłamy tu danych klienta — wyłącznie identyfikatory i kody.
    extra,
  });
}

/**
 * Ślad do odtworzenia drogi użytkownika przed błędem. Bez treści formularzy.
 */
export function leaveBreadcrumb(message: string, data?: Record<string, unknown>) {
  if (!isSentryConfigured) return;
  Sentry.addBreadcrumb({ message, data, level: 'info' });
}
