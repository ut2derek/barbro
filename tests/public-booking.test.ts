import { Client } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CONNECTION_STRING,
  LOCAL_ANON_KEY,
  LOCAL_API_URL,
  SALONS,
  SERVICES,
  STAFF,
  resetRateLimits,
} from './helpers/db';

const SALON_SLUG = 'barbershop-kowalski';
const HAIRCUT = SERVICES.haircut;

/** Strona rezerwacji rozmawia z funkcją brzegową po HTTP — tak jak przeglądarka. */
function call(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${LOCAL_API_URL}/functions/v1/public-booking`, {
    method: 'POST',
    headers: { apikey: LOCAL_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Pierwszy wolny termin poza horyzontem najbliższego tygodnia — dalsze dni są
 * puste, więc test nie kłóci się o slot z danymi testowymi.
 */
async function futureSlot(): Promise<{ startsAt: string; staffId: string }> {
  const db = new Client({ connectionString: CONNECTION_STRING });
  await db.connect();
  // Konkretnie u Marka: Tomek ma w danych testowych krótszy czas i niższą cenę
  // strzyżenia, więc „pierwszy wolny z brzegu” dawałby raz takie liczby, raz inne.
  const { rows } = await db.query(
    `select slot_start, staff_id from public.get_available_slots(
       $1, array[$2]::uuid[], (current_date + 8)::date, (current_date + 21)::date, $3
     ) order by slot_start limit 1`,
    [SALONS.main, HAIRCUT, STAFF.marek],
  );
  await db.end();

  return { startsAt: rows[0].slot_start.toISOString(), staffId: rows[0].staff_id };
}

/** Konta zakładane przez testy — kasujemy je po każdym, żeby nie zostawały. */
const createdEmails: string[] = [];

afterEach(async () => {
  const db = new Client({ connectionString: CONNECTION_STRING });
  await db.connect();

  for (const email of createdEmails.splice(0)) {
    const { rows } = await db.query('select id from public.clients where email = $1', [email]);
    for (const row of rows) {
      await db.query('delete from public.bookings where client_id = $1', [row.id]);
      await db.query('delete from public.clients where id = $1', [row.id]);
    }
  }

  await db.end();
});

// Limit zapytań broni funkcję przed botami; testy biją w nią dziesiątki razy
// z jednego adresu, więc zerujemy licznik przed każdym.
beforeEach(resetRateLimits);

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
    const slot = await futureSlot();

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
      staffId: slot.staffId,
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

    // Cały tydzień, nie jeden dzień: pojedynczy dzień potrafi wypaść w dzień
    // zamknięcia salonu i wtedy obie liczby są zerami, co niczego nie dowodzi.
    const { rows: plain } = await db.query(
      `select count(*)::int as n from public.get_available_slots(
        '20000000-0000-0000-0000-000000000001',
        array['${HAIRCUT}']::uuid[],
        (current_date + 8)::date, (current_date + 14)::date)`,
    );
    const { rows: withAddon } = await db.query(
      `select count(*)::int as n from public.get_available_slots(
        '20000000-0000-0000-0000-000000000001',
        array['${HAIRCUT}']::uuid[],
        (current_date + 8)::date, (current_date + 14)::date, null, 20)`,
    );
    await db.end();

    expect(addonRows).toHaveLength(1);
    expect(plain[0].n).toBeGreaterThan(0);
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