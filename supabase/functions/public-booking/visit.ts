// CO KLIENT MOŻE ZROBIĆ ZE SWOJĄ WIZYTĄ Z POZIOMU LINKU
//
// Podgląd, potwierdzenie adresu e-mail, odwołanie, wystawienie opinii.
// Każda z tych operacji zaczyna się od `bookingByToken`, które sprawdza
// zarówno poprawność, jak i ważność linku.

import { admin } from '../_shared/admin.ts';
import { json } from '../_shared/http.ts';
import type { RequestOf } from './schemas.ts';
import { bookingByToken, describe } from './token.ts';

export async function readBooking(body: RequestOf<'booking'>): Promise<Response> {
  const found = await bookingByToken(body.token);
  if (!found.ok) return found.response;

  return json({ booking: describe(found.booking) });
}

/** Klient potwierdza, że adres e-mail należy do niego — i że przyjdzie. */
export async function confirmBooking(body: RequestOf<'confirm'>): Promise<Response> {
  const found = await bookingByToken(body.token);
  if (!found.ok) return found.response;

  const booking = found.booking;

  if (booking.status !== 'pending_confirmation') {
    // Drugie kliknięcie w ten sam link nie może niczego zepsuć.
    return json({ booking: describe(booking), alreadyHandled: true });
  }

  const nextStatus = booking.salons.auto_accept ? 'confirmed' : 'pending_approval';

  const { error } = await admin.rpc('change_booking_status', {
    p_booking_id: booking.id,
    p_status: nextStatus,
  });
  if (error) throw error;

  return await readBooking(body);
}

export async function cancelBooking(body: RequestOf<'cancel'>): Promise<Response> {
  const found = await bookingByToken(body.token);
  if (!found.ok) return found.response;

  if (!describe(found.booking).canCancel) {
    return json({ error: 'Tej wizyty nie można już odwołać przez internet' }, 409);
  }

  const { error } = await admin.rpc('change_booking_status', {
    p_booking_id: found.booking.id,
    p_status: 'cancelled_by_client',
  });
  if (error) throw error;

  return await readBooking(body);
}

/** Czy z tego linku można ocenić wizytę i czy ocena już istnieje. */
export async function reviewState(body: RequestOf<'reviewState'>): Promise<Response> {
  const found = await bookingByToken(body.token);
  if (!found.ok) return found.response;

  const { data: existing, error } = await admin
    .from('booking_reviews')
    .select('id, rating, comment, salon_reply')
    .eq('booking_id', found.booking.id)
    .maybeSingle();

  if (error) throw error;

  return json({
    canReview: found.booking.status === 'completed' && !existing,
    review: existing
      ? { rating: existing.rating, comment: existing.comment, salonReply: existing.salon_reply }
      : null,
  });
}

export async function submitReview(body: RequestOf<'submitReview'>): Promise<Response> {
  const found = await bookingByToken(body.token);
  if (!found.ok) return found.response;

  // Zakres oceny sprawdził schemat. Resztę sprawdza baza: wizyta musi być
  // zrealizowana, a opinia może być tylko jedna.
  const { error } = await admin.from('booking_reviews').insert({
    salon_id: found.booking.salon_id,
    booking_id: found.booking.id,
    rating: body.rating,
    comment: body.comment || null,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') return json({ error: 'Ta wizyta ma już opinię' }, 409);
    if (code === 'P0011') {
      return json({ error: 'Opinię można wystawić dopiero po wizycie' }, 409);
    }
    throw error;
  }

  return json({ ok: true });
}
