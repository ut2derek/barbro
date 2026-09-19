import { describe, expect, it } from 'vitest';

import { CLIENTS, SALONS, STAFF, warsawTime, withRollback } from './helpers/db';

/**
 * Reguła 4 z CLAUDE.md: podwójna rezerwacja musi być niemożliwa na poziomie bazy.
 * Te testy omijają aplikację i próbują zapisać kolizję wprost w bazie.
 */

const OVERLAP_ERROR = '23P01'; // naruszenie ograniczenia wykluczającego

async function insertBooking(
  db: Awaited<ReturnType<typeof withRollback>> extends never ? never : any,
  opts: { staffId: string; dayOffset: number; from: string; to: string; status?: string },
) {
  return db.query(`
    insert into public.bookings (salon_id, staff_id, client_id, starts_at, ends_at, status, total_price_grosz, source)
    values (
      '${SALONS.main}', '${opts.staffId}', '${CLIENTS.anna}',
      ${warsawTime(opts.dayOffset, opts.from)},
      ${warsawTime(opts.dayOffset, opts.to)},
      '${opts.status ?? 'confirmed'}', 8000, 'manual'
    )
    returning id
  `);
}

describe('blokada podwójnej rezerwacji', () => {
  it('odrzuca wizytę nakładającą się na istniejącą u tego samego fryzjera', async () => {
    await withRollback(async (db) => {
      await insertBooking(db, { staffId: STAFF.marek, dayOffset: 3, from: '10:00', to: '11:00' });

      await expect(
        insertBooking(db, { staffId: STAFF.marek, dayOffset: 3, from: '10:30', to: '11:30' }),
      ).rejects.toMatchObject({ code: OVERLAP_ERROR });
    });
  });

  it('dopuszcza wizytę stykającą się końcem z poprzednią', async () => {
    await withRollback(async (db) => {
      await insertBooking(db, { staffId: STAFF.marek, dayOffset: 3, from: '10:00', to: '11:00' });

      const result = await insertBooking(db, {
        staffId: STAFF.marek,
        dayOffset: 3,
        from: '11:00',
        to: '12:00',
      });

      expect(result.rowCount).toBe(1);
    });
  });

  it('dopuszcza tę samą godzinę u innego fryzjera', async () => {
    await withRollback(async (db) => {
      await insertBooking(db, { staffId: STAFF.marek, dayOffset: 3, from: '10:00', to: '11:00' });

      const result = await insertBooking(db, {
        staffId: STAFF.tomek,
        dayOffset: 3,
        from: '10:00',
        to: '11:00',
      });

      expect(result.rowCount).toBe(1);
    });
  });

  it.each([
    'cancelled_by_client',
    'cancelled_by_salon',
    'expired',
    'rescheduled',
    'no_show',
  ])('status %s zwalnia termin', async (status) => {
    await withRollback(async (db) => {
      await insertBooking(db, {
        staffId: STAFF.marek,
        dayOffset: 3,
        from: '10:00',
        to: '11:00',
        status,
      });

      const result = await insertBooking(db, {
        staffId: STAFF.marek,
        dayOffset: 3,
        from: '10:00',
        to: '11:00',
      });

      expect(result.rowCount).toBe(1);
    });
  });

  it.each([
    'pending_confirmation',
    'pending_approval',
    'confirmed',
    'completed',
  ])('status %s blokuje termin', async (status) => {
    await withRollback(async (db) => {
      await insertBooking(db, {
        staffId: STAFF.marek,
        dayOffset: 3,
        from: '10:00',
        to: '11:00',
        status,
      });

      await expect(
        insertBooking(db, { staffId: STAFF.marek, dayOffset: 3, from: '10:15', to: '10:45' }),
      ).rejects.toMatchObject({ code: OVERLAP_ERROR });
    });
  });

  it('anulowanie przez salon wymaga komentarza', async () => {
    await withRollback(async (db) => {
      await expect(
        insertBooking(db, {
          staffId: STAFF.marek,
          dayOffset: 4,
          from: '10:00',
          to: '11:00',
          status: 'cancelled_by_salon',
        }),
      ).rejects.toMatchObject({ code: '23514' }); // naruszenie warunku CHECK
    });
  });
});
