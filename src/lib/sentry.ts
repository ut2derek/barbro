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
