import { DateTime } from 'luxon';

/** Wszystkie kwoty trzymamy w groszach — tu zamieniamy je na tekst dla oka. */
export function formatPrice(grosz: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
  }).format(grosz / 100);
}

export function formatTime(iso: string, zone: string): string {
  return DateTime.fromISO(iso, { zone }).toFormat('HH:mm');
}

export function formatTimeRange(fromIso: string, toIso: string, zone: string): string {
  return `${formatTime(fromIso, zone)}–${formatTime(toIso, zone)}`;
}

/** „poniedziałek, 13 października” — data w formie, jaką barber mówi klientowi. */
export function formatFullDate(iso: string, zone: string): string {
  return DateTime.fromISO(iso, { zone })
    .setLocale('pl')
    .toLocaleString({ weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Data w kilku znakach („21 wrz”), do plakietek i kafelków. Rok dopisujemy
 * tylko wtedy, gdy jest inny niż bieżący — inaczej zabierałby miejsce,
 * nie wnosząc nic.
 */
export function formatCompactDate(iso: string, zone: string): string {
  const date = DateTime.fromISO(iso, { zone }).setLocale('pl');
  const sameYear = date.year === DateTime.now().setZone(zone).year;

  return date.toLocaleString(
    sameYear
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' },
  );
}

/**
 * Dzień i godzina wizyty rozbite na części: „20 września, Niedziela.” i
 * „10:00–10:45”. Osobno, bo nie mają tej samej wagi — dzień niesie treść
 * i jest wyróżniony, godzina to szczegół i zostaje przygaszona.
 *
 * Data zaczyna się od liczby, bo tego szuka wzrok przy przeglądaniu historii;
 * dzień tygodnia idzie po przecinku, wielką literą, żeby odcinał się od cyfr.
 *
 * Kropka, nie kropka środkowa: data ma już w sobie przecinek, więc trzeci
 * znak rozdzielający robiłby z tego wyliczankę.
 */
export function formatDayAndTime(
  fromIso: string,
  toIso: string,
  zone: string,
): { day: string; time: string } {
  const date = DateTime.fromISO(fromIso, { zone }).setLocale('pl');
  const dayMonth = date.toLocaleString({ day: 'numeric', month: 'long' });
  const weekday = date.toFormat('cccc');

  return {
    day: `${dayMonth}, ${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}.`,
    time: formatTimeRange(fromIso, toIso, zone),
  };
}

export function formatShortDate(date: DateTime): string {
  return date.setLocale('pl').toLocaleString({ day: 'numeric', month: 'short' });
}

export function formatWeekday(date: DateTime): string {
  return date.setLocale('pl').toFormat('ccc');
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} godz.` : `${hours} godz. ${rest} min`;
}

/**
 * Polska odmiana przez liczbę: 1 wizyta, 2 wizyty, 5 wizyt.
 * Reguła: liczebnik kończący się na 2–4 (poza 12–14) bierze formę mnogą „lekką”.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count);
  if (abs === 1) return one;

  const lastTwo = abs % 100;
  const last = abs % 10;

  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
  return many;
}

/**
 * Kwota wpisana ręcznie → grosze. `null`, gdy to nie jest kwota.
 *
 * Przyjmuje przecinek i kropkę, bo na polskiej klawiaturze wygodniej wpisać
 * przecinek. Wcześniej ta sama funkcja siedziała w trzech ekranach naraz;
 * poprawka w jednym z nich nie trafiałaby do dwóch pozostałych.
 */
export function parsePriceToGrosz(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Grosze → tekst do pola formularza („60,00"). Bez symbolu waluty. */
export function formatGroszForInput(grosz: number): string {
  return (grosz / 100).toFixed(2).replace('.', ',');
}
