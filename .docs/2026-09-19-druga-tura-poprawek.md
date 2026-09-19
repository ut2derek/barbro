# Druga tura poprawek — 19.09.2026

Ciąg dalszy [przeglądu z 18.09](2026-09-18-przeglad-kodu.md). Ten dokument
istnieje z jednego powodu: **część poprawek opisanych w tamtym dokumencie nie
była w kodzie.** Stan repozytorium został odtworzony z zapisów sesji
(commit `699c585e`), a przy odtwarzaniu zgubiły się całe kawałki — w tym
komponenty, które zostały w repozytorium, ale których nikt już nie importował.

Morał na przyszłość: opis w dokumencie nie jest dowodem, że kod działa.
Dowodem jest test albo uruchomiony ekran.

## Stan przed i po

| Sprawdzenie | Przed | Po |
|---|---|---|
| `npm run typecheck` | czysto | czysto |
| `npm run lint` | **4 błędy, 3 ostrzeżenia** | **0 / 0** |
| `npm test` | **2 testy nie przechodziły** (117) | **117 przechodzi** |
| Drugie uruchomienie testów pod rząd | zostawiało śmieci w bazie | baza wraca do stanu z `seed.sql` |
| `const ZONE = 'Europe/Warsaw'` | 8 plików | 0 |
| `as unknown as` w kodzie aplikacji | 4 | 0 |
| Klucze zapytań jako luźne napisy | 7 plików | 0 |
| Największy plik ekranu | 451 linii | 47 linii |

---

## A. Strona rezerwacji dla klienta była martwym kodem

Największa rzecz w tej turze.

`src/features/public-booking/use-booking-flow.ts`, wszystkie pliki
z `src/components/public/steps/`, `addons-sheet.tsx`, `day-strip.tsx`,
`staff-picker.tsx` i `slot-picker.tsx` **leżały w repozytorium, ale nie
importował ich żaden plik.** Trasa `src/app/rezerwacja/[slug].tsx` była starą
wersją na 451 linii, sprzed rozbicia na kroki.

Co to znaczyło w praktyce:

- **klient nie mógł dobrać dodatku** — „Mycie" i „Tuszowanie siwizny" są
  w bazie, w funkcji brzegowej i w gotowym arkuszu wyboru, ale nie było ekranu,
  z którego dałoby się je otworzyć,
- **klient nie widział opinii** salonu, mimo że funkcja `reviews` je zwracała,
- **nie działał podział na kroki** (usługi → termin → dane), pasek dni ani
  pasek podsumowania,
- poprawki opisane w 18.09 jako A6 (mrugające zdjęcia fryzjerów) i B4 (jedna
  siatka terminów) dotyczyły plików, których nikt nie uruchamiał.

Trasa jest teraz tym, czym miała być — wybiera krok i nic więcej:

```tsx
if (flow.confirmed) return <ConfirmedScreen flow={flow} />;
if (flow.step === 'term') return <TermScreen flow={flow} />;
if (flow.step === 'data') return <DataScreen flow={flow} />;
return <ServicesScreen flow={flow} />;
```

**Sprawdzone w przeglądarce:** wybór usługi otwiera arkusz dodatków, „Mycie"
podnosi wizytę z 45 na 55 minut i z 60 na 70 zł, terminy przeliczają się
o dłuższy czas, a sekcja opinii pokazuje się pod listą usług.

### Dwie kopie siatki terminów wróciły

Ręczna wizyta i przełożenie terminu znowu rysowały własną siatkę godzin —
bez odznaczenia wybranej godziny i bez etykiety dla czytnika ekranu, które ma
wspólny `SlotPicker`. Oba ekrany używają teraz komponentu.

---

## B. Strefa czasowa znowu wpisana na sztywno

`const ZONE = 'Europe/Warsaw'` wróciło do ośmiu ekranów, mimo że
`useSalonTimezone()` cały czas istniał i był używany w trzech innych. Pierwszy
salon poza Polską widziałby na tych ekranach złe godziny.

Przy okazji: hook obiecywał w komentarzu, że **do czasu wczytania salonu
zwraca strefę urządzenia**, a zwracał wpisaną na stałe Warszawę. Teraz robi
to, co opisuje.

---

## C. Komunikat błędu od serwera znowu ginął

Poprawka z punktu C przeglądu 18.09 nie przetrwała. `callPublicBooking` rzucał
surowy błąd biblioteki, więc klient, który pomylił się w adresie e-mail,
widział *„Edge Function returned a non-2xx status code"*.

Treść odpowiedzi serwera Supabase chowa w polu `context`. Odczytujemy ją i
rzucamy `PublicBookingError` z komunikatem po polsku.

**Sprawdzone w przeglądarce:** przy adresie `to-nie-jest-mail` formularz
pokazuje „Nieprawidłowy adres e-mail".

### Błędy spodziewane nie idą już do Sentry

Przegląd 18.09 opisywał `markExpected` w `src/lib/sentry.ts` — tej funkcji
w kodzie nie było, więc każda literówka klienta trafiłaby do Sentry jak
awaria. `markExpected` / `isExpected` są z powrotem, a `captureError`
milczy na błędach oznaczonych jako spodziewane. `PublicBookingError`
oznacza się sam.

---

## D. Unieważnianie cache — te same dziury, inne miejsca

`query-keys.ts` istniał i miał komplet list „co odświeżyć po zmianie X", ale
**siedem plików go omijało** i trzymało własne listy. Każda była niepełna
dokładnie tak, jak opisuje punkt A2 przeglądu:

| Plik | Czego brakowało | Co widział użytkownik |
|---|---|---|
| `settings/queries.ts` | `public-slots`, `public-catalog` | zmiana siatki slotów albo wyłączenie rezerwacji online nie docierało do strony klienta |
| `schedule/queries.ts` | `public-slots` | po zmianie grafiku strona klienta nadal proponowała stare godziny |
| `team/queries.ts` | `public-catalog`, `public-slots` | nowy fryzjer nie pojawiał się na stronie rezerwacji |
| `reviews/queries.ts` | `salon-rating`, `public-catalog` | po odpowiedzi na opinię średnia ocen zostawała stara |
| `use-quick-action.ts` | `booking`, `pending-approval-count`, `slots` | cofnięcie szybkiej akcji zostawiało nieaktualną kropkę na zakładce „Dziś" |

Wszystkie wołają teraz `invalidateSalonSettings`, `invalidateSchedule`,
`invalidateTeam`, `invalidateReviews`, `invalidateBookings`. Żaden klucz
zapytania nie jest już napisem wpisanym w miejscu użycia — sprawdza to:

```bash
grep -rn "queryKey: \[" src | grep -v "queryKeys\.\|bookingListPrefixes"
```

---

## E. Cztery `as unknown as` w kodzie aplikacji

Dołączone tabele (`staff ( display_name )`, `clients ( … )`,
`service_categories ( … )`) znowu były przepuszczane przez rzutowanie, które
wyłącza sprawdzanie typów. Opisane schematami Zod i przepuszczone przez
`parseRows`, tak jak `bookings/queries.ts` — czyli grafik, usługi i opinie
sprawdzają teraz kształt odpowiedzi naprawdę.

Zostało jedno rzutowanie, świadomie: `supabase/functions/public-booking/token.ts`.
To zapytanie z kluczem serwisowym do własnej bazy, po kolumnach wypisanych
o dwie linie wyżej — schemat opisywałby tam sam siebie.

---

## F. Funkcje brzegowe poza `public-booking`

`delete-account` i `admin-create-salon` miały **własne kopie nagłówków CORS**
(trzecia i czwarta w projekcie) i kończyły obsługę błędu na `console.error`.

`console.error` w funkcji brzegowej nie dociera nigdzie, gdzie ktoś zagląda.
Nieudane **usunięcie konta** jest wymogiem App Store i użytkownik zobaczy
tylko „Nie udało się usunąć konta" — nikomu tego nie zgłosi. Obie funkcje
używają teraz `CORS`/`json` z `_shared/http.ts` i `reportError`.

---

## G. Testy

### Dwa testy nie przechodziły

Oba z tego samego powodu: **opierały się na danych testowych, które zmieniają
się w ciągu dnia.**

1. „nie da się wystawić opinii do wizyty, która się nie odbyła" szukał wizyty
   ze statusem `confirmed`. Dane testowe mają jedną taką, dzisiaj o 10:00 —
   a po tej godzinie zamyka ją zadanie cykliczne `mark_past_bookings_completed`.
   Test przechodził rano i nie przechodził po południu. Teraz zakłada sobie
   wizytę w transakcji, która i tak się wycofa.

2. „klient ocenia wizytę swoim linkiem" doklejał stały token do „pierwszej
   wizyty z brzegu" i nie sprzątał po sobie. Przy kolejnym uruchomieniu
   `limit 1` wskazywało inną wizytę, a skrót tokenu jest unikalny — test
   wywalał się na `duplicate key`, czyli na czymś, co nie miało z nim nic
   wspólnego. Teraz wskazuje konkretną wizytę (`BOOKINGS.completed`) i zdejmuje
   link w `afterEach`.

Wszystkie testy w tym pliku sięgają po `BOOKINGS.completed` zamiast
`where status = '…' limit 1`.

### Testy zaśmiecały bazę deweloperską

`tests/hardening.test.ts` zakładał prawdziwych klientów i wizyty przez funkcję
brzegową (inaczej się nie da — to test HTTP), ale kasował tylko część z nich.
Po kilkunastu uruchomieniach w bazie leżało **19 klientów zamiast 4 i 20 wizyt
zamiast 5**, a zajęte terminy zaczynały psuć inne testy. Doszło sprzątanie
w `afterAll`; po dwóch uruchomieniach pod rząd baza wraca do stanu z `seed.sql`.

### `warsawTime()` liczył dzień w UTC

Pomocnik testowy składał datę z `toISOString()`, czyli w czasie UTC — ten sam
błąd, który przegląd 18.09 opisuje jako A5. Testy uruchomione między północą
a drugą w nocy celowałyby w dobę wcześniej. Data składa się teraz z części
lokalnych.

---

## H. ESLint znowu nie był czysty

Cztery błędy i trzy ostrzeżenia. Błędy brały się stąd, że ESLint próbował
rozwiązać importy Deno (`jsr:@supabase/supabase-js@2`, `npm:zod@^4.6.5`)
w `node_modules` — i nigdy nie mógł ich tam znaleźć. To nie usterka kodu,
tylko brak reguły w konfiguracji:

```js
{
  files: ["supabase/functions/**/*.ts"],
  rules: { "import/no-unresolved": "off" },
}
```

Przy okazji zniknął martwy `eslint-disable` w rozdzielni funkcji rezerwacji.
Stał tam po to, żeby przepuścić `Record<Action, (body: any) => …>` — a że
wszystkie obsługi i tak są otypowane przez `RequestOf<…>`, mapa dostała
prawdziwy typ i `any` nie jest już potrzebne:

```ts
type Handlers = { [A in Action]: (body: RequestOf<A>) => Promise<Response> };
```

---

## I. Nazwa lokalnego środowiska

`supabase/config.toml` nie miał `project_id`, więc Supabase CLI brał nazwę
katalogu — kontenery nazywały się `supabase_db_BARBRO_-_APP_-_FINAL`. U kogoś,
kto sklonuje repozytorium pod inną nazwą, nazywałyby się jeszcze inaczej,
a polecenie z CLAUDE.md (`docker restart supabase_edge_runtime_barbro`) nie
zadziałałoby u nikogo.

`project_id = "barbro"` jest w konfiguracji. **Wymaga to jednorazowego
przestawienia lokalnego środowiska**, bo kontenery zakładane są pod starą
nazwą:

```bash
supabase stop && npm run db:start && npm run db:reset
```

Stare kontenery (`*_BARBRO_-_APP_-_FINAL`) trzeba wtedy usunąć ręcznie
w Dockerze — CLI nie wie już o ich istnieniu.

---

## J. Czego nie zmieniano

- **`src/features/setup/check-connection.ts`** — pozostałość po Etapie 0,
  niczym nieimportowana. Nic nie psuje; zostawiona do decyzji.
- **`staff_invitations`** — bez zmian, tak jak w 18.09: tabela jest, kodu nie
  ma. Do zrobienia razem z etapem 9 (poczta).
- **Etapy 8–10 i 13** — push, poczta, Google Calendar i przygotowanie do
  sklepów czekają na konta w usługach zewnętrznych.

---

## K. Jak sprawdzić, że to nie rozjedzie się znowu

Trzy polecenia, wszystkie muszą być czyste:

```bash
npm run typecheck && npm run lint && npm test
```

Czwarte sprawdzenie, którego żadne z nich nie zrobi za nas: **plik może być
poprawny i nieużywany.** Zanim uznasz refaktor za zrobiony, sprawdź, czy ktoś
importuje to, co powstało:

```bash
grep -rn "use-booking-flow\|public/steps\|slot-picker" src
```
