import { Client } from 'pg';

/**
 * POŁĄCZENIE Z LOKALNĄ BAZĄ
 *
 * Testy uderzają w prawdziwą bazę postawioną przez `npm run db:start`, nie
 * w atrapę — sprawdzamy te funkcje SQL i reguły dostępu, które pojadą na
 * produkcję. Adres można nadpisać, gdy baza stoi gdzie indziej.
 */
export const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Adresy lokalnej Supabase (te same, które wypisuje `supabase start`). */
export const LOCAL_API_URL = process.env.TEST_SUPABASE_URL ?? 'http://127.0.0.1:54321';

/**
 * Klucze demonstracyjne lokalnej Supabase — identyczne na każdej maszynie,
 * nie są sekretem i nie mają nic wspólnego z produkcją.
 */
export const LOCAL_ANON_KEY =
  process.env.TEST_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export const LOCAL_SERVICE_KEY =
  process.env.TEST_SUPABASE_SERVICE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/**
 * Klient bazy z jedną dodatkową możliwością: `asUser` przełącza tożsamość na
 * wskazanego użytkownika, żeby zadziałały reguły dostępu (RLS). Bez tego
 * zapytanie leci jako `postgres`, który widzi wszystko — i test niczego nie
 * sprawdza.
 */
export type Db = Client & {
  asUser: (userId: string) => Promise<void>;
};

/**
 * Test w transakcji, która na końcu zawsze się wycofuje. Dzięki temu testy
 * nie zostawiają po sobie danych i mogą iść jeden po drugim bez sprzątania.
 */
export async function withRollback<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: CONNECTION_STRING });
  await client.connect();

  const db = client as Db;
  db.asUser = async (userId: string) => {
    // `true` = ustawienie znika razem z transakcją, więc nie przecieka
    // do kolejnego testu.
    await client.query("select set_config('role', 'authenticated', true)");
    await client.query(
      "select set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)",
      [userId],
    );
  };

  try {
    await db.query('begin');
    return await fn(db);
  } finally {
    // Wycofanie nawet po błędzie — inaczej nieudany test psułby kolejne.
    await db.query('rollback').catch(() => undefined);
    await db.end().catch(() => undefined);
  }
}

/**
 * Zeruje liczniki limitu zapytań. Testy funkcji publicznej biją w nią
 * dziesiątki razy z jednego adresu, więc bez tego przekroczyłyby limit,
 * który w normalnej pracy dotyczy botów, nie ludzi.
 */
export async function resetRateLimits(): Promise<void> {
  const client = new Client({ connectionString: CONNECTION_STRING });
  await client.connect();
  await client.query('delete from public.rate_limits');
  await client.end();
}

// ─────────────────────────── dane testowe ───────────────────────────
// Identyfikatory z `supabase/seed.sql`. Trzymamy je tutaj, żeby test czytał
// się jak zdanie („wizyta Marka w głównym salonie"), a nie jak ciąg zer.

export const USERS = {
  admin: '10000000-0000-0000-0000-000000000001',
  owner: '10000000-0000-0000-0000-000000000002',
  staff: '10000000-0000-0000-0000-000000000003',
  /** Właściciel drugiego salonu — służy do sprawdzania izolacji danych. */
  otherSalonOwner: '10000000-0000-0000-0000-000000000004',
} as const;

export const SALONS = {
  main: '20000000-0000-0000-0000-000000000001',
  other: '20000000-0000-0000-0000-000000000002',
} as const;

export const STAFF = {
  marek: '30000000-0000-0000-0000-000000000001',
  tomek: '30000000-0000-0000-0000-000000000002',
} as const;

export const SERVICES = {
  haircut: '50000000-0000-0000-0000-000000000001',
  beard: '50000000-0000-0000-0000-000000000002',
  coloring: '50000000-0000-0000-0000-000000000003',
} as const;

export const CLIENTS = {
  jan: '60000000-0000-0000-0000-000000000001',
  piotr: '60000000-0000-0000-0000-000000000002',
  anna: '60000000-0000-0000-0000-000000000003',
} as const;

/**
 * Rezerwacje z danych testowych.
 *
 * Testy nie szukają wizyty przez `where status = '…' limit 1`, bo zadania
 * cykliczne zmieniają status w trakcie dnia: wizyta „dzisiaj o 10:00" jest
 * potwierdzona rano, a po godzinie 10 zamyka ją `mark_past_bookings_completed`.
 * Test uruchomiony po południu szukał wtedy wizyty, której już nie ma.
 *
 * Wizyta z wczoraj jest zamknięta na stałe — tylko na niej można polegać.
 */
export const BOOKINGS = {
  /** Wczoraj u Tomka, status `completed`. Jedyna niezmienna w czasie. */
  completed: '70000000-0000-0000-0000-000000000004',
} as const;

/**
 * Fragment SQL z chwilą w czasie warszawskim, liczoną od dzisiaj. Wstawiamy go
 * wprost do zapytania, a strefę przelicza Postgres — dzięki temu testy
 * przechodzą także w dobę zmiany czasu, kiedy ręczne składanie godzin myli się
 * o godzinę.
 *
 * ```ts
 * warsawTime(3, '10:00')  //  timestamptz '2026-09-22 10:00 Europe/Warsaw'
 * ```
 */
export function warsawTime(dayOffset: number, time: string): string {
  const day = new Date();
  day.setDate(day.getDate() + dayOffset);

  // Dzień składamy z części lokalnych, nie z `toISOString()`. To drugie podaje
  // dzień w UTC, więc test uruchomiony w Polsce po północy (latem UTC ma wtedy
  // jeszcze poprzedni dzień) celowałby w dobę wcześniej — ten sam błąd, który
  // psuł rezerwacje „u dowolnego fryzjera”.
  const date = [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, '0'),
    String(day.getDate()).padStart(2, '0'),
  ].join('-');

  return `timestamptz '${date} ${time} Europe/Warsaw'`;
}
