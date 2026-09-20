import { describe, expect, it } from 'vitest';

import { BOOKINGS, CLIENTS, SALONS, STAFF, USERS, withRollback } from './helpers/db';

/**
 * ZDJĘCIA PRZY WIZYCIE
 *
 * Zdjęcia z salonu to dane, których klient nigdy nie widzi, a obcy salon nie
 * widzi tym bardziej. Reguł pilnuje baza, więc sprawdzamy je na bazie —
 * aplikacja mogłaby je pominąć na dziesięć sposobów.
 */

/** Ścieżka w koszyku ma kształt `<salon>/<wizyta>/<nazwa>`. */
function path(salonId: string, bookingId: string, name = 'zdjecie.jpg'): string {
  return `${salonId}/${bookingId}/${name}`;
}

async function insertPhoto(
  db: Awaited<Parameters<Parameters<typeof withRollback>[0]>[0]>,
  bookingId: string,
  storagePath: string,
  salonId: string = SALONS.main,
) {
  return db.query(
    `insert into public.booking_photos (salon_id, booking_id, storage_path)
     values ($1, $2, $3)
     returning id, salon_id, storage_path`,
    [salonId, bookingId, storagePath],
  );
}

/**
 * Zapis, który ma się nie udać. Nieudane polecenie przewraca całą transakcję,
 * więc odgradzamy je punktem zapisu — inaczej pierwszy sprawdzony zakaz
 * kończyłby test, zamiast pozwolić sprawdzić następny.
 */
async function rejected(
  db: Awaited<Parameters<Parameters<typeof withRollback>[0]>[0]>,
  run: () => Promise<unknown>,
): Promise<string> {
  await db.query('savepoint proba');

  try {
    await run();
  } catch (cause) {
    await db.query('rollback to savepoint proba');
    return (cause as Error).message;
  }

  await db.query('rollback to savepoint proba');
  throw new Error('Zapis przeszedł, a miał zostać odrzucony.');
}

/** Wizyta prowadzona przez Marka — potrzebna, by sprawdzić cudzy kalendarz. */
async function bookingOfMarek(
  db: Awaited<Parameters<Parameters<typeof withRollback>[0]>[0]>,
): Promise<string> {
  const { rows } = await db.query(
    `insert into public.bookings
       (salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source)
     values ($1, $2, $3,
             ((current_date - 3) + time '09:00') at time zone 'Europe/Warsaw',
             ((current_date - 3) + time '09:40') at time zone 'Europe/Warsaw',
             'completed', 7000, 'manual')
     returning id`,
    [SALONS.main, STAFF.marek, CLIENTS.jan],
  );

  return rows[0].id as string;
}

describe('zdjęcia przy wizycie', () => {
  it('właściciel dodaje zdjęcie i je widzi', () =>
    withRollback(async (db) => {
      await db.asUser(USERS.owner);

      const inserted = await insertPhoto(
        db,
        BOOKINGS.completed,
        path(SALONS.main, BOOKINGS.completed),
      );
      expect(inserted.rows).toHaveLength(1);

      const { rows } = await db.query(
        'select id from public.booking_photos where booking_id = $1',
        [BOOKINGS.completed],
      );
      expect(rows).toHaveLength(1);
    }));

  it('salon bierze się z wizyty, nie z tego, co przysłała aplikacja', () =>
    withRollback(async (db) => {
      await db.asUser(USERS.owner);

      // Podszywamy się pod obcy salon — wyzwalacz i tak wpisze właściwy.
      const { rows } = await insertPhoto(
        db,
        BOOKINGS.completed,
        path(SALONS.main, BOOKINGS.completed),
        SALONS.other,
      );

      expect(rows[0].salon_id).toBe(SALONS.main);
    }));

  it('ścieżka spoza wizyty nie przechodzi', () =>
    withRollback(async (db) => {
      await db.asUser(USERS.owner);

      const obcyFolder = await rejected(db, () =>
        insertPhoto(db, BOOKINGS.completed, `${SALONS.main}/dowolny-folder/zdjecie.jpg`),
      );
      expect(obcyFolder).toMatch(/Ścieżka zdjęcia/);

      const bezNazwy = await rejected(db, () =>
        insertPhoto(db, BOOKINGS.completed, path(SALONS.main, BOOKINGS.completed, '')),
      );
      expect(bezNazwy).toMatch(/Ścieżka zdjęcia/);
    }));

  it('obcy salon nie widzi zdjęć i nie dodaje swoich', () =>
    withRollback(async (db) => {
      await db.asUser(USERS.owner);
      await insertPhoto(db, BOOKINGS.completed, path(SALONS.main, BOOKINGS.completed));

      await db.asUser(USERS.otherSalonOwner);

      const { rows } = await db.query(
        'select id from public.booking_photos where booking_id = $1',
        [BOOKINGS.completed],
      );
      expect(rows).toHaveLength(0);

      const odrzucone = await rejected(db, () =>
        insertPhoto(db, BOOKINGS.completed, path(SALONS.main, BOOKINGS.completed, 'obce.jpg')),
      );
      expect(odrzucone).toMatch(/row-level security/);
    }));

  it('pracownik dokłada zdjęcia do swoich wizyt, ale nie do cudzych', () =>
    withRollback(async (db) => {
      const marekBooking = await bookingOfMarek(db);

      // Tomek prowadzi wizytę `BOOKINGS.completed`.
      await db.asUser(USERS.staff);

      const mine = await insertPhoto(
        db,
        BOOKINGS.completed,
        path(SALONS.main, BOOKINGS.completed),
      );
      expect(mine.rows).toHaveLength(1);

      const cudza = await rejected(db, () =>
        insertPhoto(db, marekBooking, path(SALONS.main, marekBooking)),
      );
      expect(cudza).toMatch(/row-level security/);

      // Cudze zdjęcia widzi — kalendarz salonu jest wspólny.
      await db.asUser(USERS.owner);
      await insertPhoto(db, marekBooking, path(SALONS.main, marekBooking));

      await db.asUser(USERS.staff);
      const { rows } = await db.query(
        'select id from public.booking_photos where booking_id = $1',
        [marekBooking],
      );
      expect(rows).toHaveLength(1);
    }));

  it('wizyta skasowana zabiera ze sobą zdjęcia', () =>
    withRollback(async (db) => {
      const marekBooking = await bookingOfMarek(db);

      await db.asUser(USERS.owner);
      await insertPhoto(db, marekBooking, path(SALONS.main, marekBooking));

      await db.query('reset role');
      await db.query('delete from public.bookings where id = $1', [marekBooking]);

      const { rows } = await db.query(
        'select id from public.booking_photos where booking_id = $1',
        [marekBooking],
      );
      expect(rows).toHaveLength(0);
    }));
});
