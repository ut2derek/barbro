import { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

import { LOCAL_ANON_KEY, LOCAL_API_URL, LOCAL_SERVICE_KEY } from './helpers/db';

/**
 * Usunięcie konta z poziomu aplikacji to wymóg App Store — bez działającej
 * ścieżki aplikacja nie przechodzi recenzji. Test przechodzi tę drogę tak,
 * jak zrobi to recenzent: zakłada konto, loguje się, usuwa konto.
 *
 * Dane zapisywane są na stałe (funkcja serwerowa działa poza naszą transakcją),
 * więc test sprząta po sobie sam.
 */

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const createdSalons: string[] = [];
const createdUsers: string[] = [];

afterEach(async () => {
  const db = new Client({ connectionString: CONNECTION_STRING });
  await db.connect();
  for (const salonId of createdSalons.splice(0)) {
    await db.query('delete from public.salons where id = $1', [salonId]);
  }
  await db.end();

  for (const userId of createdUsers.splice(0)) {
    await fetch(`${LOCAL_API_URL}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: LOCAL_SERVICE_KEY, Authorization: `Bearer ${LOCAL_SERVICE_KEY}` },
    });
  }
});

async function createUser(email: string, password: string): Promise<string> {
  const response = await fetch(`${LOCAL_API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: LOCAL_SERVICE_KEY,
      Authorization: `Bearer ${LOCAL_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await response.json();
  createdUsers.push(user.id);
  return user.id;
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await fetch(`${LOCAL_API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: LOCAL_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const session = await response.json();
  return session.access_token;
}

function deleteAccount(accessToken?: string): Promise<Response> {
  return fetch(`${LOCAL_API_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      apikey: LOCAL_ANON_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
}

async function userExists(userId: string): Promise<boolean> {
  const response = await fetch(`${LOCAL_API_URL}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: LOCAL_SERVICE_KEY, Authorization: `Bearer ${LOCAL_SERVICE_KEY}` },
  });
  return response.status === 200;
}

describe('usuwanie konta', () => {
  it('usuwa konto zalogowanego użytkownika', async () => {
    const email = `usun-${Date.now()}@barbro.test`;
    const userId = await createUser(email, 'haslo12345');
    const token = await signIn(email, 'haslo12345');

    const response = await deleteAccount(token);

    expect(response.status).toBe(200);
    expect(await userExists(userId)).toBe(false);
  });

  it('odrzuca wywołanie bez zalogowania', async () => {
    const response = await deleteAccount();

    expect(response.status).toBe(401);
  });

  it('wyłącza salon, który stracił jedynego właściciela, ale zostawia rezerwacje', async () => {
    const email = `wlasciciel-${Date.now()}@barbro.test`;
    const userId = await createUser(email, 'haslo12345');

    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();

    const salon = await db.query(
      `insert into public.salons (name, slug)
       values ('Salon jednego właściciela', 'jedyny-' || replace(gen_random_uuid()::text, '-', ''))
       returning id`,
    );
    const salonId = salon.rows[0].id;
    createdSalons.push(salonId);

    await db.query(
      `insert into public.salon_members (salon_id, user_id, role) values ($1, $2, 'owner')`,
      [salonId, userId],
    );
    const staff = await db.query(
      `insert into public.staff (salon_id, user_id, display_name) values ($1, $2, 'Właściciel') returning id`,
      [salonId, userId],
    );
    const client = await db.query(
      `insert into public.clients (salon_id, first_name, email, phone)
       values ($1, 'Klient', 'klient-' || replace(gen_random_uuid()::text, '-', '') || '@test.test', '+48600100100')
       returning id`,
      [salonId],
    );
    await db.query(
      `insert into public.bookings (salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source)
       values ($1, $2, $3, now() + interval '2 days', now() + interval '2 days 1 hour', 'confirmed', 10000, 'manual')`,
      [salonId, staff.rows[0].id, client.rows[0].id],
    );

    const token = await signIn(email, 'haslo12345');
    const response = await deleteAccount(token);
    expect(response.status).toBe(200);

    const after = await db.query('select active from public.salons where id = $1', [salonId]);
    const staffAfter = await db.query('select user_id from public.staff where id = $1', [
      staff.rows[0].id,
    ]);
    const bookings = await db.query(
      'select count(*)::int as n from public.bookings where salon_id = $1',
      [salonId],
    );
    await db.end();

    expect(after.rows[0].active).toBe(false);
    expect(staffAfter.rows[0].user_id).toBeNull();
    expect(bookings.rows[0].n).toBe(1);
  });
});