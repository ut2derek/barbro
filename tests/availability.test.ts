import { describe, expect, it } from 'vitest';

import { withRollback } from './helpers/db';
import {
  addService,
  addStaff,
  assignService,
  at,
  availableSlots,
  createSalon,
  dayAfter,
  futureMonday,
  localTimes,
  setSalonHours,
  setWorkingHours,
  utcTimes,
} from './helpers/scenario';

/**
 * Przypadki brzegowe liczenia wolnych terminów (CLAUDE.md, rozdział 11).
 * Każdy test buduje własny salon, więc opisuje dokładnie jedną regułę.
 */

const { date: MONDAY, weekday: MON } = futureMonday();

/** Salon 9–17, jeden fryzjer 9–17, jedna usługa. */
async function simpleSalon(
  db: Parameters<Parameters<typeof withRollback>[0]>[0],
  options: { duration?: number; buffer?: number; slotStep?: number; minLead?: number; horizon?: number } = {},
) {
  const salonId = await createSalon(db, {
    slotStep: options.slotStep ?? 15,
    minLead: options.minLead ?? 0,
    horizon: options.horizon ?? 365,
  });
  const staffId = await addStaff(db, salonId);
  const serviceId = await addService(db, salonId, {
    duration: options.duration ?? 60,
    buffer: options.buffer ?? 0,
  });
  await assignService(db, salonId, staffId, serviceId);
  await setSalonHours(db, salonId, MON, '09:00', '17:00');
  await setWorkingHours(db, salonId, staffId, MON, '09:00', '17:00');
  return { salonId, staffId, serviceId };
}

describe('podstawy', () => {
  it('zwraca sloty w siatce co 15 minut, ostatni taki, by wizyta zmieściła się do zamknięcia', async () => {
    await withRollback(async (db) => {
      const { salonId, serviceId } = await simpleSalon(db, { duration: 60 });

      const slots = await availableSlots(db, salonId, [serviceId], MONDAY);
      const times = localTimes(slots);

      expect(times[0]).toBe('09:00');
      expect(times[1]).toBe('09:15');
      expect(times.at(-1)).toBe('16:00');
      expect(times).toHaveLength(29);
    });
  });

  it('respektuje siatkę ustawioną w salonie', async () => {
    await withRollback(async (db) => {
      const { salonId, serviceId } = await simpleSalon(db, { duration: 60, slotStep: 30 });

      const times = localTimes(await availableSlots(db, salonId, [serviceId], MONDAY));

      expect(times.slice(0, 3)).toEqual(['09:00', '09:30', '10:00']);
    });
  });

  it('nie proponuje niczego w dniu, w którym fryzjer nie pracuje', async () => {
    await withRollback(async (db) => {
      const { salonId, serviceId } = await simpleSalon(db);

      const slots = await availableSlots(db, salonId, [serviceId], dayAfter(MONDAY, 1));

      expect(slots).toHaveLength(0);
    });
  });
});

describe('godziny pracy', () => {
  it('usługa dłuższa niż okno pracy nie daje żadnego terminu', async () => {
    await withRollback(async (db) => {
      const { salonId, serviceId } = await simpleSalon(db, { duration: 600 });

      expect(await availableSlots(db, salonId, [serviceId], MONDAY)).toHaveLength(0);
    });
  });

  it('fryzjer nie pracuje poza godzinami otwarcia salonu', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const staffId = await addStaff(db, salonId);
      const serviceId = await addService(db, salonId, { duration: 60 });
      await assignService(db, salonId, staffId, serviceId);
      // Salon otwarty krócej niż chce pracować fryzjer.
      await setSalonHours(db, salonId, MON, '09:00', '17:00');
      await setWorkingHours(db, salonId, staffId, MON, '06:00', '22:00');

      const times = localTimes(await availableSlots(db, salonId, [serviceId], MONDAY));

      expect(times[0]).toBe('09:00');
      expect(times.at(-1)).toBe('16:00');
    });
  });

  it('przerwa w grafiku wycina terminy w jej trakcie', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const staffId = await addStaff(db, salonId);
      const serviceId = await addService(db, salonId, { duration: 60 });
      await assignService(db, salonId, staffId, serviceId);
      await setSalonHours(db, salonId, MON, '09:00', '18:00');
      // Przerwa 13:00–14:00.
      await setWorkingHours(db, salonId, staffId, MON, '09:00', '13:00');
      await setWorkingHours(db, salonId, staffId, MON, '14:00', '18:00');

      const times = localTimes(await availableSlots(db, salonId, [serviceId], MONDAY));

      expect(times).toContain('12:00');
      expect(times).not.toContain('12:15');
      expect(times).not.toContain('13:00');
      expect(times).toContain('14:00');
      expect(times.at(-1)).toBe('17:00');
    });
  });
});

describe('urlopy i blokady', () => {
  it('urlop zabiera cały dzień', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, serviceId } = await simpleSalon(db);
      await db.query(
        `insert into public.schedule_exceptions (salon_id, staff_id, exception_type, starts_on, ends_on, reason)
         values ($1, $2, 'day_off', $3::date, $3::date, 'Urlop')`,
        [salonId, staffId, MONDAY],
      );

      expect(await availableSlots(db, salonId, [serviceId], MONDAY)).toHaveLength(0);
    });
  });

  it('dzień wolny ogłoszony dla całego salonu zabiera dzień wszystkim', async () => {
    await withRollback(async (db) => {
      const { salonId, serviceId } = await simpleSalon(db);
      await db.query(
        `insert into public.schedule_exceptions (salon_id, staff_id, exception_type, starts_on, ends_on, reason)
         values ($1, null, 'day_off', $2::date, $2::date, 'Święto')`,
        [salonId, MONDAY],
      );

      expect(await availableSlots(db, salonId, [serviceId], MONDAY)).toHaveLength(0);
    });
  });

  it('wyjątek „inne godziny” zastępuje grafik na ten dzień', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, serviceId } = await simpleSalon(db, { duration: 60 });
      await db.query(
        `insert into public.schedule_exceptions (salon_id, staff_id, exception_type, starts_on, ends_on, start_time, end_time)
         values ($1, $2, 'custom_hours', $3::date, $3::date, '12:00', '15:00')`,
        [salonId, staffId, MONDAY],
      );

      const times = localTimes(await availableSlots(db, salonId, [serviceId], MONDAY));

      expect(times[0]).toBe('12:00');
      expect(times.at(-1)).toBe('14:00');
    });
  });

  it('ręczna blokada czasu wycina kolidujące terminy', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, serviceId } = await simpleSalon(db, { duration: 60 });
      await db.query(
        `insert into public.time_blocks (salon_id, staff_id, starts_at, ends_at, reason)
         values ($1, $2, $3, $4, 'Dostawa')`,
        [salonId, staffId, at(MONDAY, '11:00'), at(MONDAY, '12:00')],
      );

      const times = localTimes(await availableSlots(db, salonId, [serviceId], MONDAY));

      expect(times).toContain('10:00');
      expect(times).not.toContain('10:15');
      expect(times).not.toContain('11:30');
      expect(times).toContain('12:00');
    });
  });
});

describe('istniejące rezerwacje', () => {
  async function book(
    db: Parameters<Parameters<typeof withRollback>[0]>[0],
    args: { salonId: string; staffId: string; from: string; to: string; buffer?: number; status?: string },
  ) {
    const { rows } = await db.query(
      `insert into public.clients (salon_id, first_name, email, phone)
       values ($1, 'Klient', 'k' || replace(gen_random_uuid()::text, '-', '') || '@test.test', '+48600100100')
       returning id`,
      [args.salonId],
    );

    await db.query(
      `insert into public.bookings
         (salon_id, staff_id, client_id, starts_at, ends_at, buffer_after_minutes, status, total_price_grosz, source)
       values ($1, $2, $3, $4, $5, $6, $7, 10000, 'manual')`,
      [
        args.salonId,
        args.staffId,
        rows[0].id,
        at(MONDAY, args.from),
        at(MONDAY, args.to),
        args.buffer ?? 0,
        args.status ?? 'confirmed',
      ],
    );
  }

  it('zajęty termin znika z listy', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, serviceId } = await simpleSalon(db, { duration: 60 });
      await book(db, { salonId, staffId, from: '11:00', to: '12:00' });

      const times = localTimes(await availableSlots(db, salonId, [serviceId], MONDAY));

      expect(times).not.toContain('11:00');
      expect(times).not.toContain('10:30');
      expect(times).toContain('10:00');
      expect(times).toContain('12:00');
    });
  });

  it('przerwa po wizycie blokuje kolejny termin', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, serviceId } = await simpleSalon(db, { duration: 60 });
      // Wizyta kończy się o 12:00, ale po niej jest 15 minut przerwy.
      await book(db, { salonId, staffId, from: '11:00', to: '12:00', buffer: 15 });

      const times = localTimes(await availableSlots(db, salonId, [serviceId], MONDAY));

      expect(times).not.toContain('12:00');
      expect(times).toContain('12:15');
    });
  });

  it('przerwa po rezerwowanej usłudze też musi się zmieścić przed kolejną wizytą', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, serviceId } = await simpleSalon(db, { duration: 60, buffer: 15 });
      await book(db, { salonId, staffId, from: '12:00', to: '13:00' });

      const times = localTimes(await availableSlots(db, salonId, [serviceId], MONDAY));

      // Wizyta 10:45–11:45 plus 15 minut przerwy kończy się dokładnie o 12:00.
      expect(times).toContain('10:45');
      expect(times).not.toContain('11:00');
    });
  });

  it('anulowana wizyta zwalnia termin', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, serviceId } = await simpleSalon(db, { duration: 60 });
      await book(db, { salonId, staffId, from: '11:00', to: '12:00', status: 'cancelled_by_client' });

      expect(localTimes(await availableSlots(db, salonId, [serviceId], MONDAY))).toContain('11:00');
    });
  });

  it('niepotwierdzona wizyta blokuje termin, dopóki nie wygaśnie', async () => {
    await withRollback(async (db) => {
      const { salonId, staffId, serviceId } = await simpleSalon(db, { duration: 60 });
      await book(db, { salonId, staffId, from: '11:00', to: '12:00', status: 'pending_confirmation' });

      expect(localTimes(await availableSlots(db, salonId, [serviceId], MONDAY))).not.toContain('11:00');
    });
  });
});

describe('usługi i fryzjerzy', () => {
  it('kilka usług w jednej wizycie sumuje czas', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const staffId = await addStaff(db, salonId);
      const haircut = await addService(db, salonId, { duration: 45, name: 'Strzyżenie' });
      const beard = await addService(db, salonId, { duration: 30, name: 'Broda' });
      await assignService(db, salonId, staffId, haircut);
      await assignService(db, salonId, staffId, beard);
      await setSalonHours(db, salonId, MON, '09:00', '17:00');
      await setWorkingHours(db, salonId, staffId, MON, '09:00', '17:00');

      const times = localTimes(await availableSlots(db, salonId, [haircut, beard], MONDAY));

      // 75 minut, więc ostatnia wizyta może zacząć się o 15:45.
      expect(times.at(-1)).toBe('15:45');
    });
  });

  it('uwzględnia skrócony czas usługi u konkretnego fryzjera', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const staffId = await addStaff(db, salonId);
      const serviceId = await addService(db, salonId, { duration: 60 });
      await assignService(db, salonId, staffId, serviceId, { duration: 30 });
      await setSalonHours(db, salonId, MON, '09:00', '17:00');
      await setWorkingHours(db, salonId, staffId, MON, '09:00', '17:00');

      const times = localTimes(await availableSlots(db, salonId, [serviceId], MONDAY));

      expect(times.at(-1)).toBe('16:30');
    });
  });

  it('pomija fryzjera, który nie wykonuje wybranej usługi', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const doing = await addStaff(db, salonId, 'Robi');
      const notDoing = await addStaff(db, salonId, 'Nie robi');
      const serviceId = await addService(db, salonId, { duration: 60 });
      await assignService(db, salonId, doing, serviceId);
      for (const staffId of [doing, notDoing]) {
        await setSalonHours(db, salonId, MON, '09:00', '17:00');
        await setWorkingHours(db, salonId, staffId, MON, '09:00', '17:00');
      }

      const slots = await availableSlots(db, salonId, [serviceId], MONDAY);

      expect(new Set(slots.map((s) => s.staff_id))).toEqual(new Set([doing]));
    });
  });

  it('wybór konkretnego fryzjera zawęża listę do jego terminów', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db);
      const first = await addStaff(db, salonId, 'Pierwszy');
      const second = await addStaff(db, salonId, 'Drugi');
      const serviceId = await addService(db, salonId, { duration: 60 });
      await setSalonHours(db, salonId, MON, '09:00', '17:00');
      for (const staffId of [first, second]) {
        await assignService(db, salonId, staffId, serviceId);
        await setWorkingHours(db, salonId, staffId, MON, '09:00', '17:00');
      }

      const all = await availableSlots(db, salonId, [serviceId], MONDAY);
      const onlyFirst = await availableSlots(db, salonId, [serviceId], MONDAY, first);

      expect(new Set(all.map((s) => s.staff_id)).size).toBe(2);
      expect(new Set(onlyFirst.map((s) => s.staff_id))).toEqual(new Set([first]));
    });
  });
});

describe('wyprzedzenie, horyzont i wyłączony salon', () => {
  it('minimalne wyprzedzenie ucina najbliższe terminy', async () => {
    await withRollback(async (db) => {
      // Wyprzedzenie większe niż odległość do badanego dnia.
      const { salonId, serviceId } = await simpleSalon(db, { minLead: 60 * 24 * 365 });

      expect(await availableSlots(db, salonId, [serviceId], MONDAY)).toHaveLength(0);
    });
  });

  it('dzień poza horyzontem nie ma terminów', async () => {
    await withRollback(async (db) => {
      const { salonId, serviceId } = await simpleSalon(db, { horizon: 7 });

      expect(await availableSlots(db, salonId, [serviceId], MONDAY)).toHaveLength(0);
    });
  });

  it('wyłączony salon nie proponuje niczego', async () => {
    await withRollback(async (db) => {
      const { salonId, serviceId } = await simpleSalon(db);
      await db.query('update public.salons set active = false where id = $1', [salonId]);

      expect(await availableSlots(db, salonId, [serviceId], MONDAY)).toHaveLength(0);
    });
  });

  it('usługa z innego salonu nie daje terminów', async () => {
    await withRollback(async (db) => {
      const { salonId } = await simpleSalon(db);
      const otherSalon = await createSalon(db);
      const foreignService = await addService(db, otherSalon, { duration: 60 });

      expect(await availableSlots(db, salonId, [foreignService], MONDAY)).toHaveLength(0);
    });
  });
});

describe('zmiana czasu letniego i zimowego', () => {
  // W Polsce czas zmienia się w nocy z 24 na 25 października 2026.
  const SATURDAY_SUMMER = '2026-10-24';
  const SUNDAY_WINTER = '2026-10-25';

  it('9:00 rano znaczy 9:00 rano po obu stronach zmiany czasu', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db, { horizon: 400 });
      const staffId = await addStaff(db, salonId);
      const serviceId = await addService(db, salonId, { duration: 60 });
      await assignService(db, salonId, staffId, serviceId);

      for (const weekday of [6, 7]) {
        await setSalonHours(db, salonId, weekday, '09:00', '17:00');
        await setWorkingHours(db, salonId, staffId, weekday, '09:00', '17:00');
      }

      const summer = await availableSlots(db, salonId, [serviceId], SATURDAY_SUMMER);
      const winter = await availableSlots(db, salonId, [serviceId], SUNDAY_WINTER);

      // Lokalnie identycznie…
      expect(localTimes(summer)[0]).toBe('09:00');
      expect(localTimes(winter)[0]).toBe('09:00');

      // …ale w czasie uniwersalnym różnica godziny, bo zegarki się cofnęły.
      expect(utcTimes(summer)[0]).toBe('07:00');
      expect(utcTimes(winter)[0]).toBe('08:00');
    });
  });

  it('doba ze zmianą czasu ma komplet terminów', async () => {
    await withRollback(async (db) => {
      const salonId = await createSalon(db, { horizon: 400 });
      const staffId = await addStaff(db, salonId);
      const serviceId = await addService(db, salonId, { duration: 60 });
      await assignService(db, salonId, staffId, serviceId);
      await setSalonHours(db, salonId, 7, '09:00', '17:00');
      await setWorkingHours(db, salonId, staffId, 7, '09:00', '17:00');

      const winter = await availableSlots(db, salonId, [serviceId], SUNDAY_WINTER);

      expect(localTimes(winter)).toHaveLength(29);
      expect(localTimes(winter).at(-1)).toBe('16:00');
    });
  });
});