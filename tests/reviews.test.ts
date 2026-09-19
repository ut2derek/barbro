import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BOOKINGS,
  CLIENTS,
  LOCAL_ANON_KEY,
  LOCAL_API_URL,
  SALONS,
  STAFF,
  USERS,
  resetRateLimits,
  withRollback,
} from './helpers/db';

/**
 * Opinie klientów (publiczne) i ocena klienta przez salon (wewnętrzna).
 *
 * Najważniejsze reguły: opinię wystawia tylko klient po zrealizowanej wizycie,
 * jedną na wizytę, a salon może odpowiedzieć, ale nie może jej ukryć.
 */

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const createdReviews: string[] = [];

/**
 * Wizyty z danych testowych, którym test doczepił link do zarządzania.
 * Link trzeba zdjąć, inaczej kolejne uruchomienie odbija się o unikalność
 * skrótu tokenu — i test wywala się na czymś, co nie ma z nim nic wspólnego.
 */
const borrowedLinks: string[] = [];

afterEach(async () => {
  if (createdReviews.length === 0 && borrowedLinks.length === 0) return;

  const db = new Client({ connectionString: CONNECTION_STRING });
  await db.connect();

  if (createdReviews.length > 0) {
    await db.query('delete from public.booking_reviews where booking_id = any($1::uuid[])', [
      createdReviews.splice(0),
    ]);
  }

  if (borrowedLinks.length > 0) {
    await db.query(
      `update public.bookings
       set manage_token_hash = null, manage_token_expires_at = null
       where id = any($1::uuid[])`,
      [borrowedLinks.splice(0)],
    );
  }

  await db.end();
});

function call(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${LOCAL_API_URL}/functions/v1/public-booking`, {
    method: 'POST',
    headers: { apikey: LOCAL_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Limit zapytań broni funkcję przed botami; testy biją w nią dziesiątki razy
// z jednego adresu, więc zerujemy licznik przed każdym.
beforeEach(resetRateLimits);

describe('opinia klienta', () => {
  it('nie da się wystawić opinii do wizyty, która się nie odbyła', async () => {
    await withRollback(async (db) => {
      // Wizytę zakładamy w transakcji, zamiast szukać potwierdzonej w danych
      // testowych: `mark_past_bookings_completed` zamyka te z dzisiaj, więc
      // po południu żadnej potwierdzonej już tam nie ma.
      const { rows } = await db.query(
        `insert into public.bookings
           (salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source)
         values ($1, $2, $3,
                 now() + interval '30 days',
                 now() + interval '30 days' + interval '45 minutes',
                 'confirmed', 8000, 'manual')
         returning id`,
        [SALONS.main, STAFF.marek, CLIENTS.jan],
      );

      await expect(
        db.query(
          `insert into public.booking_reviews (salon_id, booking_id, rating)
           values ($1, $2, 5)`,
          [SALONS.main, rows[0].id],
        ),
      ).rejects.toMatchObject({ code: 'P0011' });
    });
  });

  it('opinia bierze salon, fryzjera i klienta z wizyty, a nie z tego, co przysłano', async () => {
    await withRollback(async (db) => {
      const { rows: booking } = await db.query(
        'select id, salon_id, staff_id, client_id from public.bookings where id = $1',
        [BOOKINGS.completed],
      );

      await db.query(
        `insert into public.booking_reviews (salon_id, booking_id, staff_id, client_id, rating)
         values ($1, $2, null, null, 4)`,
        [SALONS.other, booking[0].id],
      );

      const { rows } = await db.query(
        'select salon_id, staff_id, client_id from public.booking_reviews where booking_id = $1',
        [booking[0].id],
      );

      // Podstawiony obcy salon został nadpisany danymi z wizyty.
      expect(rows[0].salon_id).toBe(booking[0].salon_id);
      expect(rows[0].staff_id).toBe(booking[0].staff_id);
      expect(rows[0].client_id).toBe(booking[0].client_id);
    });
  });

  it('ocena spoza zakresu 1–5 jest odrzucana', async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        'select id from public.bookings where id = $1',
        [BOOKINGS.completed],
      );

      await expect(
        db.query(
          `insert into public.booking_reviews (salon_id, booking_id, rating) values ($1, $2, 6)`,
          [SALONS.main, rows[0].id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('salon odpowiada na opinię, ale nie zmienia oceny ani komentarza', async () => {
    await withRollback(async (db) => {
      const { rows: booking } = await db.query(
        'select id from public.bookings where id = $1',
        [BOOKINGS.completed],
      );
      const { rows: review } = await db.query(
        `insert into public.booking_reviews (salon_id, booking_id, rating, comment)
         values ($1, $2, 5, 'Bardzo dobrze') returning id`,
        [SALONS.main, booking[0].id],
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
      const { rows: booking } = await db.query(
        'select id from public.bookings where id = $1',
        [BOOKINGS.completed],
      );
      const { rows: review } = await db.query(
        `insert into public.booking_reviews (salon_id, booking_id, rating) values ($1, $2, 5) returning id`,
        [SALONS.main, booking[0].id],
      );

      await db.asUser(USERS.otherSalonOwner);

      await expect(
        db.query('select public.reply_to_review($1, $2)', [review[0].id, 'Podszywam się']),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('opinii nie da się usunąć przez aplikację', async () => {
    await withRollback(async (db) => {
      const { rows: booking } = await db.query(
        'select id from public.bookings where id = $1',
        [BOOKINGS.completed],
      );
      const { rows: review } = await db.query(
        `insert into public.booking_reviews (salon_id, booking_id, rating) values ($1, $2, 1) returning id`,
        [SALONS.main, booking[0].id],
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
  it('klient ocenia wizytę swoim linkiem, drugi raz już nie', async () => {
    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();

    // Konkretna wizyta z danych testowych, nie „pierwsza z brzegu": skrót
    // tokenu jest unikalny, więc dwa uruchomienia nie mogą trafić w różne
    // wizyty tym samym tokenem.
    const bookingId = BOOKINGS.completed;
    createdReviews.push(bookingId);
    borrowedLinks.push(bookingId);

    // Token to 24 bajty zapisane szesnastkowo — taki sam kształt, jaki
    // generuje serwer, inaczej odbija się o walidację linku.
    const token = 'a1b2c3d4'.repeat(6);
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(token).digest('hex');

    // Pozostałość po przerwanym uruchomieniu — ten sam skrót nie może wisieć
    // na dwóch wizytach naraz.
    await db.query(
      `update public.bookings set manage_token_hash = null, manage_token_expires_at = null
       where manage_token_hash = $1`,
      [hash],
    );
    await db.query(
      `update public.bookings
       set manage_token_hash = $2, manage_token_expires_at = now() + interval '30 days'
       where id = $1`,
      [bookingId, hash],
    );
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
    // Kształt poprawny, tylko takiej wizyty nie ma — wtedy odpowiedzią jest 404.
    const response = await call({ action: 'submitReview', token: 'f0e1d2c3'.repeat(6), rating: 5 });
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