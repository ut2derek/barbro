import type { DateTime } from 'luxon';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SlotPicker } from '@/components/bookings/slot-picker';
import { AddonsSheet } from '@/components/public/addons-sheet';
import { DayStrip } from '@/components/public/day-strip';
import { StaffPicker } from '@/components/public/staff-picker';
import { OrderSummary } from '@/components/public/steps/order-summary';
import { StepHeader } from '@/components/public/steps/step-header';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { STRIP_DAYS, type BookingFlow } from '@/features/public-booking/use-booking-flow';
import { t } from '@/i18n';
import { formatDuration, formatPrice, plural } from '@/lib/format';
import { useTheme } from '@/theme';

/** Krok 2: dzień, godzina i fryzjer. Terminy liczy baza — tu je tylko widać. */
export function TermScreen({ flow }: { flow: BookingFlow }) {
  const theme = useTheme();

  const CONTENT_WIDTH = { width: '100%', maxWidth: 560, alignSelf: 'center' } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top']}>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          gap: theme.spacing.md,
          ...CONTENT_WIDTH,
        }}
      >
        <StepHeader
          title={t('publicBooking.pickDateTitle')}
          onBack={() => flow.setStep('services')}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="heading" style={{ flex: 1 }}>
            {flow.day.setLocale('pl').toLocaleString({ month: 'long', year: 'numeric' })}
          </Text>
          <Button
            label="‹"
            variant="secondary"
            onPress={() => flow.setStripStart(flow.stripStart.minus({ days: 7 }))}
          />
          <Button
            label="›"
            variant="secondary"
            onPress={() => flow.setStripStart(flow.stripStart.plus({ days: 7 }))}
          />
        </View>

        <DayStrip
          from={flow.stripStart as DateTime<true>}
          days={STRIP_DAYS}
          selected={flow.day as DateTime<true>}
          onSelect={flow.selectDay}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl,
          ...CONTENT_WIDTH,
        }}
      >
        <SlotPicker
          slots={flow.slots}
          zone={flow.zone}
          loading={flow.slotsPending}
          selected={flow.pendingSlot}
          onSelect={flow.setPendingSlot}
          emptyTitle={t('publicBooking.noSlotsTitle')}
          emptyDescription={t('publicBooking.noSlotsDescription')}
        />

        <OrderSummary
          services={flow.chosenServices}
          addonLines={flow.addonSummary.lines}
          addonsPrice={flow.addonSummary.price}
          hasAddons={flow.relevantAddons.length > 0}
          onOpenAddons={() => flow.setAddonsOpen(true)}
        />

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="heading">{t('publicBooking.availableStaff')}</Text>
          <StaffPicker
            staff={flow.availableStaff}
            selected={flow.staffId}
            onSelect={flow.selectStaff}
          />
        </View>

        <Button
          label={t('publicBooking.addAnotherService')}
          variant="secondary"
          onPress={() => flow.setStep('services')}
        />
      </ScrollView>

      {/* Podsumowanie zawsze pod ręką, tak jak w koszyku. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="small" tone="muted">
            {t('publicBooking.servicesCount', {
              count: `${flow.chosenServices.length} ${plural(flow.chosenServices.length, 'usługa', 'usługi', 'usług')}`,
              duration: formatDuration(flow.totalMinutes),
            })}
          </Text>
          <Text variant="title">{formatPrice(flow.totalPrice)}</Text>
        </View>
        <Button
          label={t('publicBooking.next')}
          disabled={!flow.pendingSlot}
          onPress={() => flow.setStep('data')}
        />
      </View>

      <AddonsSheet
        visible={flow.addonsOpen}
        serviceName={flow.chosenServices.map((service) => service.name).join(' + ')}
        addons={flow.relevantAddons}
        chosen={flow.chosenAddons}
        onChange={flow.changeAddons}
        onClose={() => flow.setAddonsOpen(false)}
        onContinue={() => flow.setAddonsOpen(false)}
      />
    </SafeAreaView>
  );
}
