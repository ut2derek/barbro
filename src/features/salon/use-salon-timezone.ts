import { useCurrentSalon } from './use-current-salon';

/** Strefa urządzenia — najbliższa prawdy, dopóki nie wiemy, gdzie jest salon. */
function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw';
  } catch {
    return 'Europe/Warsaw';
  }
}

/**
 * Strefa czasowa salonu — jedyne źródło prawdy dla wyświetlania godzin.
 *
 * Baza liczy wszystko w UTC i zna strefę każdego salonu (`salons.timezone`).
 * Aplikacja ma tylko pokazać te godziny tak, jak widzi je barber na miejscu.
 * Wcześniej w jedenastu plikach siedziało `const ZONE = 'Europe/Warsaw'`,
 * co przy pierwszym salonie w innej strefie pokazałoby złe godziny —
 * a sprzedajemy jedną aplikację wielu salonom.
 *
 * Zanim dane salonu się wczytają, zwracamy strefę urządzenia. To tylko chwila
 * i tylko ekrany ładowania; wpisana na sztywno Polska myliłaby się o tyle
 * godzin, ile dzieli salon od Warszawy, a strefa telefonu barbera zwykle
 * zgadza się ze strefą salonu, w którym on stoi.
 */
export function useSalonTimezone(): string {
  const { data: salon } = useCurrentSalon();
  return salon?.timezone ?? deviceTimezone();
}
