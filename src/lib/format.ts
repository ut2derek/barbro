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
