import { useQueryClient } from '@tanstack/react-query';

import { useUndo } from '@/components/ui/undo-toast';
import { t } from '@/i18n';
import { bookingListPrefixes, invalidateBookings } from '@/lib/query-keys';

import { useChangeBookingStatus, type BookingListItem, type BookingStatus } from './queries';

/**
 * Szybka zmiana statusu wizyty z oknem na cofnięcie.
 *
 * Do serwera nic nie leci przez pierwsze kilka sekund — lista zmienia się
 * od razu, ale zapis czeka. Dzięki temu „Cofnij” nie musi odwracać zmiany
 * w bazie, tylko ją odwołuje, zanim nastąpi.
 */
export function useQuickBookingAction() {
  const queryClient = useQueryClient();
  const changeStatus = useChangeBookingStatus();
  const { runWithUndo } = useUndo();

  return (booking: BookingListItem, status: BookingStatus, label: string) => {
    // Natychmiastowa zmiana w tym, co widać — we wszystkich listach wizyt
    // naraz (dzień, tydzień, miesiąc), bo barber patrzy raz na jedną, raz
    // na drugą. Które to listy, mówi `query-keys.ts`.
    for (const queryKey of bookingListPrefixes) {
      queryClient.setQueriesData<BookingListItem[]>({ queryKey }, (current) =>
        current?.map((item) => (item.id === booking.id ? { ...item, status } : item)),
      );
    }

    runWithUndo({
      message: t('booking.quickActionDone', { action: label }),
      commit: async () => {
        await changeStatus.mutateAsync({ bookingId: booking.id, status });
      },
      // Cofnięcie przywraca stan z serwera. Odświeżamy wszystko, co pokazuje
      // wizyty — razem z kropką „do akceptacji", która też zdążyła się zmienić.
      undo: () => invalidateBookings(queryClient),
    });
  };
}