import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/**
 * Dwie osoby klikają ten sam termin w tej samej sekundzie — jedna z dwóch
 * stron rezerwacji albo dwóch telefonów. Tylko jedna może wygrać, a rozstrzyga
 * to baza, nie kolejność zapytań w aplikacji.
 *
 * Ten test, w odróżnieniu od pozostałych, zapisuje dane na stałe (musi, bo
 * inaczej połączenia by się nie widziały), więc sam po sobie sprząta.
 */

let setup: Client;
let salonId: string;
let staffId: string;
let clientId: string;

beforeEach(async () => {
  setup = new Client({ connectionString: CONNECTION_STRING });
  await setup.connect();

  const salon = await setup.query(
    `insert into public.salons (name, slug) values ('Wyścig', 'wyscig-' || replace(gen_random_uuid()::text, '-', '')) returning id`,
  );
  salonId = salon.rows[0].id;

  const staff = await setup.query(
    `insert into public.staff (salon_id, display_name) values ($1, 'Fryzjer') returning id`,
    [salonId],
  );
  staffId = staff.rows[0].id;

  const client = await setup.query(
    `insert into public.clients (salon_id, first_name, email, phone)
     values ($1, 'Klient', 'wyscig@test.test', '+48600100100') returning id`,
    [salonId],
  );
  clientId = client.rows[0].id;
});

afterEach(async () => {
  await setup.query('delete from public.salons where id = $1', [salonId]);
  await setup.end();
});

async function tryBooking(): Promise<'ok' | 'odrzucone'> {
  const client = new Client({ connectionString: CONNECTION_STRING });
  await client.connect();

  try {
    await client.query('begin');
    await client.query(
      `insert into public.bookings
         (salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source)
       values ($1, $2, $3, now() + interval '3 days', now() + interval '3 days 1 hour',
               'confirmed', 10000, 'web')`,
      [salonId, staffId, clientId],
    );
    // Chwila zwłoki, żeby obie próby faktycznie nałożyły się w czasie.
    await client.query("select pg_sleep(0.2)");
    await client.query('commit');
    return 'ok';
  } catch {
    await client.query('rollback').catch(() => undefined);
    return 'odrzucone';
  } finally {
    await client.end().catch(() => undefined);
  }
}

describe('dwie równoczesne rezerwacje tego samego terminu', () => {
  it('przechodzi dokładnie jedna', async () => {
    const [first, second] = await Promise.all([tryBooking(), tryBooking()]);

    expect([first, second].filter((r) => r === 'ok')).toHaveLength(1);
    expect([first, second].filter((r) => r === 'odrzucone')).toHaveLength(1);

    const { rows } = await setup.query(
      `select count(*)::int as n from public.bookings where salon_id = $1`,
      [salonId],
    );
    expect(rows[0].n).toBe(1);
  });
});