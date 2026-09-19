import { describe, expect, it } from 'vitest';

import { CLIENTS, SALONS, SERVICES, STAFF, USERS, type Db, withRollback } from './helpers/db';
import {
  addService,
  addStaff,
  assignService,
  at,
  availableSlots,
  createSalon,
  futureMonday,
  localTimes,
  setSalonHours,
  setWorkingHours,
} from './helpers/scenario';

/**
 * Tworzenie, przekładanie i zmiana statusu wizyty. Te same funkcje wywoła
 * później strona rezerwacji dla klientów, więc reguły muszą być tutaj,
 * a nie w kodzie aplikacji.
 */

const { date: MONDAY, weekday: MON } = futureMonday();

async function salonWithService(
  db: Db,
  options: { duration?: number; buffer?: number; price?: number } = {},
) {
  const salonId = await createSalon(db, { minLead: 0, horizon: 365 });
  const staffId = await addStaff(db, salonId);
  const serviceId = await addService(db, salonId, {
    duration: options.duration ?? 60,
    buffer: options.buffer ?? 0,
    name: 'Strzyżenie',
  });
  await assignService(db, salonId, staffId, serviceId);
  await setSalonHours(db, salonId, MON, '09:00', '17:00');
  await setWorkingHours(db, salonId, staffId, MON, '09:00', '17:00');

  if (options.price !== undefined) {
    await db.query('update public.services set price_grosz = $2 where id = $1', [
      serviceId,
      options.price,
    ]);
  }

  const client = await db.query(
    `insert into public.clients (salon_id, first_name, email, phone)
     values ($1, 'Jan', 'jan' || replace(gen_random_uuid()::text, '-', '') || '@test.test', '+48600100100')
     returning id`,
    [salonId],
  );

  return { salonId, staffId, serviceId, clientId: client.rows[0].id };
}

async function createBooking(
  db: Db,
  args: {
    salonId: string;
    staffId: string;
    clientId: string;
    serviceIds: string[];
    startsAt: Date;
    source?: string;
  },
): Promise<string> {
  const { rows } = await db.query(
    `select public.create_booking($1, $2, $3, $4::uuid[], $5, $6::public.booking_source) as id`,
    [
      args.salonId,
      args.staffId,
      args.clientId,
      args.serviceIds,
      args.startsAt,
      args.source ?? 'manual',
    ],
  );
  return rows[0].id;
}

describe('tworzenie wizyty', () => {
  it('sumuje czas i cenę wszystkich usług', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, clientId, serviceId } = await salonWithService(db, {
        duration: 45,
        price: 8000,
      });
      const beard = await addService(db, salonId, { duration: 30, buffer: 10, name: 'Broda' });
      await db.query('update public.services set price_grosz = 5000 where id = $1', [beard]);
      await assignService(db, salonId, staffId, beard);

      const bookingId = await createBooking(db, {
        salonId,
        staffId,
        clientId,
        serviceIds: [serviceId, beard],
        startsAt: at(MONDAY, '10:00'),
      });

      const { rows } = await db.query(
        `select starts_at, ends_at, buffer_after_minutes, total_price_grosz, status,
                (select count(*)::int from public.booking_items where booking_id = b.id) as items
         from public.bookings b where id = $1`,
        [bookingId],
      );

      expect(rows[0].total_price_grosz).toBe(13000);
      expect(rows[0].items).toBe(2);
      // 45 + 30 minut wizyty, przerwa po ostatniej usłudze osobno.
      expect(new Date(rows[0].ends_at).getTime() - new Date(rows[0].starts_at).getTime()).toBe(
        75 * 60 * 1000,
      );
      expect(rows[0].buffer_after_minutes).toBe(10);
      // Wizyta dopisana przez salon jest od razu potwierdzona.
      expect(rows[0].status).toBe('confirmed');
    });
  });

  it('zapisuje cenę promocyjną obowiązującą w chwili rezerwacji', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, clientId, serviceId } = await salonWithService(db, { price: 10000 });
      await db.query(
        `update public.services
         set promo_price_grosz = 7000,
             promo_starts_at = now() - interval '1 day',
             promo_ends_at = now() + interval '1 day'
         where id = $1`,
        [serviceId],
      );

      const bookingId = await createBooking(db, {
        salonId,
        staffId,
        clientId,
        serviceIds: [serviceId],
        startsAt: at(MONDAY, '10:00'),
      });

      const { rows } = await db.query(
        'select total_price_grosz from public.bookings where id = $1',
        [bookingId],
      );
      expect(rows[0].total_price_grosz).toBe(7000);
    });
  });

  it('cena ustawiona u konkretnego fryzjera ma pierwszeństwo przed promocją', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, clientId, serviceId } = await salonWithService(db, { price: 10000 });
      await db.query(
        `update public.services
         set promo_price_grosz = 7000,
             promo_starts_at = now() - interval '1 day',
             promo_ends_at = now() + interval '1 day'
         where id = $1`,
        [serviceId],
      );
      await db.query(
        'update public.staff_services set price_grosz_override = 12000 where staff_id = $1 and service_id = $2',
        [staffId, serviceId],
      );

      const bookingId = await createBooking(db, {
        salonId,
        staffId,
        clientId,
        serviceIds: [serviceId],
        startsAt: at(MONDAY, '10:00'),
      });

      const { rows } = await db.query(
        'select total_price_grosz from public.bookings where id = $1',
        [bookingId],
      );
      expect(rows[0].total_price_grosz).toBe(12000);
    });
  });

  it('odrzuca usługę, której fryzjer nie wykonuje', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, clientId } = await salonWithService(db);
      const other = await addService(db, salonId, { duration: 30, name: 'Koloryzacja' });

      await expect(
        createBooking(db, {
          salonId,
          staffId,
          clientId,
          serviceIds: [other],
          startsAt: at(MONDAY, '10:00'),
        }),
      ).rejects.toMatchObject({ code: 'P0003' });
    });
  });

  it('nie pozwala nałożyć wizyty na istniejącą', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, clientId, serviceId } = await salonWithService(db, { duration: 60 });
      await createBooking(db, {
        salonId,
        staffId,
        clientId,
        serviceIds: [serviceId],
        startsAt: at(MONDAY, '10:00'),
      });

      await expect(
        createBooking(db, {
          salonId,
          staffId,
          clientId,
          serviceIds: [serviceId],
          startsAt: at(MONDAY, '10:30'),
        }),
      ).rejects.toMatchObject({ code: '23P01' });
    });
  });

  it('rezerwacja z internetu musi trafić w wolny termin, ręczna nie musi', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, clientId, serviceId } = await salonWithService(db);

      // 07:00 — salon jeszcze zamknięty.
      await db.query('savepoint przed_proba');
      await expect(
        createBooking(db, {
          salonId,
          staffId,
          clientId,
          serviceIds: [serviceId],
          startsAt: at(MONDAY, '07:00'),
          source: 'web',
        }),
      ).rejects.toMatchObject({ code: 'P0004' });
      await db.query('rollback to savepoint przed_proba');

      // Barber może kogoś wcisnąć poza grafikiem.
      const manual = await createBooking(db, {
        salonId,
        staffId,
        clientId,
        serviceIds: [serviceId],
        startsAt: at(MONDAY, '07:00'),
      });
      expect(manual).toBeTruthy();
    });
  });

  it('rezerwacja z internetu czeka na potwierdzenie mailem', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, clientId, serviceId } = await salonWithService(db);

      const bookingId = await createBooking(db, {
        salonId,
        staffId,
        clientId,
        serviceIds: [serviceId],
        startsAt: at(MONDAY, '10:00'),
        source: 'web',
      });

      const { rows } = await db.query('select status from public.bookings where id = $1', [
        bookingId,
      ]);
      expect(rows[0].status).toBe('pending_confirmation');
    });
  });
});

describe('zmiana statusu', () => {
  async function bookingInStatus(db: Db, status: string) {
    const ctx = await salonWithService(db);
    const bookingId = await createBooking(db, {
      salonId: ctx.salonId,
      staffId: ctx.staffId,
      clientId: ctx.clientId,
      serviceIds: [ctx.serviceId],
      startsAt: at(MONDAY, '10:00'),
    });
    if (status !== 'confirmed') {
      await db.query('update public.bookings set status = $2 where id = $1', [bookingId, status]);
    }
    return { ...ctx, bookingId };
  }

  it('potwierdzoną wizytę można zamknąć jako zrealizowaną', async () => {
    await withRollback(async (db) => {
      const { bookingId } = await bookingInStatus(db, 'confirmed');

      await db.query('select public.change_booking_status($1, $2)', [bookingId, 'completed']);

      const { rows } = await db.query('select status from public.bookings where id = $1', [
        bookingId,
      ]);
      expect(rows[0].status).toBe('completed');
    });
  });

  it('zamkniętej wizyty nie da się cofnąć', async () => {
    await withRollback(async (db) => {
      const { bookingId } = await bookingInStatus(db, 'completed');

      await expect(
        db.query('select public.change_booking_status($1, $2)', [bookingId, 'confirmed']),
      ).rejects.toMatchObject({ code: 'P0007' });
    });
  });

  it('anulowanie przez salon bez komentarza jest odrzucane', async () => {
    await withRollback(async (db) => {
      const { bookingId } = await bookingInStatus(db, 'confirmed');

      await expect(
        db.query('select public.change_booking_status($1, $2)', [bookingId, 'cancelled_by_salon']),
      ).rejects.toMatchObject({ code: 'P0008' });
    });
  });

  it('anulowanie przez salon z komentarzem zapisuje powód i zwalnia termin', async () => {
    await withRollback(async (db) => {
      const { bookingId, salonId, serviceId } = await bookingInStatus(db, 'confirmed');

      await db.query('select public.change_booking_status($1, $2, $3)', [
        bookingId,
        'cancelled_by_salon',
        'Fryzjer zachorował',
      ]);

      const { rows } = await db.query(
        'select status, cancellation_comment from public.bookings where id = $1',
        [bookingId],
      );
      expect(rows[0].status).toBe('cancelled_by_salon');
      expect(rows[0].cancellation_comment).toBe('Fryzjer zachorował');
      expect(localTimes(await availableSlots(db, salonId, [serviceId], MONDAY))).toContain('10:00');
    });
  });

  it('każda zmiana statusu trafia do historii', async () => {
    await withRollback(async (db) => {
      const { bookingId } = await bookingInStatus(db, 'confirmed');

      await db.query('select public.change_booking_status($1, $2)', [bookingId, 'no_show']);

      const { rows } = await db.query(
        'select from_status, to_status from public.booking_status_history where booking_id = $1 order by created_at',
        [bookingId],
      );
      expect(rows.map((r) => r.to_status)).toEqual(['confirmed', 'no_show']);
    });
  });
});

describe('przełożenie terminu', () => {
  it('zwalnia stary termin i wiąże wizyty ze sobą', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, clientId, serviceId } = await salonWithService(db);
      const oldId = await createBooking(db, {
        salonId,
        staffId,
        clientId,
        serviceIds: [serviceId],
        startsAt: at(MONDAY, '10:00'),
      });

      const { rows: newRows } = await db.query(
        'select public.reschedule_booking($1, $2) as id',
        [oldId, at(MONDAY, '14:00')],
      );
      const newId = newRows[0].id;

      const { rows } = await db.query(
        `select id, status, starts_at, previous_booking_id, total_price_grosz
         from public.bookings where id in ($1, $2) order by starts_at`,
        [oldId, newId],
      );

      expect(rows[0].status).toBe('rescheduled');
      expect(rows[1].previous_booking_id).toBe(oldId);
      // Cena ustalona przy pierwszej rezerwacji zostaje.
      expect(rows[1].total_price_grosz).toBe(rows[0].total_price_grosz);

      const times = localTimes(await availableSlots(db, salonId, [serviceId], MONDAY));
      expect(times).toContain('10:00');
      expect(times).not.toContain('14:00');
    });
  });

  it('przeniesienie pozycji zachowuje zapisane ceny', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, clientId, serviceId } = await salonWithService(db, { price: 9000 });
      const oldId = await createBooking(db, {
        salonId,
        staffId,
        clientId,
        serviceIds: [serviceId],
        startsAt: at(MONDAY, '10:00'),
      });

      // Cennik zmienia się już po rezerwacji.
      await db.query('update public.services set price_grosz = 15000 where id = $1', [serviceId]);

      const { rows: newRows } = await db.query('select public.reschedule_booking($1, $2) as id', [
        oldId,
        at(MONDAY, '14:00'),
      ]);

      const { rows } = await db.query(
        'select price_grosz from public.booking_items where booking_id = $1',
        [newRows[0].id],
      );
      expect(rows[0].price_grosz).toBe(9000);
    });
  });

  it('przełożenie na zajęty termin nie rusza starej wizyty', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, clientId, serviceId } = await salonWithService(db);
      const first = await createBooking(db, {
        salonId,
        staffId,
        clientId,
        serviceIds: [serviceId],
        startsAt: at(MONDAY, '10:00'),
      });
      await createBooking(db, {
        salonId,
        staffId,
        clientId,
        serviceIds: [serviceId],
        startsAt: at(MONDAY, '14:00'),
      });

      await db.query('savepoint przed_przelozeniem');
      await expect(
        db.query('select public.reschedule_booking($1, $2)', [first, at(MONDAY, '14:00')]),
      ).rejects.toMatchObject({ code: '23P01' });
      await db.query('rollback to savepoint przed_przelozeniem');

      const { rows } = await db.query('select status from public.bookings where id = $1', [first]);
      expect(rows[0].status).toBe('confirmed');
    });
  });

  it('nie przekłada wizyty już anulowanej', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, clientId, serviceId } = await salonWithService(db);
      const bookingId = await createBooking(db, {
        salonId,
        staffId,
        clientId,
        serviceIds: [serviceId],
        startsAt: at(MONDAY, '10:00'),
      });
      await db.query('select public.change_booking_status($1, $2)', [
        bookingId,
        'cancelled_by_client',
      ]);

      await expect(
        db.query('select public.reschedule_booking($1, $2)', [bookingId, at(MONDAY, '14:00')]),
      ).rejects.toMatchObject({ code: 'P0009' });
    });
  });
});

describe('uprawnienia zalogowanego użytkownika', () => {
  /**
   * Testy wyżej działają z uprawnieniami administratora bazy, więc nie wyłapią
   * braku uprawnień zwykłego konta. Te dwa przechodzą tą samą drogą co aplikacja.
   */

  it('właściciel salonu zapisuje wizytę przez funkcję', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.owner);

      const { rows } = await db.query(
        `select public.create_booking($1, $2, $3, $4::uuid[], now() + interval '10 days', 'manual') as id`,
        [SALONS.main, STAFF.marek, CLIENTS.jan, [SERVICES.haircut]],
      );

      expect(rows[0].id).toBeTruthy();
    });
  });

  it('właściciel obcego salonu nie zapisze wizyty w cudzym salonie', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.otherSalonOwner);

      // Reguły dostępu ukrywają cudzy salon całkowicie, więc funkcja nie mówi
      // „brak uprawnień”, tylko „salon nie istnieje” — nie zdradzamy nawet tego,
      // że taki salon jest w bazie.
      await expect(
        db.query(
          `select public.create_booking($1, $2, $3, $4::uuid[], now() + interval '10 days', 'manual')`,
          [SALONS.main, STAFF.marek, CLIENTS.jan, [SERVICES.haircut]],
        ),
      ).rejects.toMatchObject({ code: 'P0002' });
    });
  });

  it('pracownik dopisuje wizytę i zmienia jej status', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.staff);

      const { rows } = await db.query(
        `select public.create_booking($1, $2, $3, $4::uuid[], now() + interval '11 days', 'manual') as id`,
        [SALONS.main, STAFF.tomek, CLIENTS.jan, [SERVICES.haircut]],
      );

      await db.query('select public.change_booking_status($1, $2, $3)', [
        rows[0].id,
        'cancelled_by_salon',
        'Klient przełożył telefonicznie',
      ]);

      const check = await db.query('select status from public.bookings where id = $1', [rows[0].id]);
      expect(check.rows[0].status).toBe('cancelled_by_salon');
    });
  });
});
