import { describe, expect, it } from 'vitest';

import { SALONS, STAFF, USERS, withRollback } from './helpers/db';

/**
 * Reguły dostępu z CLAUDE.md, rozdział 7:
 * - nikt nie widzi danych innego salonu,
 * - pracownik widzi kalendarz całego salonu, ale edytuje tylko swoje wizyty,
 * - zakładanie salonów tylko przez administratora platformy.
 */

describe('izolacja salonów', () => {
  it('właściciel widzi tylko swój salon', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.owner);

      const { rows } = await db.query('select id from public.salons');

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(SALONS.main);
    });
  });

  it('właściciel obcego salonu nie widzi naszych rezerwacji', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.otherSalonOwner);

      const { rows } = await db.query('select id from public.bookings where salon_id = $1', [
        SALONS.main,
      ]);

      expect(rows).toHaveLength(0);
    });
  });

  it('właściciel obcego salonu nie widzi naszych klientów', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.otherSalonOwner);

      const { rows } = await db.query('select id from public.clients where salon_id = $1', [
        SALONS.main,
      ]);

      expect(rows).toHaveLength(0);
    });
  });
});

describe('pracownik', () => {
  it('widzi kalendarz całego salonu, także wizyty innych fryzjerów', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.staff);

      const { rows } = await db.query('select staff_id from public.bookings where salon_id = $1', [
        SALONS.main,
      ]);

      const staffIds = new Set(rows.map((r) => r.staff_id));
      expect(staffIds.has(STAFF.marek)).toBe(true);
      expect(staffIds.has(STAFF.tomek)).toBe(true);
    });
  });

  it('nie zmienia wizyty innego fryzjera', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.staff);

      const result = await db.query(
        `update public.bookings set client_note = 'proba' where staff_id = $1 returning id`,
        [STAFF.marek],
      );

      expect(result.rowCount).toBe(0);
    });
  });

  it('zmienia własną wizytę', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.staff);

      const result = await db.query(
        `update public.bookings set client_note = 'moja notatka' where staff_id = $1 returning id`,
        [STAFF.tomek],
      );

      expect(result.rowCount).toBeGreaterThan(0);
    });
  });

  it('nie zmienia cennika', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.staff);

      const result = await db.query(
        `update public.services set price_grosz = 1 where salon_id = $1 returning id`,
        [SALONS.main],
      );

      expect(result.rowCount).toBe(0);
    });
  });
});

describe('właściciel', () => {
  it('zmienia cennik swojego salonu', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.owner);

      const result = await db.query(
        `update public.services set price_grosz = 9900 where salon_id = $1 returning id`,
        [SALONS.main],
      );

      expect(result.rowCount).toBeGreaterThan(0);
    });
  });

  it('nie zakłada nowego salonu — to rola administratora platformy', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.owner);

      await expect(
        db.query(`insert into public.salons (name, slug) values ('Nowy', 'nowy')`),
      ).rejects.toMatchObject({ code: '42501' }); // naruszenie reguły RLS
    });
  });
});

describe('administrator platformy', () => {
  it('zakłada salon', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.admin);

      const result = await db.query(
        `insert into public.salons (name, slug) values ('Nowy Salon', 'nowy-salon') returning id`,
      );

      expect(result.rowCount).toBe(1);
    });
  });

  it('widzi listę wszystkich salonów', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.admin);

      const { rows } = await db.query('select id from public.salons');

      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('historia cen', () => {
  it('zapisuje się sama przy zmianie ceny', async () => {
    await withRollback(async (db) => {
      await db.asUser(USERS.owner);

      const before = await db.query(
        'select count(*)::int as n from public.service_price_history where service_id = $1',
        ['50000000-0000-0000-0000-000000000002'],
      );

      await db.query('update public.services set price_grosz = 5500 where id = $1', [
        '50000000-0000-0000-0000-000000000002',
      ]);

      const after = await db.query(
        'select count(*)::int as n from public.service_price_history where service_id = $1',
        ['50000000-0000-0000-0000-000000000002'],
      );

      expect(after.rows[0].n).toBe(before.rows[0].n + 1);
    });
  });
});
