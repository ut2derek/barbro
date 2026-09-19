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
 * BŁĄD SPODZIEWANY — TAKI, KTÓRY POKAZUJEMY UŻYTKOWNIKOWI
 *
 * Zły adres e-mail, zajęty termin, przekroczony limit prób. To nie są awarie,
 * tylko normalny przebieg rozmowy z człowiekiem. Gdyby szły do Sentry, każda
 * literówka klienta wyglądałaby tam jak usterka i utonęłyby w tym prawdziwe
 * awarie.
 *
 * Znacznik siedzi pod symbolem, więc nie da się go podrobić danymi z sieci
 * ani zgubić przy kopiowaniu obiektu.
 */
const EXPECTED = Symbol('błąd spodziewany');

export function markExpected<E extends object>(error: E): E {
  Object.defineProperty(error, EXPECTED, { value: true, enumerable: false });
  return error;
}

export function isExpected(error: unknown): boolean {
  return typeof error === 'object' && error !== null && EXPECTED in error;
}

/**
 * Zgłoszenie błędu. Jedyna droga, którą błąd ma opuścić aplikację — nie
 * używamy `console.error`, bo na telefonie użytkownika nikt go nie przeczyta.
 *
 * `where` to krótka nazwa miejsca („zapis usługi", „lista wizyt"), żeby
 * w Sentry dało się grupować bez czytania stosu wywołań.
 */
export function captureError(error: unknown, where: string, extra?: Record<string, unknown>) {
  // Błąd, który użytkownik już zobaczył na ekranie, nie jest zgłoszeniem.
  if (isExpected(error)) return;

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
