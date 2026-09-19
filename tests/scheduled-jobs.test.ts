import { describe, expect, it } from 'vitest';

import { type Db, withRollback } from './helpers/db';
import { addStaff, createSalon } from './helpers/scenario';
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