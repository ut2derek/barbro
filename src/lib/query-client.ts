import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { captureError } from './sentry';

/**
 * Każdy błąd zapytania i każdy błąd zapisu przechodzi tędy i trafia do Sentry.
 * Bez tego dowiadywalibyśmy się o awariach od barbera przez telefon — ekran
 * pokazuje komunikat, ale nikt po naszej stronie tego nie widzi.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      captureError(error, 'zapytanie', { queryKey: query.queryKey });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      captureError(error, 'zapis', { mutationKey: mutation.options.mutationKey });
    },
  }),
  defaultOptions: {
    queries: {
      // Kalendarz i tak odświeża się przez Realtime — nie odpytujemy bez potrzeby.
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
