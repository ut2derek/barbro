-- Rozszerzenia i typy wyliczeniowe.
-- btree_gist jest potrzebny do ograniczenia wykluczającego na rezerwacjach
-- (porównanie uuid przez = w tym samym indeksie co zakres czasu przez &&).

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- Rola użytkownika w salonie.
create type public.salon_role as enum ('owner', 'staff');

-- Sposób prezentacji ceny usługi.
create type public.price_type as enum ('fixed', 'from', 'variable');

-- Statusy rezerwacji. Kolejność ma znaczenie tylko porządkowe.
create type public.booking_status as enum (
  'pending_confirmation',  -- klient nie potwierdził maila, slot zablokowany czasowo
  'pending_approval',      -- czeka na akceptację salonu
  'confirmed',             -- potwierdzona
  'completed',             -- zrealizowana
  'cancelled_by_client',
  'cancelled_by_salon',    -- zawsze z komentarzem
  'rescheduled',           -- stary termin po przełożeniu
  'expired',               -- niepotwierdzona w czasie
  'no_show'                -- klient się nie stawił
);

-- Skąd wzięła się rezerwacja.
create type public.booking_source as enum ('web', 'manual', 'app');

-- Rodzaj wyjątku w grafiku.
create type public.schedule_exception_type as enum ('day_off', 'custom_hours');

-- Stan połączenia z kalendarzem Google.
create type public.calendar_connection_status as enum ('connected', 'needs_reauth', 'disconnected');

-- Stan wysyłki maila.
create type public.email_status as enum ('pending', 'sent', 'failed');

-- Stan zaproszenia pracownika.
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

-- Wspólny wyzwalacz utrzymujący updated_at.
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.tg_set_updated_at is
  'Ustawia updated_at przy każdej aktualizacji wiersza.';