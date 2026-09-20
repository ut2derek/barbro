-- ---------------------------------------------------------------------------
-- Tytuł fryzjera
--
-- „Master”, „Barber”, „Praktykant” — stopień, który salon nadaje sam. Klient
-- widzi go przy wyborze fryzjera i wie, czego się spodziewać; zespół widzi go
-- na liście pracowników.
--
-- Zwykły tekst, nie lista wartości: każdy salon nazywa to po swojemu
-- („Senior Barber”, „Stylista”), a wymuszanie naszego słownika kazałoby im
-- prosić nas o zmianę przy każdym nowym stopniu.
-- ---------------------------------------------------------------------------

alter table public.staff
  add column if not exists title text
    check (title is null or length(trim(title)) between 1 and 40);

comment on column public.staff.title is
  'Stopień nadawany przez salon: Master, Barber, Praktykant.';
