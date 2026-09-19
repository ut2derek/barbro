# Przegląd kodu i naprawa — 18.09.2026

Dokument dla programisty przejmującego projekt. Opisuje, co było źle, dlaczego
to było źle i co zostało zrobione. Każda usterka ma odsyłacz do testu, który
pilnuje, żeby nie wróciła.

## Stan przed i po

| Sprawdzenie | Przed | Po |
|---|---|---|
| `npm run typecheck` | czysto | czysto |
| `npm run lint` | **nie dawał się uruchomić** (brak ESLinta) | **0 błędów, 0 ostrzeżeń** |
| Błędy ESLint po instalacji | 8 błędów, 10 ostrzeżeń | 0 / 0 |
| `npm test` | 130 testów | **145 testów** |
| `as unknown as` w kodzie aplikacji | 12 | 0 |
| `const ZONE = 'Europe/Warsaw'` | 11 plików | 0 |
| Największy pisany ręcznie plik | 703 linie | 417 linii (moduł zapytań) |
| Największy ekran | 703 linie | 280 linii |

---

## A. Usterki widoczne dla użytkownika

### A1. Formularze kasowały wpisane dane

**Gdzie:** ekrany edycji usługi, dodatku, pracownika, klienta i ustawień —
sześć miejsc z tym samym wzorcem.

**Co było:**

```tsx
useEffect(() => {
  if (!existing) return;
  setName(existing.name);   // …i 9 kolejnych setState
}, [existing]);
```

**Dlaczego to błąd:** `existing` pochodzi z zapytania TanStack Query i przy
każdym ponownym pobraniu danych jest **nowym obiektem**. Efekt uruchamiał się
więc po powrocie do aplikacji, po unieważnieniu cache i po odzyskaniu sieci —
i nadpisywał to, co użytkownik właśnie wpisał. Barber zmieniał cenę na 80 zł,
odbierał telefon, wracał — i widział znowu 60 zł, bez żadnego komunikatu.

**Co jest teraz:** ekran ładuje dane, formularz je dostaje jako właściwości
i montuje się raz, z kluczem opartym o identyfikator rekordu:

```tsx
export default function ServiceFormScreen() {
  // …wczytanie danych…
  if (!salon || (!isNew && isPending)) return <Loading />;
  return <ServiceForm key={existing?.id ?? 'new'} existing={existing} … />;
}
```

Stan początkowy bierze się wprost z `useState(existing?.name ?? '')`. Nie ma
efektu, nie ma nadpisywania, a przejście do innego rekordu przemontowuje
formularz przez zmianę klucza. To rozwiązanie zalecane przez React („resetting
state with a key"), a nie obejście.

**Pliki:** `src/app/(app)/services/[id].tsx`, `addons/[id].tsx`, `team/[id].tsx`,
`clients/[id].tsx` (wydzielony `ClientNoteCard`), `settings/index.tsx`.

---

### A2. Widok tygodnia i miesiąca nie odświeżał się po zmianie wizyty

**Co było:** `useChangeBookingStatus`, `useRescheduleBooking` i `useCreateBooking`
unieważniały `['bookings']` i `['booking']`, ale **nie** `['bookings-week']`
(dane widoku tygodnia i miesiąca) ani `['pending-approval-count']` (kropka na
zakładce „Dziś").

Że to przeoczenie, a nie decyzja, dowodził `use-quick-action.ts`, który
obsługiwał `bookings-week` poprawnie. Klucze były rozsypanymi napisami, więc
nie było jak zauważyć braku.

**Co jest teraz:** `src/lib/query-keys.ts` — jedno miejsce z kluczami **oraz**
z listami „co unieważnić po zmianie X":

```ts
export function invalidateBookings(client: QueryClient) {
  invalidateAll(client, [
    prefix.bookingsDay, prefix.bookingsWeek, prefix.booking,
    prefix.pendingApprovalCount, prefix.clientBookings,
    prefix.slots, prefix.publicSlots,
  ]);
}
```

Mutacje wołają `invalidateBookings(queryClient)`, `invalidateServices(…)`,
`invalidateSchedule(…)` i tak dalej. Dodanie nowego widoku wizyt to jedna
linijka w tym pliku, nie polowanie po dwudziestu plikach.

**Sprawdzone ręcznie:** zaakceptowanie wizyty w widoku dnia zmienia jej status
w widoku tygodnia i zmniejsza kropkę na zakładce — bez odświeżania ekranu.

---

### A3. Adres e-mail klienta trafiał do bazy jako wzorzec wyszukiwania

**Co było** (`supabase/functions/public-booking/index.ts`):

```ts
.ilike('email', email)
```

**Dlaczego to poważne:** `ilike` to dopasowanie wzorca, w którym `%` i `_` mają
znaczenie specjalne. Klient wpisujący przy rezerwacji `jan%@gmail.com`
**dopinał swoją wizytę do kartoteki innej osoby** — z jej imieniem, telefonem
i historią wizyt. Wpisanie samego `%` dopasowywało wszystkich klientów salonu
i wywracało funkcję błędem 500.

**Co jest teraz:** porównanie dokładne, a adres wcześniej przechodzi przez
schemat, który sprawdza, czy to w ogóle adres e-mail:

```ts
.eq('email', client.email)
```

W bazie jest unikalny indeks `clients (salon_id, lower(email))`, a schemat
zamienia adres na małe litery — więc `eq` jest i poprawne, i szybsze.

**Testy:** `tests/hardening.test.ts` → „adres e-mail klienta nie jest wzorcem
wyszukiwania" (2 testy).

---

### A4. Wygasły link nie blokował odwołania wizyty

**Co było:** datę ważności `manage_token_expires_at` sprawdzał **tylko** podgląd
wizyty. Potwierdzenie, odwołanie i wystawienie opinii jej nie sprawdzały.
Data ważności linku była dla operacji zmieniających dane martwym zapisem.

To jest przykład problemu, o który chodziło w zleceniu: sprawdzenie zostało
*dopisane w jednym miejscu*, zamiast trafić tam, przez co przechodzą wszystkie
drogi.

**Co jest teraz:** `bookingByToken` zwraca albo wizytę, albo gotową odpowiedź
z odmową — i nie ma sposobu, żeby dostać wizytę bez przejścia przez sprawdzenie:

```ts
export type FoundBooking =
  | { ok: true; booking: Joined }
  | { ok: false; response: Response };
```

Każda operacja zaczyna się identycznie:

```ts
const found = await bookingByToken(body.token);
if (!found.ok) return found.response;
```

**Testy:** `tests/hardening.test.ts` → „wygasły link do wizyty" (3 testy:
potwierdzenie, odwołanie, opinia).

---

### A5. Dzień liczony w UTC zamiast w strefie salonu

**Co było:** `new Date(body.startsAt).toISOString().slice(0, 10)` przy
rezerwacji „u dowolnego fryzjera". Latem, przy przesunięciu +2 h, termin o 00:30
czasu polskiego wypadał „wczoraj" i wolne terminy szukane były dla złego dnia →
klient dostawał „Ten termin nie jest już dostępny".

**Co jest teraz:** `dayInZone(iso, timezone)` w `supabase/functions/_shared/admin.ts`,
liczące dzień przez `Intl.DateTimeFormat` w strefie salonu.

---

### A6. Komponent tworzony w trakcie renderu

`StaffPicker` definiował `Avatar` w swoim wnętrzu. Przy każdym renderze była to
nowa funkcja, więc React traktował ją jak inny komponent i montował od zera:
zdjęcia mrugały, stan przewinięcia się gubił. `Avatar` stoi teraz obok, na
poziomie modułu.

Podobnie `useColorScheme` na webie ustawiał stan w efekcie, żeby wykryć
„nawodnienie" strony — teraz robi to `useSyncExternalStore`, bez dodatkowego
renderu przy każdym wejściu.

---

## B. Architektura

### B1. Strefa czasowa wpisana na sztywno w 11 plikach

`const ZONE = 'Europe/Warsaw'` powtórzone jedenaście razy, mimo że
`salons.timezone` jest w bazie od pierwszej migracji i **baza liczyła
poprawnie**. Sprzedajemy jedną aplikację wielu salonom — pierwszy salon poza
Polską zobaczyłby złe godziny na ekranie.

Teraz jest `useSalonTimezone()` (`src/features/salon/use-salon-timezone.ts`),
czytający strefę z danych salonu. Strona rezerwacji dla klienta bierze ją
z katalogu salonu, bo nie ma zalogowanego użytkownika.

### B2. Klucze zapytań jako luźne napisy

Opisane w A2. Plik `src/lib/query-keys.ts`.

### B3. Zod w zależnościach, zero użyć

`zod` był w `package.json` od początku i **nie był użyty ani razu**. Granica
sieci nie była nigdzie sprawdzana:

- funkcja publiczna przyjmowała dowolny JSON — nikt nie sprawdzał, czy e-mail
  jest e-mailem ani czy imię nie ma 10 000 znaków (stąd też A3),
- aplikacja przyjmowała dowolną odpowiedź przez **12 × `as unknown as`** —
  najsilniejszą formę wyłączenia kontroli typów.

**Co jest teraz:**

- `supabase/functions/public-booking/schemas.ts` — schemat na każdą operację.
  Nieznana operacja, zły token, ocena spoza skali, za długa notatka: wszystko
  odrzucone **zanim** dotknie bazy.
- `src/lib/parse.ts` — `parseRow` / `parseRows` na każdej odpowiedzi z bazy.
  W trakcie pracy nad kodem niezgodność wyrzuca błąd od razu, z nazwą pola;
  na produkcji trafia do Sentry, a dane lecą dalej, żeby drobna różnica nie
  zablokowała barberowi ekranu.

> **Pułapka, na którą warto uważać.** Zod 4 wymaga w `z.uuid()` numeru
> w wersji 4. Nasze identyfikatory (dane testowe, wszystko nadane ręcznie) mają
> wersję zerową i były odrzucane. W `schemas.ts` sprawdzamy więc kształt
> wyrażeniem regularnym, nie `z.uuid()`.

### B4. Trzy kopie siatki terminów

Ręczna wizyta, przełożenie i strona rezerwacji rysowały tę samą siatkę godzin,
każda po swojemu. Jest jeden `src/components/bookings/slot-picker.tsx`,
z podświetleniem wybranej godziny i etykietą dla czytnika ekranu.

### B5. Największe pliki rozbite

**`src/app/rezerwacja/[slug].tsx`: 703 → 48 linii.** Stan i reguły przepływu
poszły do `src/features/public-booking/use-booking-flow.ts`, a każdy krok ma
swój plik w `src/components/public/steps/`. Plik trasy wybiera już tylko, który
krok pokazać.

**`supabase/functions/public-booking/index.ts`: 573 → 78 linii.** Jest
rozdzielnią (limit zapytań → schemat → obsługa), a logika siedzi w `salon.ts`,
`booking.ts`, `visit.ts` i `token.ts`.

**`src/app/(app)/(tabs)/calendar.tsx`: 543 → 280 linii.** Trzy tryby widoku
w jednym drzewie warunków rozeszły się do `src/components/bookings/calendar/`:
`calendar-header.tsx`, `week-list.tsx`, `month-grid.tsx`, `month-picker-sheet.tsx`.
Ekran decyduje, co pokazać i o co zapytać serwer; rysowanie jest obok. Czwarty
tryb widoku to nowy plik, a nie kolejne piętro warunków.

> **Uwaga o typach dat.** Luxon rozróżnia w typach datę poprawną (`DateTime<true>`)
> od niepoprawnej. Metody takie jak `startOf` czy `plus` zwracają typ ogólny,
> więc przy przekazywaniu dat do komponentów potrzebne jest rzutowanie na
> `DateTime<true>`. To nie jest obejście — te daty zawsze pochodzą z `DateTime.now()`.

### B6. Sentry zainicjowany, nigdy nie używany

`Sentry.init` było jedynym wywołaniem w całym projekcie; funkcje brzegowe
robiły `console.error`, którego nikt nie czyta. Produkcyjnie nie dowiedzielibyśmy
się o awarii inaczej niż telefonem od barbera.

- `src/lib/query-client.ts` — `QueryCache` i `MutationCache` zgłaszają **każdy**
  błąd zapytania i zapisu.
- `src/lib/sentry.ts` — `captureError(error, where, extra)` oraz `markExpected`.
- `supabase/functions/_shared/observability.ts` — `reportError` wysyłający
  zgłoszenie do Sentry zwykłym żądaniem HTTP (bez biblioteki, ~80 linii).
  Bez `SENTRY_DSN` zostaje sam log i funkcja działa normalnie.

**Świadoma decyzja:** błędy, które pokazujemy użytkownikowi (zły adres e-mail,
zajęty termin, przekroczony limit) są oznaczane jako spodziewane i **nie idą do
Sentry**. Inaczej każda literówka klienta wyglądałaby tam jak usterka.

### B7. Brak limitu zapytań na funkcji publicznej

CLAUDE.md §7 wymagał go od początku. Bez niego każdy mógł w pętli zakładać
klientów i niepotwierdzone rezerwacje, blokując realne terminy po 20 minut każdy.

Licznik trzymamy **w bazie**, nie w pamięci funkcji — ta sama funkcja brzegowa
działa w wielu kopiach naraz, więc licznik w pamięci policzyłby ułamek zapytań.

- migracja `20260918130000_hardening.sql`: tabela `rate_limits`, funkcja
  `rate_limit_take(bucket, limit, window_seconds)`, sprzątanie przez `pg_cron`,
- `supabase/functions/_shared/rate-limit.ts`: limity per operacja. Przeglądanie
  oferty 120/min, zapis wizyty 5 na 5 minut, opinia 10/min.

**Świadoma decyzja:** gdy licznik jest niedostępny (awaria bazy), **przepuszczamy**.
Rezerwacje nie mają przestać działać z powodu awarii licznika, a prawdziwą
blokadę podwójnej rezerwacji i tak trzyma ograniczenie wykluczające w bazie.

### B8. Funkcje `security definer` bez sprawdzenia salonu

`get_available_slots`, `salon_rating` i `staff_ratings` omijają reguły dostępu
(taka jest natura `security definer`) i nie sprawdzały, czy pytający należy do
salonu. Zalogowany barber salonu A mógł odczytać dostępność i oceny salonu B,
znając jego identyfikator. Priorytet był niski — te dane są i tak publiczne na
stronie rezerwacji — ale zasada musi być zapisana w kodzie, nie w głowie.

```sql
create or replace function public.caller_may_read_salon(p_salon_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select auth.uid() is null
      or public.is_salon_member(p_salon_id)
      or public.is_app_admin();
$$;
```

Rola serwisowa (funkcja brzegowa obsługująca stronę rezerwacji) nie ma
`auth.uid()` i przechodzi — tam dostępu pilnuje sama funkcja brzegowa.

**Testy:** `tests/hardening.test.ts` → „funkcje omijające reguły dostępu…"
(4 testy, w tym potwierdzenie, że strona rezerwacji nadal widzi terminy).

### B9. ESLint nigdy nie był uruchamiany

`npm run lint` istniał w `package.json`, ale ESLint nie był zainstalowany.
Po instalacji: 8 błędów i 10 ostrzeżeń, w tym wszystkie usterki z punktu A1 i A6.
Teraz jest czysto — **warto trzymać ten stan**, bo to najtańsza kontrola
w projekcie.

### B10. Powtórzony kod odesłany do wspólnych miejsc

- `toGrosz` / `fromGrosz` — trzy kopie → `parsePriceToGrosz` i
  `formatGroszForInput` w `src/lib/format.ts`.
- Kwadratowy przycisk ze strzałką — pięć kopii tego samego stylu →
  `src/components/ui/icon-button.tsx`, z wymuszonym opisem dla czytnika ekranu
  (wcześniej część z nich miała tylko znak „‹", czyli dla niewidomego nic).
- CORS i budowanie odpowiedzi — trzy kopie w funkcjach brzegowych →
  `supabase/functions/_shared/http.ts`.
- Klient bazy z uprawnieniami serwisowymi → `supabase/functions/_shared/admin.ts`.

---

## C. Poprawka zrobiona przy okazji testów

Funkcja serwerowa odrzucała zły adres e-mail poprawnie (400), ale aplikacja
pokazywała klientowi surowe *„Edge Function returned a non-2xx status code"*.
Biblioteka Supabase chowa treść odpowiedzi w polu `context`. `callPublicBooking`
czyta ją teraz i rzuca `PublicBookingError` z komunikatem od serwera — klient
widzi „Nieprawidłowy adres e-mail".

---

## D. Czego świadomie nie zmieniano

- **Strona rezerwacji dla klienta nadal mieszka w tym repozytorium**
  (`src/app/rezerwacja`, `src/app/wizyta`, `src/features/public-booking`,
  `src/components/public`). Docelowo to osobne repo, ale rozdzielenie teraz
  utrudniłoby testowanie. Granica jest już wyraźna: te katalogi nie sięgają do
  `features/` aplikacji barbera i rozmawiają wyłącznie z funkcją brzegową.
- **`staff_invitations`** — tabela istnieje, kodu nie ma. Zaproszony dziś
  pracownik nie założy konta. Do zrobienia razem z etapem 9 (poczta).
- **Etapy 8–10 i 13** — push, poczta, Google Calendar i przygotowanie do sklepów
  czekają na konta w usługach zewnętrznych.

---

## E. Uwagi praktyczne

**Funkcje brzegowe nie przeładowują się same.** Po każdej zmianie w
`supabase/functions/` trzeba zrestartować kontener, inaczej testy sprawdzają
starą wersję i można stracić sporo czasu na szukanie nieistniejącego błędu:

```bash
docker restart supabase_edge_runtime_barbro
```

**Limit zapytań w testach.** Testy funkcji publicznej biją w nią dziesiątki razy
z jednego adresu. `tests/helpers/db.ts` udostępnia `resetRateLimits()` —
wołany w `beforeEach` plików, które tego potrzebują. Limitu nie wyłączamy
w środowisku lokalnym, bo wtedy nikt by go nie testował.

**Nowa usterka = nowy test w `tests/hardening.test.ts`.** Każdy opis testu mówi,
na czym polegał błąd. To najtańszy sposób, żeby poprawka się nie cofnęła.
