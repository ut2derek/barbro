import { StepHeader } from '@/components/public/steps/step-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import type { BookingFlow } from '@/features/public-booking/use-booking-flow';
import { t } from '@/i18n';
import { formatDuration, formatFullDate, formatPrice, formatTime } from '@/lib/format';

/** Krok 3: dane klienta i zapis wizyty. */
export function DataScreen({ flow }: { flow: BookingFlow }) {
  const startsAt = flow.pendingSlot!;
  const services = flow.chosenServices.map((service) => service.name).join(' + ');
  const addons = flow.addonSummary.lines.map((line) => line.addon.name).join(' + ');

  return (
    <Screen scroll edges={['top', 'bottom']}>
      <StepHeader title={t('publicBooking.stepData')} onBack={() => flow.setStep('term')} />

      <Card>
        <Text variant="heading">{formatFullDate(startsAt, flow.zone)}</Text>
        <Text variant="title">{formatTime(startsAt, flow.zone)}</Text>
        <Text tone="secondary">
          {services}
          {addons ? ` + ${addons}` : ''}
        </Text>
        <Text variant="bodyStrong">
          {formatPrice(flow.totalPrice)} · {formatDuration(flow.totalMinutes)}
        </Text>
      </Card>

      <Input
        label={t('publicBooking.firstName')}
        value={flow.form.firstName}
        onChangeText={(firstName) => flow.setForm({ ...flow.form, firstName })}
      />
      <Input
        label={t('publicBooking.phone')}
        value={flow.form.phone}
        onChangeText={(phone) => flow.setForm({ ...flow.form, phone })}
        keyboardType="phone-pad"
      />
      <Input
        label={t('publicBooking.email')}
        value={flow.form.email}
        onChangeText={(email) => flow.setForm({ ...flow.form, email })}
        keyboardType="email-address"
        autoCapitalize="none"
        hint={t('publicBooking.emailHint')}
      />
      <Input
        label={t('publicBooking.note')}
        value={flow.form.note}
        onChangeText={(note) => flow.setForm({ ...flow.form, note })}
        multiline
        numberOfLines={2}
      />

      {flow.formError ? <Text tone="danger">{flow.formError}</Text> : null}

      <Button
        label={t('publicBooking.submit', {
          time: formatTime(startsAt, flow.zone),
          price: formatPrice(flow.totalPrice),
        })}
        loading={flow.submitting}
        onPress={() =>
          void flow.submit(t('publicBooking.dataRequired'), t('publicBooking.bookingError'))
        }
      />

      {flow.catalog.data?.salon.cancellationPolicy ? (
        <Text variant="small" tone="muted">
          {flow.catalog.data.salon.cancellationPolicy}
        </Text>
      ) : null}
    </Screen>
  );
}
