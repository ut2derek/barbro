// ZAPIS WIZYTY Z INTERNETU
//
// Termin i cenę liczy baza — ta sama funkcja, z której korzysta aplikacja
// barbera. Tutaj tylko rozpoznajemy klienta, wybieramy fryzjera i wołamy bazę.

import { admin, dayInZone } from '../_shared/admin.ts';
import { isLocalEnvironment, json } from '../_shared/http.ts';
import { SALON_NOT_FOUND, openSalon } from './salon.ts';
import type { RequestOf } from './schemas.ts';
import { hashToken, newToken } from './token.ts';

/** Ile czasu po terminie wizyty link do zarządzania nią pozostaje ważny. */
const MANAGE_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

export async function book(body: RequestOf<'book'>): Promise<Response> {
  const salon = await openSalon(body.slug);
  if (!salon) return SALON_NOT_FOUND();
  if (!salon.online_booking_enabled) {
    return json({ error: 'Ten salon nie przyjmuje w tej chwili rezerwacji online' }, 409);
  }

  // Kształt i długości pól sprawdził już schemat na wejściu funkcji.
  const { firstName, lastName, email, phone } = body.client;

  const addons = (body.addons ?? []).filter((addon) => addon.quantity > 0);
  const extraMinutes = await addonMinutes(salon.id, addons);

  const staffId = body.staffId ?? (await pickStaff(salon, body, extraMinutes));
  if (!staffId) return json({ error: 'Ten termin nie jest już dostępny' }, 409);

  const clientId = await findOrCreateClient(salon.id, { firstName, lastName, email, phone });
  if (clientId === 'blocked') {
    return json({ error: 'Rezerwacja online jest niedostępna. Skontaktuj się z salonem.' }, 403);
  }

  const { data: bookingId, error: bookingError } = await admin.rpc('create_booking', {
    p_salon_id: salon.id,
    p_staff_id: staffId,
    p_client_id: clientId,
    p_service_ids: body.serviceIds,
    p_starts_at: body.startsAt,
    p_source: 'web',
    p_client_note: body.note || undefined,
    p_addons: addons.length > 0 ? addons : undefined,
  });

  if (bookingError) {
    // Ktoś zajął termin w międzyczasie — baza nie pozwoli nałożyć wizyt.
    const code = (bookingError as { code?: string }).code;
    if (code === '23P01' || code === 'P0004') {
      return json({ error: 'Ten termin właśnie się zajął. Wybierz inny.' }, 409);
    }
    throw bookingError;
  }

  // Link do wizyty: potwierdzenie teraz, zarządzanie aż do terminu.
  const token = newToken();
  const { data: booking, error: readError } = await admin
    .from('bookings')
    .update({
      manage_token_hash: await hashToken(token),
      manage_token_expires_at: new Date(
        new Date(body.startsAt).getTime() + MANAGE_TOKEN_LIFETIME_MS,
      ).toISOString(),
    })
    .eq('id', bookingId as string)
    .select('id, starts_at, ends_at, status, total_price_grosz, staff ( display_name )')
    .single();
  if (readError) throw readError;

  return json({
    booking: {
      id: booking.id,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      status: booking.status,
      totalPriceGrosz: booking.total_price_grosz,
      staffName: (booking.staff as { display_name: string } | null)?.display_name ?? '',
    },
    // Trafi do maila potwierdzającego (Etap 9).
    confirmationPath: `/wizyta/${token}`,
    devConfirmationPath: isLocalEnvironment() ? `/wizyta/${token}` : undefined,
  });
}

/** Dodatki wydłużają wizytę — czas bierzemy z bazy, nie z tego, co przysłano. */
async function addonMinutes(
  salonId: string,
  addons: { id: string; quantity: number }[],
): Promise<number> {
  if (addons.length === 0) return 0;

  const { data, error } = await admin
    .from('service_addons')
    .select('id, duration_minutes')
    .eq('salon_id', salonId)
    .eq('active', true)
    .in(
      'id',
      addons.map((addon) => addon.id),
    );
  if (error) throw error;

  return addons.reduce((sum, chosen) => {
    const row = data.find((addon) => addon.id === chosen.id);
    return sum + (row ? row.duration_minutes * chosen.quantity : 0);
  }, 0);
}

/**
 * Rezerwacja „u dowolnego": bierzemy pierwszego fryzjera, który ma ten termin
 * naprawdę wolny. Dzień liczymy w strefie salonu — w UTC termin tuż po północy
 * wypadałby dnia poprzedniego i nie znaleźlibyśmy go wśród wolnych.
 */
async function pickStaff(
  salon: { id: string; timezone: string },
  body: RequestOf<'book'>,
  extraMinutes: number,
): Promise<string | null> {
  const day = dayInZone(body.startsAt, salon.timezone);

  const { data, error } = await admin.rpc('get_available_slots', {
    p_salon_id: salon.id,
    p_service_ids: body.serviceIds,
    p_from: day,
    p_to: day,
    p_extra_minutes: extraMinutes,
  });
  if (error) throw error;

  const wanted = new Date(body.startsAt).getTime();
  const match = (data ?? []).find(
    (slot: { slot_start: string; staff_id: string }) =>
      new Date(slot.slot_start).getTime() === wanted,
  );

  return match?.staff_id ?? null;
}

/**
 * Klienta rozpoznajemy po adresie e-mail w obrębie salonu.
 *
 * Porównanie musi być dokładne (`eq`). Wcześniej używaliśmy `ilike`, czyli
 * dopasowania wzorca — klient, który wpisał adres ze znakiem `%`, dopinał
 * swoją wizytę do kartoteki zupełnie innej osoby. W bazie jest unikalny
 * indeks na `(salon_id, lower(email))`, a adres jest już zamieniony na małe
 * litery przez schemat, więc `eq` jest i poprawne, i szybsze.
 */
async function findOrCreateClient(
  salonId: string,
  client: { firstName: string; lastName?: string; email: string; phone: string },
): Promise<string | 'blocked'> {
  const { data: existing, error: lookupError } = await admin
    .from('clients')
    .select('id, blocked')
    .eq('salon_id', salonId)
    .eq('email', client.email)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.blocked) return 'blocked';
  if (existing) return existing.id;

  const { data: created, error: createError } = await admin
    .from('clients')
    .insert({
      salon_id: salonId,
      first_name: client.firstName,
      last_name: client.lastName || null,
      email: client.email,
      phone: client.phone,
    })
    .select('id')
    .single();
  if (createError) throw createError;

  return created.id;
}
