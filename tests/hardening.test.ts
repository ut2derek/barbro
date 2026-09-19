import { Client } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  LOCAL_ANON_KEY,
  LOCAL_API_URL,
  SALONS,
  SERVICES,
  USERS,
  resetRateLimits,
  withRollback,
} from './helpers/db';

/**
 * Testy poprawek z przeglądu kodu. Każdy opisuje konkretny błąd, który był
 * w kodzie, żeby nie wrócił niezauważony.
 */

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const SALON_SLUG = 'barbershop-kowalski';

function call(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${LOCAL_API_URL}/functions/v1/public-booking`, {
    method: 'POST',
    headers: { apikey: LOCAL_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function futureSlot(): Promise<string> {
  const db = new Client({ connectionString: CONNECTION_STRING });
  await db.connect();
  const { rows } = await db.query(
    `select slot_start from public.get_available_slots(
       $1, array[$2]::uuid[], (current_date + 8)::date, (current_date + 21)::date
     ) order by slot_start limit 1`,
    [SALONS.main, SERVICES.haircut],
  );
  await db.end();
  return rows[0].slot_start.toISOString();
}

beforeEach(resetRateLimits);

describe('adres e-mail klienta nie jest wzorcem wyszukiwania', () => {
  /**
   * BŁĄD: klienta wyszukiwaliśmy przez `ilike`, czyli dopasowanie wzorca.
   * Znaki `%` i `_` mają w nim znaczenie specjalne, więc klient wpisujący
   * `jan%@example.test` dopinał swoją wizytę do kartoteki innej osoby.
   */
  it('odrzuca adres ze znakiem wieloznacznym zamiast dopasować cudzą kartotekę', async () => {
    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [SERVICES.haircut],
      startsAt: await futureSlot(),
      client: { firstName: 'Podszywacz', email: '%@example.test', phone: '+48600100200' },
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('e-mail');
  });

  it('nie zwraca cudzej kartoteki dla adresu pasującego wzorcem', async () => {
    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();

    // Kartoteka istniejącego klienta salonu.
    const { rows } = await db.query(
      'select email from public.clients where salon_id = $1 limit 1',
      [SALONS.main],
    );
    const realEmail: string = rows[0].email;
    // Adres, który jako wzorzec `ilike` trafiłby w tę kartotekę,
    // a jako zwykły tekst jest po prostu innym adresem.
    const pattern = realEmail.replace(/^.{3}/, '___');

    const startsAt = await futureSlot();
    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [SERVICES.haircut],
      startsAt,
      client: { firstName: 'Ktoś inny', email: pattern, phone: '+48600100200' },
    });

    expect(response.status).toBe(200);
    const bookingId = (await response.json()).booking.id;

    const { rows: booked } = await db.query(
      `select c.email from public.bookings b
       join public.clients c on c.id = b.client_id
       where b.id = $1`,
      [bookingId],
    );

    // Wizyta należy do nowego klienta, nie do tego, w którego trafiłby wzorzec.
    expect(booked[0].email).toBe(pattern.toLowerCase());
    expect(booked[0].email).not.toBe(realEmail);

    await db.query('delete from public.bookings where id = $1', [bookingId]);
    await db.query('delete from public.clients where email = $1', [pattern.toLowerCase()]);
    await db.end();
  });
});

describe('wygasły link do wizyty', () => {
  /**
   * BŁĄD: datę ważności sprawdzał tylko podgląd wizyty. Potwierdzenie
   * i odwołanie jej nie sprawdzały, więc wygasły link nadal działał.
   */
  async function bookingWithExpiredLink(): Promise<string> {
    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [SERVICES.haircut],
      startsAt: await futureSlot(),
      client: {
        firstName: 'Wygasły',
        email: `wygasly-${Date.now()}@example.test`,
        phone: '+48600100200',
      },
    });
    const data = await response.json();
    const token: string = data.devConfirmationPath.split('/').pop();

    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();
    await db.query(
      `update public.bookings set manage_token_expires_at = now() - interval '1 hour'
       where id = $1`,
      [data.booking.id],
    );
    await db.end();

    return token;
  }

  it('nie pozwala potwierdzić wizyty', async () => {
    const response = await call({ action: 'confirm', token: await bookingWithExpiredLink() });
    expect(response.status).toBe(410);
  });

  it('nie pozwala odwołać wizyty', async () => {
    const response = await call({ action: 'cancel', token: await bookingWithExpiredLink() });
    expect(response.status).toBe(410);
  });

  it('nie pozwala wystawić opinii', async () => {
    const response = await call({
      action: 'submitReview',
      token: await bookingWithExpiredLink(),
      rating: 5,
    });
    expect(response.status).toBe(410);
  });
});

describe('limit zapytań chroni przed botami', () => {
  it('odcina po przekroczeniu limitu i podaje, kiedy spróbować ponownie', async () => {
    const startsAt = await futureSlot();

    const statuses: number[] = [];
    // Limit dla zapisu wizyty to 5 prób na 5 minut z jednego adresu.
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const response = await call({
        action: 'book',
        slug: SALON_SLUG,
        serviceIds: [SERVICES.haircut],
        startsAt,
        client: {
          firstName: 'Bot',
          email: `bot-${attempt}-${Date.now()}@example.test`,
          phone: '+48600100200',
        },
      });
      statuses.push(response.status);
      if (response.status === 429) {
        expect(response.headers.get('Retry-After')).toBe('60');
      }
    }

    expect(statuses).toContain(429);

    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();
    await db.query("delete from public.clients where email like 'bot-%@example.test'");
    await db.end();
  });

  it('przeglądanie oferty ma limit na tyle wysoki, że człowiek go nie dotknie', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => call({ action: 'catalog', slug: SALON_SLUG })),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
  });
});

describe('dane przysłane do funkcji publicznej są sprawdzane', () => {
  it('odrzuca nieznaną operację', async () => {
    const response = await call({ action: 'usunWszystko', slug: SALON_SLUG });
    expect(response.status).toBe(400);
  });

  it('odrzuca notatkę dłuższą niż dopuszczalna', async () => {
    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [SERVICES.haircut],
      startsAt: await futureSlot(),
      client: { firstName: 'Długopis', email: 'a@example.test', phone: '+48600100200' },
      note: 'x'.repeat(5000),
    });
    expect(response.status).toBe(400);
  });

  it('odrzuca token o nieprawidłowym kształcie, nie pytając bazy', async () => {
    const response = await call({ action: 'booking', token: "' or 1=1 --" });
    expect(response.status).toBe(400);
  });

  it('odrzuca ocenę spoza skali', async () => {
    const response = await call({
      action: 'submitReview',
      token: 'a'.repeat(48),
      rating: 99,
    });
    expect(response.status).toBe(400);
  });
});

describe('funkcje omijające reguły dostępu sprawdzają przynależność do salonu', () => {
  /**
   * BŁĄD: `get_available_slots`, `salon_rating` i `staff_ratings` działają
   * w trybie `security definer`, czyli omijają reguły dostępu. Nie sprawdzały
   * przy tym, czy pytający należy do salonu.
   */
  it('właściciel obcego salonu nie odczyta wolnych terminów', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.otherSalonOwner);

      const { rows } = await db.query(
        `select count(*)::int as ile from public.get_available_slots(
           $1, array[$2]::uuid[], (current_date + 8)::date, (current_date + 21)::date
         )`,
        [SALONS.main, SERVICES.haircut],
      );

      expect(rows[0].ile).toBe(0);
    });
  });

  it('właściciel własnego salonu odczyta wolne terminy normalnie', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.owner);

      const { rows } = await db.query(
        `select count(*)::int as ile from public.get_available_slots(
           $1, array[$2]::uuid[], (current_date + 8)::date, (current_date + 21)::date
         )`,
        [SALONS.main, SERVICES.haircut],
      );

      expect(rows[0].ile).toBeGreaterThan(0);
    });
  });

  it('właściciel obcego salonu nie odczyta ocen', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.otherSalonOwner);

      const { rows } = await db.query('select reviews_count from public.salon_rating($1)', [
        SALONS.main,
      ]);

      expect(rows[0]?.reviews_count ?? 0).toBe(0);
    });
  });

  it('strona rezerwacji (rola serwisowa) nadal widzi terminy salonu', async () => {
    const response = await call({
      action: 'slots',
      slug: SALON_SLUG,
      serviceIds: [SERVICES.haircut],
      from: new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10),
      to: new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).slots.length).toBeGreaterThan(0);
  });
});
