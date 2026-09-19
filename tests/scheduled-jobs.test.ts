import { describe, expect, it } from 'vitest';

import { type Db, withRollback } from './helpers/db';
import {
  addService,
  addStaff,
  assignService,
  availableSlots,
  createSalon,
  futureMonday,
  localTimes,
  setSalonHours,
  setWorkingHours,
} from './helpers/scenario';

/**
 * Zadania cykliczne (CLAUDE.md, rozdział 6). Testujemy same funkcje —
 * harmonogram tylko je wywołuje o wyznaczonych porach.
 */

const { date: MONDAY, weekday: MON } = futureMonday();

async function makeBooking(
  db: Db,
  args: {
    salonId: string;
    staffId: string;
    status: string;
    startsAt: string;
    endsAt: string;
    createdAt?: string;
  },
): Promise<string> {
  const client = await db.query(
    `insert into public.clients (salon_id, first_name, email, phone)
     values ($1, 'Klient', 'k' || replace(gen_random_uuid()::text, '-', '') || '@test.test', '+48600100100')
     returning id`,
    [args.salonId],
  );

  const { rows } = await db.query(
    `insert into public.bookings
       (salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source, created_at)
     values ($1, $2, $3, now() + $4::interval, now() + $5::interval, $6, 10000, 'web',
             now() + coalesce($7::interval, interval '0'))
     returning id`,
    [
      args.salonId,
      args.staffId,
      client.rows[0].id,
      args.startsAt,
      args.endsAt,
      args.status,
      args.createdAt ?? null,
    ],
  );
  return rows[0].id;
}

async function statusOf(db: Db, bookingId: string): Promise<string> {
  const { rows } = await db.query('select status from public.bookings where id = $1', [bookingId]);
  return rows[0].status;
}

describe('wygaszanie niepotwierdzonych rezerwacji', () => {
  it('wygasza rezerwację starszą niż czas na potwierdzenie', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const staffId = await addStaff(db, salonId);
      const bookingId = await makeBooking(db, {
        salonId,
        staffId,
        status: 'pending_confirmation',
        startsAt: '2 days',
        endsAt: '2 days 1 hour',
        createdAt: '-30 minutes',
      });

      await db.query('select public.expire_pending_bookings()');

      expect(await statusOf(db, bookingId)).toBe('expired');
    });
  });

  it('nie rusza rezerwacji, która wciąż ma czas na potwierdzenie', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const staffId = await addStaff(db, salonId);
      const bookingId = await makeBooking(db, {
        salonId,
        staffId,
        status: 'pending_confirmation',
        startsAt: '2 days',
        endsAt: '2 days 1 hour',
        createdAt: '-5 minutes',
      });

      await db.query('select public.expire_pending_bookings()');

      expect(await statusOf(db, bookingId)).toBe('pending_confirmation');
    });
  });

  it('każdy salon ma własny czas na potwierdzenie', async () => {
    await withRollback(async (db) => {
      const fastSalon = await createSalon(db);
      const slowSalon = await createSalon(db);
      await db.query('update public.salons set hold_minutes = 5 where id = $1', [fastSalon]);
      await db.query('update public.salons set hold_minutes = 60 where id = $1', [slowSalon]);

      const fastBooking = await makeBooking(db, {
        salonId: fastSalon,
        staffId: await addStaff(db, fastSalon),
        status: 'pending_confirmation',
        startsAt: '2 days',
        endsAt: '2 days 1 hour',
        createdAt: '-10 minutes',
      });
      const slowBooking = await makeBooking(db, {
        salonId: slowSalon,
        staffId: await addStaff(db, slowSalon),
        status: 'pending_confirmation',
        startsAt: '2 days',
        endsAt: '2 days 1 hour',
        createdAt: '-10 minutes',
      });

      await db.query('select public.expire_pending_bookings()');

      expect(await statusOf(db, fastBooking)).toBe('expired');
      expect(await statusOf(db, slowBooking)).toBe('pending_confirmation');
    });
  });

  it('wygaśnięcie zwalnia termin i wraca on do puli wolnych', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const staffId = await addStaff(db, salonId);
      const serviceId = await addService(db, salonId, { duration: 60 });
      await assignService(db, salonId, staffId, serviceId);
      await setSalonHours(db, salonId, MON, '09:00', '17:00');
      await setWorkingHours(db, salonId, staffId, MON, '09:00', '17:00');

      await db.query(
        `insert into public.clients (salon_id, first_name, email, phone)
         values ($1, 'Klient', 'zajmuje@test.test', '+48600100100')`,
        [salonId],
      );
      await db.query(
        `insert into public.bookings
           (salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source, created_at)
         select $1, $2, c.id,
                ($3::date + time '11:00') at time zone 'Europe/Warsaw',
                ($3::date + time '12:00') at time zone 'Europe/Warsaw',
                'pending_confirmation', 10000, 'web', now() - interval '30 minutes'
         from public.clients c where c.salon_id = $1 limit 1`,
        [salonId, staffId, MONDAY],
      );

      expect(localTimes(await availableSlots(db, salonId, [serviceId], MONDAY))).not.toContain('11:00');

      await db.query('select public.expire_pending_bookings()');

      expect(localTimes(await availableSlots(db, salonId, [serviceId], MONDAY))).toContain('11:00');
    });
  });
});

describe('zamykanie minionych wizyt', () => {
  it('oznacza minioną potwierdzoną wizytę jako zrealizowaną', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const staffId = await addStaff(db, salonId);
      const bookingId = await makeBooking(db, {
        salonId,
        staffId,
        status: 'confirmed',
        startsAt: '-3 hours',
        endsAt: '-2 hours',
      });

      await db.query('select public.complete_past_bookings()');

      expect(await statusOf(db, bookingId)).toBe('completed');
    });
  });

  it('nie rusza wizyty, która jeszcze trwa ani przyszłej', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const staffId = await addStaff(db, salonId);
      const ongoing = await makeBooking(db, {
        salonId,
        staffId,
        status: 'confirmed',
        startsAt: '-30 minutes',
        endsAt: '30 minutes',
      });
      const future = await makeBooking(db, {
        salonId,
        staffId,
        status: 'confirmed',
        startsAt: '2 days',
        endsAt: '2 days 1 hour',
      });

      await db.query('select public.complete_past_bookings()');

      expect(await statusOf(db, ongoing)).toBe('confirmed');
      expect(await statusOf(db, future)).toBe('confirmed');
    });
  });

  it('zostawia barberowi decyzję o wizytach niezaakceptowanych i anulowanych', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const staffId = await addStaff(db, salonId);
      const waiting = await makeBooking(db, {
        salonId,
        staffId,
        status: 'pending_approval',
        startsAt: '-3 hours',
        endsAt: '-2 hours',
      });
      const cancelled = await makeBooking(db, {
        salonId,
        staffId,
        status: 'cancelled_by_client',
        startsAt: '-5 hours',
        endsAt: '-4 hours',
      });

      await db.query('select public.complete_past_bookings()');

      expect(await statusOf(db, waiting)).toBe('pending_approval');
      expect(await statusOf(db, cancelled)).toBe('cancelled_by_client');
    });
  });
});

describe('wyłączanie promocji', () => {
  async function promoState(db: Db, serviceId: string) {
    const { rows } = await db.query(
      'select promo_price_grosz, promo_starts_at, promo_ends_at from public.services where id = $1',
      [serviceId],
    );
    return rows[0];
  }

  it('czyści promocję po dacie końcowej', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const serviceId = await addService(db, salonId, { duration: 60 });
      await db.query(
        `update public.services
         set promo_price_grosz = 5000,
             promo_starts_at = now() - interval '10 days',
             promo_ends_at = now() - interval '1 day'
         where id = $1`,
        [serviceId],
      );

      await db.query('select public.deactivate_finished_promotions()');

      expect(await promoState(db, serviceId)).toEqual({
        promo_price_grosz: null,
        promo_starts_at: null,
        promo_ends_at: null,
      });
    });
  });

  it('nie rusza trwającej promocji', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const serviceId = await addService(db, salonId, { duration: 60 });
      await db.query(
        `update public.services
         set promo_price_grosz = 5000,
             promo_starts_at = now() - interval '1 day',
             promo_ends_at = now() + interval '3 days'
         where id = $1`,
        [serviceId],
      );

      await db.query('select public.deactivate_finished_promotions()');

      expect((await promoState(db, serviceId)).promo_price_grosz).toBe(5000);
    });
  });

  it('cena zapisana w rezerwacji nie zmienia się po wygaśnięciu promocji', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const staffId = await addStaff(db, salonId);
      const serviceId = await addService(db, salonId, { duration: 60 });
      await db.query(
        `update public.services
         set price_grosz = 10000,
             promo_price_grosz = 6000,
             promo_starts_at = now() - interval '5 days',
             promo_ends_at = now() - interval '1 hour'
         where id = $1`,
        [serviceId],
      );

      const bookingId = await makeBooking(db, {
        salonId,
        staffId,
        status: 'confirmed',
        startsAt: '2 days',
        endsAt: '2 days 1 hour',
      });
      // Klient zarezerwował w promocji — cena idzie do pozycji rezerwacji.
      await db.query(
        `insert into public.booking_items
           (salon_id, booking_id, service_id, item_order, name_snapshot, price_grosz, duration_minutes)
         values ($1, $2, $3, 1, 'Usługa', 6000, 60)`,
        [salonId, bookingId, serviceId],
      );

      await db.query('select public.deactivate_finished_promotions()');

      const { rows } = await db.query(
        'select price_grosz from public.booking_items where booking_id = $1',
        [bookingId],
      );
      expect(rows[0].price_grosz).toBe(6000);
    });
  });
});

describe('harmonogram', () => {
  it('ma zarejestrowane trzy zadania', async () => {
    await withRollback(async (db) => {
      const { rows } = await db.query(
        `select jobname from cron.job where jobname like 'barbro-%' order by jobname`,
      );

      expect(rows.map((r) => r.jobname)).toEqual([
        'barbro-koniec-promocji',
        'barbro-wygaszanie-niepotwierdzonych',
        'barbro-zamykanie-minionych-wizyt',
      ]);
    });
  });
});

describe('kolejka maili do klienta', () => {
  async function bookingFor(db: Db, status: string): Promise<string> {
    const salonId = await createSalon(db);
    const staffId = await addStaff(db, salonId);
    const client = await db.query(
      `insert into public.clients (salon_id, first_name, email, phone)
       values ($1, 'Klient', 'mail' || replace(gen_random_uuid()::text, '-', '') || '@test.test', '+48600100100')
       returning id`,
      [salonId],
    );

    const { rows } = await db.query(
      `insert into public.bookings
         (salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source)
       values ($1, $2, $3, now() + interval '2 days', now() + interval '2 days 1 hour', $4, 10000, 'web')
       returning id`,
      [salonId, staffId, client.rows[0].id, status],
    );
    return rows[0].id;
  }

  it('odwołanie przez salon ustawia mail do klienta w kolejce', async () => {
    await withRollback(async (db) => {
      const bookingId = await bookingFor(db, 'confirmed');

      await db.query('select public.change_booking_status($1, $2, $3)', [
        bookingId,
        'cancelled_by_salon',
        'Fryzjer zachorował',
      ]);

      const { rows } = await db.query(
        'select template, recipient, status from public.email_log where booking_id = $1',
        [bookingId],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].template).toBe('booking_cancelled_by_salon');
      expect(rows[0].status).toBe('pending');
      expect(rows[0].recipient).toContain('@');
    });
  });

  it('rezerwacja z internetu prosi klienta o potwierdzenie', async () => {
    await withRollback(async (db) => {
      const bookingId = await bookingFor(db, 'pending_confirmation');

      const { rows } = await db.query(
        'select template from public.email_log where booking_id = $1',
        [bookingId],
      );
      expect(rows[0].template).toBe('booking_confirm_request');
    });
  });

  it('ten sam rodzaj maila nie trafia do kolejki dwa razy', async () => {
    await withRollback(async (db) => {
      const bookingId = await bookingFor(db, 'pending_approval');

      await db.query('select public.change_booking_status($1, $2)', [bookingId, 'confirmed']);
      // Tam i z powrotem: klient nie może dostać dwóch takich samych wiadomości.
      await db.query('select public.change_booking_status($1, $2, $3)', [
        bookingId,
        'cancelled_by_salon',
        'Pomyłka',
      ]);

      const { rows } = await db.query(
        `select count(*)::int as n from public.email_log
         where booking_id = $1 and template = 'booking_confirmed'`,
        [bookingId],
      );
      expect(rows[0].n).toBe(1);
    });
  });

  it('odwołanie przez klienta nie generuje maila do klienta', async () => {
    await withRollback(async (db) => {
      const bookingId = await bookingFor(db, 'confirmed');

      await db.query('select public.change_booking_status($1, $2)', [
        bookingId,
        'cancelled_by_client',
      ]);

      const { rows } = await db.query(
        'select count(*)::int as n from public.email_log where booking_id = $1',
        [bookingId],
      );
      // Klient wie, że odwołał — powiadomienie pójdzie do salonu (Etap 9).
      expect(rows[0].n).toBe(0);
    });
  });
});
