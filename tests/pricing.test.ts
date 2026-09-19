import { describe, expect, it } from 'vitest';

import { type Db, withRollback } from './helpers/db';
import { addService, addStaff, assignService, createSalon } from './helpers/scenario';

/**
 * Ceny i promocje (CLAUDE.md, reguły 5 i 6).
 *
 * Przy obniżce trzeba pokazać najniższą cenę z 30 dni przed promocją — to wymóg
 * ustawy o informowaniu o cenach, a nie kwestia gustu. Liczymy ją z historii,
 * którą baza prowadzi sama przy każdej zmianie cennika.
 */

async function serviceWithHistory(
  db: Db,
  prices: { price: number; daysAgo: number }[],
  promo?: { price: number; startedDaysAgo: number; endsInDays: number },
) {
  const salonId = await createSalon(db);
  const serviceId = await addService(db, salonId, { duration: 60, name: 'Strzyżenie' });

  // Wyzwalacz zapisał już cenę początkową — czyścimy, żeby test panował nad historią.
  await db.query('delete from public.service_price_history where service_id = $1', [serviceId]);

  for (const entry of prices) {
    await db.query(
      `insert into public.service_price_history (salon_id, service_id, price_grosz, effective_from)
       values ($1, $2, $3, now() - make_interval(days => $4))`,
      [salonId, serviceId, entry.price, entry.daysAgo],
    );
  }

  if (promo) {
    await db.query(
      `update public.services
       set promo_price_grosz = $2,
           promo_starts_at = now() - make_interval(days => $3),
           promo_ends_at = now() + make_interval(days => $4)
       where id = $1`,
      [serviceId, promo.price, promo.startedDaysAgo, promo.endsInDays],
    );
  }

  return { salonId, serviceId };
}

async function lowestPrice(db: Db, serviceId: string): Promise<number | null> {
  const { rows } = await db.query('select public.lowest_price_before_promo($1) as price', [
    serviceId,
  ]);
  return rows[0].price;
}

describe('najniższa cena z 30 dni przed obniżką', () => {
  it('bierze najniższą cenę z okna 30 dni', async () => {
    await withRollback(async (db) => {
      const { serviceId } = await serviceWithHistory(
        db,
        [
          { price: 10000, daysAgo: 25 },
          { price: 9000, daysAgo: 15 },
          { price: 11000, daysAgo: 5 },
        ],
        { price: 7000, startedDaysAgo: 1, endsInDays: 7 },
      );

      expect(await lowestPrice(db, serviceId)).toBe(9000);
    });
  });

  it('pomija ceny starsze niż 30 dni przed obniżką', async () => {
    await withRollback(async (db) => {
      const { serviceId } = await serviceWithHistory(
        db,
        [
          // Bardzo niska cena, ale sprzed okna — nie może zaniżyć wyniku.
          { price: 3000, daysAgo: 60 },
          { price: 10000, daysAgo: 20 },
        ],
        { price: 7000, startedDaysAgo: 1, endsInDays: 7 },
      );

      expect(await lowestPrice(db, serviceId)).toBe(10000);
    });
  });

  it('gdy w oknie nie ma zmian, bierze ostatnią cenę sprzed okna', async () => {
    await withRollback(async (db) => {
      const { serviceId } = await serviceWithHistory(
        db,
        [
          { price: 12000, daysAgo: 90 },
          { price: 9500, daysAgo: 45 },
        ],
        { price: 7000, startedDaysAgo: 1, endsInDays: 7 },
      );

      expect(await lowestPrice(db, serviceId)).toBe(9500);
    });
  });

  it('bez historii bierze cenę z cennika', async () => {
    await withRollback(async (db) => {
      const { serviceId } = await serviceWithHistory(db, [], {
        price: 7000,
        startedDaysAgo: 1,
        endsInDays: 7,
      });
      await db.query('update public.services set price_grosz = 10000 where id = $1', [serviceId]);
      await db.query('delete from public.service_price_history where service_id = $1', [serviceId]);

      expect(await lowestPrice(db, serviceId)).toBe(10000);
    });
  });
});

describe('cena pokazywana klientowi', () => {
  async function pricing(db: Db, salonId: string, staffId?: string) {
    const { rows } = await db.query(
      'select * from public.service_pricing($1, $2) order by service_id',
      [salonId, staffId ?? null],
    );
    return rows;
  }

  it('w trakcie promocji podaje cenę promocyjną razem z najniższą z 30 dni', async () => {
    await withRollback(async (db) => {
      const { salonId, serviceId } = await serviceWithHistory(
        db,
        [{ price: 9000, daysAgo: 10 }],
        { price: 7000, startedDaysAgo: 1, endsInDays: 7 },
      );
      await db.query('update public.services set price_grosz = 10000 where id = $1', [serviceId]);

      const [row] = await pricing(db, salonId);

      expect(row.price_grosz).toBe(7000);
      expect(row.regular_price_grosz).toBe(10000);
      expect(row.lowest_price_before_promo_grosz).toBe(9000);
      expect(row.promo_active).toBe(true);
    });
  });

  it('po zakończeniu promocji wraca cena z cennika', async () => {
    await withRollback(async (db) => {
      const { salonId, serviceId } = await serviceWithHistory(db, [{ price: 9000, daysAgo: 10 }]);
      await db.query(
        `update public.services
         set price_grosz = 10000,
             promo_price_grosz = 7000,
             promo_starts_at = now() - interval '10 days',
             promo_ends_at = now() - interval '1 day'
         where id = $1`,
        [serviceId],
      );

      const [row] = await pricing(db, salonId);

      expect(row.price_grosz).toBe(10000);
      expect(row.promo_active).toBe(false);
      expect(row.lowest_price_before_promo_grosz).toBeNull();
    });
  });

  it('cena ustawiona u fryzjera ma pierwszeństwo przed promocją', async () => {
    await withRollback(async (db) => {
      const { salonId, serviceId } = await serviceWithHistory(
        db,
        [{ price: 9000, daysAgo: 10 }],
        { price: 7000, startedDaysAgo: 1, endsInDays: 7 },
      );
      const staffId = await addStaff(db, salonId);
      await assignService(db, salonId, staffId, serviceId, { price: 12000, duration: 30 });

      const [row] = await pricing(db, salonId, staffId);

      expect(row.price_grosz).toBe(12000);
      expect(row.promo_active).toBe(false);
      expect(row.duration_minutes).toBe(30);
    });
  });

  it('dla fryzjera pokazuje wyłącznie usługi, które wykonuje', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const staffId = await addStaff(db, salonId);
      const doing = await addService(db, salonId, { duration: 30, name: 'Robi' });
      await addService(db, salonId, { duration: 30, name: 'Nie robi' });
      await assignService(db, salonId, staffId, doing);

      const rows = await pricing(db, salonId, staffId);

      expect(rows).toHaveLength(1);
      expect(rows[0].service_id).toBe(doing);
    });
  });
});