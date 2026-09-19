// STRONA REZERWACJI DLA KLIENTA — WARSTWA SERWEROWA
//
// Klient nie ma konta i nie dotyka bazy bezpośrednio. Wszystko idzie przez tę
// funkcję, która sama pilnuje, że salon jest włączony i przyjmuje rezerwacje.
//
// Terminy i zapis wizyty liczą te same funkcje w bazie, z których korzysta
// aplikacja barbera — dlatego obie strony nie mogą pokazać różnych rzeczy.
//
// Docelowo tę samą funkcję wywoła osobna strona rezerwacji; tutaj służy też
// podglądowi w aplikacji.
//
// Ten plik jest wyłącznie rozdzielnią: sprawdza limit zapytań, sprawdza
// kształt danych i przekazuje je dalej. Logika siedzi w plikach obok:
//   salon.ts    — oferta salonu, wolne terminy, opinie publiczne
//   booking.ts  — zapis nowej wizyty
//   visit.ts    — obsługa wizyty z linku (podgląd, potwierdzenie, odwołanie)
//   token.ts    — token z linku i jego ważność
//   schemas.ts  — co wolno przysłać

import { admin } from '../_shared/admin.ts';
import { CORS, clientIp, json } from '../_shared/http.ts';
import { reportError } from '../_shared/observability.ts';
import { withinLimit } from '../_shared/rate-limit.ts';
import { book } from './booking.ts';
import { catalog, reviews, slots } from './salon.ts';
import { ACTIONS, type Action, firstIssue, requestSchemas } from './schemas.ts';
import { cancelBooking, confirmBooking, readBooking, reviewState, submitReview } from './visit.ts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const handlers: Record<Action, (body: any) => Promise<Response>> = {
  catalog,
  slots,
  book,
  booking: readBooking,
  confirm: confirmBooking,
  cancel: cancelBooking,
  reviews,
  reviewState,
  submitReview,
};

function isAction(value: unknown): value is Action {
  return typeof value === 'string' && (ACTIONS as string[]).includes(value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Dozwolona wyłącznie metoda POST' }, 405);

  let action: Action | 'nieznana' = 'nieznana';

  try {
    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object' || !isAction((raw as { action?: unknown }).action)) {
      return json({ error: 'Nieznana operacja' }, 400);
    }

    action = (raw as { action: Action }).action;

    // Ochrona przed botami. Bez tego dało się w pętli zakładać klientów
    // i niepotwierdzone rezerwacje, blokując realne terminy.
    if (!(await withinLimit(admin, action, clientIp(req)))) {
      return json({ error: 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.' }, 429, {
        'Retry-After': '60',
      });
    }

    const parsed = requestSchemas[action].safeParse(raw);
    if (!parsed.success) {
      return json({ error: firstIssue(parsed.error) }, 400);
    }

    return await handlers[action](parsed.data);
  } catch (error) {
    reportError(error, 'strona rezerwacji', { action });
    return json({ error: 'Coś poszło nie tak. Spróbuj ponownie.' }, 500);
  }
});
