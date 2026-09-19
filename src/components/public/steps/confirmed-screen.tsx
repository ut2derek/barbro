import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import type { BookingFlow } from '@/features/public-booking/use-booking-flow';
import { t } from '@/i18n';
import { formatFullDate, formatPrice, formatTime } from '@/lib/format';

/** Potwierdzenie po zapisaniu wizyty. */
export function ConfirmedScreen({ flow }: { flow: BookingFlow }) {
  const router = useRouter();
  const confirmed = flow.confirmed!;
  const booking = confirmed.booking;

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <Text variant="display">{t('publicBooking.confirmedTitle')}</Text>

      <Card>
        <Text variant="heading">{formatFullDate(booking.startsAt, flow.zone)}</Text>
        <Text variant="title">
          {formatTime(booking.startsAt, flow.zone)}–{formatTime(booking.endsAt, flow.zone)}
        </Text>
        <Text tone="secondary">{booking.staffName}</Text>
        <Text variant="bodyStrong">{formatPrice(booking.totalPriceGrosz)}</Text>
      </Card>

      <Card>
        <Text variant="heading">{t('publicBooking.whatNextTitle')}</Text>
        <Text tone="secondary">{t('publicBooking.whatNextDescription')}</Text>

        {/* Do czasu podłączenia poczty (Etap 9) link pokazujemy tylko lokalnie. */}
        {__DEV__ && confirmed.devConfirmationPath ? (
          <>
            <Text variant="small" tone="warning">
              {t('publicBooking.mailNotReady')}
            </Text>
            <Button
              label={t('publicBooking.openConfirmationLink')}
              onPress={() => router.push(confirmed.devConfirmationPath as '/')}
            />
          </>
        ) : null}
      </Card>

      <Button
        label={t('publicBooking.bookAnother')}
        variant="secondary"
        onPress={flow.startOver}
      />
    </Screen>
  );
}