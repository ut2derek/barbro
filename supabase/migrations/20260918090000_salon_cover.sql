-- Zdjęcie w tle nagłówka strony rezerwacji.
-- Logo salonu jest już w salons.logo_url; okładka to osobna, szersza grafika.

alter table public.salons
  add column cover_url text;

comment on column public.salons.cover_url is
  'Zdjęcie w tle nagłówka strony rezerwacji (szerokie). Logo trzyma logo_url.';