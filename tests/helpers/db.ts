import { Client } from 'pg';

/**
 * Połączenie z lokalną bazą Supabase (`npm run db:start`).
 * Testy sprawdzają prawdziwe funkcje i reguły w bazie, a nie ich kopię w JS —
 * dokładnie ten sam kod obsłuży aplikację mobilną i stronę rezerwacji.
 */
const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Konta z danych testowych (supabase/seed.sql). */
export const USERS = {
  admin: '10000000-0000-0000-0000-000000000001',
  owner: '10000000-0000-0000-0000-000000000002',
  staff: '10000000-0000-0000-0000-000000000003',
  otherSalonOwner: '10000000-0000-0000-0000-000000000004',
} as const;

export const SALONS = {
  main: '20000000-0000-0000-0000-000000000001',
  other: '20000000-0000-0000-0000-000000000002',
} as const;

export const STAFF = {
  marek: '30000000-0000-0000-0000-000000000001',
  tomek: '30000000-0000-0000-0000-000000000002',
  kasia: '30000000-0000-0000-0000-000000000003',
} as const;

export const SERVICES = {
  haircut: '50000000-0000-0000-0000-000000000001',
  beard: '50000000-0000-0000-0000-000000000002',
  color: '50000000-0000-0000-0000-000000000003',
} as const;

export const CLIENTS = {
  jan: '60000000-0000-0000-0000-000000000001',
  piotr: '60000000-0000-0000-0000-000000000002',
  anna: '60000000-0000-0000-0000-000000000003',
} as const;

export type Db = Client & {
  /** Wykonuje zapytania tak, jakby robił je zalogowany użytkownik (z regułami RLS). */
  asUser(userId: string): Promise<void>;
  /** Wraca do roli serwisowej, która omija RLS — do przygotowania danych. */
  asService(): Promise<void>;
};

/**
 * Uruchamia test w transakcji i zawsze ją wycofuje, więc dane testowe
 * pozostają nietknięte niezależnie od tego, co test zrobi.
 */
export async function withRollback<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: CONNECTION_STRING }) as Db;

  client.asUser = async (userId: string) => {
    await client.query("select set_config('role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
  };

  client.asService = async () => {
    await client.query('reset role');
    await client.query("select set_config('request.jwt.claims', '', true)");
  };

  await client.connect();
  await client.query('begin');

  try {
    return await fn(client);
  } finally {
    await client.query('rollback').catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

/** Czas w strefie salonu zamieniony na znacznik czasu, tak jak robi to aplikacja. */
export function warsawTime(dayOffset: number, time: string): string {
  return `((current_date + ${dayOffset}) + time '${time}') at time zone 'Europe/Warsaw'`;
}
