import { useLocalSearchParams } from 'expo-router';

import { ConfirmedScreen } from '@/components/public/steps/confirmed-screen';
import { DataScreen } from '@/components/public/steps/data-screen';
import { ServicesScreen } from '@/components/public/steps/services-screen';
import { TermScreen } from '@/components/public/steps/term-screen';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { usePublicBookingFlow } from '@/features/public-booking/use-booking-flow';
import { t } from '@/i18n';

/**
 * Strona rezerwacji dla klienta — podgląd w aplikacji.
 *
 * Trzy kroki: usługa (z opcjonalnymi dodatkami), termin, dane. Nic nie liczy
 * się tutaj: wolne godziny, ceny i zapis wizyty robi funkcja serwerowa,
 * z której skorzysta też docelowa strona rezerwacji salonu.
 *
 * Ten plik wybiera wyłącznie, który krok pokazać. Stan i reguły przepływu
 * siedzą w `usePublicBookingFlow`, a każdy krok ma swój plik obok — dzięki
 * temu da się je przenieść do osobnego repozytorium bez rozplątywania.
 */
export default function PublicBookingScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const flow = usePublicBookingFlow(slug);

  if (flow.catalog.isPending) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Text tone="muted">{t('common.loading')}</Text>
      </Screen>
    );
  }

  if (flow.catalog.error || !flow.catalog.data) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Text variant="title">{t('publicBooking.notFoundTitle')}</Text>
        <Text tone="secondary">{t('publicBooking.notFoundDescription')}</Text>
      </Screen>
    );
  }

  if (flow.confirmed) return <ConfirmedScreen flow={flow} />;
  if (flow.step === 'services') return <ServicesScreen flow={flow} />;
  if (flow.step === 'term') return <TermScreen flow={flow} />;
  return <DataScreen flow={flow} />;
}
