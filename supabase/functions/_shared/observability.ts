// ZGŁASZANIE BŁĘDÓW Z FUNKCJI SERWEROWYCH
//
// Dotąd funkcje brzegowe robiły `console.error` i na tym się kończyło —
// logi funkcji nikt nie czyta codziennie, więc awaria rezerwacji online mogła
// trwać godzinami, zanim ktokolwiek by ją zauważył.
//
// Sentry przyjmuje zgłoszenia zwykłym żądaniem HTTP, więc nie potrzebujemy tu
// żadnej biblioteki. Bez ustawionego `SENTRY_DSN` zostaje sam log — funkcja
// działa normalnie.

type Extra = Record<string, unknown>;

const DSN = Deno.env.get('SENTRY_DSN') ?? '';
const ENVIRONMENT = Deno.env.get('SENTRY_ENVIRONMENT') ?? 'development';

/** Rozbiera adres DSN na adres przyjmujący zgłoszenia i klucz. */
function parseDsn(dsn: string): { url: string; key: string } | null {
  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.replace('/', '');
    if (!projectId || !parsed.username) return null;
    return {
      url: `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/`,
      key: parsed.username,
    };
  } catch {
    return null;
  }
}

const TARGET = DSN ? parseDsn(DSN) : null;

/**
 * Zgłasza błąd. Nie rzuca dalej i nie czeka na odpowiedź Sentry — zgłoszenie
 * nie może opóźnić ani wywrócić odpowiedzi dla klienta.
 *
 * `where` to krótka nazwa operacji („rezerwacja", „potwierdzenie"), po której
 * grupujemy zgłoszenia. W `extra` trafiają wyłącznie identyfikatory i kody —
 * nigdy dane osobowe klienta.
 */
export function reportError(error: unknown, where: string, extra?: Extra): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(JSON.stringify({ level: 'error', where, detail, ...extra }));

  if (!TARGET) return;

  const eventId = crypto.randomUUID().replaceAll('-', '');
  const envelope =
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }) +
    '\n' +
    JSON.stringify({ type: 'event' }) +
    '\n' +
    JSON.stringify({
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      environment: ENVIRONMENT,
      server_name: 'supabase-edge',
      tags: { where },
      extra,
      exception: {
        values: [
          {
            type: error instanceof Error ? error.name : 'Error',
            value: error instanceof Error ? error.message : String(error),
            stacktrace: error instanceof Error && error.stack ? { frames: [] } : undefined,
          },
        ],
      },
    });

  // Celowo bez `await`: zgłoszenie leci w tle.
  fetch(TARGET.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${TARGET.key}`,
    },
    body: envelope,
  }).catch(() => {
    // Sentry niedostępne — trudno. Log już jest.
  });
}
