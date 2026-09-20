import { useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * AUTOZAPIS POLA TEKSTOWEGO
 *
 * Barber pisze notatkę między jednym klientem a drugim. Przycisk „Zapisz” to
 * w tej sytuacji krok, o którym łatwo zapomnieć — a wtedy notatka przepada
 * przy wyjściu z ekranu.
 *
 * Zapisujemy po chwili ciszy (`delay`), a nie po każdej literze: inaczej
 * jedno zdanie oznaczałoby kilkadziesiąt zapisów do bazy.
 *
 * Porównujemy z `saved` — wartością, o której wiemy, że leży na serwerze.
 * Dzięki temu wpisanie litery i skasowanie jej nie wywołuje zapisu, a dane
 * przychodzące z serwera (odświeżenie listy) nie są brane za zmianę
 * użytkownika.
 *
 * Wyjście z ekranu przed upływem `delay` nie gubi tekstu — niezapisana zmiana
 * leci wtedy od razu.
 *
 * Stan wyliczamy przy renderowaniu, a w efekcie tylko planujemy zapis. Gdyby
 * efekt sam ustawiał stan, React renderowałby ekran dwa razy przy każdym
 * naciśnięciu klawisza.
 */
export function useAutosave(args: {
  /** Co jest w polu teraz. */
  value: string;
  /** Co wie serwer. */
  saved: string;
  save: (value: string) => Promise<unknown>;
  /** Cisza po ostatnim znaku, po której zapisujemy. */
  delay?: number;
}): AutosaveStatus {
  const { value, saved, save, delay = 1200 } = args;

  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [everSaved, setEverSaved] = useState(false);

  // Referencje, żeby timer i sprzątanie efektu widziały aktualne wartości,
  // a nie te z chwili, w której efekt się uruchomił. Odświeżamy je po każdym
  // renderowaniu — sięganie do referencji w trakcie renderowania jest
  // niedozwolone i psuje się przy wstrzymanym renderze.
  const valueRef = useRef(value);
  const savedRef = useRef(saved);
  const saveRef = useRef(save);

  useEffect(() => {
    valueRef.current = value;
    savedRef.current = saved;
    saveRef.current = save;
  });

  const changed = value !== saved;

  useEffect(() => {
    if (!changed) return;

    const timer = setTimeout(() => {
      setSaving(true);
      setFailed(false);

      void saveRef
        .current(valueRef.current)
        .then(() => setEverSaved(true))
        .catch(() => setFailed(true))
        .finally(() => setSaving(false));
    }, delay);

    return () => clearTimeout(timer);
  }, [changed, value, delay]);

  // Wyjście z ekranu z niezapisaną zmianą — zapisujemy bez czekania.
  useEffect(() => {
    return () => {
      if (valueRef.current !== savedRef.current) {
        void saveRef.current(valueRef.current).catch(() => undefined);
      }
    };
  }, []);

  if (failed) return 'error';
  if (saving) return 'saving';
  if (changed) return 'pending';
  return everSaved ? 'saved' : 'idle';
}
