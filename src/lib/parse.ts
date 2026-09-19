/**
 * GRANICA MIĘDZY SERWEREM A APLIKACJĄ
 *
 * Wszystko, co przychodzi z sieci, przechodzi tędy. Wcześniej w dwunastu
 * miejscach stało `as unknown as { ... }` — zapis, który każe TypeScriptowi
 * przestać sprawdzać i uwierzyć nam na słowo. Jeśli baza zwróciła co innego,
 * niż zakładaliśmy, aplikacja dowiadywała się o tym dopiero pustym ekranem.
 *
 * Teraz kształt danych jest opisany schematem (Zod) i sprawdzany naprawdę:
 *
 * - w trakcie pracy nad kodem niezgodność wyrzuca błąd od razu, z nazwą pola,
 * - na produkcji trafia do Sentry i puszczamy dane dalej, żeby drobna różnica
 *   (np. pole, które okazało się opcjonalne) nie zablokowała barberowi ekranu.
 */

import type { ZodType } from 'zod';

import { captureError } from './sentry';

export class ResponseShapeError extends Error {
  constructor(where: string, detail: string) {
    super(`Serwer zwrócił nieoczekiwane dane (${where}): ${detail}`);
    this.name = 'ResponseShapeError';
  }
}

function fail<T>(where: string, detail: string, fallback: unknown): T {
  const error = new ResponseShapeError(where, detail);

  if (__DEV__) throw error;

  captureError(error, 'kształt odpowiedzi', { where, detail });
  return fallback as T;
}

/** Pojedynczy wiersz z bazy albo odpowiedź funkcji serwerowej. */
export function parseRow<T>(schema: ZodType<T>, value: unknown, where: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  return fail<T>(where, describe(result.error.issues), value);
}

/**
 * Lista wierszy. Wiersz, który nie pasuje do schematu, jest pomijany — jedna
 * uszkodzona pozycja nie może wywrócić całej listy wizyt.
 */
export function parseRows<T>(schema: ZodType<T>, value: unknown, where: string): T[] {
  if (!Array.isArray(value)) {
    return fail<T[]>(where, 'oczekiwano listy', []);
  }

  const parsed: T[] = [];
  for (const [index, row] of value.entries()) {
    const result = schema.safeParse(row);
    if (result.success) {
      parsed.push(result.data);
      continue;
    }
    fail<T>(`${where}, pozycja ${index}`, describe(result.error.issues), row);
  }
  return parsed;
}

function describe(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join('.') || '(korzeń)'} — ${issue.message}`)
    .join('; ');
}
