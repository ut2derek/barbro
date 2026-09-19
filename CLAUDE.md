# CLAUDE.md — system rezerwacji dla barbershopów i salonów fryzjerskich

Dokument roboczy projektu. Opisuje produkt, model danych, reguły biznesowe,
zasady bezpieczeństwa i plan etapów. Jest źródłem prawdy — jeśli kod i ten
dokument się rozjadą, poprawiamy jedno albo drugie świadomie, nie po cichu.

---

## 1. Produkt

SaaS sprzedawany wielu salonom. Jedna baza, jedna aplikacja, izolacja danych
przez `salon_id` i reguły dostępu w bazie (RLS).

Dwie części produktu:

1. **Aplikacja natywna dla barbera** (iOS + Android) — kalendarz, rezerwacje,
   usługi, grafik, powiadomienia push. **Budujemy w tym repozytorium.**
2. **Strona rezerwacji dla klienta** (web, mobile first) — osadzana jako modal
   na stronie salonu albo pod własnym linkiem. **Osobne repozytorium, ta sama
   baza.**

**Konsekwencja architektoniczna (nienegocjowalna):** cała logika dostępności
i reguły biznesowe żyją po stronie serwera — jako funkcje w Postgresie albo
Edge Functions. Aplikacja mobilna i strona rezerwacji tylko je wywołują.
Żadnej logiki liczenia slotów w kodzie klienckim, w żadnej z dwóch aplikacji.

### Marka i publikacja

Jedna aplikacja pod własną marką produktu w App Store i Google Play. Barber po
zalogowaniu widzi logo i kolor swojego salonu. Strona rezerwacji dla klientów
końcowych ma branding salonu.

- Nazwa produktu: **Barbro**
- Identyfikator aplikacji: `pl.barbro.app` —
  po publikacji nie da się go zmienić
- Domena: **do ustalenia** — potrzebna do maili (Resend), linków głębokich
  i polityki prywatności

---

## 2. Stack

| Warstwa | Wybór | Uwagi |
|---|---|---|
| Aplikacja | Expo (React Native) + TypeScript, expo-router | EAS Build, EAS Update |
| Backend i baza | Supabase: Postgres, Auth, RLS, Edge Functions, Realtime, pg_cron | dwa projekty: dev i prod |
| Dane w aplikacji | TanStack Query + klient Supabase | cache, ponawianie, odświeżanie |
| Walidacja | Zod | wspólny kształt danych: formularze + Edge Functions |
| Daty | Postgres (liczenie) + Luxon (wyświetlanie) | strefa bazowa `Europe/Warsaw` |
| Push | expo-notifications + Expo Push Service | kanał powiadomień na Androidzie |
| Mail | Resend, wywoływany z Edge Function | własna domena + DKIM/SPF |
| Kalendarz | Google Calendar API po stronie serwera | jednokierunkowo, opcjonalnie |
| Testy | Vitest na lokalnej bazie Supabase (Docker) | testują prawdziwe funkcje SQL |
| Błędy | Sentry | w aplikacji i w Edge Functions |

Ceny trzymamy jako liczby całkowite w **groszach**. Czas w bazie zawsze
`timestamptz` (UTC), wyświetlany w strefie salonu.

---

## 3. Model danych

Wszystkie tabele poza `app_admins` mają `salon_id` i włączone RLS.
Wszystkie mają `id uuid`, `created_at`, `updated_at`.

### Salon i ludzie

**`salons`** — nazwa, slug, logo, kolor główny, adres, telefon, mail,
strefa czasowa, oraz ustawienia: `auto_accept`, `hold_minutes` (ważność
niepotwierdzonej rezerwacji), `min_lead_minutes` (minimalne wyprzedzenie),
`booking_horizon_days` (horyzont), `slot_step_minutes` (siatka slotów),
`client_cancel_lead_hours` (do kiedy klient może odwołać),
`cancellation_policy_text`, `online_booking_enabled`,
`calendar_event_title_template`, `active` (włączenie/wyłączenie salonu).

**`salon_members`** — `user_id` + `salon_id` + `role` (`owner` \| `staff`).
Steruje dostępem. Jeden użytkownik może należeć do wielu salonów.

**`staff`** — fryzjer: `salon_id`, `user_id` (**może być puste**), imię,
zdjęcie, opis, `active`, kolejność. Właściciel może dodać pracownika bez konta
i prowadzić jego kalendarz; pracownik zakłada konto później (mail, Google lub
Apple) i wtedy podpinamy `user_id` przez zaproszenie.

**`staff_invitations`** — zaproszenie pracownika: mail, token, data ważności,
status. Po przyjęciu łączy konto z wpisem w `staff`.

**`app_admins`** — moje konta administratora platformy (panel administracyjny).
Jedyna tabela poza modelem salonu.

### Usługi i ceny

**`service_categories`** — `salon_id`, nazwa, kolejność.

**`services`** — `salon_id`, kategoria, nazwa, opis, `duration_minutes`,
`buffer_after_minutes` (przerwa po usłudze), `price_grosz`, `price_type`
(`fixed` \| `from` \| `variable`), `promo_price_grosz`, `promo_starts_at`,
`promo_ends_at`, zdjęcie, `visible`, kolejność.

**`staff_services`** — przypisanie usługi do fryzjera z opcjonalnym
nadpisaniem ceny i czasu trwania. Usługa bez przypisania nie jest u nikogo
dostępna.

**`service_price_history`** — każda zmiana ceny z datą. Potrzebna do wyliczenia
najniższej ceny z 30 dni przed obniżką. Zapisywana automatycznie wyzwalaczem,
nie z aplikacji.

### Czas pracy

**`salon_hours`** — godziny otwarcia salonu: dzień tygodnia, `open_time`,
`close_time`. Kilka wpisów na dzień = kilka okien (np. 9–13 i 14–18).

**`working_hours`** — grafik tygodniowy fryzjera, ta sama struktura.
**Fryzjer nigdy nie pracuje poza godzinami otwarcia salonu** — część wspólna
obu grafików jest czasem dostępnym.

**`schedule_exceptions`** — wyjątki: urlop, dzień wolny, inne godziny.
Per fryzjer albo dla całego salonu (np. święto). Zakres dat.

**`time_blocks`** — ręczne blokady czasu fryzjera z opisem.

### Klienci i rezerwacje

**`clients`** — `salon_id`, `user_id` (**może być puste**), imię, nazwisko,
mail (wymagany), telefon (wymagany), notatka wewnętrzna, `no_show_count`,
`blocked`. Klient nie musi mieć konta; może je założyć (mail, Google, Apple)
i wtedy widzi swoje wizyty. Deduplikacja po mailu w obrębie salonu.

**`bookings`** — `salon_id`, `staff_id`, `client_id`, `time_range`
(`tstzrange`), `status`, `total_price_grosz` (suma zapisana w momencie
rezerwacji), `source` (`web` \| `manual` \| `app`), `cancellation_comment`,
`manage_token` + `manage_token_expires_at`, `previous_booking_id`
(przy przełożeniu), `google_event_id`, `client_note`.

**`booking_items`** — pozycje rezerwacji: `booking_id`, `service_id`,
`position`, `name_snapshot`, `price_grosz`, `duration_minutes`,
`buffer_after_minutes`. **Jedna rezerwacja może mieć kilka usług**
(np. strzyżenie + broda). Czas trwania wizyty = suma czasów pozycji,
przerwa po ostatniej pozycji wlicza się do blokady slotu.

**`booking_status_history`** — kto, kiedy, ze statusu na status, komentarz.

### Integracje i wysyłki

**`calendar_connections`** — konto Google per fryzjer, tokeny **szyfrowane**
w bazie, status połączenia, data ostatniej synchronizacji, licznik błędów.

**`push_tokens`** — tokeny urządzeń per użytkownik, platforma, data ostatniego
użycia.

**`email_log`** — typ maila, odbiorca, powiązana rezerwacja, status wysyłki,
liczba prób, klucz idempotencji.

### Poza zakresem MVP (miejsce w modelu jest, kodu nie ma)

SMS (`clients.sms_consent`), zadatki i płatności (`bookings.deposit_*`),
lista oczekujących, opinie, dodatki do usług, karnety, samoobsługowa
rejestracja salonów, odczyt zajętości z Booksy.

---

## 4. Statusy rezerwacji

```
pending_confirmation  klient nie potwierdził maila, slot zablokowany na X minut
      ↓ potwierdzenie maila
pending_approval      czeka na akceptację salonu          (gdy auto_accept = false)
      ↓ akceptacja salonu
confirmed             potwierdzona                        (gdy auto_accept = true — od razu tutaj)
      ↓ po terminie wizyty
completed             zrealizowana
```

Statusy końcowe: `cancelled_by_client`, `cancelled_by_salon` (zawsze
z komentarzem), `rescheduled` (stary termin po przełożeniu), `expired`
(niepotwierdzona w czasie), `no_show`.

**Statusy blokujące slot:** `pending_confirmation`, `pending_approval`,
`confirmed`, `completed`. Pozostałe zwalniają termin.

---

## 5. Reguły biznesowe (tu nie improwizujemy)

1. **Wolne sloty liczy funkcja w bazie**, na podstawie: godzin otwarcia salonu,
   grafiku fryzjera, wyjątków i urlopów, blokad czasu, istniejących rezerwacji
   w statusach blokujących, łącznego czasu wybranych usług plus przerwy po
   ostatniej, minimalnego wyprzedzenia i horyzontu rezerwacji.
2. **Wybór fryzjera:** bez wybranego fryzjera klient widzi sumę wolnych
   terminów całego salonu; po wybraniu konkretnego — tylko jego terminy.
   Przy rezerwacji „u dowolnego" system przydziela fryzjera.
3. **Siatka slotów** co 15 minut, konfigurowalna per salon.
4. **Podwójna rezerwacja niemożliwa na poziomie bazy** — ograniczenie
   wykluczające (`EXCLUDE USING gist`) na nakładające się zakresy czasu tego
   samego fryzjera w statusach blokujących. Nie tylko walidacja w aplikacji.
   Jeden fryzjer = jedna wizyta w danym momencie.
5. **`pending_confirmation` blokuje slot** przez `hold_minutes` (domyślnie 20),
   potem automatycznie wygasa i slot wraca do puli.
6. **Cena kopiowana do rezerwacji** przy jej utworzeniu i nigdy się nie zmienia,
   nawet jeśli cennik się zmieni albo promocja wygaśnie przed wizytą.
7. **Promocje:** przy aktywnej cenie promocyjnej system podaje najniższą cenę
   z 30 dni przed obniżką, liczoną z `service_price_history` (wymóg ustawy
   o informowaniu o cenach — dotyczy też usług). Promocja wygasa automatycznie
   po dacie końcowej.
8. **Anulowanie przez salon** zawsze wymaga komentarza i wysyła mail do klienta.
9. **Anulowanie przez klienta** możliwe do `client_cancel_lead_hours` przed
   wizytą (domyślnie 12).
10. **Przełożenie terminu:** nowy termin sprawdzany tą samą logiką dostępności,
    stary slot zwalniany atomowo w jednej transakcji, klient dostaje mail
    z nową datą, wydarzenie w kalendarzu Google aktualizowane.
11. **Google Calendar jednokierunkowo:** z systemu do kalendarza. Usunięcie
    wydarzenia w kalendarzu **nie** anuluje rezerwacji. W opisie wydarzenia
    i w polu URL link do rezerwacji otwierający ekran w aplikacji (universal
    link / app link) albo panel web. Link wymaga zalogowania. Tytuł wydarzenia
    według szablonu salonu. Do Google wysyłamy minimum danych.
12. **Czas i waluta:** daty w UTC, wyświetlanie w strefie salonu, poprawna
    obsługa zmiany czasu letniego i zimowego. Waluta PLN, zegar 24-godzinny,
    interfejs po polsku, teksty w plikach tłumaczeń (i18n) z myślą o przyszłości.

### Ustawienia domyślne nowego salonu

siatka slotów 15 min · minimalne wyprzedzenie 2 h · horyzont 60 dni ·
niepotwierdzona rezerwacja wygasa po 20 min · automatyczna akceptacja
wyłączona · odwołanie przez klienta do 12 h przed · rezerwacje online włączone

---

## 6. Zadania cykliczne (pg_cron)

| Zadanie | Częstotliwość |
|---|---|
| wygaszanie `pending_confirmation` po upływie `hold_minutes` | co minutę |
| oznaczanie minionych wizyt jako `completed` | co 15 minut |
| wyłączanie promocji po dacie końcowej | codziennie |
| odświeżanie tokenów Google i ponawianie nieudanych synchronizacji | co 15 minut |
| ponawianie nieudanych wysyłek maili | co 5 minut |
| przypomnienie mailowe dzień przed wizytą | **przygotowane, wyłączone w MVP** |

---

## 7. Dostęp do danych (RLS)

- **Nikt nigdy nie widzi danych innego salonu.** Podstawa każdej reguły to
  przynależność do salonu przez `salon_members`.
- **Właściciel** (`owner`): pełny dostęp w obrębie swojego salonu.
- **Pracownik** (`staff`): **widzi kalendarz całego salonu** (terminy wszystkich
  fryzjerów, bo tego wymaga umawianie klientów), ale **edytuje tylko swoje
  wizyty i swój grafik**. Nie zmienia ustawień salonu, usług ani zespołu.
- **Klient z kontem**: widzi wyłącznie własne rezerwacje.
- **Klient bez konta**: dostęp tylko przez jednorazowy, nieodgadywalny token
  z datą ważności, obsługiwany przez Edge Function — nigdy bezpośrednio do bazy.
- **Administrator platformy** (`app_admins`): lista salonów, liczba rezerwacji,
  włączanie i wyłączanie salonu. Bez wglądu w dane osobowe klientów.
- Tworzenie rezerwacji z internetu przechodzi przez Edge Function z limitem
  zapytań (ochrona przed botami).

### Dane osobowe

- tokeny w mailach: jednorazowe, z datą ważności, nieodgadywalne
- tokeny Google szyfrowane w bazie, możliwość odłączenia konta jednym ruchem
- usuwanie danych klienta na żądanie + anonimizacja rezerwacji starszych niż
  ustalony okres retencji
- do Google Calendar wysyłamy minimum danych
- **żadnych sekretów w repozytorium** — wyłącznie zmienne środowiskowe
- usunięcie konta z poziomu aplikacji (wymóg App Store — bez tego aplikacja
  nie przejdzie recenzji)

---

## 8. Ekrany aplikacji

- **Logowanie** — mail + hasło, Google, Apple; reset hasła; usunięcie konta
- **Dziś** — wizyty na dzisiaj z szybkimi akcjami
- **Kalendarz** — widok dnia i tygodnia, przełączanie fryzjerów
- **Szczegóły rezerwacji** — dane, status, akceptuj, anuluj z komentarzem,
  przełóż, oznacz jako zrealizowaną lub nieobecność, notatka
- **Nowa wizyta** dodawana ręcznie
- **Blokada czasu**
- **Usługi** — lista z kategoriami, pełna edycja, zmiana kolejności, promocje
- **Grafik** — godziny pracy, wyjątki, urlopy
- **Zespół** (właściciel) — zapraszanie, role, przypisanie usług, nadpisania cen
- **Ustawienia** — dane salonu, logo, kolor, automatyczna akceptacja,
  powiadomienia, wyłączenie rezerwacji online, Google Calendar, link .ics,
  polityka odwołań, **panel administratora** (ukryty, tylko dla `app_admins`)
- **Powiadomienia push** — kanał na Androidzie, otwieranie właściwego ekranu
  po kliknięciu, odświeżanie kalendarza przez Realtime
- **Stany puste i onboarding** — propozycja startowych kategorii usług:
  Strzyżenie, Broda, Strzyżenie + broda, Koloryzacja, Pielęgnacja

---

## 9. Niezawodność

- każda nowa rezerwacja trafia do salonu **pushem oraz mailem** — na wypadek
  gdy push nie dotrze
- ponawianie nieudanych wysyłek maili i synchronizacji kalendarza, wszystkie
  operacje idempotentne (klucz idempotencji w `email_log`)
- Sentry w aplikacji i w funkcjach serwerowych
- dwa środowiska: testowe i produkcyjne, migracje bazy trzymane w repozytorium
- skrypt z danymi testowymi: przykładowy salon, zespół, usługi, grafik, rezerwacje

---

## 10. Wygląd

Docelowy design dostarcza product designer. Na teraz: czysty, neutralny
interfejs oparty na tokenach (kolory, typografia, odstępy, promienie)
zdefiniowanych w **jednym pliku**, żeby dało się je podmienić bez ruszania
ekranów. Kontrast zgodny z WCAG AA, elementy dotykowe minimum 44 px,
tryb jasny i ciemny.

---

## 11. Testy

Logika dostępności pokryta testami uruchamianymi na **lokalnej bazie
Supabase** — testujemy prawdziwą funkcję SQL, nie jej kopię w JS.

Przypadki brzegowe, które muszą przejść:

- usługa dłuższa niż okno w grafiku
- wizyta stykająca się z przerwą po poprzedniej usłudze
- urlop w środku dnia
- zmiana czasu letniego i zimowego
- rezerwacja dokładnie na granicy horyzontu i minimalnego wyprzedzenia
- dwie równoczesne próby rezerwacji tego samego slotu
- przełożenie na termin zajęty
- promocja kończąca się między rezerwacją a wizytą
- kilka usług w jednej rezerwacji przekraczających koniec okna pracy
- fryzjer pracujący poza godzinami otwarcia salonu

---

## 12. Plan etapów

| # | Etap | Rezultat |
|---|---|---|
| 0 | Fundament | repo, git, Expo + TypeScript, CLI Supabase, Docker, dwa środowiska, Sentry |
| 1 | Baza i RLS | wszystkie tabele, blokada podwójnej rezerwacji, izolacja salonów, dane testowe |
| 2 | Logika dostępności | funkcja slotów w Postgresie + testy z przypadkami brzegowymi |
| 3 | Zadania cykliczne | wygaszanie, zamykanie wizyt, koniec promocji |
| 4 | Logowanie | mail, Google, Apple, reset hasła, usunięcie konta |
| 5 | Kalendarz i rezerwacje | Dziś, kalendarz dzień/tydzień, szczegóły, akcje, ręczna wizyta, blokada czasu |
| 6 | Usługi | kategorie, edycja, ceny, promocje z historią cen |
| 7 | Grafik | godziny otwarcia salonu, godziny pracy, wyjątki, urlopy |
| 8 | Push i Realtime | powiadomienia, kanał na Androidzie, odświeżanie na żywo |
| 9 | Maile | Resend, ponawianie, dziennik wysyłek |
| 10 | Google Calendar | połączenie konta, jednokierunkowa synchronizacja |
| 11 | Ustawienia i zespół | dane salonu, wygląd, role, zaproszenia, przypisania usług |
| 12 | Panel administratora | zakładanie salonów, zapraszanie właścicieli, włączanie i wyłączanie |
| 13 | Przygotowanie do sklepów | ikona, ekran startowy, linki głębokie, polityka prywatności, konto dla recenzenta |

Po każdym etapie: krótkie podsumowanie co działa, jak to sprawdzić na telefonie,
co dalej. Commity małymi porcjami z czytelnymi opisami.

---

## 13. Struktura repozytorium

```
app/                 ekrany (expo-router)
src/
  components/        komponenty wspólne
  theme/             tokeny: kolory, typografia, odstępy, promienie
  lib/               klient Supabase, TanStack Query, Sentry
  features/          logika ekranów pogrupowana funkcjonalnie
  i18n/              pl.json (i miejsce na kolejne języki)
supabase/
  migrations/        migracje SQL — jedyne źródło kształtu bazy
  functions/         Edge Functions
  seed/              dane testowe
tests/               testy logiki dostępności (Vitest + lokalna baza)
```

---

## 14. Rzeczy, które musisz zrobić ręcznie (poza kodem)

Lista rośnie w miarę etapów. Przy każdym etapie dostajesz dokładne instrukcje
— co kliknąć i gdzie.

- [ ] nazwa produktu i identyfikator aplikacji (przed publikacją, nie do zmiany później)
- [ ] domena (maile, linki głębokie, polityka prywatności)
- [ ] konto Supabase — dwa projekty: dev i prod
- [ ] konto GitHub — nowe prywatne repozytorium
- [ ] konto Resend + wpisy DNS domeny
- [ ] Google Cloud — projekt, OAuth, zgoda na logowanie Google
- [ ] Google Cloud — weryfikacja aplikacji dla dostępu do kalendarza (kilka tygodni, start wcześnie)
- [ ] konto Apple Developer (99 USD/rok, firmowe wymaga numeru D-U-N-S)
- [ ] konto Google Play (25 USD jednorazowo; konto osobiste wymaga testu z 12 testerami przez 14 dni)
- [ ] polityka prywatności pod publicznym adresem
- [ ] konto testowe dla recenzenta Apple