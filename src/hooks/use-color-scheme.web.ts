import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * Na webie pierwszy render odbywa się po stronie serwera, gdzie nie znamy
 * motywu przeglądarki. Dopiero po „nawodnieniu" strony wolno wziąć prawdziwą
 * wartość — inaczej React zgłasza niezgodność między serwerem a przeglądarką.
 *
 * `useSyncExternalStore` załatwia to jednym wywołaniem: podaje inną wartość
 * dla serwera i dla przeglądarki. Wcześniej robił to `useEffect` ustawiający
 * stan, czyli dodatkowy render przy każdym wejściu na stronę.
 */
const subscribe = () => () => {};
const hasHydrated = () => true;
const onServer = () => false;

export function useColorScheme() {
  const hydrated = useSyncExternalStore(subscribe, hasHydrated, onServer);
  const colorScheme = useRNColorScheme();

  return hydrated ? colorScheme : 'light';
}
