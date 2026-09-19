// Usunięcie własnego konta z poziomu aplikacji.
//
// Wymóg App Store: użytkownik musi móc usunąć konto w aplikacji, bez pisania
// do nikogo. Aplikacja nie ma uprawnień do kasowania kont, więc robi to ta
// funkcja, działająca na serwerze z kluczem administracyjnym.
//
// Co się dzieje z danymi:
//   - wpis pracownika i klienta zostaje, ale traci powiązanie z kontem
//     (rezerwacje salonu muszą przetrwać, to dokumentacja jego pracy),
//   - tokeny urządzeń są kasowane — koniec powiadomień,
//   - jeśli to był jedyny właściciel salonu, salon zostaje wyłączony,
//     żeby nie został bez opiekuna,
//   - konto w systemie logowania jest usuwane.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { CORS, json } from '../_shared/http.ts';
import { reportError } from '../_shared/observability.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Dozwolona wyłącznie metoda POST' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Brak autoryzacji' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;

  // Kim jest proszący — sprawdzamy jego własnym tokenem, nie na słowo.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Nieprawidłowa sesja' }, 401);

  const userId = userData.user.id;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // Salony, w których użytkownik jest właścicielem.
    const { data: ownerships, error: membershipError } = await admin
      .from('salon_members')
      .select('salon_id')
      .eq('user_id', userId)
      .eq('role', 'owner');

    if (membershipError) throw membershipError;

    for (const { salon_id } of ownerships ?? []) {
      const { count, error: countError } = await admin
        .from('salon_members')
        .select('id', { count: 'exact', head: true })
        .eq('salon_id', salon_id)
        .eq('role', 'owner');

      if (countError) throw countError;

      // Salon bez właściciela zostaje wyłączony, a nie osierocony.
      if ((count ?? 0) <= 1) {
        const { error } = await admin.from('salons').update({ active: false }).eq('id', salon_id);
        if (error) throw error;
      }
    }

    // Odłączenie danych od konta — historia salonu zostaje nienaruszona.
    const detachStaff = await admin.from('staff').update({ user_id: null }).eq('user_id', userId);
    if (detachStaff.error) throw detachStaff.error;

    const detachClients = await admin.from('clients').update({ user_id: null }).eq('user_id', userId);
    if (detachClients.error) throw detachClients.error;

    const removeTokens = await admin.from('push_tokens').delete().eq('user_id', userId);
    if (removeTokens.error) throw removeTokens.error;

    const removeMemberships = await admin.from('salon_members').delete().eq('user_id', userId);
    if (removeMemberships.error) throw removeMemberships.error;

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw deleteError;

    return json({ ok: true });
  } catch (error) {
    reportError(error, 'usuwanie konta', { userId });
    return json({ error: 'Nie udało się usunąć konta' }, 500);
  }
});
