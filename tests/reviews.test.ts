import { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';

import { LOCAL_ANON_KEY, LOCAL_API_URL, SALONS, USERS, withRollback } from './helpers/db';

/**
 * Opinie klientów (publiczne) i ocena klienta przez salon (wewnętrzna).
 *
 * Najważniejsze reguły: opinię wystawia tylko klient po zrealizowanej wizycie,
 * jedną na wizytę, a salon może odpowiedzieć, ale nie może jej ukryć.
 */

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';


/**
 * Wizyta o znanym statusie, tworzona na potrzeby testu.
 * Nie polegamy na danych testowych — zadania cykliczne zmieniają ich statusy
 * (miniona wizyta sama staje się zrealizowana), więc test by się chwiał.
 */
async function bookingWithStatus(
  db: Awaited<ReturnType<typeof withRollback>> extends never ? never : any,
  status: 'confirmed' | 'completed',
  offsetHours = -3,
): Promise<string> {
  const client = await db.query(
    `insert into public.clients (salon_id, first_name, email, phone)
     values ($1, 'Klient', 'opinia' || replace(gen_random_uuid()::text, '-', '') || '@test.test', '+48600100100')
     returning id`,
    [SALONS.main],
  );

  const { rows } = await db.query(
    `insert into public.bookings
       (salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source)
     values ($1, '30000000-0000-0000-0000-000000000001', $2,
             now() + make_interval(hours => $4), now() + make_interval(hours => $4 + 1),
             $3, 8000, 'web')
     returning id`,
    [SALONS.main, client.rows[0].id, status, offsetHours],
  );

  return rows[0].id;
}

function call(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${LOCAL_API_URL}/functions/v1/public-booking`, {
    method: 'POST',
    headers: { apikey: LOCAL_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('opinia klienta', () => {
  it('nie da się wystawić opinii do wizyty, która się nie odbyła', async () => {
    await withRollback(async (db) => {
      // Wizyta jeszcze się nie odbyła — zaplanowana na jutro.
      const bookingId = await bookingWithStatus(db, 'confirmed', 24);

      await expect(
        db.query(
          `insert into public.booking_reviews (salon_id, booking_id, rating)
           values ($1, $2, 5)`,
          [SALONS.main, bookingId],
        ),
      ).rejects.toMatchObject({ code: 'P0011' });
    });
  });

  it('opinia bierze salon, fryzjera i klienta z wizyty, a nie z tego, co przysłano', async () => {
    await withRollback(async (db) => {
      const bookingId = await bookingWithStatus(db, 'completed');
      const { rows: booking } = await db.query(
        'select id, salon_id, staff_id, client_id from public.bookings where id = $1',
        [bookingId],
      );

      await db.query(
        `insert into public.booking_reviews (salon_id, booking_id, staff_id, client_id, rating)
         values ($1, $2, null, null, 4)`,
        [SALONS.other, bookingId],
      );

      const { rows } = await db.query(
        'select salon_id, staff_id, client_id from public.booking_reviews where booking_id = $1',
        [bookingId],
      );

      // Podstawiony obcy salon został nadpisany danymi z wizyty.
      expect(rows[0].salon_id).toBe(booking[0].salon_id);
      expect(rows[0].staff_id).toBe(booking[0].staff_id);
      expect(rows[0].client_id).toBe(booking[0].client_id);
    });
  });

  it('ocena spoza zakresu 1–5 jest odrzucana', async () => {
    await withRollback(async (db) => {
      const bookingId = await bookingWithStatus(db, 'completed');

      await expect(
        db.query(
          `insert into public.booking_reviews (salon_id, booking_id, rating) values ($1, $2, 6)`,
          [SALONS.main, bookingId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('salon odpowiada na opinię, ale nie zmienia oceny ani komentarza', async () => {
    await withRollback(async (db) => {
      const bookingId = await bookingWithStatus(db, 'completed');
      const { rows: review } = await db.query(
        `insert into public.booking_reviews (salon_id, booking_id, rating, comment)
         values ($1, $2, 5, 'Bardzo dobrze') returning id`,
        [SALONS.main, bookingId],
      );

      await db.asUser(USERS.owner);
      await db.query('select public.reply_to_review($1, $2)', [
        review[0].id,
        'Dziękujemy za miłe słowa!',
      ]);

      const { rows } = await db.query(
        'select rating, comment, salon_reply from public.booking_reviews where id = $1',
        [review[0].id],
      );
      expect(rows[0].rating).toBe(5);
      expect(rows[0].comment).toBe('Bardzo dobrze');
      expect(rows[0].salon_reply).toBe('Dziękujemy za miłe słowa!');
    });
  });

  it('obcy salon nie odpowie na cudzą opinię', async () => {
    await withRollback(async (db) => {
      const bookingId = await bookingWithStatus(db, 'completed');
      const { rows: review } = await db.query(
        `insert into public.booking_reviews (salon_id, booking_id, rating) values ($1, $2, 5) returning id`,
        [SALONS.main, bookingId],
      );

      await db.asUser(USERS.otherSalonOwner);

      await expect(
        db.query('select public.reply_to_review($1, $2)', [review[0].id, 'Podszywam się']),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('opinii nie da się usunąć przez aplikację', async () => {
    await withRollback(async (db) => {
      const bookingId = await bookingWithStatus(db, 'completed');
      const { rows: review } = await db.query(
        `insert into public.booking_reviews (salon_id, booking_id, rating) values ($1, $2, 1) returning id`,
        [SALONS.main, bookingId],
      );

      await db.asUser(USERS.owner);
      const result = await db.query('delete from public.booking_reviews where id = $1 returning id', [
        review[0].id,
      ]);

      // Brak reguły na usuwanie — zapytanie nie kasuje niczego.
      expect(result.rowCount).toBe(0);
    });
  });
});

describe('opinia przez link klienta', () => {
  /**
   * Ten test zapisuje dane na stałe — funkcja serwerowa działa poza naszą
   * transakcją — więc tworzy własną wizytę i sam po sobie sprząta.
   */
  const committed: { bookingId?: string; clientId?: string } = {};

  afterEach(async () => {
    if (!committed.bookingId) return;

    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();
    await db.query('delete from public.bookings where id = $1', [committed.bookingId]);
    await db.query('delete from public.clients where id = $1', [committed.clientId]);
    await db.end();

    committed.bookingId = undefined;
    committed.clientId = undefined;
  });

  it('klient ocenia wizytę swoim linkiem, drugi raz już nie', async () => {
    const { createHash, randomBytes } = await import('node:crypto');
    // Token losowy przy każdym uruchomieniu — stały zderzałby się z poprzednim.
    const token = randomBytes(24).toString('hex');

    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();

    const client = await db.query(
      `insert into public.clients (salon_id, first_name, email, phone)
       values ($1, 'Oceniający', 'ocena' || replace(gen_random_uuid()::text, '-', '') || '@test.test', '+48600100100')
       returning id`,
      [SALONS.main],
    );
    committed.clientId = client.rows[0].id;

    const booking = await db.query(
      `insert into public.bookings
         (salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source,
          manage_token_hash, manage_token_expires_at)
       values ($1, '30000000-0000-0000-0000-000000000001', $2,
               now() - interval '3 hours', now() - interval '2 hours',
               'completed', 8000, 'web', $3, now() + interval '30 days')
       returning id`,
      [SALONS.main, committed.clientId, createHash('sha256').update(token).digest('hex')],
    );
    committed.bookingId = booking.rows[0].id;
    await db.end();

    const first = await call({ action: 'submitReview', token, rating: 5, comment: 'Polecam' });
    expect(first.status).toBe(200);

    const second = await call({ action: 'submitReview', token, rating: 1 });
    expect(second.status).toBe(409);

    const state = await call({ action: 'reviewState', token });
    const stateBody = await state.json();
    expect(stateBody.canReview).toBe(false);
    expect(stateBody.review.rating).toBe(5);

    const list = await call({ action: 'reviews', slug: 'barbershop-kowalski' });
    const listBody = await list.json();
    expect(listBody.reviews[0].comment).toBe('Polecam');
    // Publicznie pokazujemy imię, nigdy kontaktu.
    expect(JSON.stringify(listBody.reviews[0])).not.toContain('@');
  });

  it('bez ważnego linku nie da się ocenić', async () => {
    const response = await call({ action: 'submitReview', token: 'zmyslony', rating: 5 });
    expect(response.status).toBe(404);
  });
});

describe('ocena klienta przez salon', () => {
  it('zespół wystawia ocenę, która nie wychodzi poza salon', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.staff);

      const result = await db.query(
        `update public.clients set internal_rating = 2
         where salon_id = $1 returning id`,
        [SALONS.main],
      );
      expect(result.rowCount).toBeGreaterThan(0);

      await db.asUser(USERS.otherSalonOwner);
      const foreign = await db.query(
        'select internal_rating from public.clients where salon_id = $1',
        [SALONS.main],
      );
      // Obcy salon nie widzi ani klienta, ani jego oceny.
      expect(foreign.rows).toHaveLength(0);
    });
  });

  it('ocena poza skalą jest odrzucana', async () => {
    await withRollback(async (db) => {
      await expect(
        db.query(`update public.clients set internal_rating = 9 where salon_id = $1`, [
          SALONS.main,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });
});
