-- KOLEJKA MAILI DO KLIENTA
--
-- Maile ustawiają się w kolejce w bazie, a nie w aplikacji. Dzięki temu
-- powiadomienie powstaje niezależnie od tego, kto zmienił status: aplikacja
-- barbera, strona rezerwacji czy zadanie cykliczne.
--
-- Wysyłką zajmie się Etap 9 (Resend). Do tego czasu wpisy czekają ze statusem
-- „pending” — nic nie ginie, a po podłączeniu poczty zaległe po prostu wyjdą.

create or replace function public.tg_queue_booking_emails()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_template text;
  v_email text;
begin
  v_template := case
    when tg_op = 'INSERT' and new.status = 'pending_confirmation' then 'booking_confirm_request'
    when tg_op = 'UPDATE' and new.status is distinct from old.status then
      case new.status
        when 'confirmed' then 'booking_confirmed'
        when 'cancelled_by_salon' then 'booking_cancelled_by_salon'
        when 'rescheduled' then null -- mail wysyła nowa wizyta, nie stara
        else null
      end
    else null
  end;

  if v_template is null then
    return new;
  end if;

  select c.email into v_email from public.clients c where c.id = new.client_id;

  if v_email is null then
    return new;
  end if;

  -- Klucz idempotencji: jedna wiadomość na wizytę i rodzaj zdarzenia.
  -- Ponowna zmiana statusu tam i z powrotem nie zasypie klienta mailami.
  insert into public.email_log (salon_id, booking_id, template, recipient, idempotency_key)
  values (new.salon_id, new.id, v_template, v_email, new.id::text || ':' || v_template)
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

create trigger bookings_queue_emails
  after insert or update of status on public.bookings
  for each row execute function public.tg_queue_booking_emails();

comment on function public.tg_queue_booking_emails is
  'Ustawia maile do klienta w kolejce przy zmianie statusu wizyty. Wysyłka: Etap 9.';
