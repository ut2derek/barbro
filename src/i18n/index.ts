import pl from './pl.json';

/**
 * Minimalne tłumaczenia. Interfejs jest po polsku, ale żaden tekst nie siedzi
 * w kodzie ekranu — dorzucenie kolejnego języka to dodanie pliku i przełącznika.
 */
const dictionaries = { pl } as const;

type Dictionary = typeof pl;
type Locale = keyof typeof dictionaries;

let locale: Locale = 'pl';

export function setLocale(next: Locale) {
  locale = next;
}

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type TranslationKey = Leaves<Dictionary>;

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const value = key
    .split('.')
    .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], dictionaries[locale]);

  if (typeof value !== 'string') return key;

  if (!params) return value;

  return Object.entries(params).reduce(
    (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
    value,
  );
}