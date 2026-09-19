import { afterEach, describe, expect, it } from 'vitest';

import {
  LOCAL_ANON_KEY,
  LOCAL_API_URL,
  LOCAL_SERVICE_KEY,
  SALONS,
  USERS,
  withRollback,
} from './helpers/db';

/**
 * Panel administratora platformy. Zakładanie salonów nie jest samoobsługowe —
 * robi to właściciel produktu, więc trzeba pilnować, kto ma tu dostęp.
 */

describe('przegląd salonów', () => {
  it('administrator platformy widzi wszystkie salony z ruchem', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.admin);

      const { rows } = await db.query('select * from public.admin_salon_overview()');

      expect(rows.length).toBeGreaterThanOrEqual(2);
      const main = rows.find((row) => row.salon_id === SALONS.main);
      expect(main?.staff_count).toBeGreaterThan(0);
      expect(main?.bookings_last_30_days).toBeGreaterThan(0);
    });
  });

  it('właściciel salonu nie widzi przeglądu platformy', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.owner);

      const { rows } = await db.query('select * from public.admin_salon_overview()');

      expect(rows).toHaveLength(0);
    });
  });

  it('tylko administrator platformy wyłącza salon', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.owner);

      await expect(
        db.query('select public.admin_set_salon_active($1, false)', [SALONS.main]),
      ).rejects.toMatchObject({ code: '42501' });

      await db.query('rollback');
      await db.query('begin');
      await db.asUser(USERS.admin);
      await db.query('select public.admin_set_salon_active($1, false)', [SALONS.main]);

      const { rows } = await db.query('select active from public.salons where id = $1', [
        SALONS.main,
      ]);
      expect(rows[0].active).toBe(false);
    });
  });
});

describe('zakładanie salonu przez funkcję serwerową', () => {
  const createdEmails: string[] = [];
  const createdSalons: string[] = [];

  afterEach(async () => {
    const { Client } = await import('pg');
    const db = new Client({
      connectionString:
        process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    });
    await db.connect();
    for (const salonId of createdSalons.splice(0)) {
      await db.query('delete from public.salons where id = $1', [salonId]);
    }
    const emails = createdEmails.splice(0);
    for (const email of emails) {
      const { rows } = await db.query('select id from auth.users where email = $1', [email]);
      if (rows[0]) {
        await fetch(`${LOCAL_API_URL}/auth/v1/admin/users/${rows[0].id}`, {
          method: 'DELETE',
          headers: { apikey: LOCAL_SERVICE_KEY, Authorization: `Bearer ${LOCAL_SERVICE_KEY}` },
        });
      }
    }
    await db.end();
  });

  async function signIn(email: string, password: string): Promise<string> {
    const response = await fetch(`${LOCAL_API_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: LOCAL_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const session = await response.json();
    return session.access_token;
  }

  function createSalon(token: string, body: unknown): Promise<Response> {
    return fetch(`${LOCAL_API_URL}/functions/v1/admin-create-salon`, {
      method: 'POST',
      headers: {
        apikey: LOCAL_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  it('administrator zakłada salon razem z kontem właściciela', async () => {
    const ownerEmail = `wlasciciel-${Date.now()}@barbro.test`;
    createdEmails.push(ownerEmail);

    const token = await signIn('admin@barbro.test', 'haslo123');
    const response = await createSalon(token, {
      salonName: 'Barber Testowy',
      ownerEmail,
      ownerName: 'Nowy Właściciel',
      city: 'Gdańsk',
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    createdSalons.push(result.salonId);

    expect(result.temporaryPassword).toBeTruthy();

    // Właściciel może się od razu zalogować i zobaczyć swój salon.
    const ownerToken = await signIn(ownerEmail, result.temporaryPassword);
    expect(ownerToken).toBeTruthy();
  });

  it('właściciel salonu nie założy nowego salonu', async () => {
    const token = await signIn('wlasciciel@barbro.test', 'haslo123');

    const response = await createSalon(token, {
      salonName: 'Podszywacz',
      ownerEmail: 'podszywacz@barbro.test',
    });

    expect(response.status).toBe(403);
  });

  it('bez zalogowania nie da się założyć salonu', async () => {
    const response = await fetch(`${LOCAL_API_URL}/functions/v1/admin-create-salon`, {
      method: 'POST',
      headers: { apikey: LOCAL_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ salonName: 'Bez tokenu', ownerEmail: 'x@barbro.test' }),
    });

    expect(response.status).toBe(401);
  });
});
