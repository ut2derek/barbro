import { useState } from 'react';

/**
 * FORMULARZ WYPEŁNIANY DANYMI Z SERWERA
 *
 * Ekran edycji otwiera się, zanim dane dojdą z serwera. Kusi, żeby wpisać je
 * do pól w `useEffect`, ale wtedy React renderuje ekran dwa razy: raz pusty,
 * raz wypełniony — i przy każdym odświeżeniu danych kasuje to, co użytkownik
 * zdążył wpisać.
 *
 * Tutaj przepisujemy dane w trakcie renderowania i tylko wtedy, gdy zmieni się
 * `key` — czyli gdy naprawdę oglądamy inny rekord. Zwykłe odświeżenie listy
 * nie rusza wpisanego tekstu.
 *
 * ```ts
 * const [form, setForm] = useSyncedForm(service, service?.id, (s) => ({
 *   name: s.name,
 *   price: String(s.priceGrosz / 100),
 * }));
 * ```
 */
export function useSyncedForm<Source, Form>(
  source: Source | undefined,
  key: string | undefined,
  build: (source: Source) => Form,
  empty: Form,
): [Form, React.Dispatch<React.SetStateAction<Form>>] {
  const [form, setForm] = useState<Form>(() => (source ? build(source) : empty));
  const [loadedKey, setLoadedKey] = useState<string | undefined>(source ? key : undefined);

  if (source && key !== loadedKey) {
    setLoadedKey(key);
    setForm(build(source));
  }

  return [form, setForm];
}

/**
 * Wariant dla ekranów, gdzie pola są osobnymi stanami i przepisywanie ich
 * wszystkich do jednego obiektu byłoby większą przebudową niż zyskiem.
 *
 * `fill` wykonuje się raz na rekord, w trakcie renderowania — nie w efekcie,
 * więc React nie renderuje ekranu dwa razy i nie kasuje wpisanych zmian przy
 * odświeżeniu danych z serwera.
 *
 * ```ts
 * useRecordChange(existing?.id, () => {
 *   setName(existing!.name);
 *   setPrice(fromGrosz(existing!.priceGrosz));
 * });
 * ```
 */
export function useRecordChange(key: string | undefined, fill: () => void): void {
  const [loadedKey, setLoadedKey] = useState<string | undefined>(undefined);

  if (key !== undefined && key !== loadedKey) {
    setLoadedKey(key);
    fill();
  }
}
