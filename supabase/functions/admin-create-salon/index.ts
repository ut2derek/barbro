// Zakładanie nowego salonu wraz z kontem właściciela.
//
// Nie ma samoobsługowej rejestracji firm — salony zakłada administrator
// platformy. Ta funkcja robi to w jednym kroku: tworzy salon, konto właściciela,
// jego wpis w zespole i przypisanie roli.
//
// Hasło tymczasowe wraca w odpowiedzi jeden raz. Gdy podłączymy pocztę,
// zastąpi je link do ustawienia własnego hasła.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 16);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Dozwolona wyłącznie metoda POST' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Brak autoryzacji' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Nieprawidłowa sesja' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Uprawnienia sprawdzamy w bazie, nie na podstawie tego, co przysłał klient.
  const { data: isAdmin, error: adminError } = await asUser.rpc('is_app_admin');
  if (adminError || isAdmin !== true) {
    return json({ error: 'Tylko administrator platformy' }, 403);
  }

  let payload: { salonName?: string; ownerEmail?: string; ownerName?: string; city?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Nieprawidłowe dane' }, 400);
  }

  const salonName = payload.salonName?.trim();
  const ownerEmail = payload.ownerEmail?.trim().toLowerCase();
  const ownerName = payload.ownerName?.trim() || 'Właściciel';

  if (!salonName || !ownerEmail) {
    return json({ error: 'Podaj nazwę salonu i adres e-mail właściciela' }, 400);
  }

  const slug = `${slugify(salonName)}-${crypto.randomUUID().slice(0, 6)}`;

  try {
    const { data: salon, error: salonError } = await admin
      .from('salons')
      .insert({ name: salonName, slug, city: payload.city?.trim() || null })
      .select('id')
      .single();
    if (salonError) throw salonError;

    // Konto mogło już istnieć — właściciel może prowadzić dwa salony.
    const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 });
    let ownerId = existing?.users.find((user) => user.email === ownerEmail)?.id;
    let temporaryPassword: string | null = null;

    if (!ownerId) {
      temporaryPassword = randomPassword();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: ownerEmail,
        password: temporaryPassword,
        email_confirm: true,
      });
      if (createError) throw createError;
      ownerId = created.user!.id;
    }

    const { error: memberError } = await admin
      .from('salon_members')
      .insert({ salon_id: salon.id, user_id: ownerId, role: 'owner' });
    if (memberError) throw memberError;

    const { error: staffError } = await admin
      .from('staff')
      .insert({ salon_id: salon.id, user_id: ownerId, display_name: ownerName, sort_order: 1 });
    if (staffError) throw staffError;

    return json({ salonId: salon.id, slug, ownerId, temporaryPassword });
  } catch (error) {
    console.error('Zakładanie salonu nie powiodło się', error);
    return json({ error: 'Nie udało się założyć salonu' }, 500);
  }
});
