# Barbro — aplikacja dla barbera

Aplikacja natywna (iOS + Android) dla barbershopów i salonów fryzjerskich
oraz wspólny backend w Supabase. Strona rezerwacji dla klientów powstaje
w osobnym repozytorium na tej samej bazie.

Opis produktu, model danych, reguły biznesowe i plan etapów: **[CLAUDE.md](CLAUDE.md)**.

## Wymagania

- Node 20+
- Docker Desktop (tylko do lokalnej bazy i testów)
- aplikacja **Expo Go** na telefonie (do podglądu)

## Start

```bash
npm install
cp .env.example .env.local   # uzupełnij danymi z Supabase
npm start
```

Zeskanuj kod QR aplikacją Expo Go (Android) lub Aparatem (iOS).

## Komendy

| Komenda | Co robi |
|---|---|
| `npm start` | uruchamia aplikację w trybie deweloperskim |
| `npm run ios` / `npm run android` | uruchamia w symulatorze |
| `npm run typecheck` | sprawdza typy |
| `npm run lint` | sprawdza styl kodu |
| `npm test` | testy reguł i ograniczeń w bazie (wymaga działającej bazy) |
| `npm run db:start` | lokalna baza Supabase (wymaga Dockera) |
| `npm run db:stop` | zatrzymuje lokalną bazę |
| `npm run db:reset` | wgrywa migracje i dane testowe od zera |

## Struktura

```
src/app/          ekrany (expo-router)
src/components/   komponenty wspólne
src/theme/        tokeny wyglądu — jedyne miejsce z kolorami i odstępami
src/lib/          Supabase, TanStack Query, Sentry, zmienne środowiskowe
src/features/     logika pogrupowana funkcjonalnie
src/i18n/         teksty interfejsu
supabase/         migracje, funkcje serwerowe, dane testowe
```

## Konfiguracja

Sekrety nigdy nie trafiają do repozytorium. Wszystko przez `.env.local`
(wzór w `.env.example`).

## Lokalna baza

`npm run db:start` stawia komplet: Postgres, API, Auth i podgląd danych.

| Co | Adres |
|---|---|
| Podgląd danych (Studio) | http://127.0.0.1:54323 |
| API | http://127.0.0.1:54321 |
| Skrzynka na maile testowe | http://127.0.0.1:54324 |

Konta testowe (hasło `haslo123`): `wlasciciel@barbro.test`, `pracownik@barbro.test`,
`admin@barbro.test`, `obcy@barbro.test`. Pełny opis danych testowych:
[supabase/seed.sql](supabase/seed.sql).

Telefon łączy się z bazą po adresie IP komputera — jeśli zmienisz sieć Wi-Fi,
zaktualizuj `EXPO_PUBLIC_SUPABASE_URL` w `.env.local`.
