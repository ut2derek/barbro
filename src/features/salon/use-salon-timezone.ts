import { useCurrentSalon } from './use-current-salon';

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
 * i tylko ekrany ładowania, a żadna godzina nie jest wtedy jeszcze rysowana.
 */
export function useSalonTimezone(): string {
  const { data: salon } = useCurrentSalon();
  return salon?.timezone ?? 'Europe/Warsaw';
}