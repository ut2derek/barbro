import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LOCAL_ANON_KEY, LOCAL_API_URL, resetRateLimits } from './helpers/db';

/**
 * Strona rezerwacji dla klienta. Klient nie ma konta, więc wszystko idzie
 * przez funkcję serwerową — i to ona musi pilnować zasad, nie interfejs.
 */

const CONNECTION_STRING =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const SALON_SLUG = 'barbershop-kowalski';
const HAIRCUT = '50000000-0000-0000-0000-000000000001';
const MAREK = '30000000-0000-0000-0000-000000000001';

const createdEmails: string[] = [];

// Limit zapytań jest prawdziwy i chroni przed botami; testy nie są botami.
beforeEach(resetRateLimits);

afterEach(async () => {
  if (createdEmails.length === 0) return;

  const db = new Client({ connectionString: CONNECTION_STRING });
  await db.connect();
  for (const email of createdEmails.splice(0)) {
    // Najpierw wizyty — klient jest do nich przypięty kluczem obcym, żeby
    // nikt nie skasował historii salonu przez usunięcie klienta.
    await db.query(
      `delete from public.bookings
       where client_id in (select id from public.clients where email = $1)`,
      [email],
    );
    await db.query('delete from public.clients where email = $1', [email]);
  }
  await db.query('update public.salons set online_booking_enabled = true');
  await db.end();
});

function call(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${LOCAL_API_URL}/functions/v1/public-booking`, {
    method: 'POST',
    headers: { apikey: LOCAL_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Pierwszy wolny termin z najbliższych dwóch tygodni — razem z fryzjerem.
 * Pojedynczy dzień bywa niedzielą albo dniem wolnym, więc szukamy w zakresie.
 */
async function futureSlot(
  staffId?: string,
  extraMinutes = 0,
): Promise<{ startsAt: string; day: string; staffId: string }> {
  const db = new Client({ connectionString: CONNECTION_STRING });
  await db.connect();
  const { rows } = await db.query(
    `select slot_start, staff_id,
            to_char(slot_start at time zone 'Europe/Warsaw', 'YYYY-MM-DD') as day
     from public.get_available_slots(
       '20000000-0000-0000-0000-000000000001',
       array['${HAIRCUT}']::uuid[],
       (current_date + 8)::date,
       (current_date + 21)::date,
       $1,
       $2
     )
     order by slot_start limit 1`,
    [staffId ?? null, extraMinutes],
  );
  await db.end();
  return { startsAt: rows[0].slot_start.toISOString(), day: rows[0].day, staffId: rows[0].staff_id };
}

describe('katalog salonu', () => {
  it('pokazuje salon, widoczne usługi i aktywnych fryzjerów bez logowania', async () => {
    const response = await call({ action: 'catalog', slug: SALON_SLUG });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.salon.name).toBe('Barbershop Kowalski');
    expect(data.services.length).toBeGreaterThan(0);
    expect(data.staff.length).toBeGreaterThan(0);
    // Każdy fryzjer ma listę usług, które wykonuje — po niej filtruje strona.
    expect(data.staff[0].serviceIds).toBeInstanceOf(Array);
  });

  it('nie zdradza niczego o nieistniejącym salonie', async () => {
    const response = await call({ action: 'catalog', slug: 'nie-ma-takiego' });
    expect(response.status).toBe(404);
  });

  it('podaje cenę promocyjną razem z najniższą ceną z 30 dni', async () => {
    const response = await call({ action: 'catalog', slug: SALON_SLUG });
    const data = await response.json();

    const haircut = data.services.find((service: { id: string }) => service.id === HAIRCUT);
    expect(haircut.promoActive).toBe(true);
    expect(haircut.priceGrosz).toBeLessThan(haircut.regularPriceGrosz);
    expect(haircut.lowestPriceBeforePromoGrosz).toBeGreaterThan(0);
  });
});

describe('rezerwacja przez klienta', () => {
  it('zapisuje wizytę oczekującą na potwierdzenie mailem', async () => {
    const email = `klient-${Date.now()}@example.test`;
    createdEmails.push(email);
    const slot = await futureSlot();

    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [HAIRCUT],
      startsAt: slot.startsAt,
      client: { firstName: 'Krzysztof', email, phone: '+48601202303' },
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.booking.status).toBe('pending_confirmation');
    expect(data.booking.staffName).toBeTruthy();
  });

  it('odrzuca termin, który właśnie ktoś zajął', async () => {
    const email = `klient-${Date.now()}-a@example.test`;
    const second = `klient-${Date.now()}-b@example.test`;
    createdEmails.push(email, second);
    const slot = await futureSlot();

    const first = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [HAIRCUT],
      startsAt: slot.startsAt,
      staffId: slot.staffId,
      client: { firstName: 'Pierwszy', email, phone: '+48601202303' },
    });
    expect(first.status).toBe(200);

    const conflict = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [HAIRCUT],
      startsAt: slot.startsAt,
      staffId: slot.staffId,
      client: { firstName: 'Drugi', email: second, phone: '+48601202304' },
    });

    expect(conflict.status).toBe(409);
  });

  it('nie przyjmuje rezerwacji, gdy salon wyłączył rezerwacje online', async () => {
    const email = `klient-${Date.now()}-c@example.test`;
    createdEmails.push(email);
    const slot = await futureSlot();

    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();
    await db.query(
      `update public.salons set online_booking_enabled = false where slug = $1`,
      [SALON_SLUG],
    );
    await db.end();

    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [HAIRCUT],
      startsAt: slot.startsAt,
      client: { firstName: 'Krzysztof', email, phone: '+48601202303' },
    });

    expect(response.status).toBe(409);
  });

  it('nie przyjmuje rezerwacji od zablokowanego klienta', async () => {
    const email = `zablokowany-${Date.now()}@example.test`;
    createdEmails.push(email);
    const slot = await futureSlot();

    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();
    await db.query(
      `insert into public.clients (salon_id, first_name, email, phone, blocked)
       values ('20000000-0000-0000-0000-000000000001', 'Zablokowany', $1, '+48601000000', true)`,
      [email],
    );
    await db.end();

    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [HAIRCUT],
      startsAt: slot.startsAt,
      client: { firstName: 'Zablokowany', email, phone: '+48601000000' },
    });

    expect(response.status).toBe(403);
  });

  it('wymaga kompletu danych klienta', async () => {
    const slot = await futureSlot();

    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [HAIRCUT],
      startsAt: slot.startsAt,
      client: { firstName: 'Bez maila', email: '', phone: '' },
    });

    expect(response.status).toBe(400);
  });
});

describe('link do wizyty wysyłany klientowi', () => {
  async function bookWithLink() {
    const email = `link-${Date.now()}@example.test`;
    createdEmails.push(email);
    const slot = await futureSlot();

    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [HAIRCUT],
      startsAt: slot.startsAt,
      client: { firstName: 'Krzysztof', email, phone: '+48601202303' },
    });
    const data = await response.json();
    return { token: data.devConfirmationPath.split('/').pop() as string, data };
  }

  it('rezerwacja zwraca ścieżkę do wizyty, a token nie leży w bazie otwartym tekstem', async () => {
    const { token, data } = await bookWithLink();

    expect(data.confirmationPath).toContain('/wizyta/');
    expect(token).toHaveLength(48);

    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();
    const { rows } = await db.query(
      'select manage_token_hash from public.bookings where id = $1',
      [data.booking.id],
    );
    await db.end();

    // W bazie jest wyłącznie skrót — z niego nie da się odtworzyć linku.
    expect(rows[0].manage_token_hash).not.toBe(token);
    expect(rows[0].manage_token_hash).toHaveLength(64);
  });

  it('potwierdzenie przesuwa wizytę do akceptacji salonu', async () => {
    const { token } = await bookWithLink();

    const response = await call({ action: 'confirm', token });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.booking.status).toBe('pending_approval');
  });

  it('drugie kliknięcie tego samego linku niczego nie psuje', async () => {
    const { token } = await bookWithLink();
    await call({ action: 'confirm', token });

    const response = await call({ action: 'confirm', token });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.alreadyHandled).toBe(true);
    expect(data.booking.status).toBe('pending_approval');
  });

  it('klient odwołuje wizytę swoim linkiem', async () => {
    const { token } = await bookWithLink();
    await call({ action: 'confirm', token });

    const response = await call({ action: 'cancel', token });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.booking.status).toBe('cancelled_by_client');
  });

  it('zmyślony token niczego nie ujawnia', async () => {
    // Token o prawidłowym kształcie, ale nieistniejący — musi dojść do bazy
    // i wrócić z niczym. Token o złym kształcie odrzucamy wcześniej (400),
    // co sprawdza tests/hardening.test.ts.
    const response = await call({ action: 'booking', token: 'a1b2c3d4'.repeat(6) });
    expect(response.status).toBe(404);
  });
});

describe('dodatki do usługi', () => {
  it('katalog podaje dodatki z ceną i czasem', async () => {
    const response = await call({ action: 'catalog', slug: SALON_SLUG });
    const data = await response.json();

    expect(data.addons.length).toBeGreaterThan(0);
    const tuszowanie = data.addons.find(
      (addon: { name: string }) => addon.name === 'Tuszowanie siwizny',
    );
    expect(tuszowanie.priceGrosz).toBe(5000);
    expect(tuszowanie.durationMinutes).toBe(20);
  });

  it('dodatek wydłuża wizytę i podnosi kwotę', async () => {
    const email = `dodatki-${Date.now()}@example.test`;
    createdEmails.push(email);
    // Konkretny fryzjer, bo czas usługi bywa u każdego inny.
    const slot = await futureSlot(MAREK, 20);

    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();
    const { rows: addonRows } = await db.query(
      `select id from public.service_addons where name = 'Tuszowanie siwizny'`,
    );
    await db.end();

    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [HAIRCUT],
      startsAt: slot.startsAt,
      staffId: MAREK,
      addons: [{ id: addonRows[0].id, quantity: 1 }],
      client: { firstName: 'Krzysztof', email, phone: '+48601202303' },
    });
    const data = await response.json();

    expect(response.status).toBe(200);

    const minutes =
      (new Date(data.booking.endsAt).getTime() - new Date(data.booking.startsAt).getTime()) / 60000;
    // Strzyżenie 45 minut + dodatek 20 minut.
    expect(minutes).toBe(65);
    // Cena promocyjna 60 zł + dodatek 50 zł.
    expect(data.booking.totalPriceGrosz).toBe(11000);
  });

  it('dodatek zabiera termin, w którym sama usługa by się zmieściła', async () => {
    const db = new Client({ connectionString: CONNECTION_STRING });
    await db.connect();

    const { rows: addonRows } = await db.query(
      `select id from public.service_addons where name = 'Tuszowanie siwizny'`,
    );

    // Liczymy w zakresie dwóch tygodni — pojedynczy dzień bywa wolny.
    const { rows: plain } = await db.query(
      `select count(*)::int as n from public.get_available_slots(
        '20000000-0000-0000-0000-000000000001',
        array['${HAIRCUT}']::uuid[],
        (current_date + 8)::date, (current_date + 21)::date)`,
    );
    const { rows: withAddon } = await db.query(
      `select count(*)::int as n from public.get_available_slots(
        '20000000-0000-0000-0000-000000000001',
        array['${HAIRCUT}']::uuid[],
        (current_date + 8)::date, (current_date + 21)::date, null, 20)`,
    );
    await db.end();

    expect(addonRows).toHaveLength(1);
    // Dłuższa wizyta mieści się rzadziej — terminów musi być mniej.
    expect(withAddon[0].n).toBeLessThan(plain[0].n);
  });

  it('nie przyjmuje dodatku z innego salonu', async () => {
    const email = `obcy-dodatek-${Date.now()}@example.test`;
    createdEmails.push(email);
    const slot = await futureSlot();

    const response = await call({
      action: 'book',
      slug: SALON_SLUG,
      serviceIds: [HAIRCUT],
      startsAt: slot.startsAt,
      staffId: slot.staffId,
      addons: [{ id: '00000000-0000-0000-0000-0000000000ff', quantity: 1 }],
      client: { firstName: 'Krzysztof', email, phone: '+48601202303' },
    });

    expect(response.status).toBe(500);
  });
});
